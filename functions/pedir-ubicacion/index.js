// pedir-ubicacion: confirma el pedido y, en el MISMO mensaje, le pide al cliente
// su ubicacion con el boton nativo de WhatsApp (location_request_message). El
// boton abre el selector de WhatsApp: puede mandar su ubicacion actual o marcar
// otro punto en el mapa. Cuando la comparte, guardar_ubicacion (rama de
// create-shopify-order) la escribe en `_cod_ubicacion` del pedido y Kapta la
// toma como el punto de entrega.
//
// Un solo mensaje: la confirmacion con el codigo de pedido (la escribe el
// agente, en `texto`) + el pedido de ubicacion (texto fijo). Si WhatsApp
// rechaza el mensaje interactivo, sale la confirmacion como texto con una linea
// que explica como mandar la ubicacion: la confirmacion del pedido nunca se
// pierde. Leads por username (BSUID) van en `recipient` (CLAUDE.md).

const KAPSO = "https://api.kapso.ai";
const MAX_BODY = 1024;

const PEDIDO_UBICACION =
  "🚚 *Hagamos tu entrega más fácil*\n"
  + "¿Estás donde recibirás tu pedido? Compártenos tu ubicación con el botón de abajo 📍 "
  + "Si no, puedes marcar otro punto en el mapa.\n\n"
  + "Solo la usamos para coordinar la entrega de este pedido. Es opcional 😊";

const RESPALDO_TEXTO =
  "📍 Si quieres que el repartidor llegue directo, compártenos tu ubicación: "
  + "toca el clip 📎 > *Ubicación*. Es opcional 😊";

const deps = { fetch: (...a) => fetch(...a) };

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

function limpiarTexto(valor) {
  return String(valor ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function armarCuerpo(texto) {
  const confirmacion = limpiarTexto(texto);
  const sep = confirmacion ? "\n\n" : "";
  const espacio = MAX_BODY - PEDIDO_UBICACION.length - sep.length;
  const recortada = confirmacion.length > espacio ? `${confirmacion.slice(0, Math.max(0, espacio - 1)).trimEnd()}…` : confirmacion;
  return `${recortada}${sep}${PEDIDO_UBICACION}`;
}

async function handleRequest(request, env = globalThis) {
  const payload = await readJson(request);
  const ctx = contexto(payload, env);
  const confirmacion = limpiarTexto(ctx.input.texto ?? ctx.input.text);
  if (!confirmacion) {
    return json({ ok: false, reason: "falta_texto", message: "Falta `texto`: la confirmacion del pedido con su codigo (*Codigo de pedido:* #KP...). Vuelve a llamar con ese texto." });
  }
  const interactivo = {
    type: "interactive",
    interactive: { type: "location_request_message", body: { text: armarCuerpo(confirmacion) }, action: { name: "send_location" } },
  };
  if (ctx.dryRun) return json({ ok: true, dryRun: true, mensaje: interactivo });
  if (!ctx.apiKey || !ctx.phoneNumberId || !(ctx.to || ctx.bsuid)) {
    return json({ ok: false, reason: "sin_contexto", message: "No pude enviar. Manda la confirmacion del pedido con send_text." });
  }
  const r = await enviar(interactivo, ctx);
  if (r.ok) {
    return json({ ok: true, sent: "location_request", messageId: r.messageId, message: "Confirmacion y pedido de ubicacion enviados en un solo mensaje. NO repitas la confirmacion. Guarda stage=orden_creada y complete_task." });
  }
  const t = await enviar({ type: "text", text: { body: `${confirmacion}\n\n${RESPALDO_TEXTO}` } }, ctx);
  return json(t.ok
    ? { ok: true, sent: "text_fallback", messageId: t.messageId, error: r.error, message: "Confirmacion enviada (como texto). NO la repitas. Guarda stage=orden_creada y complete_task." }
    : { ok: false, reason: "envio_fallido", error: t.error || r.error, message: "No salio nada: manda la confirmacion del pedido con send_text." });
}

async function enviar(mensaje, ctx) {
  const body = { messaging_product: "whatsapp", ...(ctx.to ? { to: ctx.to } : { recipient: ctx.bsuid }), ...mensaje };
  try {
    const res = await deps.fetch(`${KAPSO}/meta/whatsapp/v24.0/${ctx.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ctx.apiKey },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(result).slice(0, 200)}` };
    return { ok: true, messageId: result?.messages?.[0]?.id || null };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 200) };
  }
}

function contexto(payload, env) {
  const input = isPlainObject(payload.input) ? payload.input : payload;
  const conv = payload.whatsapp_context?.conversation || {};
  const ec = payload.execution_context || {};
  return {
    input,
    apiKey: env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "",
    phoneNumberId: conv.phone_number_id || payload.whatsapp_context?.phone_number_id || ec.system?.whatsapp_config?.phone_number_id || ec.context?.phone_number_id || "",
    to: conv.phone_number || ec.context?.phone_number || "",
    bsuid: conv.business_scoped_user_id || ec.context?.business_scoped_user_id || conv.businessScopedUserId || ec.context?.businessScopedUserId || "",
    dryRun: input.dryRun === true || payload.dryRun === true,
  };
}

async function readJson(request) {
  try { return (await request.json()) || {}; } catch { return {}; }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

globalThis.__kenkuPedirUbicacion = { handler, handleRequest, armarCuerpo, deps, PEDIDO_UBICACION, RESPALDO_TEXTO };
