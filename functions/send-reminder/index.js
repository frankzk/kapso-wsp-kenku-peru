// send-reminder: el recordatorio "Aquí sigo" de los seguimientos (paso p5),
// sin modelo.
//
// Por que existe: el p5 era un nodo agente cuyo prompt decia "manda UN mensaje
// con este TEXTO exacto, con la primera foto del producto si hay". El modelo no
// decidia nada, pero cada recordatorio le costaba ~5 llamadas (get_variable x2,
// product_media_lookup, send_media, complete_task): medido 2026-10-29, 782
// recordatorios y US$13 en un dia, el 36% del gasto de modelo del flujo. Aca se
// hace lo mismo en codigo.
//
// Contrato (igual que el p5): el cliente recibe EXACTAMENTE UN mensaje: la
// primera foto del producto con el TEXTO al pie o, si no hay producto, foto o la
// foto falla, el TEXTO solo. Nunca los dos. La funcion nunca lanza: si no puede
// enviar, devuelve ok:false y el flujo sigue igual hacia la espera siguiente.

const MEDIA_LOOKUP_FN = "d4e6365e-4736-4e92-872a-259adb6634f2";
const KAPSO = "https://api.kapso.ai";

const TEXTO = "Aquí sigo por si lo quieres retomar 🙌 Me escribes y te lo dejo listo en un toque.";

// La busqueda de la foto no puede comerse el invoke (Kapso corta a los 30 s):
// tiene 22 s en total y quedan ~8 s para el envio. Si falla, se reintenta una
// vez mientras quede tiempo. Medido 2026-10-30: a las 07:00 salen juntos los
// recordatorios retenidos por el horario nocturno (~150) y con un solo intento
// de 12 s la mitad se quedaba sin foto; la misma busqueda, en calma, tarda ~1 s.
const LOOKUP_BUDGET_MS = 22000;
const PAUSA_REINTENTO_MS = 1000;

const deps = {
  fetch: (...a) => fetch(...a),
  ahora: () => Date.now(),
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

async function handleRequest(request, env = globalThis) {
  const payload = await readJson(request);
  const ctx = contexto(payload, env);
  if (!ctx.apiKey || !ctx.phoneNumberId || !(ctx.to || ctx.bsuid)) {
    return json({ ok: false, sent: false, reason: "sin_contexto" });
  }

  const handle = String(ctx.vars.last_product_handle || "").trim();
  const titulo = String(ctx.vars.last_product_title || "").trim();
  const busqueda = { motivo: "" };
  const foto = handle || titulo ? await primeraFoto({ handle, product: titulo || handle }, ctx.apiKey, busqueda) : "";
  // Para auditar en los eventos de la ejecucion por que salio solo el texto.
  const diag = { producto: Boolean(handle || titulo), busqueda: busqueda.motivo || (foto ? "ok" : "sin_producto") };

  if (foto) {
    const res = await enviar({ type: "image", image: { link: foto, caption: TEXTO } }, ctx);
    if (res.ok) return json({ ok: true, sent: "image", messageId: res.messageId, diag });
    diag.fotoRechazada = res.error;
  }
  const res = await enviar({ type: "text", text: { body: TEXTO } }, ctx);
  return json(res.ok
    ? { ok: true, sent: "text", messageId: res.messageId, diag }
    : { ok: false, sent: false, reason: "envio_fallido", error: res.error, diag });
}

async function primeraFoto(input, apiKey, busqueda = {}) {
  const limite = deps.ahora() + LOOKUP_BUDGET_MS;
  for (let intento = 1; intento <= 2; intento += 1) {
    const restante = limite - deps.ahora();
    if (restante < 2000) break;
    const foto = await buscarFoto(input, apiKey, busqueda, restante);
    if (foto) return foto;
    // Si la busqueda respondio bien pero el producto no tiene foto, no hay que reintentar.
    if (String(busqueda.motivo || "").startsWith("sin_foto")) break;
    busqueda.intentos = intento;
    if (intento === 1) await deps.dormir(PAUSA_REINTENTO_MS);
  }
  return "";
}

async function buscarFoto(input, apiKey, busqueda, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await deps.fetch(`${KAPSO}/platform/v1/functions/${MEDIA_LOOKUP_FN}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ input: { ...input, limit: 1 } }),
      signal: controller.signal,
    });
    if (!response.ok) { busqueda.motivo = `http_${response.status}`; return ""; }
    const body = await response.json().catch(() => ({}));
    let data = body?.data ?? body;
    if (typeof data?.result === "string") data = JSON.parse(data.result);
    else if (data?.result && typeof data.result === "object") data = data.result;
    const item = (Array.isArray(data?.media) ? data.media : [])
      .find((m) => m && (m.mediaType || m.type || "image") === "image" && (m.mediaUrl || m.url));
    if (!item) busqueda.motivo = `sin_foto:${data?.reason || data?.found === false ? "no_encontrado" : (Array.isArray(data?.media) ? data.media.length : "sin_media")}`;
    return item ? String(item.mediaUrl || item.url) : "";
  } catch (error) {
    busqueda.motivo = error?.name === "AbortError" ? "timeout" : "error";
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// Mismo envio que send-presentation: telefono en `to`, lead por username
// (BSUID) en `recipient` (ver CLAUDE.md, "Enviar a leads que entran por username").
async function enviar(mensaje, ctx) {
  const body = {
    messaging_product: "whatsapp",
    ...(ctx.to ? { to: ctx.to } : { recipient: ctx.bsuid }),
    ...mensaje,
  };
  try {
    const response = await deps.fetch(`${KAPSO}/meta/whatsapp/v24.0/${ctx.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ctx.apiKey },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `${response.status} ${JSON.stringify(result).slice(0, 200)}` };
    return { ok: true, messageId: result?.messages?.[0]?.id || null };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 200) };
  }
}

function contexto(payload, env) {
  const conv = payload.whatsapp_context?.conversation || {};
  const ec = payload.execution_context || {};
  return {
    apiKey: env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "",
    phoneNumberId: conv.phone_number_id
      || payload.whatsapp_context?.phone_number_id
      || ec.system?.whatsapp_config?.phone_number_id
      || ec.context?.phone_number_id || "",
    to: conv.phone_number || ec.context?.phone_number || "",
    bsuid: conv.business_scoped_user_id || ec.context?.business_scoped_user_id
      || conv.businessScopedUserId || ec.context?.businessScopedUserId || "",
    vars: isPlainObject(ec.vars) ? ec.vars : (isPlainObject(payload.vars) ? payload.vars : {}),
  };
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

globalThis.__kenkuSendReminder = { handler, handleRequest, contexto, primeraFoto, enviar, deps, TEXTO };
