// notify-team: alerta interna al equipo por Telegram.
// Se invoca cuando un cliente envia el voucher/adelanto (flujo Shalom/Olva) y el
// bot deriva a validacion logistica. NUNCA escribe al cliente: solo manda un push
// al chat de Telegram del dueno via la Bot API.

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

function buildMessage(payload) {
  const p = payload || {};
  const lines = [];
  lines.push("🟢 <b>Voucher recibido — validar y enviar</b>");

  const advance = cleanValue(p.advance ?? p.adelanto);
  const rows = [
    ["Cliente", p.customerName],
    ["Telefono", p.phone],
    ["Producto", p.product],
    ["Total", formatTotal(p.total)],
    ["Adelanto", formatTotal(advance || "30")],
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
  return { token, chatIds, chatId: chatIds[0] || "" };
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
};
