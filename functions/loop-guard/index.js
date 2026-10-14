const MESSAGES_TO_CHECK = 14;

// Decide determinista anti-loop: se ejecuta antes del agente (y en cada
// re-entrada tras un wait). Lee los ultimos mensajes de la conversacion via el
// proxy Meta de Kapso y decide "atender" o "silencio". Corta los ciclos
// bot-a-bot (auto-respondedores tipo Claro) y las conversaciones donde el bot
// ya esta repitiendose. Ante cualquier error, falla abierto (atender).

const AUTO_REPLY_PATTERNS = [
  /mensajes? informativos/,
  /fue un gusto atenderte/,
  /respuesta automatica/,
  /mensaje automatico/,
  /este (numero|chat) (solo|no)/,
  /no monitoreamos/,
];

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

async function handleRequest(request, env = globalThis) {
  let edges = [];
  try {
    const payload = await readJson(request);
    edges = Array.isArray(payload.available_edges) ? payload.available_edges : [];

    const apiKey = env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "";
    const conv = payload.whatsapp_context?.conversation || {};
    const conversationId = conv.id || payload.execution_context?.context?.conversation_id;
    const phoneNumberId =
      conv.phone_number_id ||
      payload.execution_context?.system?.whatsapp_config?.phone_number_id ||
      payload.execution_context?.context?.phone_number_id;

    if (!apiKey || !conversationId || !phoneNumberId) {
      return decision(edges, false, ["sin_contexto"]);
    }

    const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`
      + `?conversation_id=${encodeURIComponent(conversationId)}&limit=${MESSAGES_TO_CHECK}`;
    const response = await fetch(url, { headers: { "X-API-Key": apiKey } });
    if (!response.ok) return decision(edges, false, ["historial_no_disponible"]);
    const data = await response.json();

    const sortedMessages = [...(data?.data || [])]
      .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
    const latestInbound = sortedMessages.find((message) => message?.kapso?.direction === "inbound");
    const generation = latestInbound
      ? String(latestInbound.id || latestInbound.timestamp || "")
      : "";
    const executionGeneration = String(payload.execution_context?.vars?.followup_generation || "");

    if (env?.KV && generation) {
      const generationKey = `followup_generation:${conversationId}`;
      const storedGeneration = String(await env.KV.get(generationKey) || "");

      // Una escalera vieja volvio a entrar despues de que otra ejecucion ya
      // atendio un inbound nuevo. Se termina sin volver a escribir al cliente.
      if (executionGeneration && storedGeneration && executionGeneration !== storedGeneration) {
        return decision(edges, true, ["ejecucion_obsoleta"], { followup_generation: executionGeneration });
      }

      // Dos triggers pueden intentar procesar el mismo inbound. La ejecucion
      // que ya trae la generacion es la continuacion legitima; una ejecucion
      // nueva sin generacion y con claim existente es duplicada.
      const claimKey = `inbound_claim:${conversationId}:${generation}`;
      if (!executionGeneration && await env.KV.get(claimKey)) {
        return decision(edges, true, ["inbound_duplicado"], { followup_generation: generation });
      }
      await Promise.all([
        env.KV.put(generationKey, generation, { expirationTtl: 7 * 24 * 60 * 60 }),
        env.KV.put(claimKey, "1", { expirationTtl: 24 * 60 * 60 }),
      ]);
    }

    // Guard anti-rebote de control-flow. El loop sales-agent<->fu-terminal<->
    // loop-guard NO genera mensajes nuevos, asi que detectLoopRisk (basado en
    // contenido) es ciego a el. Si loop-guard se re-invoca varias veces para el
    // MISMO inbound (misma generation) en poco tiempo, es un rebote sin mensaje
    // nuevo del cliente -> cortar con silencio antes de reventar el tope de pasos.
    if (env?.KV && conversationId) {
      const reentryKey = `lg_reentry:${conversationId}:${generation || "none"}`;
      const reentries = Number(await env.KV.get(reentryKey) || 0) + 1;
      await env.KV.put(reentryKey, String(reentries), { expirationTtl: 90 });
      if (reentries >= 5) {
        return decision(edges, true, ["rebote_control_flow:" + reentries], generation ? { followup_generation: generation } : {});
      }
    }

    const { risk, reasons } = detectLoopRisk(data?.data || []);
    return decision(edges, risk, reasons, generation ? { followup_generation: generation } : {});
  } catch (error) {
    return decision(edges, false, ["error:" + String(error?.message || error).slice(0, 120)]);
  }
}

function detectLoopRisk(messages) {
  // Orden: mas reciente primero (no confiamos en el orden del API).
  const sorted = [...messages].sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
  const inbound = [];
  const outbound = [];
  for (const m of sorted) {
    const dir = m?.kapso?.direction;
    const text = normalizeText(m?.kapso?.content || m?.text?.body || "");
    if (!text) continue;
    if (dir === "inbound") inbound.push(text);
    else if (dir === "outbound") outbound.push(text);
  }

  const reasons = [];

  // 1) El ultimo mensaje entrante parece una auto-respuesta de otro sistema.
  if (inbound[0] && AUTO_REPLY_PATTERNS.some((p) => p.test(inbound[0]))) {
    reasons.push("auto_respuesta");
  }

  // 2) Tres entrantes consecutivos identicos (un humano no hace eso).
  if (inbound.length >= 3 && inbound[0] === inbound[1] && inbound[1] === inbound[2]) {
    reasons.push("inbound_repetido");
  }

  // 3) Patron alternante A,B,A,B (dos auto-mensajes turnandose).
  if (inbound.length >= 4 && inbound[0] === inbound[2] && inbound[1] === inbound[3] && inbound[0] !== inbound[1]) {
    reasons.push("inbound_alternante");
  }

  // 4) Conversacion larga donde el cliente "dice" siempre lo mismo.
  if (inbound.length >= 8 && new Set(inbound).size <= 2) {
    reasons.push("conversacion_ciclica");
  }

  // 5) El bot ya se esta repitiendo (ultimos salientes casi sin variedad).
  const recentOut = outbound.slice(0, 6);
  if (recentOut.length >= 4 && new Set(recentOut).size <= 2) {
    reasons.push("outbound_repetido");
  }

  return { risk: reasons.length > 0, reasons };
}

function decision(edges, risk, reasons, extraVars = {}) {
  const target = risk ? "silencio" : "atender";
  const nextEdge = edges.includes(target) ? target : (edges[0] || target);
  return json({
    next_edge: nextEdge,
    loop_risk: risk,
    reasons,
    vars: { loop_risk: risk, ...extraVars },
  });
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJson(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function json(body) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}

globalThis.__kenkuLoopGuard = { handler, handleRequest, detectLoopRisk, normalizeText };
