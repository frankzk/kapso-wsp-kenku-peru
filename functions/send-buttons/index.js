const MAX_BUTTONS = 3;
const MAX_TITLE_CHARS = 20; // limite de WhatsApp para titulos de boton
const MAX_BODY_CHARS = 1024;

// Herramienta del agente: envia un mensaje interactivo de WhatsApp con 1-3
// botones de respuesta rapida, via el proxy Meta de Kapso. El destino sale del
// whatsapp_context de la conversacion; si falta contexto o falla el envio,
// devuelve ok=false con instruccion de hacer la pregunta como texto normal.

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

async function handleRequest(request, env = globalThis) {
  try {
    const payload = await readJson(request);
    const input = isPlainObject(payload.input) ? payload.input : payload;

    const apiKey = env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "";
    const conv = payload.whatsapp_context?.conversation || {};
    // En los payloads reales de agente/nodo el phone_number_id NO viene en
    // whatsapp_context: viene en execution_context.system.whatsapp_config.
    const phoneNumberId =
      input.phoneNumberId ||
      conv.phone_number_id ||
      payload.whatsapp_context?.phone_number_id ||
      payload.execution_context?.system?.whatsapp_config?.phone_number_id ||
      payload.execution_context?.context?.phone_number_id;
    const to = resolveRecipient(conv, payload.execution_context?.context, input.to);

    const bodyText = String(input.bodyText || input.body_text || input.text || "").trim();
    const buttons = normalizeButtons(input.buttons);

    if (!apiKey || !phoneNumberId || !to) {
      return json({ ok: false, reason: "missing_context", message: "Sin contexto de WhatsApp para enviar botones: haz la misma pregunta como mensaje de texto normal." });
    }
    if (!bodyText || buttons.length === 0) {
      return json({ ok: false, reason: "invalid_input", message: "Falta bodyText o buttons (1-3 botones con titulo de max 20 caracteres). Corrige y reintenta, o haz la pregunta como texto normal." });
    }

    const response = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText.slice(0, MAX_BODY_CHARS) },
          action: { buttons },
        },
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return json({
        ok: false,
        reason: "send_failed",
        status: response.status,
        error: JSON.stringify(result).slice(0, 300),
        message: "No se pudieron enviar los botones: haz la misma pregunta como mensaje de texto normal.",
      });
    }

    return json({
      ok: true,
      sent: true,
      buttons: buttons.map((b) => b.reply.title),
      message: "Botones enviados como mensaje de WhatsApp: NO repitas la misma pregunta en texto. Si quedas esperando la respuesta del cliente, guarda stage/followup_hint y llama complete_task.",
    });
  } catch (error) {
    return json({
      ok: false,
      reason: "send_buttons_error",
      error: String(error?.message || error).slice(0, 300),
      message: "Fallo el envio de botones: haz la misma pregunta como mensaje de texto normal.",
    });
  }
}

function normalizeButtons(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const buttons = [];
  for (const item of list) {
    if (buttons.length >= MAX_BUTTONS) break;
    const title = String((typeof item === "string" ? item : item?.title) || "").trim().slice(0, MAX_TITLE_CHARS);
    if (!title) continue;
    const id = String((isPlainObject(item) && item.id) || `btn_${buttons.length + 1}`).slice(0, 256);
    buttons.push({ type: "reply", reply: { id, title } });
  }
  return buttons;
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(body) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}

globalThis.__kenkuSendButtons = { handler, handleRequest, normalizeButtons };

// Destinatario correcto del envio. Los contactos que entran por USERNAME de
// WhatsApp no tienen telefono y Kapso guarda en phone_number los DIGITOS del
// business_scoped_user_id (ej. phone_number "1586627056237556" con bsuid
// "PE.1586627056237556"). Enviar a ese "numero" falla SIEMPRE con el error 131026
// de Meta ("Message undeliverable"): el destinatario valido es el bsuid COMPLETO,
// con su prefijo de pais (PE., CO., ...).
function resolveRecipient(conv, ctx, explicit) {
  conv = conv || {};
  ctx = ctx || {};
  if (explicit) return String(explicit);
  const phone = String(conv.phone_number || ctx.phone_number || "").trim();
  const bsuid = String(conv.business_scoped_user_id || ctx.business_scoped_user_id || "").trim();
  if (bsuid) {
    const digits = bsuid.includes(".") ? bsuid.split(".").pop() : bsuid;
    if (!phone || phone === digits) return bsuid;
  }
  return phone || bsuid || "";
}
