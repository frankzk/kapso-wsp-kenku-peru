// send-presentation: manda la presentacion completa de un producto en UNA sola
// llamada del agente.
//
// Por que existe (COSTOS.md): la presentacion es la misma secuencia para todos
// los productos — saludo, fotos, video, beneficio, precio, testimonio, botones —
// y el agente la ejecutaba mensaje por mensaje, con un `pause` entre cada uno.
// Cada envio y cada pausa es una iteracion del modelo con el prompt entero
// adentro (~22.000 tokens): ~18 llamadas para mandar una plantilla. Aca se
// hacen los envios y las pausas en codigo, y el modelo solo escribe las dos
// lineas que si necesitan criterio: el saludo y el beneficio.
//
// PRINCIPIO: la funcion solo cubre el caso limpio. Ante cualquier duda
// (producto ambiguo, agotado, precio que cambia segun la variante, lead de la
// variante de control) NO manda nada y devuelve ok:false, y el agente presenta
// a mano como siempre. Nunca adivina.
//
// Es la variante "D" del A/B (ver customer-lookup / abVariant). Si el lead no
// es "D" la funcion se niega por codigo, asi la separacion del experimento no
// depende de que el modelo lea bien una variable.

// Fuentes de verdad: se INVOCAN las mismas funciones que usa el agente en vez
// de reimplementarlas, para que el precio y las fotos sean exactamente los
// mismos que veria en el camino manual. El precio de shopify-product-lookup sale
// del mismo catalogo publico que usa quote-order para cotizar.
const PRODUCT_LOOKUP_FN = "21cd24f1-ed57-4303-988c-043bf4bc8069";
const MEDIA_LOOKUP_FN = "d4e6365e-4736-4e92-872a-259adb6634f2";
const KAPSO = "https://api.kapso.ai";

const VARIANTE_TRATAMIENTO = "D";

// Igual que quote-order (FREE_SHIPPING_THRESHOLD, comparacion estricta).
const FREE_SHIPPING_THRESHOLD = 40;

// Ritmo: el mismo que pedia el prompt para `pause` (2-4 s, variando). Esperar no
// cuesta tokens; lo que costaba era despertar al modelo para esperar. Ademas el
// hueco evita que un texto llegue antes que la imagen que se mando antes que el.
const PAUSA_MIN_MS = 2000;
const PAUSA_MAX_MS = 4000;
// El video tarda mas en procesarse del lado de Meta.
const PAUSA_TRAS_VIDEO_MS = 4500;

const deps = {
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  azar: () => Math.random(),
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
  const input = isPlainObject(payload.input) ? payload.input : payload;
  const ctx = contexto(payload, input, env);

  // --- Guardas: todo lo que no sea el caso limpio vuelve al camino manual ---

  const variante = String(ctx.vars.ab_variant || "").trim().toUpperCase();
  if (variante !== VARIANTE_TRATAMIENTO) {
    return rechazo("variante_control",
      "Este cliente es de la variante de control: NO uses esta herramienta. Presenta a mano como siempre (PRESENTACION DE PRODUCTO).");
  }
  if (!ctx.apiKey || !ctx.phoneNumberId || !(ctx.to || ctx.bsuid)) {
    return rechazo("sin_contexto", "No pude identificar el chat. Presenta a mano como siempre (PRESENTACION DE PRODUCTO).");
  }

  const producto = String(input.product || input.handle || input.producto || "").trim();
  if (!producto) {
    return rechazo("sin_producto", "Falta `product` (el handle de shopify_product_lookup). Presenta a mano como siempre.");
  }

  const saludo = sanitize(input.saludo || input.greeting || "").clean;
  const beneficio = sanitize(input.beneficio || input.benefit || "").clean;
  if (!saludo || !beneficio) {
    return rechazo("faltan_textos",
      "Faltan `saludo` y/o `beneficio` (o eran narracion interna). Vuelve a llamar con las dos lineas escritas para el cliente.");
  }
  // El beneficio va ANTES del precio a proposito: si trae precio, promo o link
  // arruina la secuencia.
  if (/S\/\s?\d|https?:\/\/|3x2|5x3/i.test(beneficio)) {
    return rechazo("beneficio_con_precio",
      "El `beneficio` no puede traer precio, promos ni links: es una linea sobre el RESULTADO para el cliente. Reescribela y vuelve a llamar.");
  }

  const [lookup, medios] = await Promise.all([
    invocar(PRODUCT_LOOKUP_FN, { product: producto, message: producto }, ctx.apiKey),
    invocar(MEDIA_LOOKUP_FN, { product: producto, presentation: true, includeVideo: true }, ctx.apiKey),
  ]);

  const precio = precioUnico(lookup);
  if (!precio.ok) return rechazo(precio.reason, precio.message);

  const titulo = String(lookup.product.title || "").trim();
  const nombre = sanitize(input.nombre || input.name || "").clean || nombreCorto(titulo);
  const unidad = unidadDe(titulo);
  const media = Array.isArray(medios?.media) ? medios.media : [];

  const pasos = armarSecuencia({
    saludo,
    beneficio,
    nombre,
    media,
    precio: precio.precio,
    antes: precio.antes,
    unidad,
    knownAddress: String(ctx.vars.known_address || "").trim(),
  });

  // --- Envio: en orden, esperando cada respuesta, y cortando en el primer error ---

  const enviados = [];
  for (let i = 0; i < pasos.length; i += 1) {
    const paso = pasos[i];
    if (i > 0) {
      const previo = pasos[i - 1];
      await deps.dormir(previo.tipo === "video" ? PAUSA_TRAS_VIDEO_MS : pausa());
    }
    const res = await enviar(paso, ctx);
    if (!res.ok) {
      await registrar(env, ctx, "parcial");
      return json({
        ok: false,
        reason: "envio_parcial",
        enviados: enviados.map((p) => p.paso),
        fallo: { paso: paso.paso, error: res.error },
        pendientes: pasos.slice(i).map(describir),
        message: enviados.length
          ? `Se enviaron ${enviados.map((p) => p.paso).join(", ")} y fallo "${paso.paso}". Manda a mano SOLO lo que falta (campo pendientes), en ese orden, y sigue normal. No repitas lo que ya se envio.`
          : "No se envio nada. Presenta a mano como siempre (PRESENTACION DE PRODUCTO).",
      });
    }
    enviados.push({ paso: paso.paso, messageId: res.messageId });
  }

  await registrar(env, ctx, "completa");
  return json({
    ok: true,
    sent: true,
    producto: { handle: lookup.product.handle, titulo, precio: precio.precio },
    enviados: enviados.map((p) => p.paso),
    message: "Presentacion enviada completa, incluida la pregunta final con botones. NO repitas nada de eso."
      + " Ahora guarda stage=\"producto_mostrado\" + followup_hint y llama complete_task.",
  });
}

// ---------------------------------------------------------------------------
// Armado de la secuencia. Es el orden de PRESENTACION DE PRODUCTO del prompt:
// Msg 1 saludo, 2 principal, 3 antes/despues, 5 video, 5b beneficio, 6 precio,
// 7 testimonio, 8 botones. Los pasos de media se omiten sin avisar si no hay
// material; los de texto van siempre.
// ---------------------------------------------------------------------------

function armarSecuencia({ saludo, beneficio, nombre, media, precio, antes, unidad, knownAddress }) {
  const porRol = (rol) => media.find((m) => m && m.role === rol && (m.url || m.mediaUrl));
  const url = (m) => m.url || m.mediaUrl;
  const pasos = [];

  pasos.push({ paso: "saludo", tipo: "text", body: { body: saludo } });

  const principal = porRol("principal");
  if (principal) pasos.push({ paso: "foto_principal", tipo: "image", body: { link: url(principal), caption: nombre } });

  const antesDespues = porRol("antes_despues");
  if (antesDespues) pasos.push({ paso: "foto_antes_despues", tipo: "image", body: { link: url(antesDespues) } });

  const video = porRol("video");
  if (video) pasos.push({ paso: "video", tipo: "video", body: { link: url(video), caption: `Mira este video corto del *${nombre}* 🎬` } });

  pasos.push({ paso: "beneficio", tipo: "text", body: { body: beneficio } });
  pasos.push({ paso: "precio", tipo: "text", body: { body: lineaPrecio({ nombre, precio, antes, unidad }) } });

  const testimonio = porRol("testimonio");
  if (testimonio) pasos.push({ paso: "testimonio", tipo: "image", body: { link: url(testimonio), caption: "Lo que dicen nuestros clientes 💬" } });

  pasos.push(knownAddress
    ? {
      paso: "pregunta_final",
      tipo: "buttons",
      body: botones(`¿Te lo enviamos a ${knownAddress}, como la vez pasada? 😊`, ["Si, la misma", "Cambiar direccion"]),
    }
    : {
      paso: "pregunta_final",
      tipo: "buttons",
      body: botones("Por cierto 😊, ¿te encuentras en *Lima* o en *provincia*?", ["Lima", "Provincia"]),
    });

  return pasos;
}

// Msg 6 del prompt. El ladder es el mismo que calcula quote-order: 3 unidades
// pagan 2, 5 pagan 3 (ver countFreeUnits).
function lineaPrecio({ nombre, precio, antes, unidad }) {
  let cabeza = `*${nombre}* queda en *${soles(precio)}* por ${unidad.sing}`;
  if (antes && antes > precio) cabeza += ` (antes *${soles(antes)}*)`;
  if (precio > FREE_SHIPPING_THRESHOLD) cabeza += " con *envío gratis* 📦";
  cabeza += ", en la mayoría de zonas *pagas al recibir* y con *garantía de 30 días* 🛡️ 😊.";
  return [
    cabeza,
    "",
    "🔥 Promociones disponibles:",
    `• 1 ${unidad.sing}: *${soles(precio)}*`,
    `• 3x2: Lleva 3 ${unidad.plur} por *${soles(precio * 2)}* (pagas solo 2)`,
    `• 5x3: Lleva 5 ${unidad.plur} por *${soles(precio * 3)}* (pagas solo 3)`,
  ].join("\n");
}

function botones(bodyText, titulos) {
  return {
    type: "button",
    body: { text: bodyText.slice(0, 1024) },
    action: {
      buttons: titulos.map((t, i) => ({ type: "reply", reply: { id: `btn_${i + 1}`, title: t.slice(0, 20) } })),
    },
  };
}

// "par" SOLO para calzado y medias; todo lo demas es "unidad". Es la regla del
// prompt, y la falla que la origino (el bot ofrecio "1 par" de una pulsera) es
// justo el tipo de error que el codigo no comete. Se mira el titulo porque en
// este catalogo `productType` viene vacio.
const PAR_RE = /\b(zapatillas?|zapatos?|sandalias?|botas?|botines?|pantuflas?|medias?|calcetines?)\b/i;

function unidadDe(titulo) {
  return PAR_RE.test(sinTildes(titulo))
    ? { sing: "par", plur: "pares" }
    : { sing: "unidad", plur: "unidades" };
}

// "Magnesio 12 en 1 Complex – Capsulas para..." -> "Magnesio 12 en 1 Complex".
// Solo se usa si el agente no manda `nombre`.
function nombreCorto(titulo) {
  const t = String(titulo || "").trim();
  const corte = t.split(/\s[–—-]\s/)[0].trim();
  return (corte.length >= 4 ? corte : t).slice(0, 80);
}

// El precio tiene que ser UNO. Si las variantes disponibles tienen precios
// distintos, "queda en S/ X" seria mentira para alguna: se deja al agente.
function precioUnico(lookup) {
  if (!lookup || lookup.found !== true || !lookup.product) {
    return { ok: false, reason: "producto_no_encontrado", message: "No encontre el producto. Presenta a mano como siempre (PRESENTACION DE PRODUCTO)." };
  }
  if (lookup.reliableMatch === false) {
    return { ok: false, reason: "producto_ambiguo", message: "La busqueda no es inequivoca. Resuelve el producto con shopify_product_lookup y presenta a mano." };
  }
  if (lookup.outOfStock) {
    return { ok: false, reason: "agotado", message: "El producto esta agotado: aplica las reglas de STOCK del prompt. NO lo presentes." };
  }
  const disponibles = (lookup.product.variants || []).filter((v) => v && v.availableForSale !== false && Number.isFinite(Number(v.price)));
  if (!disponibles.length) {
    return { ok: false, reason: "sin_precio", message: "No hay precio disponible. Presenta a mano como siempre." };
  }
  const precios = [...new Set(disponibles.map((v) => Number(v.price)))];
  if (precios.length > 1) {
    return { ok: false, reason: "precio_variable", message: "El precio cambia segun la variante. Presenta a mano como siempre (PRESENTACION DE PRODUCTO)." };
  }
  const antesSet = [...new Set(disponibles.map((v) => Number(v.compareAtPrice)).filter((n) => Number.isFinite(n) && n > 0))];
  return { ok: true, precio: precios[0], antes: antesSet.length === 1 ? antesSet[0] : null };
}

function soles(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return `S/ ${Number.isInteger(v) ? String(v) : v.toFixed(2)}`;
}

function pausa() {
  return Math.round(PAUSA_MIN_MS + deps.azar() * (PAUSA_MAX_MS - PAUSA_MIN_MS));
}

function describir(p) {
  if (p.tipo === "text") return { paso: p.paso, tipo: "texto", texto: p.body.body };
  if (p.tipo === "buttons") return { paso: p.paso, tipo: "botones", bodyText: p.body.body.text, botones: p.body.action.buttons.map((b) => b.reply.title) };
  return { paso: p.paso, tipo: p.tipo, url: p.body.link, caption: p.body.caption || "" };
}

// ---------------------------------------------------------------------------
// Envio y contexto. Misma resolucion de destinatario que send-text: los leads
// que entran por username no tienen telefono, solo BSUID, y van en `recipient`.
// Con `to` Meta responde 200 con messageId y el mensaje muere despues con 131026.
// ---------------------------------------------------------------------------

async function enviar(paso, ctx) {
  const body = {
    messaging_product: "whatsapp",
    ...(ctx.to ? { to: ctx.to } : { recipient: ctx.bsuid }),
  };
  if (paso.tipo === "text") Object.assign(body, { type: "text", text: paso.body });
  else if (paso.tipo === "image") Object.assign(body, { type: "image", image: limpiarCaption(paso.body) });
  else if (paso.tipo === "video") Object.assign(body, { type: "video", video: limpiarCaption(paso.body) });
  else if (paso.tipo === "buttons") Object.assign(body, { type: "interactive", interactive: paso.body });

  try {
    const response = await fetch(`${KAPSO}/meta/whatsapp/v24.0/${ctx.phoneNumberId}/messages`, {
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

function limpiarCaption(media) {
  return media.caption ? media : { link: media.link };
}

function contexto(payload, input, env) {
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
    conversationId: conv.id || ec.context?.conversation_id || "",
    vars: isPlainObject(ec.vars) ? ec.vars : (isPlainObject(payload.vars) ? payload.vars : {}),
  };
}

async function invocar(functionId, input, apiKey) {
  try {
    const response = await fetch(`${KAPSO}/platform/v1/functions/${functionId}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ input }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return body?.data ?? body;
  } catch {
    return null;
  }
}

// Registro de adopcion: cuantas presentaciones de la variante D salieron por la
// funcion. Sin esto no se puede separar "D no convierte distinto" de "el agente
// casi nunca uso la herramienta".
async function registrar(env, ctx, resultado) {
  try {
    const kv = env.KV || globalThis.KV;
    if (!kv || !ctx.conversationId) return;
    const day = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await kv.put(`abx_present:${day}:${resultado}:${ctx.conversationId}`, "1", { expirationTtl: 90 * 24 * 3600 });
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// Sanitizador de narracion: COPIA de send-text (las funciones no comparten
// modulos). Las dos lineas que escribe el agente pasan por el mismo filtro que
// cualquier send_text. Si cambia alla, cambiar aca: el test compara las dos.
// ---------------------------------------------------------------------------

const TOOL_NAMES = [
  "complete_task", "handoff_to_human", "save_variable", "get_variable",
  "enter_waiting", "send_media", "send_notification_to_user", "send_text",
  "get_whatsapp_context", "get_current_datetime", "get_execution_metadata",
  "product_media_lookup", "shopify_product_lookup", "check_coverage",
  "create_shopify_order", "customer_lookup", "send_buttons", "send_payment",
  "quote_order", "notify_team", "loop_guard", "campaign_report",
  "send_presentation",
];

const PROCESS_PATTERNS = [
  /\bprocedo\s+con\b/i,
  /\bahora\s+(procedo|llamo|completo|envio|uso)\b/i,
  /\bvoy\s+a\s+(llamar|usar|ejecutar|invocar)\b/i,
  /\bprimero\s+(llamo|voy\s+a\s+llamar)\b/i,
  /\bpaso\s+\d+\s*:/i,
  /\bel\s+resultado\s+(muestra|devolvio|indica)\b/i,
  /\bambos\s+valores\s+existen\b/i,
  /\bla\s+herramienta\s+(devolvio|indica|dice)\b/i,
  /\b(el\s+)?lookup\s+(devolvio|muestra)\b/i,
  /\bhago\s+el\s+lookup\b/i,
  /\bdejame\s+revisar\b/i,
  /\bcompleto\s+la\s+tarea\b/i,
  /\bfinalizar\s+la\s+tarea\b/i,
  /\bsegun\s+(las\s+)?instrucciones\b/i,
  /\bdebo\s+(llamar|usar|ejecutar|invocar|enviar)\b/i,
  /\bno\s+fue\s+encontrado\s+en\s+la\s+busqueda\b/i,
  /\bbusqueda\s+de\s+medios\b/i,
  /\bno\s+(devolvio|arrojo)\s+(resultados|nada|datos)\b/i,
  /\b(la\s+)?(busqueda|consulta)\s+no\s+(devolvio|arrojo|encontro)\b/i,
];

function sinTildes(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function looksLikeNarration(fragment) {
  const text = sinTildes(fragment);
  if (!text.trim()) return false;
  const lower = text.toLowerCase();
  for (const tool of TOOL_NAMES) if (lower.includes(tool)) return true;
  for (const re of PROCESS_PATTERNS) if (re.test(text)) return true;
  return false;
}

function splitFragments(text) {
  const parts = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) { parts.push(line); continue; }
    const chunks = line.match(/[^.!?]+[.!?]*\s*/g) || [line];
    for (const c of chunks) parts.push(c);
    parts.push("\n");
  }
  return parts;
}

function hasNoRealContent(text) {
  return String(text || "").replace(/[^\p{L}\p{N}]/gu, "").length < 3;
}

function sanitize(text) {
  try {
    const original = String(text == null ? "" : text);
    if (!original.trim()) return { clean: "", removed: [] };
    const removed = [];
    let clean = splitFragments(original)
      .map((frag) => {
        if (frag === "\n" || !frag.trim()) return frag;
        if (looksLikeNarration(frag)) { removed.push(frag.trim()); return ""; }
        return frag;
      })
      .join("");
    clean = clean.replace(/\n{3,}/g, "\n\n").trim();
    if (hasNoRealContent(clean)) return { clean: "", removed: removed.length ? removed : [original.trim()] };
    return { clean, removed };
  } catch {
    return { clean: String(text == null ? "" : text), removed: [], failed: true };
  }
}

// ---------------------------------------------------------------------------

function rechazo(reason, message) {
  return json({ ok: false, sent: false, reason, message });
}

async function readJson(request) {
  try {
    const text = await request.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

globalThis.__kenkuSendPresentation = {
  handler, handleRequest, armarSecuencia, lineaPrecio, precioUnico, unidadDe, nombreCorto, sanitize, deps,
};
