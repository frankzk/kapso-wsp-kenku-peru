const DEFAULT_SHOP_DOMAIN = "kenkuperu.myshopify.com";
const DEFAULT_API_VERSION = "2026-04";

// Mapa deterministico anuncio (CTWA) -> handle del producto real. El titular/
// cuerpo del anuncio NO siempre resuelve por busqueda (ej. "Adios Irritacion
// Post-Afeitado" o "hongos en pies" caian en productos equivocados o en un set
// generico de suplementos), asi que fijamos el producto por el ad_id.
// Para agregar un anuncio nuevo: pon su Source ID (ad_id) -> handle del producto.
const AD_PRODUCT_MAP = {
  "120248448610150056": "true-beauty-aceite-post-afeitado-donut-glaseado",           // Adios Irritacion Post-Afeitado
  "120249183604400267": "nails-repairing-suero-reparador-de-unas",                    // Elimina Hongos en Pies
  "120249183576750267": "nails-repairing-suero-reparador-de-unas",                    // Elimina Hongos en Pies (variante)
  "120249921111920267": "nails-repairing-suero-reparador-de-unas",                    // Elimina Hongos en Pies (variante)
  "120250561081440066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra
  "120250269305230267": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120249751052160267": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120253592159240066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120253592247800066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120253592159250066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120253592159230066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120253592247790066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120253592159130066": "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels", // El poder de la semilla negra (variante -> Black Seed Oil)
  "120246240033570250": "feel-virgin-gel-intimo-reafirmante-e-hidratante-con-aloe-vera-y-acido-hialuronico-30-ml", // FEEL VIRGIN – Gel Intimo
  "120248517618300056": "kojic-acid-turmeric-cleansing-pads",                        // Ilumina Tu Piel Apagada
  "120248448453350056": "hair-™-capsulas-para-crecimiento-capilar-con-hierro-hemo-biotina-y-quercetina-para-crecimiento-densidad-y-fuerza-formula-avanzada-natural-120-capsulas-superhuman™", // Recupera Fuerza y Densidad (Hair+)
  "120248592918830056": "hair-™-capsulas-para-crecimiento-capilar-con-hierro-hemo-biotina-y-quercetina-para-crecimiento-densidad-y-fuerza-formula-avanzada-natural-120-capsulas-superhuman™", // Recupera Fuerza y Densidad (variante -> Hair+)
  "120253283957870120": "shampoo-de-cebolla-rebrota-fortalecimiento-capilar-y-control-de-caida-con-romero-y-canela", // Mas densidad, menos caida (Shampoo de Cebolla REBROTA — confirmado por el dueno)
  "120248136956750056": "shampoo-biru-anticaspa-ideaslabco",                          // ¿Cansado de la caspa...? (Shampoo Biru Anticaspa)
  "120248136956730056": "shampoo-biru-anticaspa-ideaslabco",                          // ¿Cansado de la caspa...? (variante -> Shampoo Biru Anticaspa)
  "120248299887110056": "shampoo-biru-anticaspa-ideaslabco",                          // ¿Cansado de la caspa...? (variante -> Shampoo Biru Anticaspa)
  "120248446351820056": "truefem-balance-capsulas-para-el-equilibrio-hormonal-y-bienestar-femenino-60-capsulas-superhuman™", // Recupera Tu Equilibrio Diario (TrueFem Balance)
  "120248592509430056": "saffron-advanced-capsulas-naturales-para-elevar-el-animo-y-reducir-el-estres-frasco-60-capsulas-superhuman™", // Recupera Tu Equilibrio Diario (variante -> Saffron+ Advanced, confirmado por el dueno)
  "120248592492790056": "saffron-advanced-capsulas-naturales-para-elevar-el-animo-y-reducir-el-estres-frasco-60-capsulas-superhuman™", // Recupera Tu Equilibrio Diario (variante -> Saffron+ Advanced, confirmado por el dueno)
  "120248645582130056": "saffron-advanced-capsulas-naturales-para-elevar-el-animo-y-reducir-el-estres-frasco-60-capsulas-superhuman™", // Recupera Tu Equilibrio Diario (variante -> Saffron+ Advanced, confirmado por el dueno)
  "120253351277920120": "sovexa-cayenne-pepper-suplemento-botanico-para-circulacion-saludable-60-capsulas", // Piernas menos pesadas al final del dia (Cayenne Pepper)
  "120253351779620120": "suplemento-natural-para-higado-y-puede-favorecer-el-drenaje-del", // Drenaje linfatico suave y natural (LINFOVIT - Higado y Drenaje Linfatico)
  "120253052315900120": "keratina-romero-ortiga-biotina-champu-nutritivo-y-regenerador-para-cabello-grueso-y-voluminoso-220-ml-tgideas™", // Revive Tu Cabello (Shampoo de Romero - Keratina+Romero+Ortiga+Biotina)
  "120253239645720120": "superhuman-focus-nootropico-natural-para-un-maximo-rendimiento-mental-potenciador-de-memoria-y-productividad", // Potencia tu enfoque diario (Focus+)
  "120253239652220120": "superhuman-focus-nootropico-natural-para-un-maximo-rendimiento-mental-potenciador-de-memoria-y-productividad", // Potencia tu enfoque diario (Focus+, variante)
  "120248370663120056": "prozenith-pro-capsules-capsulas-metabolicas-para-control-de-antojos-y-bienestar-metabolico-60-capsulas-superhuman™", // Controla tus antojos naturalmente (Prozenix Pro)
  "120248563525800056": "magnesio-12-en-1-complex-capsulas-para-energia-relajacion-muscular-y-bienestar-integral-120-capsulas-superhuman™", // 12 Tipos de Magnesio (Magnesio 12 en 1 Complex)
  "120248592862470056": "magnesio-12-en-1-complex-capsulas-para-energia-relajacion-muscular-y-bienestar-integral-120-capsulas-superhuman™", // 12 Tipos de Magnesio (variante -> Magnesio 12 en 1 Complex)
  "120248519247800056": "kojic-acid-turmeric-cleansing-pads",                          // Ilumina Tu Piel Apagada (variante -> KojicPads)
  "120253082365510120": "nails-repairing-suero-reparador-de-unas",                    // Energia Sin Estimulantes (asignacion TEMPORAL por el dueno mientras corrige el anuncio)
  "120252904020210120": "nails-repairing-suero-reparador-de-unas",                    // Energia Sin Estimulantes (asignacion TEMPORAL por el dueno mientras corrige el anuncio)
};

// Busca al cliente en Shopify por telefono (o email) para reconocer clientes
// recurrentes: si existe, devuelve sus datos y su direccion guardada para que
// el bot solo CONFIRME la direccion en lugar de volver a pedir todos los datos.

const CUSTOMER_LOOKUP_QUERY = `#graphql
  query CustomersByQuery($query: String!) {
    customers(first: 10, query: $query) {
      nodes {
        id
        displayName
        firstName
        lastName
        email
        phone
        numberOfOrders
        amountSpent { amount currencyCode }
        note
        tags
        defaultAddress {
          firstName
          lastName
          phone
          address1
          address2
          city
          province
          country
          zip
        }
        lastOrder { id name processedAt }
      }
    }
  }`;

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
    const input = unwrapInput(payload);
    enrichPhoneFromContext(input, payload);

    const phone = normalizePhone(input.phone || "");
    const email = normalizeEmail(input.email || "");

    if (!phone && !email && !input.debugQuery) {
      // Sin telefono no podemos buscar al cliente en Shopify, PERO si el lead
      // vino de un anuncio (CTWA) igual debemos leer el adReferral: antes se
      // retornaba aqui y el anuncio se perdia, dejando al bot sin saber el
      // producto (pedia link/captura en vez de reconocerlo).
      const adReferral = await fetchAdReferral(env, payload);
      await alertUnmappedAd(env, adReferral, input.phone || "");
      return json({
        ok: true,
        found: false,
        reason: "missing_phone",
        phone: null,
        adReferral,
        vars: buildFlowVars(null, null, adReferral, ""),
        message: "No hay telefono para buscar al cliente en Shopify; tratalo como cliente nuevo."
          + (adReferral ? " Llego desde un anuncio (adReferral): deduce el producto del headline/body del anuncio y presentalo directo; NO pidas link ni captura." : ""),
      });
    }

    const config = getConfig(env);
    const conversationId = payload.whatsapp_context?.conversation?.id
      || payload.execution_context?.context?.conversation_id;
    const [search, adReferral] = await Promise.all([
      searchCustomers(config, { phone, email, debugQuery: input.debugQuery }),
      fetchAdReferral(env, payload),
      logAbLead(env, conversationId, abVariant(phone)),
    ]);
    await alertUnmappedAd(env, adReferral, phone);
    if (!search.candidates.length && search.allFailed) {
      return json({ ok: false, found: false, reason: "lookup_failed", error: search.lastError, adReferral });
    }
    const match = pickBestMatch(search.candidates, { phone, email, debug: Boolean(input.debugQuery) });

    if (!match) {
      return json({
        ok: true,
        found: false,
        phone: phone || null,
        email: email || null,
        adReferral,
        vars: buildFlowVars(null, null, adReferral, phone),
        message: "Cliente nuevo: no hay registro previo en Shopify. Captura los datos normalmente."
          + (adReferral ? " OJO: llego desde un anuncio (adReferral); si su mensaje no deja claro el producto, deducelo del headline/body del anuncio." : ""),
      });
    }

    const address = match.defaultAddress || null;
    const addressSummary = buildAddressSummary(address);
    const ordersCount = Number(match.numberOfOrders || 0);

    return json({
      ok: true,
      found: true,
      customer: {
        id: match.id,
        firstName: match.firstName || null,
        lastName: match.lastName || null,
        displayName: match.displayName || null,
        email: match.email || null,
        phone: match.phone || phone || null,
        ordersCount,
        totalSpent: match.amountSpent ? `${match.amountSpent.amount} ${match.amountSpent.currencyCode}` : null,
        lastOrderName: match.lastOrder?.name || null,
        lastOrderAt: match.lastOrder?.processedAt || null,
        tags: match.tags || [],
      },
      address: address
        ? {
            firstName: address.firstName || null,
            lastName: address.lastName || null,
            phone: address.phone || null,
            address1: address.address1 || null,
            address2: address.address2 || null,
            city: address.city || null,
            province: address.province || null,
            zip: address.zip || null,
          }
        : null,
      addressSummary,
      adReferral,
      vars: buildFlowVars(match, addressSummary, adReferral, phone),
      hint: (ordersCount > 0
        ? "Cliente recurrente: saludalo con cercania y, al llegar al envio, CONFIRMA la direccion guardada en vez de pedir todos los datos de nuevo."
        : "Cliente registrado sin pedidos previos: confirma sus datos guardados antes de usarlos.")
        + (adReferral ? " Llego desde un anuncio (adReferral): si su mensaje no deja claro el producto, deducelo del headline/body del anuncio." : ""),
    });
  } catch (error) {
    return json({ ok: false, found: false, reason: "lookup_error", error: safeError(error) });
  }
}

async function searchCustomers(config, { phone, email, debugQuery }) {
  const queries = [];
  if (debugQuery) queries.push(String(debugQuery));
  const digits = phoneDigits(phone);
  const local = digits.startsWith("51") && digits.length === 11 ? digits.slice(2) : digits;
  if (email) {
    queries.push(`email:${escapeCustomerSearch(email)}`);
  }
  if (phone) queries.push(`phone:${escapeCustomerSearch(phone)}`);
  if (digits) queries.push(`phone:${digits}`);
  if (local && local !== digits) queries.push(`phone:${local}`);
  if (local) queries.push(local);

  const seen = new Set();
  const candidates = [];
  let failures = 0;
  let lastError = null;
  for (const query of queries) {
    let data;
    try {
      data = await shopifyGraphql(config, CUSTOMER_LOOKUP_QUERY, { query });
    } catch (error) {
      failures += 1;
      lastError = safeError(error);
      continue;
    }
    for (const node of data.customers?.nodes || []) {
      if (!node?.id || seen.has(node.id)) continue;
      seen.add(node.id);
      candidates.push(node);
    }
    if (candidates.length >= 10) break;
  }
  return { candidates, allFailed: queries.length > 0 && failures === queries.length, lastError };
}

function pickBestMatch(candidates, { phone, email, debug }) {
  if (!candidates.length) return null;
  if (debug && !phone && !email) return candidates[0];
  const scored = candidates
    .map((customer) => {
      let score = 0;
      if (phone && (samePhoneDigits(customer.phone, phone) || samePhoneDigits(customer.defaultAddress?.phone, phone))) score += 100;
      if (email && normalizeEmail(customer.email) === email) score += 80;
      score += Math.min(Number(customer.numberOfOrders || 0), 20);
      return { customer, score };
    })
    .filter((item) => item.score >= 80)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.customer || null;
}

function buildAddressSummary(address) {
  if (!address) return null;
  const parts = [address.address1, address.address2, address.city, address.province].map((v) => String(v || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function getConfig(env = globalThis) {
  const shopDomain = env.SHOPIFY_SHOP_DOMAIN || env.sHOPIFYSHOPDOMAIN || globalThis.SHOPIFY_SHOP_DOMAIN || DEFAULT_SHOP_DOMAIN;
  const apiVersion = env.SHOPIFY_API_VERSION || env.sHOPIFYAPIVERSION || globalThis.SHOPIFY_API_VERSION || DEFAULT_API_VERSION;
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.sHOPIFYADMINACCESSTOKEN || globalThis.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("Missing SHOPIFY_ADMIN_ACCESS_TOKEN");
  return { shopDomain, apiVersion, token };
}

async function shopifyGraphql(config, query, variables) {
  const response = await fetch(`https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(JSON.stringify(payload.errors || payload));
  }
  return payload.data;
}

// Variables de flujo que Kapso aplica automaticamente desde la respuesta
// (clave "vars"): asi el resultado queda disponible via get_variable tanto si
// la funcion corre como nodo del workflow (init-customer) como si la llama el
// agente como herramienta.
function buildFlowVars(match, addressSummary, adReferral, phone) {
  return {
    known_customer_found: Boolean(match),
    known_customer_name: match?.firstName || match?.displayName || null,
    known_customer_id: match?.id || null,
    known_address: addressSummary || null,
    ad_referral_headline: adReferral?.headline || null,
    ad_referral_body: adReferral?.body || null,
    ad_referral_source_type: adReferral?.sourceType || null,
    ad_referral_ad_id: adReferral?.adId || null,
    ad_referral_source_url: adReferral?.sourceUrl || null,
    // Handle del producto EXACTO del anuncio (mapa deterministico por ad_id).
    // Si viene, el bot debe presentar ESE producto y no adivinar por el titular.
    ad_referral_product_handle: (adReferral?.adId && AD_PRODUCT_MAP[adReferral.adId]) || null,
    ab_variant: abVariant(phone),
  };
}

// Asignacion A/B deterministica por telefono (hash FNV-1a mod 2): reparto
// ~50/50 uniforme y estable — el mismo cliente cae SIEMPRE en la misma
// variante, y create-shopify-order puede recalcularla solo con el telefono.
// A = presentacion completa de una (control). B = gancho + pregunta primero.
function abVariant(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "A";
  let h = 2166136261;
  for (let i = 0; i < digits.length; i += 1) {
    h ^= digits.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? "A" : "B";
}

// Registra el lead A/B una sola vez por conversacion (clave idempotente por
// conversationId; si ya existe, no reescribe para conservar la fecha original).
// campaign-report agrega estos eventos para comparar conversion por variante.
async function logAbLead(env, conversationId, variant) {
  try {
    const kv = env.KV || globalThis.KV;
    if (!kv || !conversationId || !variant) return;
    const key = `ab_lead:${conversationId}`;
    if (await kv.get(key)) return;
    await kv.put(key, JSON.stringify({ variant, at: new Date().toISOString() }), { expirationTtl: 90 * 24 * 3600 });
  } catch {
    // best effort
  }
}

// Busca el referral CTWA (anuncio de origen) en los mensajes de la conversacion
// via el proxy Meta de Kapso. Meta solo lo adjunta al primer mensaje enviado
// directo desde el click en el anuncio; si no hay KAPSO_API_KEY o contexto de
// conversacion, devuelve null sin romper el lookup.
async function fetchAdReferral(env, payload) {
  const apiKey = env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "";
  const p = payload || {};
  const conv = p.whatsapp_context?.conversation || {};
  const conversationId = conv.id || p.execution_context?.context?.conversation_id;
  // En los payloads reales el phone_number_id viene en
  // execution_context.system.whatsapp_config, no en whatsapp_context.
  const phoneNumberId =
    conv.phone_number_id ||
    p.whatsapp_context?.phone_number_id ||
    p.execution_context?.system?.whatsapp_config?.phone_number_id ||
    p.execution_context?.context?.phone_number_id;
  if (!apiKey || !conversationId || !phoneNumberId) return null;

  try {
    const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`
      + `?conversation_id=${encodeURIComponent(conversationId)}&limit=100`;
    const response = await fetch(url, { headers: { "X-API-Key": apiKey } });
    if (!response.ok) return null;
    const data = await response.json();
    for (const message of data?.data || []) {
      const ref = message?.referral;
      if (!ref) continue;
      return {
        sourceType: ref.source_type || null,
        sourceUrl: ref.source_url || null,
        adId: ref.source_id || null,
        headline: ref.headline || null,
        body: ref.body ? String(ref.body).slice(0, 500) : null,
        mediaType: ref.media_type || null,
      };
    }
  } catch {
    // El referral es informativo: si falla, el lookup sigue sin el.
  }
  return null;
}

// Alerta en tiempo real: si un lead llega desde un anuncio (CTWA) cuyo ad_id NO
// esta en AD_PRODUCT_MAP, el bot no puede reconocer el producto con seguridad.
// Avisamos por Telegram (via notify-team) para mapearlo rapido. Determinístico:
// corre al inicio de cada conversacion, no depende del LLM. Dedupe por ad_id
// (1 aviso cada 6h) para no spamear si el mismo anuncio trae muchos leads.
async function alertUnmappedAd(env, adReferral, phone) {
  try {
    const adId = adReferral && adReferral.adId;
    if (!adId || AD_PRODUCT_MAP[adId]) return;
    const apiKey = env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || "";
    if (!apiKey) return;

    const kv = env.KV || globalThis.KV;
    const dedupeKey = `unmapped_ad_alert:${adId}`;
    if (kv) {
      if (await kv.get(dedupeKey)) return;
      await kv.put(dedupeKey, "1", { expirationTtl: 6 * 60 * 60 });
    }

    const headline = String(adReferral.headline || "(sin titular)").slice(0, 120);
    await fetch("https://api.kapso.ai/platform/v1/functions/00dd67bd-df4b-4477-af5c-2530c44a5b60/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        input: {
          reason: "ANUNCIO SIN MAPEAR",
          skipStoreWebhook: true,
          phone: String(phone || ""),
          product: headline,
          note: `Anuncio "${headline}" (adId ${adId}) SIN producto asignado. Entro un cliente y el bot no puede reconocer el producto. Agrega este anuncio al mapa (pasale a Claude el adId + producto, o edita AD_PRODUCT_MAP).`,
        },
      }),
    });
  } catch {
    // best-effort: nunca bloquea el lookup del cliente
  }
}

function unwrapInput(payload) {
  if (payload && typeof payload.input === "object" && payload.input !== null) return payload.input;
  return payload || {};
}

function enrichPhoneFromContext(input, payload) {
  if (input.phone) return;
  const p = payload || {};
  const phone =
    p.whatsapp_context?.conversation?.phone_number ||
    p.execution_context?.context?.phone_number ||
    p.execution_context?.context?.contact?.phone_number;
  if (phone) input.phone = phone;
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

function normalizePhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length === 11) return `+${digits}`;
  if (digits.length === 9) return `+51${digits}`;
  return `+${digits}`;
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function samePhoneDigits(a, b) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.slice(-9) === db.slice(-9);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function escapeCustomerSearch(value) {
  return String(value || "").replace(/["'\\]/g, " ").trim();
}

function safeError(error) {
  return String(error?.message || error || "unknown_error").slice(0, 500);
}

function json(body) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

globalThis.__kenkuCustomerLookup = { handler, handleRequest, pickBestMatch, buildAddressSummary, normalizePhone };
