// notify-team: alerta interna al equipo por Telegram + aviso de handoff al dashboard.
// Se invoca cuando un cliente envia el voucher/adelanto (flujo Shalom/Olva) y el
// bot deriva a validacion logistica, o cuando el bot deriva a un humano (reclamo,
// mayorista, "quiero un asesor"). NUNCA escribe al cliente.
//
// Hace dos cosas, ambas best-effort e independientes entre si:
//   1) Telegram: push al chat del equipo via la Bot API.
//   2) Dashboard: si el evento trae `reason` (handoff real), POST al webhook de la
//      tienda para que el lead caiga en la cola "Atender ahora". El flujo de
//      voucher (sin `reason`) NO toca el dashboard, para no resetear el estado del
//      lead.

const TELEGRAM_API_BASE = "https://api.telegram.org";

// Destinatarios adicionales fijos del equipo (ademas del TELEGRAM_CHAT_ID
// principal y del secret TELEGRAM_CHAT_IDS). Se dejan embebidos porque la
// inyeccion del secret TELEGRAM_CHAT_IDS resulto poco confiable en el runtime.
// Cada persona debe haber iniciado el bot (Start) para poder recibir.
//   8844863582 = Daphne Zuniga
const EXTRA_TEAM_CHAT_IDS = ["8844863582"];

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

async function handleRequest(request, env = globalThis) {
  const payload = enrichPayload(await readJson(request));
  const config = getConfig(env);

  // Herramienta agendar_retoma (misma funcion, otro esquema): aplazo con fecha.
  // Campo con nombre propio: notify_team acepta campos extra y un "fecha" suelto
  // en un aviso comun no debe desviarlo hacia aca.
  if (cleanValue(payload.fecha_retoma)) {
    return handleRetoma(config, payload, env);
  }

  // 1) Aviso al dashboard (handoff). Independiente de Telegram: corre aunque
  //    falte la config de Telegram. Solo dispara si hay `reason` (handoff real).
  await postStoreHandoff(config, payload);

  // 2) Telegram.
  if (!config.token || !config.chatIds.length) {
    // Falta credencial: no rompas el flujo, solo reporta ok=false (sin filtrar el token).
    return json({ ok: false, reason: "missing_telegram_config" });
  }

  const text = buildMessage(payload);

  // Difunde la alerta a todos los chats configurados (chat principal + extras).
  // El ok se decide por el chat PRINCIPAL: que un extra falle (ej. no inicio el
  // bot con /start) no rompe el flujo ni oculta el exito del chat principal.
  const results = [];
  for (const chatId of config.chatIds) {
    results.push(await sendToChat(config.token, chatId, text));
  }
  const primary = results[0];
  return json({ ok: primary.ok, results });
}

// --- Aviso de handoff al dashboard de la tienda -----------------------------

// Firma HMAC-SHA256 (hex) del cuerpo con el secret, para que el dashboard pueda
// validar el POST igual que valida los webhooks de Kapso. Best-effort.
async function hmacHex(secret, body) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

// POST al webhook del dashboard cuando el bot deriva a un humano. Best-effort: no
// afecta el retorno ni el envio a Telegram. Solo dispara con `reason` (handoff
// real: reclamo / mayorista / "quiero un asesor"); el flujo de voucher (sin
// reason) NO postea, para no pisar el estado del lead en el dashboard.
async function postStoreHandoff(config, payload) {
  // Alertas internas (ej. "anuncio sin mapear") solo van a Telegram, nunca al
  // dashboard: no son handoffs reales y no deben tocar el estado del lead.
  if (payload && payload.skipStoreWebhook) return;
  const url = config.storeWebhookUrl;
  if (!url) return;
  const reason = cleanValue(payload.reason);
  if (!reason) return;
  const phone = String(payload.phone || "").replace(/[^\d]/g, "");
  const body = JSON.stringify({
    event: "workflow.execution.handoff",
    phone_number: phone,
    conversation_id: deriveConversationId(payload),
    reason,
    context_summary: cleanValue(payload.note || payload.context_summary),
  });
  const headers = { "Content-Type": "application/json" };
  if (config.storeWebhookSecret) {
    headers["X-Webhook-Secret"] = config.storeWebhookSecret;
    const sig = await hmacHex(config.storeWebhookSecret, body);
    if (sig) headers["X-Kapso-Signature"] = sig;
  }
  try {
    await fetch(url, { method: "POST", headers, body });
  } catch {}
}

// Id de conversacion desde el contexto de ejecucion (para enlazar el lead con la
// conversacion de Kapso). Best-effort: "" si no se encuentra.
function deriveConversationId(payload) {
  const o = payload || {};
  const ec = (o.execution_context && typeof o.execution_context === "object") ? o.execution_context : {};
  const ecCtx = (ec.context && typeof ec.context === "object") ? ec.context : {};
  const ecSys = (ec.system && typeof ec.system === "object") ? ec.system : {};
  const cands = [
    o.conversationId, o.conversation_id, o.whatsapp_conversation_id,
    ecCtx.conversation_id, ecCtx.whatsapp_conversation_id,
    ecSys.conversation_id, ec.conversation_id,
    o.whatsapp_context && o.whatsapp_context.conversation && o.whatsapp_context.conversation.id,
  ];
  for (const c of cands) {
    if (c && typeof c === "string") return c;
  }
  const msgs = o.whatsapp_context && o.whatsapp_context.messages;
  if (Array.isArray(msgs)) {
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i] || {};
      const id = (m.kapso && m.kapso.whatsapp_conversation_id) || m.whatsapp_conversation_id;
      if (id) return String(id);
    }
  }
  return "";
}

// --- Retoma agendada ("comprar despues") -------------------------------------
//
// El cliente aplaza la compra a una fecha CONCRETA ("el 15 me pagan"). Pasada la
// ventana de 24 h el bot ya no puede escribirle, asi que la retoma la hace una
// persona ese dia desde Kapta. Esta rama:
//   1) valida la fecha (AAAA-MM-DD, de 2 a 90 dias desde hoy en Lima). "Mañana"
//      o una fecha pasada NO es aplazo: ok=false y el lead sigue con sus
//      seguimientos (eso paso el 2026-11-07 con "mañana te confirmo");
//   2) avisa por Telegram;
//   3) si RETOMA_A_KAPTA=on, manda el evento kenku.retoma.agendada al dashboard
//      (misma URL y firma que el handoff). Apagado hasta que Kapta lo procese;
//   4) devuelve `vars` (stage + comprar_despues_*): check-coverage solo corta los
//      seguimientos con una comprar_despues_fecha valida.
const RETOMA_MIN_DIAS = 2;
const RETOMA_MAX_DIAS = 90;
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function hoyLima(now = Date.now()) {
  return new Date(now - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function diasEntre(desdeIso, hastaIso) {
  return Math.round((Date.parse(`${hastaIso}T00:00:00Z`) - Date.parse(`${desdeIso}T00:00:00Z`)) / 86400000);
}

function validarFechaRetoma(valor, now = Date.now()) {
  const fecha = cleanValue(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))
    || new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) {
    return { ok: false, motivo: "formato" };
  }
  const dias = diasEntre(hoyLima(now), fecha);
  if (dias < RETOMA_MIN_DIAS) return { ok: false, motivo: "muy_pronto", dias };
  if (dias > RETOMA_MAX_DIAS) return { ok: false, motivo: "muy_lejos", dias };
  return { ok: true, fecha, dias };
}

function fechaLegible(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

async function handleRetoma(config, payload, env, now = Date.now()) {
  const v = validarFechaRetoma(payload.fecha_retoma, now);
  if (!v.ok) {
    return json({
      ok: false,
      reason: "fecha_invalida",
      motivo: v.motivo,
      message: v.motivo === "formato"
        ? "fecha_retoma debe ser AAAA-MM-DD (calculala con get_current_datetime). Si el cliente no dio una fecha o hito concreto, NO es aplazo con fecha: deja el stage activo con followup_hint y complete_task."
        : `No es aplazo con fecha (${v.motivo === "muy_pronto" ? "faltan menos de 2 dias" : "es a mas de 90 dias"}): deja el stage activo con followup_hint y complete_task; los seguimientos siguen.`,
    });
  }
  const retoma = {
    fecha: v.fecha,
    producto: cleanValue(payload.producto || payload.product),
    zona: cleanValue(payload.zona || payload.destination),
    nota: cleanValue(payload.nota || payload.note),
    cliente: cleanValue(payload.customerName),
    telefono: String(payload.phone || "").replace(/[^\d]/g, ""),
    conversation_id: deriveConversationId(payload),
  };

  let telegram = "sin_config";
  if (config.token && config.chatIds.length) {
    const text = [
      `📅 <b>COMPRAR DESPUÉS — retomar el ${escapeHtml(fechaLegible(retoma.fecha))}</b>`,
      ...[["Cliente", retoma.cliente], ["Telefono", retoma.telefono || payload.phone], ["Producto", retoma.producto], ["Zona", retoma.zona], ["Nota", retoma.nota]]
        .filter(([, val]) => cleanValue(val))
        .map(([k, val]) => `<b>${k}:</b> ${escapeHtml(cleanValue(val))}`),
    ].join("\n");
    const results = [];
    for (const chatId of config.chatIds) results.push(await sendToChat(config.token, chatId, text));
    telegram = results[0]?.ok ? "enviado" : "error";
  }

  let kapta = "apagado";
  if (retomaAKapta(env) && config.storeWebhookUrl) {
    kapta = await postStoreEvent(config, {
      event: "kenku.retoma.agendada",
      phone_number: retoma.telefono,
      conversation_id: retoma.conversation_id,
      fecha: retoma.fecha,
      producto: retoma.producto,
      zona: retoma.zona,
      nota: retoma.nota,
      customer_name: retoma.cliente,
    }) ? "enviado" : "error";
  }

  return json({
    ok: true,
    retoma,
    telegram,
    kapta,
    vars: {
      stage: "comprar_despues",
      comprar_despues_fecha: retoma.fecha,
      comprar_despues_producto: retoma.producto || null,
      comprar_despues_nota: retoma.nota || null,
    },
    message: `Retoma agendada para el ${fechaLegible(retoma.fecha)}: una asesora le escribe ese dia. Ya quedo guardado stage=comprar_despues; NO lo vuelvas a guardar. Despidete en UNA linea sin prometer que le escribiras y llama complete_task.`,
  });
}

function retomaAKapta(env = globalThis) {
  const v = env.RETOMA_A_KAPTA || env.rETOMAAKAPTA || globalThis.RETOMA_A_KAPTA || globalThis.rETOMAAKAPTA || "";
  return String(v).trim().toLowerCase() === "on";
}

async function postStoreEvent(config, event) {
  const body = JSON.stringify(event);
  const headers = { "Content-Type": "application/json" };
  if (config.storeWebhookSecret) {
    headers["X-Webhook-Secret"] = config.storeWebhookSecret;
    const sig = await hmacHex(config.storeWebhookSecret, body);
    if (sig) headers["X-Kapso-Signature"] = sig;
  }
  try {
    const res = await fetch(config.storeWebhookUrl, { method: "POST", headers, body });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Telegram ---------------------------------------------------------------

async function sendToChat(token, chatId, text) {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      let description = "";
      try {
        const data = await res.json();
        description = data && data.description ? String(data.description) : "";
      } catch {
        // ignore parse errors
      }
      return { chatId, ok: false, reason: "telegram_error", status: res.status, description };
    }

    return { chatId, ok: true };
  } catch (err) {
    return { chatId, ok: false, reason: "request_failed", error: String(err && err.message ? err.message : err) };
  }
}

// Rellena telefono/cliente/producto desde el contexto de la ejecucion cuando el
// agente no los pasa explicitamente. Sin esto la alerta salia como una sola
// linea ("Voucher recibido") y el equipo no sabia a QUIEN validar/enviar.
function enrichPayload(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  // el agente puede mandar sus args bajo `input`; los fusionamos con el resto.
  const p = (r.input && typeof r.input === "object" && !Array.isArray(r.input)) ? { ...r, ...r.input } : { ...r };
  const ctx = r.execution_context?.context || p.execution_context?.context || {};
  const wa = r.whatsapp_context || p.whatsapp_context || {};
  const vars = r.execution_context?.vars || p.execution_context?.vars || {};
  const contact = ctx.contact || {};

  if (!cleanValue(p.phone)) {
    p.phone = ctx.phone_number || wa.conversation?.phone_number || vars.known_phone || "";
  }
  if (!cleanValue(p.customerName)) {
    p.customerName = contact.name || contact.profile_name || contact.display_name
      || wa.conversation?.contact_name || vars.known_customer_name || "";
  }
  if (!cleanValue(p.product)) {
    p.product = vars.last_product_title || vars.last_product_handle || "";
  }
  return p;
}

// Encabezado segun el motivo. Sin `reason` = flujo de voucher (identico a antes).
// Con `reason` = handoff a humano, con encabezado acorde.
function headerFor(reason) {
  const r = cleanValue(reason).toLowerCase();
  if (r.includes("reclamo") || r.includes("queja")) return "🔴 <b>RECLAMO — atender URGENTE</b>";
  if (r.includes("mayorista")) return "📦 <b>Pedido mayorista — coordinar</b>";
  if (r) return `🔔 <b>${escapeHtml(cleanValue(reason))}</b>`;
  return "🟢 <b>Voucher recibido — validar y enviar</b>";
}

function buildMessage(payload) {
  const p = payload || {};
  const reason = cleanValue(p.reason);
  const lines = [];
  lines.push(headerFor(reason));

  const advance = cleanValue(p.advance ?? p.adelanto);
  const rows = [
    ["Cliente", p.customerName],
    ["Telefono", p.phone],
    ["Producto", p.product],
    ["Total", formatTotal(p.total)],
    // El adelanto por defecto (S/30) es del flujo de voucher; en un handoff no aplica.
    ["Adelanto", formatTotal(advance || (reason ? "" : "30"))],
    ["Courier", p.courier],
    ["Agencia/Direccion", p.destination],
    ["DNI", p.dni],
    ["Pago reportado", p.paymentReported],
    ["Nota", p.note],
  ];

  for (const [label, value] of rows) {
    const clean = cleanValue(value);
    if (clean) lines.push(`<b>${escapeHtml(label)}:</b> ${escapeHtml(clean)}`);
  }

  return lines.join("\n");
}

function formatTotal(total) {
  if (total === undefined || total === null || total === "") return "";
  if (typeof total === "number") return `S/ ${total}`;
  const str = String(total).trim();
  if (!str) return "";
  return /^s\/?/i.test(str) ? str : `S/ ${str}`;
}

function cleanValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getConfig(env = globalThis) {
  const token =
    env.TELEGRAM_BOT_TOKEN ||
    env.tELEGRAMBOTTOKEN ||
    globalThis.TELEGRAM_BOT_TOKEN ||
    globalThis.tELEGRAMBOTTOKEN;
  const primary =
    env.TELEGRAM_CHAT_ID ||
    env.tELEGRAMCHATID ||
    globalThis.TELEGRAM_CHAT_ID ||
    globalThis.tELEGRAMCHATID;
  // Destinatarios adicionales (coma/espacio/;): asi se agregan mas chats sin
  // tocar el TELEGRAM_CHAT_ID principal. Se envia a todos, deduplicando.
  const extra =
    env.TELEGRAM_CHAT_IDS ||
    env.tELEGRAMCHATIDS ||
    globalThis.TELEGRAM_CHAT_IDS ||
    globalThis.tELEGRAMCHATIDS;
  const chatIds = parseChatIds(primary, extra, EXTRA_TEAM_CHAT_IDS.join(","));
  // URL + secret del dashboard de la tienda (runtime_config en Kapso). Kapso
  // expone las claves con la primera letra en minuscula (sTOREWEBHOOKURL).
  const storeWebhookUrl =
    env.STORE_WEBHOOK_URL || env.sTOREWEBHOOKURL ||
    globalThis.STORE_WEBHOOK_URL || globalThis.sTOREWEBHOOKURL || "";
  const storeWebhookSecret =
    env.STORE_WEBHOOK_SECRET || env.sTOREWEBHOOKSECRET ||
    globalThis.STORE_WEBHOOK_SECRET || globalThis.sTOREWEBHOOKSECRET || "";
  return { token, chatIds, chatId: chatIds[0] || "", storeWebhookUrl, storeWebhookSecret };
}

function parseChatIds(...values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value) continue;
    for (const part of String(value).split(/[\s,;]+/)) {
      const id = part.trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

async function readJson(request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams.entries());
  }

  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { note: text };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

globalThis.__kenkuNotifyTeam = {
  buildMessage,
  getConfig,
  handleRequest,
  handler,
  postStoreHandoff,
  handleRetoma,
  validarFechaRetoma,
  fechaLegible,
  hoyLima,
};