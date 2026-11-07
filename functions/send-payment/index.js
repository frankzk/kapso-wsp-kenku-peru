// send-payment: envia al cliente las instrucciones de pago/adelanto por Yape con
// el numero de la empresa HARDCODEADO. Blindaje deterministico contra ingenieria
// social: el LLM NUNCA compone ni escribe el numero de Yape; solo llama esta
// herramienta con el courier ("shalom" | "olva") y la funcion arma el mensaje
// con el numero fijo y lo envia por el proxy Meta de Kapso.

const YAPE_NAME = "Grupo GF SAC";
// Cuenta PRINCIPAL del adelanto. Kenku tiene otras cuentas validas (bancos,
// Plin, Lukita, un segundo Yape) que entregan el dashboard o una asesora, pero
// la principal es siempre esta y el bot solo manda esta. Cambiar aqui solo ante
// un cambio real de la cuenta principal.
const YAPE_NUMBER = "930 555 309";
// Cuenta bancaria para quien no usa Yape (2026-10-14): ~1 de cada 10 clientas que
// reciben el pago pregunta por deposito, transferencia, CCI o "no uso Yape". El
// CCI sirve desde cualquier banco. Misma titular que el Yape (Grupo GF SAC).
const BCP_CUENTA = "191-2434540-0-12";
const BCP_CCI = "00219100243454001251";

function lineasPago() {
  return `*${YAPE_NAME}*\n📱 Yape: *${YAPE_NUMBER}*\n`
    + `🏦 O transferencia BCP (Cta. Cte. Soles): *${BCP_CUENTA}*\n`
    + `   CCI (desde otros bancos): *${BCP_CCI}*\n`;
}

// Shalom despacha al DIA SIGUIENTE habil y no despacha los domingos; ese dia se
// le comparte a la clienta el ticket de envio. El texto decia "despacharlo
// hoy/mañana" siempre, y un sabado de noche ese mañana es domingo. Dia en hora
// Lima.
function cuandoDespacha(now = new Date()) {
  const dia = new Date(now.getTime() - 5 * 3600 * 1000).getUTCDay();
  if (dia === 0) return "mañana lunes"; // domingo
  if (dia === 6) return "el lunes"; // sabado: el dia siguiente es domingo
  return "mañana";
}

const ADELANTO_SHALOM = 30;

// El pedido que se esta pagando, si el agente lo manda: el cliente veia el Yape
// sin saber cuanto iba a pagar en total ni cuanto le quedaba al recoger
// (5acefd4b, f00f6596: pago mandado a los 40 s de "Uchiza", sin cantidad). El
// resumen lo escribe el LLM, asi que se limpia de cualquier ristra de digitos
// larga: esta funcion existe para que el modelo nunca meta un numero de cuenta
// en el mensaje de pago.
function pedidoDe(input) {
  const total = Number(String(input?.total ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(total) || total <= ADELANTO_SHALOM || total > 10000) return null;
  const resumen = String(input?.resumen ?? input?.summary ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\d[\d\s.\-]{3,}\d/g, (m) => (m.replace(/\D/g, "").length >= 5 ? "" : m))
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return { total: Math.round(total * 100) / 100, resumen: resumen || null };
}

function soles(n) {
  return `S/ ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function shalomMessage(now = new Date(), pedido = null) {
  const lineaPedido = pedido
    ? `${pedido.resumen ? `Tu pedido: *${pedido.resumen}* — ` : "Tu pedido: "}total *${soles(pedido.total)}*.\n`
    : "";
  const lineaSaldo = pedido
    ? `Ese adelanto *se descuenta de tu total*: al recoger pagas solo *${soles(pedido.total - ADELANTO_SHALOM)}* 😊\n`
    : "Ese adelanto *se descuenta de tu total* (no es un costo extra) — el saldo lo pagas al recoger 😊\n";
  return "¡Listo! Lo enviamos a esa agencia Shalom 🙌\n"
    + lineaPedido
    + `Para *separarte el pedido* y despacharlo ${cuandoDespacha(now)} (ese día te compartimos el ticket con tu *código de seguimiento*), va un adelanto de *S/30* por Yape o transferencia:\n`
    + lineasPago()
    + lineaSaldo
    + "También necesito el *DNI del titular* que recogerá.\n"
    + "Envíame el voucher o captura y lo dejo encaminado ✅";
}

function olvaMessage(pedido = null) {
  return "Perfecto 😊\n"
    + "Por Olva Courier el pago es anticipado completo.\n"
    + (pedido ? `${pedido.resumen ? `Tu pedido: *${pedido.resumen}* — ` : ""}total a pagar: *${soles(pedido.total)}*.\n` : "")
    + "Puedes realizarlo por Yape o transferencia:\n"
    + lineasPago()
    + "Cuando lo realices, envíame el voucher o captura para continuar con la confirmación ✅";
}

// El bot mandaba el bloque de pago dos veces en la misma conversacion
// (bdef0ca0): el cliente recibia dos Yape seguidos. Una vez enviado, otra
// llamada con el mismo courier no reenvia salvo reenviar=true (el cliente dice
// que no le llego o que no encuentra la cuenta). Best effort: sin KV no bloquea.
const REENVIO_TTL_S = 6 * 3600;

async function yaEnviado(kv, key) {
  if (!kv || !key) return null;
  try { return await kv.get(key); } catch { return null; }
}

async function marcarEnviado(kv, key) {
  if (!kv || !key) return;
  try { await kv.put(key, new Date().toISOString(), { expirationTtl: REENVIO_TTL_S }); } catch { /* best effort */ }
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
    // Los leads que entran por username no tienen phone_number, solo un BSUID
    // ("PE.948592654941065"), y Meta no los direcciona por `to` sino por
    // `recipient`. Mandarlos en `to` responde 200 con un messageId, pero Meta
    // le quita el prefijo de pais, lo trata como telefono y el mensaje muere en
    // 131026 "Message undeliverable" sin que el cliente reciba nada.
    const bsuid =
      input.recipient ||
      conv.business_scoped_user_id ||
      payload.execution_context?.context?.business_scoped_user_id ||
      conv.businessScopedUserId ||
      payload.execution_context?.context?.businessScopedUserId;

    const courier = String(input.courier || input.metodo || "").toLowerCase();
    const isOlva = courier.includes("olva");
    const pedido = pedidoDe(input);
    const text = isOlva ? olvaMessage(pedido) : shalomMessage(new Date(), pedido);

    const kv = env.KV || globalThis.KV;
    const conversationId = conv.id || payload.execution_context?.context?.conversation_id || "";
    const lockKey = conversationId ? `payment_sent:${conversationId}:${isOlva ? "olva" : "shalom"}` : null;
    const reenviar = input.reenviar === true || input.reenviar === "true" || input.resend === true;
    const previo = reenviar ? null : await yaEnviado(kv, lockKey);
    if (previo) {
      return json({
        ok: false,
        reason: "ya_enviado",
        sentAt: previo,
        message: "Las instrucciones de pago YA se le enviaron en esta conversacion: NO las reenvies. Si pregunta por la cuenta, dile que esta en el mensaje de arriba 👆. Solo si dice que no le llego o no la encuentra, vuelve a llamar send_payment con reenviar=true.",
      });
    }

    if (!apiKey || !phoneNumberId || !(to || bsuid)) {
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
        ...(to ? { to } : { recipient: bsuid }),
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
        message: "Fallo el envio automatico. Envia EXACTAMENTE el texto del campo `text` (ya trae la cuenta principal); NO escribas ningun numero de cuenta vos mismo.",
      });
    }

    await marcarEnviado(kv, lockKey);
    return json({
      ok: true,
      sent: true,
      courier: isOlva ? "olva" : "shalom",
      conTotal: Boolean(pedido),
      message: (pedido ? "" : "OJO: no mandaste total, asi que el cliente no vio cuanto paga ni su saldo; la proxima vez pasa total y resumen. ")
        + "Instrucciones de pago enviadas al cliente con la cuenta principal. NO escribas ningun numero de cuenta vos mismo ni repitas el mensaje. Si pide otra cuenta, NO improvises: notify_team + handoff_to_human para que una persona le mande la alternativa. Guarda stage=esperando_voucher y llama complete_task.",
    });
  } catch (error) {
    return json({
      ok: false,
      reason: "send_payment_error",
      error: String(error?.message || error).slice(0, 300),
      message: "Error enviando el pago. NO escribas ningun numero de cuenta vos mismo: reintenta send_payment y, si vuelve a fallar, notify_team + handoff_to_human.",
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

globalThis.__kenkuSendPayment = { handler, handleRequest, shalomMessage, olvaMessage, cuandoDespacha, pedidoDe, BCP_CUENTA, BCP_CCI };
