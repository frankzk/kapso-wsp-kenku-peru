// send-followup-envio: el seguimiento "Cuando gustes lo retomamos" (paso s2)
// con la forma de pago EXACTA de la zona del cliente.
//
// Por que existe: el s2 era un send_text fijo que cerraba con "En la mayoria de
// zonas *pagas recien al recibir*". Desde que los leads de la web llegan con su
// zona, a los de agencia se les dice en el mensaje del precio que separan con
// S/ 30, y una hora despues el s2 les decia lo contrario (paso de verdad el
// 2026-10-30, Llochegua). Aca se arma la frase con la cobertura real:
//   - contraentrega -> "A *Distrito* te lo llevamos a tu puerta y pagas al recibir"
//   - agencia con adelanto (Shalom) -> "va por agencia Shalom: lo separas con S/ 30..."
//   - agencia sin adelanto (Olva, pago completo) -> sin frase de pago: no se
//     ofrece nada que no aplique.
//   - zona desconocida o cobertura que no responde -> la frase de siempre.
//
// La zona sale de order_region / order_province / order_district, que
// save_order_state deja en las variables de la ejecucion (verificado
// 2026-10-30), tanto si vino del boton de la web como si el cliente la dio en
// el chat. La cobertura se consulta en el momento con check-coverage, la misma
// fuente que usa el cierre del pedido.
//
// Contrato: el cliente recibe EXACTAMENTE UN mensaje de texto. La funcion nunca
// lanza: si no puede enviar devuelve ok:false y el flujo sigue a la espera
// siguiente igual que con el send_text.

const CHECK_COVERAGE_FN = "05a6107d-6488-4bb3-8088-9f2fce140b5e";
const KAPSO = "https://api.kapso.ai";

// Texto que tenia el nodo fu-s2 en Kapso (editado a mano el 2026-10-30).
const FRASE_GENERICA = "En la mayoría de zonas *pagas recién al recibir* 😊";

// Igual que send-reminder: a las 07:00 salen juntos los seguimientos retenidos
// por el horario nocturno, asi que la consulta tiene presupuesto y un reintento.
const COVERAGE_BUDGET_MS = 15000;
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
  const zona = zonaDe(ctx.vars);
  const cobertura = zona && ctx.apiKey ? await consultarCobertura(zona, ctx.vars, ctx.apiKey) : null;
  const texto = armarTexto(ctx.vars.followup_hint, zona, cobertura);
  const diag = { zona: zona ? `${zona.region} / ${zona.province} / ${zona.district}` : null, modo: cobertura?.modo || "generica" };

  // Para revisar el texto con datos reales sin mandarle nada al cliente.
  if (ctx.dryRun) return json({ ok: true, sent: false, dryRun: true, texto, diag });

  if (!ctx.apiKey || !ctx.phoneNumberId || !(ctx.to || ctx.bsuid)) {
    return json({ ok: false, sent: false, reason: "sin_contexto", diag });
  }
  const res = await enviar({ type: "text", text: { body: texto } }, ctx);
  return json(res.ok
    ? { ok: true, sent: "text", messageId: res.messageId, diag }
    : { ok: false, sent: false, reason: "envio_fallido", error: res.error, diag });
}

function zonaDe(vars) {
  const limpio = (v) => String(v ?? "").trim();
  const district = limpio(vars.order_district);
  const province = limpio(vars.order_province);
  const region = limpio(vars.order_region);
  // check-coverage necesita el distrito y al menos provincia o region; sin eso
  // devuelve needs_location y no hay nada exacto que decir.
  if (!district || !(province || region)) return null;
  return { region, province, district };
}

// Reduce la respuesta de check-coverage a lo que decide la frase. null si no
// se pudo confirmar: needs_location, needs_location_confirmation o error.
function leerCobertura(res) {
  if (!res || typeof res.cashOnDelivery !== "boolean") return null;
  if (res.cashOnDelivery) return { modo: "contraentrega" };
  if (res.shippingMode !== "agencia") return null;
  const adelanto = Number(res.advanceAmount) || 0;
  return adelanto > 0
    ? { modo: "agencia_adelanto", courier: String(res.courier || "Shalom"), adelanto }
    : { modo: "agencia_sin_adelanto", courier: String(res.courier || "") };
}

function armarTexto(hint, zona, cobertura) {
  const pista = String(hint ?? "").trim().replace(/[\s.,;:—-]+$/, "");
  const inicio = pista ? `Cuando gustes lo retomamos: ${pista}.` : "Cuando gustes lo retomamos 🙌";
  if (!cobertura) return `${inicio} ${FRASE_GENERICA}`;
  const lugar = `*${zona.district}*`;
  if (cobertura.modo === "contraentrega") return `${inicio} A ${lugar} te lo llevamos a tu puerta y *pagas recién al recibir* 😊`;
  if (cobertura.modo === "agencia_adelanto") {
    return `${inicio} A ${lugar} va por agencia *${cobertura.courier}*: lo separas con *${soles(cobertura.adelanto)}* (se descuenta del total) y el saldo lo pagas al recoger 😊`;
  }
  // Agencia con pago completo por adelantado: mejor no hablar de pago que
  // ofrecer algo que no aplica.
  return pista ? `Cuando gustes lo retomamos: ${pista} 😊` : inicio;
}

async function consultarCobertura(zona, vars, apiKey) {
  // La direccion va para que check-coverage detecte un courier ya elegido
  // ("Shalom de ...", "Olva ...") igual que en el cierre.
  const direccion = [vars.order_address, vars.order_reference].filter(Boolean).join(" ");
  const input = { ...zona, ...(direccion ? { address: direccion } : {}) };
  const limite = deps.ahora() + COVERAGE_BUDGET_MS;
  for (let intento = 1; intento <= 2; intento += 1) {
    const restante = limite - deps.ahora();
    if (restante < 2000) break;
    const res = await invocar(CHECK_COVERAGE_FN, input, apiKey, restante);
    if (res) return leerCobertura(res);
    if (intento === 1) await deps.dormir(PAUSA_REINTENTO_MS);
  }
  return null;
}

async function invocar(functionId, input, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await deps.fetch(`${KAPSO}/platform/v1/functions/${functionId}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => ({}));
    let data = body?.data ?? body;
    if (typeof data?.result === "string") data = JSON.parse(data.result);
    else if (data?.result && typeof data.result === "object") data = data.result;
    return isPlainObject(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Mismo envio que send-reminder: telefono en `to`, lead por username (BSUID)
// en `recipient` (ver CLAUDE.md, "Enviar a leads que entran por username").
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
  const input = isPlainObject(payload.input) ? payload.input : {};
  const conv = payload.whatsapp_context?.conversation || {};
  const ec = payload.execution_context || {};
  const vars = isPlainObject(ec.vars) ? ec.vars
    : isPlainObject(payload.vars) ? payload.vars
      : isPlainObject(input.vars) ? input.vars : {};
  return {
    apiKey: env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "",
    phoneNumberId: conv.phone_number_id
      || payload.whatsapp_context?.phone_number_id
      || ec.system?.whatsapp_config?.phone_number_id
      || ec.context?.phone_number_id || "",
    to: conv.phone_number || ec.context?.phone_number || "",
    bsuid: conv.business_scoped_user_id || ec.context?.business_scoped_user_id
      || conv.businessScopedUserId || ec.context?.businessScopedUserId || "",
    vars,
    dryRun: input.dryRun === true || payload.dryRun === true,
  };
}

function soles(n) {
  return `S/ ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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

globalThis.__kenkuSendFollowupEnvio = { handler, handleRequest, contexto, zonaDe, leerCobertura, armarTexto, consultarCobertura, enviar, deps, FRASE_GENERICA };
