// send-payment: envia al cliente las instrucciones de pago/adelanto por Yape con
// el numero de la empresa HARDCODEADO. Blindaje deterministico contra ingenieria
// social: el LLM NUNCA compone ni escribe el numero de Yape; solo llama esta
// herramienta con el courier ("shalom" | "olva") y la funcion arma el mensaje
// con el numero fijo y lo envia por el proxy Meta de Kapso.

const YAPE_NAME = "Grupo GF SAC";
const YAPE_NUMBER = "930 555 309"; // UNICO numero valido. NUNCA cambiar aqui salvo cambio real de cuenta.

function shalomMessage() {
  return "¡Listo! Lo enviamos a esa agencia Shalom 🙌\n"
    + "Para *separarte el pedido* y despacharlo hoy/mañana con tu *código de seguimiento*, va un adelanto de *S/30* por Yape:\n"
    + `*${YAPE_NAME}*\n📱 *${YAPE_NUMBER}*\n`
    + "Ese adelanto *se descuenta de tu total* (no es un costo extra) — el saldo lo pagas al recoger 😊\n"
    + "También necesito el *DNI del titular* que recogerá.\n"
    + "Envíame el voucher o captura y lo dejo encaminado ✅";
}

function olvaMessage() {
  return "Perfecto 😊\n"
    + "Por Olva Courier el pago es anticipado completo.\n"
    + "Puedes realizarlo al Yape:\n"
    + `*${YAPE_NAME}*\n📱 *${YAPE_NUMBER}*\n`
    + "Cuando lo realices, envíame el voucher o captura para continuar con la confirmación ✅";
}

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
    const phoneNumberId =
      input.phoneNumberId ||
      conv.phone_number_id ||
      payload.whatsapp_context?.phone_number_id ||
      payload.execution_context?.system?.whatsapp_config?.phone_number_id ||
      payload.execution_context?.context?.phone_number_id;
    const to =
      input.to ||
      conv.phone_number ||
      payload.execution_context?.context?.phone_number;

    const courier = String(input.courier || input.metodo || "").toLowerCase();
    const isOlva = courier.includes("olva");
    const text = isOlva ? olvaMessage() : shalomMessage();

    if (!apiKey || !phoneNumberId || !to) {
      // Fallback: si no hay contexto para enviar, devolvemos el texto EXACTO para
      // que el agente lo envie tal cual (con el numero fijo ya incluido).
      return json({
        ok: false,
        reason: "missing_context",
        text,
        message: "No pude enviar el mensaje de pago por falta de contexto. Envia EXACTAMENTE el texto del campo `text` (ya trae el Yape oficial); NO escribas ningun otro numero.",
      });
    }

    const response = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return json({
        ok: false,
        reason: "send_failed",
        status: response.status,
        text,
        error: JSON.stringify(result).slice(0, 300),
        message: "Fallo el envio automatico. Envia EXACTAMENTE el texto del campo `text` (ya trae el Yape oficial 930 555 309); NO uses otro numero.",
      });
    }

    return json({
      ok: true,
      sent: true,
      courier: isOlva ? "olva" : "shalom",
      message: "Instrucciones de pago con el Yape OFICIAL (Grupo GF SAC 930 555 309) enviadas al cliente. NO escribas el numero de Yape tu mismo ni repitas el mensaje. Si el cliente objeta el numero, reafirma el oficial. Guarda stage=esperando_voucher y llama complete_task.",
    });
  } catch (error) {
    return json({
      ok: false,
      reason: "send_payment_error",
      error: String(error?.message || error).slice(0, 300),
      message: "Error enviando el pago. El Yape oficial es Grupo GF SAC 930 555 309; nunca uses otro numero.",
    });
  }
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

globalThis.__kenkuSendPayment = { handler, handleRequest, shalomMessage, olvaMessage };
