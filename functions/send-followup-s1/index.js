// send-followup-s1: el primer seguimiento (s1, a los 20 min de silencio) con la
// prueba A/B T7: "la pregunta pendiente en botones".
//
// Por que existe: el s1 era un send_text fijo, igual para cualquier estado:
//   "{{vars.followup_hint}} — ¿te quedó alguna duda? Con gusto te la respondo."
// Es el toque que mas vende (2,27 compras cada 100 enviados, EXPERIMENTOS §5).
// T7 (PRUEBAS_AB_MIREVA.md) prueba si repetir, en el ultimo mensaje y con un
// solo toque, la pregunta que el cliente dejo sin contestar rinde mas que la
// invitacion generica a dudas. Se conserva la pregunta abierta ("¿Te quedó
// alguna duda?") para que la unica diferencia sea el boton.
//
// Brazos, sorteados por telefono con sal propia "fu1:" (ortogonal a "fu4:" de
// F/R, a "present:" de A/D y a la futura "ficha:" de T11):
//   S (control): SIEMPRE el texto de siempre, byte a byte igual al nodo viejo.
//   T (tratamiento), segun el estado de la conversacion (caso):
//     ubicacion -> stage producto_mostrado, sin zona ni direccion guardada:
//                  texto con la pregunta abierta + botones Lima / Provincia.
//     cantidad  -> ya dio distrito y no eligio cantidad: texto + botones
//                  "1 unidad (S/ X)" / "3x2 (S/ 2X)" con el precio real del
//                  mismo buscador que usa la presentacion. Precio variable, sin
//                  stock o sin cotizacion -> caso otro.
//     otro      -> el texto de siempre (en los dos brazos: piso de ruido).
//   Si WhatsApp rechaza los botones sale el texto de siempre (sent
//   "text_fallback"), y se cuenta igual en T (intencion de tratar).
// El CASO se calcula igual en los dos brazos (incluida la busqueda de precio),
// asi "cantidad en S" y "cantidad en T" son la misma poblacion.
//
// DORMIDA POR DEFECTO: con PRUEBA_T_ACTIVA = false todos reciben el texto de
// siempre y la respuesta dice prueba:"dormida" (el sorteo y el caso se informan
// igual, sirve para medir el volumen por caso antes de arrancar). Para
// arrancar: poner true y redeploy. Para apagar de emergencia: false y
// redeploy, o volver el nodo fu-s1 a send_text (scripts/patch_fu_s1.py
// --revertir).
//
// Lectura: el nodo deja {brazo, caso, sent, ...} en el resultado de la
// ejecucion, y con la prueba activa escribe en KV `s1x_phone:<9 digitos>` el
// PRIMER s1 de cada telefono (como abx_phone de customer-lookup), para que la
// lectura no tenga que paginar los eventos de miles de ejecuciones. El brazo
// ademas se puede recalcular del telefono con brazoS1().
//
// Contrato (igual que el send_text): el cliente recibe EXACTAMENTE UN mensaje.
// La funcion nunca lanza: si no puede enviar devuelve ok:false y el flujo sigue
// a fu-w2 igual que antes.

const PRUEBA_T_ACTIVA = false;
const SAL = "fu1:";

const PRODUCT_LOOKUP_FN = "21cd24f1-ed57-4303-988c-043bf4bc8069";
const KAPSO = "https://api.kapso.ai";

// Lo que deja el nodo init-hint si el agente nunca guardo followup_hint.
const HINT_INICIAL = "tu consulta quedo pendiente — te ayudo a retomarla cuando quieras";
// Texto que tenia el nodo fu-s1 en Kapso, despues de "{{vars.followup_hint}}".
const COLA_CONTROL = " — ¿te quedó alguna duda? Con gusto te la respondo.";

// Limites de WhatsApp para mensajes interactivos de botones.
const MAX_BOTONES = 3;
const MAX_TITULO = 20;
const MAX_CUERPO = 1024;

// TIEMPOS. Kapso corta el invoke a los 30 s; a las 07:00 salen juntos los s1
// retenidos por el horario nocturno y el catalogo viene lento (send-reminder
// l.21-27). Todo se cuenta desde que empieza el invoke y deja 5 s de margen.
const PRESUPUESTO_TOTAL_MS = 25000;
const HISTORIAL_MS = 4000;
const LOOKUP_MS = 12000;
const PAUSA_REINTENTO_LOOKUP_MS = 1000;
const ENVIO_MS = 8000;
// Ante un 429 de Meta se reintenta a los 1,5 s y a los 3 s, si queda tiempo
// para el reintento y, detras, para el texto de siempre.
const ESPERAS_429_MS = [1500, 3000];
const RESERVA_TEXTO_MS = 4000;

const KV_TTL_S = 90 * 24 * 3600;

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
  const limite = deps.ahora() + PRESUPUESTO_TOTAL_MS;
  const payload = await readJson(request);
  const ctx = contexto(payload, env);
  const textoControl = armarTextoControl(ctx.vars.followup_hint);
  const estado = { enviado: false };
  try {
    return json(await procesar(payload, ctx, env, limite, textoControl, estado));
  } catch (error) {
    // Nunca lanza. Si todavia no salio nada, sale el texto de siempre: el
    // cliente no puede quedarse sin su s1 por un error de esta funcion.
    const diag = { error: String(error?.message || error).slice(0, 200) };
    if (ctx.dryRun || estado.enviado || !puedeEnviar(ctx)) {
      return json({ ok: false, sent: false, reason: "error", brazo: "S", caso: "otro", diag });
    }
    try {
      const res = await enviar({ type: "text", text: { body: textoControl } }, ctx, ENVIO_MS);
      return json(res.ok
        ? { ok: true, sent: "text", brazo: "S", caso: "otro", messageId: res.messageId, reason: "error", diag }
        : { ok: false, sent: false, reason: "envio_fallido", brazo: "S", caso: "otro", error: res.error, diag });
    } catch (error2) {
      return json({ ok: false, sent: false, reason: "error", brazo: "S", caso: "otro", diag: { ...diag, error2: String(error2?.message || error2).slice(0, 200) } });
    }
  }
}

async function procesar(payload, ctx, env, limite, textoControl, estado) {
  const reparto = repartir(ctx, env);
  const historial = await leerHistorial(payload, ctx, limite);
  const decision = await decidirCaso(ctx.vars, historial, ctx, limite);
  const { caso } = decision;

  const conBotones = reparto.brazo === "T" && caso !== "otro";
  const mensaje = conBotones
    ? { tipo: "buttons", bodyText: decision.bodyText, botones: decision.botones }
    : { tipo: "text", bodyText: textoControl };

  const base = {
    brazo: reparto.brazo,
    caso,
    prueba: reparto.prueba,
    sorteo: reparto.sorteo,
    ...(reparto.forzado ? { forzado: true } : {}),
    stage: String(ctx.vars.stage || "") || null,
  };
  const diag = { motivo: decision.motivo, historial: historial.fuente, ...(decision.precio ? { precio: decision.precio } : {}) };

  // Para revisar con datos reales sin mandarle nada al cliente.
  if (ctx.dryRun) {
    return { ok: true, sent: false, dryRun: true, ...base, texto: textoControl, mensaje, diag };
  }
  if (!puedeEnviar(ctx)) return { ok: false, sent: false, reason: "sin_contexto", ...base, diag };

  let sent;
  let res;
  if (conBotones) {
    res = await enviarConReintento(interactivo(decision.bodyText, decision.botones), ctx, limite, false);
    if (res.ok) {
      sent = "buttons";
    } else {
      diag.botonesRechazados = res.error;
      res = await enviarConReintento({ type: "text", text: { body: textoControl } }, ctx, limite, true);
      sent = "text_fallback";
    }
  } else {
    res = await enviarConReintento({ type: "text", text: { body: textoControl } }, ctx, limite, true);
    sent = "text";
  }
  if (!res.ok) return { ok: false, sent: false, reason: "envio_fallido", ...base, error: res.error, diag };
  estado.enviado = true;

  await registrar(env, ctx, reparto, { ...base, sent });
  return { ok: true, sent, ...base, messageId: res.messageId, diag };
}

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

// Mismo hash que brazoSeguimiento (check-coverage): FNV-1a + mezclador de
// avalancha sobre TODOS los digitos del telefono de WhatsApp (con el 51). El
// mezclador es obligatorio: el bit bajo de FNV-1a con sal queda correlacionado
// con el hash sin sal (EXPERIMENTOS.md §3, "Cuidado con el hash").
function brazoS1(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return mixSeg32(fnvSeg1a(`${SAL}${digits}`)) % 2 === 0 ? "S" : "T";
}

// Sin telefono (lead por username, solo BSUID): S y fuera de la cuenta, como
// en A/D y F/R. Telefonos de prueba (secreto S1_TELEFONOS_PRUEBA, digitos
// separados por coma): T aunque la prueba este dormida, para probar en el
// sandbox; no se registran en KV.
function repartir(ctx, env) {
  const sorteo = brazoS1(ctx.to);
  const digits = String(ctx.to || "").replace(/\D/g, "");
  const prueba = telefonosPrueba(env);
  if (digits && prueba.has(digits)) return { brazo: "T", sorteo, prueba: PRUEBA_T_ACTIVA ? "activa" : "dormida", forzado: true };
  let brazo = PRUEBA_T_ACTIVA && sorteo ? sorteo : "S";
  // Solo en dryRun: ver lo que recibiria cada brazo sin redeploy.
  if (ctx.dryRun && (ctx.simularBrazo === "T" || ctx.simularBrazo === "S")) brazo = ctx.simularBrazo;
  return { brazo, sorteo, prueba: PRUEBA_T_ACTIVA ? "activa" : "dormida", forzado: false };
}

function telefonosPrueba(env) {
  const raw = String(env?.S1_TELEFONOS_PRUEBA || globalThis.S1_TELEFONOS_PRUEBA || "");
  return new Set(raw.split(/[,\s]+/).map((t) => t.replace(/\D/g, "")).filter(Boolean));
}

function fnvSeg1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixSeg32(value) {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Caso: que pregunta quedo pendiente. Solo variables que ya existen (stage del
// prompt l.278, order_* de save-order-state, known_address de customer-lookup,
// last_product_* del prompt l.277) mas el historial reciente del chat para no
// repetir una pregunta que el cliente ya contesto sin que el agente la guardara.
// ---------------------------------------------------------------------------

async function decidirCaso(vars, historial, ctx, limite) {
  const v = (k) => String(vars?.[k] ?? "").trim();
  const stage = v("stage").toLowerCase();
  const handle = v("last_product_handle");
  const titulo = v("last_product_title");
  const otro = (motivo, extra = {}) => ({ caso: "otro", motivo, ...extra });

  if (v("known_address")) return otro("cliente_con_direccion");
  if (v("order_address")) return otro("direccion_guardada");
  if (v("order_promo") || v("order_quantity")) return otro("cantidad_elegida");
  const conZona = Boolean(v("order_district"));

  if (!conZona) {
    if (stage !== "producto_mostrado") return otro(`stage_${stage || "vacio"}`);
    if (v("order_province") || v("order_region")) return otro("zona_parcial");
    if (!handle && !titulo) return otro("sin_producto");
    if (historial.mensajes && yaContestoUbicacion(historial.mensajes)) return otro("ya_contesto_ubicacion");
    const lead = cabeza(vars.followup_hint, titulo);
    if (!lead) return otro("sin_pista");
    return {
      caso: "ubicacion",
      motivo: "ok",
      bodyText: `${lead} 😊 ¿Te quedó alguna duda? Y para dejarlo listo: ¿estás en *Lima* o en *provincia*?`,
      botones: [{ id: "s1_lima", title: "Lima" }, { id: "s1_provincia", title: "Provincia" }],
    };
  }

  if (stage !== "producto_mostrado" && stage !== "datos_envio") return otro(`stage_${stage || "vacio"}`);
  if (!handle) return otro("sin_producto");
  if (historial.mensajes && yaEligioCantidad(historial.mensajes)) return otro("ya_contesto_cantidad");
  // En agencia el agente puede estar pidiendo la oficina Shalom (prompt
  // l.152-161): la pregunta pendiente no es la cantidad.
  if (historial.mensajes && ultimoSalienteDeAgencia(historial.mensajes)) return otro("ruta_agencia");
  const lead = cabeza(vars.followup_hint, titulo);
  if (!lead) return otro("sin_pista");

  const lookup = await buscarPrecio(handle, ctx, limite);
  const precio = precioUnico(lookup.data, handle);
  if (!precio.ok) return otro(precio.reason, { precio: { estado: lookup.estado, motivo: precio.reason } });
  const unidad = unidadDe(String(lookup.data.product.title || titulo));
  const p = precio.precio;
  const botones = [
    { id: "s1_1u", title: `1 ${unidad.sing} (${soles(p)})` },
    { id: "s1_3x2", title: `3x2 (${soles(p * 2)})` },
  ];
  if (botones.some((b) => b.title.length > MAX_TITULO)) return otro("boton_largo", { precio: { estado: "ok", valor: p } });
  return {
    caso: "cantidad",
    motivo: "ok",
    precio: { estado: "ok", valor: p },
    bodyText: `${lead} 😊 ¿Te quedó alguna duda? Si quieres lo dejo listo: ¿1 ${unidad.sing} por *${soles(p)}* o el *3x2* (3 por *${soles(p * 2)}*, pagas solo 2)?`,
    botones,
  };
}

// El comienzo del mensaje del tratamiento: el followup_hint con la primera
// letra en mayuscula y sin puntuacion final. Si el hint no sirve (vacio, el de
// init-hint, una pregunta, un link, muy largo), se arma con el titulo del
// producto; sin eso, no hay tratamiento (caso otro).
function cabeza(hint, titulo) {
  const pista = String(hint ?? "").trim().replace(/[\s.,;:—–-]+$/, "");
  const usable = pista
    && pista !== HINT_INICIAL
    && !/[?¿\n]|https?:\/\//i.test(pista)
    && pista.length <= 120;
  if (usable) return mayusculaInicial(pista);
  const nombre = nombreCorto(titulo);
  return nombre ? `Quedaste viendo *${nombre.replace(/\*/g, "")}*` : "";
}

function mayusculaInicial(text) {
  // Salta *, _ y ~ del formato de WhatsApp: "*black seed*" -> "*Black seed*".
  const m = /^([*_~]*)(.)/su.exec(text);
  if (!m) return text;
  return m[1] + m[2].toLocaleUpperCase("es") + text.slice(m[0].length);
}

function sinTildes(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function entrantes(mensajes) {
  return mensajes.filter((m) => m.direccion === "inbound").map((m) => sinTildes(m.texto).toLowerCase());
}

function yaContestoUbicacion(mensajes) {
  return entrantes(mensajes).some((t) => /\b(lima|provincia|provincias)\b/.test(t));
}

function yaEligioCantidad(mensajes) {
  return entrantes(mensajes).some((t) => /\b(3\s*x\s*2|5\s*x\s*3|1\s*unidad|una\s*unidad|1\s*par|un\s*par)\b/.test(t));
}

function ultimoSalienteDeAgencia(mensajes) {
  const salientes = mensajes.filter((m) => m.direccion === "outbound" && m.texto);
  const ultimo = salientes[salientes.length - 1];
  return Boolean(ultimo) && /\b(shalom|olva|agencia|adelanto|voucher|yape)\b/i.test(sinTildes(ultimo.texto));
}

// ---------------------------------------------------------------------------
// Historial reciente del chat. Si el payload lo trae (whatsapp_context.messages)
// se usa ese; si no, se piden los ultimos 20 al proxy de Kapso. Sin historial
// el caso se decide solo con las variables (diag.historial "no_disponible").
// ---------------------------------------------------------------------------

async function leerHistorial(payload, ctx, limite) {
  const delPayload = payload?.whatsapp_context?.messages;
  if (Array.isArray(delPayload) && delPayload.length) return { fuente: "payload", mensajes: normalizarMensajes(delPayload) };
  if (!ctx.apiKey || !ctx.phoneNumberId || !ctx.conversationId) return { fuente: "no_disponible", mensajes: null };
  const timeout = Math.min(HISTORIAL_MS, limite - deps.ahora() - 15000);
  if (timeout < 500) return { fuente: "sin_tiempo", mensajes: null };
  const url = `${KAPSO}/meta/whatsapp/v24.0/${encodeURIComponent(ctx.phoneNumberId)}/messages`
    + `?conversation_id=${encodeURIComponent(ctx.conversationId)}&limit=20`;
  const res = await pedir(url, { headers: { "X-API-Key": ctx.apiKey } }, timeout);
  if (!res.ok || !Array.isArray(res.body?.data)) return { fuente: "no_disponible", mensajes: null };
  return { fuente: "api", mensajes: normalizarMensajes(res.body.data) };
}

function normalizarMensajes(lista) {
  return lista
    .filter((m) => m && typeof m === "object")
    .map((m, i) => ({
      direccion: String(m.kapso?.direction || m.direction || "").toLowerCase(),
      texto: textoDe(m),
      ts: Number(m.timestamp || Date.parse(m.created_at || "") / 1000 || 0),
      i,
    }))
    .sort((a, b) => (a.ts - b.ts) || (a.i - b.i));
}

// Igual que inboundText de check-coverage, mas los textos de salida
// (interactivos, captions) para leer el ultimo mensaje del bot.
function textoDe(m) {
  return String(
    m?.button?.text
    || m?.interactive?.button_reply?.title
    || m?.interactive?.list_reply?.title
    || m?.interactive?.body?.text
    || m?.text?.body
    || m?.image?.caption
    || m?.kapso?.content
    || m?.content
    || ""
  );
}

// ---------------------------------------------------------------------------
// Precio: shopify-product-lookup con la misma entrada que send-presentation
// (l.126) y las mismas guardas (precioUnico, l.455-478). Ante cualquier duda,
// sin precio: caso otro.
// ---------------------------------------------------------------------------

async function buscarPrecio(handle, ctx, limite) {
  if (!ctx.apiKey) return { estado: "sin_api_key", data: null };
  let estado = "sin_tiempo";
  for (let intento = 1; intento <= 2; intento += 1) {
    // Deja lugar para el envio (y su texto de respaldo) despues del lookup.
    const restante = Math.min(LOOKUP_MS, limite - deps.ahora() - 2 * RESERVA_TEXTO_MS);
    if (restante < 2000) break;
    const res = await invocar(PRODUCT_LOOKUP_FN, { product: handle, message: handle }, ctx.apiKey, restante);
    if (res.data) return { estado: intento === 1 ? "ok" : "ok_reintento", data: res.data };
    estado = res.estado;
    if (intento === 1) await deps.dormir(PAUSA_REINTENTO_LOOKUP_MS);
  }
  return { estado, data: null };
}

function precioUnico(lookup, handle) {
  if (!lookup || lookup.found !== true || !lookup.product) return { ok: false, reason: "producto_no_encontrado" };
  if (lookup.reliableMatch === false) return { ok: false, reason: "producto_ambiguo" };
  const encontrado = String(lookup.product.handle || "").trim();
  if (handle && encontrado && encontrado.toLowerCase() !== String(handle).trim().toLowerCase()) {
    return { ok: false, reason: "producto_distinto" };
  }
  if (lookup.outOfStock) return { ok: false, reason: "agotado" };
  const disponibles = (lookup.product.variants || [])
    .filter((v) => v && v.availableForSale !== false && v.price !== null && v.price !== "" && Number.isFinite(Number(v.price)) && Number(v.price) > 0);
  if (!disponibles.length) return { ok: false, reason: "sin_precio" };
  const precios = [...new Set(disponibles.map((v) => Number(v.price)))];
  if (precios.length > 1) return { ok: false, reason: "precio_variable" };
  return { ok: true, precio: precios[0] };
}

// "par" SOLO para calzado y medias (copia de send-presentation l.440-446).
const PAR_RE = /\b(zapatillas?|zapatos?|sandalias?|botas?|botines?|pantuflas?|medias?|calcetines?)\b/i;

function unidadDe(titulo) {
  return PAR_RE.test(sinTildes(titulo)) ? { sing: "par", plur: "pares" } : { sing: "unidad", plur: "unidades" };
}

// Copia de send-presentation l.450-454.
function nombreCorto(titulo) {
  const t = String(titulo || "").trim();
  const corte = t.split(/\s[–—-]\s/)[0].trim();
  return (corte.length >= 4 ? corte : t).slice(0, 80);
}

// Copia de send-presentation l.480-483: "S/ 89", "S/ 89.90".
function soles(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return `S/ ${Number.isInteger(v) ? String(v) : v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

// Lo que renderizaba el send_text de fu-s1: "{{vars.followup_hint}} — ...".
// Sin recortar ni capitalizar: el control tiene que ser identico a lo de antes.
function armarTextoControl(hint) {
  const pista = hint === undefined || hint === null ? HINT_INICIAL : String(hint);
  return `${pista}${COLA_CONTROL}`;
}

// Payload igual al de send-buttons (l.69-79), con los limites de WhatsApp.
function interactivo(bodyText, botones) {
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: String(bodyText).slice(0, MAX_CUERPO) },
      action: {
        buttons: botones.slice(0, MAX_BOTONES).map((b, i) => ({
          type: "reply",
          reply: { id: String(b.id || `btn_${i + 1}`).slice(0, 256), title: String(b.title).slice(0, MAX_TITULO) },
        })),
      },
    },
  };
}

function puedeEnviar(ctx) {
  return Boolean(ctx.apiKey && ctx.phoneNumberId && (ctx.to || ctx.bsuid));
}

// Envia con reintento ante 429 (1,5 s y 3 s) mientras quede tiempo. Para los
// botones se reserva tiempo para el texto de respaldo; el texto (ultimo
// recurso) usa lo que quede.
async function enviarConReintento(mensaje, ctx, limite, esUltimo) {
  let res = await enviar(mensaje, ctx, tiempoEnvio(limite, esUltimo));
  for (const espera of ESPERAS_429_MS) {
    if (res.ok || res.status !== 429) break;
    const quedaria = limite - deps.ahora() - espera - (esUltimo ? 0 : RESERVA_TEXTO_MS);
    if (quedaria < 2000) break;
    await deps.dormir(espera);
    res = await enviar(mensaje, ctx, tiempoEnvio(limite, esUltimo));
  }
  return res;
}

function tiempoEnvio(limite, esUltimo) {
  const restante = limite - deps.ahora() - (esUltimo ? 0 : RESERVA_TEXTO_MS);
  return Math.max(2000, Math.min(ENVIO_MS, restante));
}

// Telefono en `to`, lead por username (BSUID) en `recipient` (CLAUDE.md,
// "Enviar a leads que entran por username"): con `to` Meta responde 200 y el
// mensaje muere despues con 131026.
async function enviar(mensaje, ctx, timeoutMs) {
  const body = {
    messaging_product: "whatsapp",
    ...(ctx.to ? { to: ctx.to } : { recipient: ctx.bsuid }),
    ...mensaje,
  };
  const res = await pedir(`${KAPSO}/meta/whatsapp/v24.0/${ctx.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": ctx.apiKey },
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  return { ok: true, messageId: res.body?.messages?.[0]?.id || null };
}

async function invocar(functionId, input, apiKey, timeoutMs) {
  const res = await pedir(`${KAPSO}/platform/v1/functions/${functionId}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ input }),
  }, timeoutMs);
  if (!res.ok) return { estado: res.status ? `http_${res.status}` : res.error, data: null };
  try {
    let data = res.body?.data ?? res.body;
    if (typeof data?.result === "string") data = JSON.parse(data.result);
    else if (data?.result && typeof data.result === "object") data = data.result;
    return isPlainObject(data) ? { estado: "ok", data } : { estado: "respuesta_invalida", data: null };
  } catch {
    return { estado: "respuesta_invalida", data: null };
  }
}

async function pedir(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await deps.fetch(url, { ...opts, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, error: `${response.status} ${JSON.stringify(body).slice(0, 200)}` };
    return { ok: true, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name === "AbortError" ? "timeout" : String(error?.message || error).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Registro para la lectura: el PRIMER s1 de cada telefono durante la prueba.
// Solo con la prueba activa, con telefono y sin forzar (los de prueba no
// cuentan). No pisa un registro anterior: el lead pertenece al caso de su
// primer s1.
// ---------------------------------------------------------------------------

async function registrar(env, ctx, reparto, datos) {
  try {
    if (!PRUEBA_T_ACTIVA || reparto.forzado || !reparto.sorteo) return;
    const kv = env?.KV || globalThis.KV;
    if (!kv) return;
    const nueve = String(ctx.to || "").replace(/\D/g, "").slice(-9);
    if (nueve.length !== 9) return;
    const key = `s1x_phone:${nueve}`;
    if (await kv.get(key)) return;
    const day = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await kv.put(key, JSON.stringify({
      brazo: datos.brazo,
      caso: datos.caso,
      sent: datos.sent,
      stage: datos.stage,
      day,
      at: new Date().toISOString(),
      conversationId: ctx.conversationId || null,
    }), { expirationTtl: KV_TTL_S });
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------

function contexto(payload, env) {
  const input = isPlainObject(payload.input) ? payload.input : {};
  const conv = payload.whatsapp_context?.conversation || {};
  const ec = payload.execution_context || {};
  const vars = isPlainObject(ec.vars) ? ec.vars
    : isPlainObject(payload.vars) ? payload.vars
      : isPlainObject(input.vars) ? input.vars : {};
  return {
    apiKey: env?.KAPSO_API_KEY || env?.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "",
    phoneNumberId: conv.phone_number_id
      || payload.whatsapp_context?.phone_number_id
      || ec.system?.whatsapp_config?.phone_number_id
      || ec.context?.phone_number_id || "",
    to: conv.phone_number || ec.context?.phone_number || "",
    bsuid: conv.business_scoped_user_id || ec.context?.business_scoped_user_id
      || conv.businessScopedUserId || ec.context?.businessScopedUserId || "",
    conversationId: conv.id || ec.context?.conversation_id || "",
    vars,
    dryRun: input.dryRun === true || payload.dryRun === true,
    simularBrazo: String(input.simularBrazo || payload.simularBrazo || "").toUpperCase(),
  };
}

async function readJson(request) {
  try {
    const text = await request.text();
    return text.trim() ? JSON.parse(text) || {} : {};
  } catch {
    return {};
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

globalThis.__kenkuSendFollowupS1 = {
  handler, handleRequest, brazoS1, repartir, decidirCaso, cabeza, armarTextoControl, interactivo, precioUnico,
  soles, unidadDe, yaContestoUbicacion, yaEligioCantidad, ultimoSalienteDeAgencia, normalizarMensajes,
  deps, PRUEBA_T_ACTIVA, SAL, HINT_INICIAL, COLA_CONTROL, MAX_TITULO, MAX_BOTONES,
};
