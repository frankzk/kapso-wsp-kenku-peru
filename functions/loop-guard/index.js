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

    const { risk, reasons } = detectLoopRisk(data?.data || []);
    return decision(edges, risk, reasons);
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

function decision(edges, risk, reasons) {
  const target = risk ? "silencio" : "atender";
  const nextEdge = edges.includes(target) ? target : (edges[0] || target);
  return json({
    next_edge: nextEdge,
    loop_risk: risk,
    reasons,
    vars: { loop_risk: risk },
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
