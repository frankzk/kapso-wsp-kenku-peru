// Guarda el estado del pedido con un ESQUEMA FIJO y validado.
//
// Por que existe: hasta ahora el agente guardaba los datos de envio con
// save_variable eligiendo el nombre el mismo, y se inventaba uno distinto casi
// cada vez. Auditoria del 2026-08-31 sobre 400 ejecuciones:
//   cantidad  -> quantity(6), quantity_selected(4), cantidad(1), order_quantity(1),
//                last_quantity(1), selected_promo(1)
//   direccion -> address(3), customer_address(2), delivery_address(1),
//                direccion_confirmada(1), address_confirmed(1), address_reference(1)
//   distrito  -> district(4), customer_district(1), customer_city(1)  [ninguna "distrito"]
//   nombre    -> customer_name, nombre_envio, shipping_name, delivery_name,
//                customer_receiver_name  (una cada uno)
// De las 96 ejecuciones que llegaron a la zona de cierre, el distrito estaba
// guardado en ~6 y la cantidad en ~13. El dato solo vivia en el contexto del
// agente, asi que cualquier otro nodo (o un reinicio) arrancaba ciego. Es la
// misma clase de problema que el pedido #KP129457, creado sin direccion.
//
// La leccion de send-text aplica igual: pedirselo al prompt no alcanza. Aca el
// agente pasa los datos y el CODIGO decide como se llaman y si son validos.
//
// Doble escritura a proposito:
//   - `vars` en la respuesta: Kapso las fusiona al ejecutar la funcion como
//     nodo. Como herramienta del agente NO esta verificado que lo haga.
//   - KV `orderstate:<conversationId>`: fuente confiable pase lo que pase, y la
//     que puede leer create-shopify-order para validar contra lo acordado.
// Ademas acumula: cada llamada mezcla con lo ya guardado, asi el agente puede
// mandar los datos de a poco (primero distrito, despues cantidad, etc.).

const STATE_TTL_S = 14 * 24 * 3600;

// Alias -> campo canonico. El agente puede mandar cualquiera de estos nombres.
const ALIASES = {
  district: ["district", "distrito", "customer_district", "city", "ciudad", "customer_city"],
  province: ["province", "provincia"],
  region: ["region", "departamento", "department"],
  quantity: ["quantity", "quantity_selected", "cantidad", "order_quantity", "last_quantity", "cantidad_elegida", "units", "unidades"],
  promo: ["promo", "selected_promo", "promocion", "oferta"],
  address: ["address", "direccion", "delivery_address", "customer_address", "shipping_address"],
  reference: ["reference", "referencia", "address_reference", "referencia_direccion"],
  receiver_name: ["receiver_name", "receiverName", "nombre", "nombre_envio", "shipping_name",
    "delivery_name", "customer_receiver_name", "customer_name", "a_nombre_de"],
  phone: ["phone", "telefono", "celular", "delivery_phone", "confirmed_phone", "contact_phone",
    "known_phone", "known_customer_phone", "customer_phone", "customerPhone", "phone_number",
    "phoneNumber", "numero", "numero_celular", "movil", "whatsapp_phone", "telefono_contacto"],
  dni: ["dni", "customer_dni", "documento"],
  product_handle: ["product_handle", "productHandle", "handle", "last_product_handle"],
  product_title: ["product_title", "productTitle", "titulo", "last_product_title"],
};

function pick(input, field) {
  for (const alias of ALIASES[field]) {
    const v = input[alias];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  if (field === "phone") return pickPhoneLoose(input);
  return undefined;
}

// Red de seguridad para el telefono: si el agente lo manda con un nombre que no
// esta en ALIASES, antes se perdia en silencio y el estado quedaba con
// missing=[phone]. El agente leia eso como "el numero no vale" y se lo repetia
// al cliente. Aca se acepta cualquier clave que hable de telefono SIEMPRE que el
// valor sea un celular peruano de verdad (nunca un *_id ni un phone_number_id).
const PHONE_KEY_RE = /(phone|telefono|celular|movil|numero|whatsapp)/i;
const PHONE_KEY_BLOCK_RE = /(id|number_id|numberid)$/i;

function pickPhoneLoose(input) {
  for (const [key, value] of Object.entries(input || {})) {
    if (!PHONE_KEY_RE.test(key)) continue;
    if (PHONE_KEY_BLOCK_RE.test(key)) continue;
    if (value === undefined || value === null || String(value).trim() === "") continue;
    if (isPeruMobile(value)) return value;
  }
  return undefined;
}

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function stripAccents(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Mismos placeholders que create-shopify-order: "-, -" y compania no son una
// direccion (asi se colo el pedido #KP129457).
const PLACEHOLDERS = new Set([
  "por coordinar", "por confirmar", "sin direccion", "no tiene", "no tengo",
  "pendiente", "na", "n a", "s n", "sn", "ninguna", "ninguno", "x", "xx", "xxx",
]);

function isPlaceholder(value) {
  const raw = stripAccents(clean(value)).toLowerCase();
  if (!raw) return true;
  const compact = raw.replace(/[^a-z0-9]+/g, " ").trim();
  if (!compact) return true;
  if (PLACEHOLDERS.has(compact)) return true;
  return raw.replace(/[^a-z0-9]/g, "").length < 3;
}

function isPeruMobile(value) {
  const digits = String(value == null ? "" : value).replace(/\D/g, "").replace(/^51/, "");
  return digits.length === 9 && digits.startsWith("9");
}

function normalizePhone(value) {
  return String(value == null ? "" : value).replace(/\D/g, "").replace(/^51/, "");
}

// El celular del cliente tal como lo expone el chat. Viene por el contexto de
// ejecucion (nodo del workflow) o por whatsapp_context (herramienta del agente);
// wa_id es el mismo dato con otro nombre segun el canal.
function chatPhone(payload) {
  const context = payload?.execution_context?.context || {};
  const contact = context.contact || {};
  const wa = payload?.whatsapp_context || {};
  return context.phone_number || contact.wa_id || wa.conversation?.phone_number || wa.contact?.wa_id || "";
}

// "3x2" -> 3 unidades, "5x3" -> 5. Es la fuente de mas confusion de precios,
// asi que la cantidad se deriva de la promo y no al reves.
function normalizePromo(value) {
  const raw = stripAccents(clean(value)).toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  if (raw.includes("5x3")) return { promo: "5x3", quantity: 5 };
  if (raw.includes("3x2")) return { promo: "3x2", quantity: 3 };
  if (/^(1|1unidad|unidad|1u)$/.test(raw)) return { promo: "1u", quantity: 1 };
  return null;
}

function normalizeQuantity(value) {
  const n = Number(String(value == null ? "" : value).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

// Campos minimos para poder crear un pedido contraentrega.
const REQUIRED = ["district", "province", "quantity", "address", "receiver_name", "phone"];

function buildState(previous, input) {
  const state = { ...previous };
  const rejected = [];

  const promoRaw = pick(input, "promo");
  const promo = normalizePromo(promoRaw);
  if (promo) {
    state.promo = promo.promo;
    state.quantity = promo.quantity;
  } else if (promoRaw !== undefined) {
    rejected.push({ field: "promo", value: clean(promoRaw), reason: "no es 1u, 3x2 ni 5x3" });
  }

  const qtyRaw = pick(input, "quantity");
  if (qtyRaw !== undefined) {
    const q = normalizeQuantity(qtyRaw);
    // Si ya vino una promo valida, ella manda: evita que "3x2" se guarde como 2.
    if (q && !promo) state.quantity = q;
    else if (!q) rejected.push({ field: "quantity", value: clean(qtyRaw), reason: "no es un numero valido" });
  }

  const addrRaw = pick(input, "address");
  if (addrRaw !== undefined) {
    if (isPlaceholder(addrRaw)) {
      rejected.push({ field: "address", value: clean(addrRaw), reason: "no es una direccion entregable" });
    } else {
      state.address = clean(addrRaw);
    }
  }

  const phoneRaw = pick(input, "phone");
  if (phoneRaw !== undefined) {
    if (isPeruMobile(phoneRaw)) state.phone = normalizePhone(phoneRaw);
    else rejected.push({ field: "phone", value: clean(phoneRaw), reason: "debe ser un celular peruano de 9 digitos que empieza en 9" });
  }

  for (const field of ["district", "province", "region", "reference", "receiver_name", "dni", "product_handle", "product_title"]) {
    const v = pick(input, field);
    if (v === undefined) continue;
    const c = clean(v);
    if (!c) continue;
    if ((field === "district" || field === "province" || field === "receiver_name") && isPlaceholder(c)) {
      rejected.push({ field, value: c, reason: "valor vacio o de relleno" });
      continue;
    }
    state[field] = c;
  }

  return { state, rejected };
}

function toVars(state) {
  const vars = {};
  for (const [k, v] of Object.entries(state)) {
    if (v === undefined || v === null || v === "") continue;
    vars[`order_${k}`] = v;
  }
  return vars;
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

    const conversationId =
      input.conversationId ||
      input.conversation_id ||
      payload.whatsapp_context?.conversation?.id ||
      payload.execution_context?.context?.conversation_id;

    const kv = env.KV || globalThis.KV;
    const key = conversationId ? `orderstate:${conversationId}` : null;

    let previous = {};
    if (kv && key) {
      try {
        const raw = await kv.get(key);
        if (raw) previous = JSON.parse(raw) || {};
      } catch {
        previous = {};
      }
      // updated_at es metadato del guardado, no un campo del pedido: si se deja
      // vuelve a entrar al estado en cada lectura y termina saliendo como una
      // variable `order_updated_at` que no le sirve a nadie.
      delete previous.updated_at;
    }

    const { state, rejected } = buildState(previous, input);

    // El telefono ya lo tenemos: es el numero del chat, salvo en los leads que
    // entran por username de WhatsApp (esos si hay que pedirlo, y para eso esta
    // needs_phone). Sembrarlo aca evita el peor bug posible en la zona de
    // cierre: como `phone` estaba en REQUIRED y nadie lo sembraba, el estado
    // salia con missing=[phone], el agente se lo pedia al cliente y, cuando el
    // cliente respondia con el numero de su propio chat, le contestaba que no
    // era valido. Paso de verdad el 31/08/2026 (Javier, Huancayo): tres vueltas
    // del mismo numero, alerta al equipo y la conversacion cortada por
    // loop-guard con el pedido a medio hacer.
    const fromChat = chatPhone(payload);
    if (!state.phone && isPeruMobile(fromChat)) state.phone = normalizePhone(fromChat);

    // Un numero rechazado deja de ser un problema si el del chat ya esta: el
    // agente no debe pedirlo de nuevo ni decirle nada al cliente.
    const phoneRejected = rejected.findIndex((r) => r.field === "phone");
    let phoneNote = "";
    if (phoneRejected !== -1 && state.phone) {
      rejected.splice(phoneRejected, 1);
      phoneNote = `El numero alternativo que mandaste no es un celular peruano, asi que se mantiene el del chat (${state.phone}). NO le digas al cliente que su numero es invalido ni se lo vuelvas a pedir.`;
    }

    const missing = REQUIRED.filter((f) => state[f] === undefined || state[f] === null || state[f] === "");

    if (kv && key) {
      try {
        await kv.put(key, JSON.stringify({ ...state, updated_at: new Date().toISOString() }), { expirationTtl: STATE_TTL_S });
      } catch {
        // best effort: el estado igual vuelve en `vars` y en la respuesta
      }
    }

    const parts = [];
    if (phoneNote) parts.push(phoneNote);
    if (rejected.length) {
      parts.push("NO se guardaron estos datos: "
        + rejected.map((r) => `${r.field} ("${r.value}") ${r.reason}`).join("; ")
        + ". Pediselos de nuevo al cliente; no los inventes ni pongas relleno.");
    }
    parts.push(missing.length
      ? `Todavia falta para poder crear el pedido: ${missing.join(", ")}. Pedi SOLO lo que falta, de a un dato por turno y sin repetir lo que ya tenes.`
      : "Estado completo: ya tenes todo para mostrar el resumen y pedir la confirmacion.");

    return json({
      ok: rejected.length === 0,
      saved: state,
      rejected,
      missing,
      complete: missing.length === 0,
      persisted: Boolean(kv && key),
      vars: toVars(state),
      message: parts.join(" "),
    });
  } catch (error) {
    return json({ ok: false, reason: "save_order_state_error", error: safeError(error) });
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

globalThis.__kenkuSaveOrderState = { buildState, chatPhone, isPlaceholder, isPeruMobile, normalizePhone, normalizePromo, pickPhoneLoose, toVars, handleRequest, handler };
