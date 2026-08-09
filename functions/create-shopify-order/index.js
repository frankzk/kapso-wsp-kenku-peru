async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

// Dominio admin de la tienda Kenku (SHOPIFY_SHOP_DOMAIN en la config tiene prioridad).
const DEFAULT_SHOP_DOMAIN = "kenkuperu.myshopify.com";
const DEFAULT_API_VERSION = "2026-04";
const DEFAULT_PHONE_NUMBER_ID = "597907523413541";
const MAX_QUANTITY = 50;
const FREE_SHIPPING_THRESHOLD = 40;
const SHIPPING_FEE_UNDER_THRESHOLD = 10;

function clampQuantity(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_QUANTITY, n);
}

function sanitizeNoteText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
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
    enrichConversationContext(input, payload);
    enrichCustomerFromContext(input, payload);

    if (input.coverage?.shippingMode === "agencia" || input.coverage?.shipping_mode === "agencia" || input.requiresLogisticsValidation || input.requires_logistics_validation) {
      return json({
        ok: false,
        reason: "logistics_validation_required",
        message: "Este pedido requiere validacion logistica antes de crear la orden.",
      });
    }

    const config = await getConfig(env);
    const dryRun = Boolean(input.dryRun || input.dry_run);
    // Referral del anuncio para atribucion CTWA. Orden de preferencia: (1) el que
    // ya paso el agente, (2) fetch en vivo por conversation_id, (3) respaldo desde
    // las vars del flujo (ad_referral_*) que dejo customer-lookup al inicio. El (3)
    // es clave: como tool de agente, el payload a veces NO trae conversation_id/
    // phone y el fetch en vivo devuelve null, dejando el pedido sin etiquetar.
    input.ctwaReferral = input.ctwaReferral
      || (await fetchCtwaReferral(env, input))
      || ctwaFromVars(payload);

    const build = await buildOrderInput(config, input, { createMissingCustomer: !dryRun });
    const orderInput = build.orderInput;
    const customerLookup = build.customerLookup;

    // Requisito duro para CONTRAENTREGA: direccion realmente entregable. Un pedido
    // contraentrega necesita ciudad/distrito real Y (calle+numero O una referencia
    // clara). Si falta, NO lo creamos con "Por coordinar" (eso genero ordenes
    // basura como #KP126229, Camana sin direccion): pedimos la direccion. Cuando la
    // haya, check_coverage decide contraentrega vs agencia (Shalom + adelanto).
    if (!dryRun) {
      const addr = orderInput.shippingAddress || {};
      const isPlaceholder = (v) => {
        const s = String(v || "").trim().toLowerCase();
        return !s || s === "por coordinar";
      };
      const noCity = isPlaceholder(addr.city);
      const noStreet = isPlaceholder(addr.address1);
      const noReference = isPlaceholder(addr.address2);
      if (noCity || (noStreet && noReference)) {
        return json({
          ok: false,
          reason: "address_incomplete",
          message: "No registro el pedido: falta la direccion completa. Pide al cliente su *distrito* y su *direccion exacta* (calle y numero, o una referencia clara). Cuando la tengas, corre check_coverage con ese distrito: si da contraentrega, crea el pedido; si da agencia (Shalom), sigue la ruta de agencia con el adelanto de S/30. NUNCA registres un pedido contraentrega con la direccion en 'Por coordinar'.",
          customerLookup,
        });
      }
    }

    // Requisito duro: telefono de contacto REAL. Los leads que entran por
    // username de WhatsApp no traen numero, y el flujo llegaba a crear el
    // pedido con phone vacio: quedaba un cliente con direccion completa al que
    // era IMPOSIBLE contactar para coordinar la entrega. Sin celular valido no
    // hay pedido; se pide y despues se reintenta.
    if (!dryRun && !isPeruMobile(orderInput.phone || input.phone)) {
      return json({
        ok: false,
        reason: "phone_missing",
        message: "No registro el pedido: falta el numero de celular del cliente. Este chat NO expone telefono (entro por username de WhatsApp), asi que no podemos coordinar la entrega ni contactarlo si se corta la conversacion. Pideselo de forma natural y directa: \"Para coordinar la entrega necesito tu *numero de celular* 📱 ¿Cual es?\". Debe ser un celular peruano de 9 digitos que empiece con 9. Cuando lo tengas, vuelve a llamar create_shopify_order incluyendo ese numero en el campo phone.",
        customerLookup,
      });
    }

    // Defensa anti-contraentrega en zona equivocada: re-verifica la cobertura con
    // check-coverage (fuente de verdad). Si la zona NO es contraentrega, no crea
    // la orden de pago-al-recibir; deriva a validacion logistica (Shalom/adelanto).
    const verifiedMode = await verifyDeliveryMode(env, input, orderInput.shippingAddress);
    if (verifiedMode === "agencia" || verifiedMode === "needs_location_confirmation") {
      return json({
        ok: false,
        reason: "coverage_mismatch",
        verifiedShippingMode: verifiedMode,
        claimedShippingMode: input.coverage?.shippingMode || null,
        message: "Esta zona no tiene pago contraentrega: requiere envio por agencia (Shalom) con adelanto. No se creo la orden. Corre check_coverage con el distrito y provincia reales y sigue la ruta de agencia.",
      });
    }

    const outOfStockVariants = await checkVariantsStock(config, orderInput.lineItems.map((li) => li.variantId));
    const stockToValidate = outOfStockVariants.length > 0;
    if (stockToValidate) {
      if (!orderInput.tags.includes("stock-por-validar")) orderInput.tags.push("stock-por-validar");
      const detail = outOfStockVariants.map((v) => v.title || v.id).join("; ");
      orderInput.note = `${orderInput.note}\nSTOCK POR VALIDAR (sin stock al crear): ${detail}`;
    }

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        stockToValidate,
        outOfStockVariants,
        customerLookup,
        orderPreview: {
          customer: orderInput.customer || null,
          customerId: customerLookup?.customerId || null,
          lineItems: orderInput.lineItems,
          phone: orderInput.phone,
          email: orderInput.email || null,
          shippingAddress: orderInput.shippingAddress,
          billingAddress: orderInput.billingAddress,
          tags: orderInput.tags,
          customAttributes: orderInput.customAttributes || [],
          hasDiscount: Boolean(orderInput.discountCode),
          shippingLines: orderInput.shippingLines || [],
        },
      });
    }

    // Idempotencia anti-duplicado: si ya se creo un pedido IDENTICO (mismos
    // variantes + cantidades) para este numero en las ultimas horas, NO crear
    // otro. Cubre el caso de dos threads/ejecuciones para el mismo numero (el
    // cliente "avanza su pedido" dos veces en conversaciones separadas y cada
    // una llega hasta aca). Solo bloquea duplicados exactos: una compra con
    // producto/cantidad distinta pasa igual.
    const phoneKey = phoneDigits(orderInput.phone || input.phone).slice(-9);
    const orderSig = orderSignature(orderInput.lineItems);
    const existingLock = await findRecentOrderLock(env, phoneKey, orderSig);
    if (existingLock) {
      return json({
        ok: true,
        duplicate: true,
        reason: "duplicate_prevented",
        stage: "orden creada",
        conversionStatus: "already_registered",
        message: `Ya existe un pedido reciente identico (${existingLock.orderName}) para este numero; NO se creo uno nuevo. Confirma al cliente que su pedido ${existingLock.orderName} ya quedo registrado (no se duplico) y pregunta si necesita algo mas.`,
        order: { name: existingLock.orderName },
        customerLookup,
      });
    }

    const data = await shopifyGraphql(config, ORDER_CREATE_MUTATION, {
      order: orderInput,
      options: {
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
    });

    const result = data.orderCreate;
    if (result.userErrors?.length) {
      return json({ ok: false, reason: "shopify_user_errors", errors: result.userErrors, customerLookup });
    }

    // Guarda el candado anti-duplicado (por numero + firma del pedido) para que
    // una segunda ejecucion/thread del mismo cliente no cree una orden identica.
    await recordOrderLock(env, phoneKey, orderSig, result.order?.name);

    // Registra la conversion A/B (una por pedido) para el reporte por variante.
    await logAbOrder(env, result.order?.name, abVariant(orderInput.phone || input.phone), input.conversationId || input.conversation_id);

    return json({
      ok: true,
      stage: "orden creada",
      conversionStatus: "confirmed",
      conversionType: "contraentrega",
      conversionTotal: Number(input.quote?.total ?? input.quote?.totalAmount ?? 0),
      stockToValidate,
      outOfStockVariants,
      customerLookup,
      order: {
        id: result.order.id,
        name: result.order.name,
        legacyResourceId: result.order.legacyResourceId,
        statusUrl: result.order.statusPageUrl,
        customer: result.order.customer ? {
          id: result.order.customer.id,
          displayName: result.order.customer.displayName,
          email: result.order.customer.email,
          phone: result.order.customer.phone,
        } : null,
      },
      customerMessage: stockToValidate
        ? "Listo, registre tu pedido. Queda sujeto a confirmacion de stock; nuestro equipo lo valida y te confirma por aqui."
        : "Listo, tu pedido quedo registrado. Nuestro equipo coordinara el despacho por aqui.",
    });
  } catch (error) {
    return json({ ok: false, reason: "order_create_error", error: safeError(error) });
  }
}

const ORDER_CREATE_MUTATION = `#graphql
  mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      userErrors { field message }
      order {
        id
        name
        legacyResourceId
        statusPageUrl
        customer { id displayName email phone }
      }
    }
  }`;

const CUSTOMER_SEARCH_QUERY = `#graphql
  query CustomersByQuery($query: String!) {
    customers(first: 10, query: $query) {
      nodes {
        id
        displayName
        firstName
        lastName
        email
        phone
        defaultAddress { phone address1 address2 city province country zip }
      }
    }
  }`;

const CUSTOMER_CREATE_MUTATION = `#graphql
  mutation customerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id displayName firstName lastName email phone defaultAddress { phone address1 city province country zip } }
      userErrors { field message }
    }
  }`;

// CustomerInput.addresses quedo deprecado (API 2026-01+) y la tienda corre
// 2026-04: la direccion se adjunta con una mutation aparte tras crear el cliente.
const CUSTOMER_ADDRESS_CREATE_MUTATION = `#graphql
  mutation customerAddressCreate($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
    customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
      customerAddress { id }
      userErrors { field message }
    }
  }`;

async function readJson(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function getConfig(env = globalThis) {
  const kvConfig = await getKvConfig(env);
  const shopDomain = env.SHOPIFY_SHOP_DOMAIN || env.sHOPIFYSHOPDOMAIN || kvConfig.SHOPIFY_SHOP_DOMAIN || globalThis.SHOPIFY_SHOP_DOMAIN || globalThis.sHOPIFYSHOPDOMAIN || DEFAULT_SHOP_DOMAIN;
  const apiVersion = env.SHOPIFY_API_VERSION || env.sHOPIFYAPIVERSION || kvConfig.SHOPIFY_API_VERSION || globalThis.SHOPIFY_API_VERSION || globalThis.sHOPIFYAPIVERSION || DEFAULT_API_VERSION;
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.sHOPIFYADMINACCESSTOKEN || kvConfig.SHOPIFY_ADMIN_ACCESS_TOKEN || globalThis.SHOPIFY_ADMIN_ACCESS_TOKEN || globalThis.sHOPIFYADMINACCESSTOKEN;

  if (!token) throw new Error("Missing SHOPIFY_ADMIN_ACCESS_TOKEN");
  return { apiVersion, shopDomain, token };
}

async function getKvConfig(env) {
  if (!env?.KV?.get) return {};
  const [token, apiVersion, shopDomain] = await Promise.all([
    env.KV.get("SHOPIFY_ADMIN_ACCESS_TOKEN"),
    env.KV.get("SHOPIFY_API_VERSION"),
    env.KV.get("SHOPIFY_SHOP_DOMAIN"),
  ]);
  return {
    SHOPIFY_ADMIN_ACCESS_TOKEN: token,
    SHOPIFY_API_VERSION: apiVersion,
    SHOPIFY_SHOP_DOMAIN: shopDomain,
  };
}

function getKapsoConfig(env = globalThis) {
  const apiKey = env.KAPSO_API_KEY || env.kAPSOAPIKEY || globalThis.KAPSO_API_KEY || globalThis.kAPSOAPIKEY;
  const apiBase = env.KAPSO_API_BASE || env.kAPSOAPIBASE || globalThis.KAPSO_API_BASE || "https://api.kapso.ai";
  return { apiKey, apiBase };
}

const CTWA_MAX_PAGES = 5;
const CHECK_COVERAGE_FUNCTION_ID = "05a6107d-6488-4bb3-8088-9f2fce140b5e";

// Defensa: re-verifica la cobertura llamando a check-coverage con la ubicacion
// del pedido, sin confiar en el shippingMode que afirma el agente. check-coverage
// es la fuente de verdad (maneja texto libre de Lima y cae a agencia para zonas
// no reconocidas). Devuelve "contraentrega" | "agencia" | null (no verificable).
async function verifyDeliveryMode(env, input, shippingAddress) {
  try {
    const { apiKey, apiBase } = getKapsoConfig(env);
    if (!apiKey) return null;
    const cov = input.coverage || {};
    const norm = cov.normalized || {};
    const district = cov.district || cov.distrito || norm.district || shippingAddress.city || "";
    const province = cov.province || cov.provincia || norm.province || shippingAddress.province || "";
    const region = cov.region || cov.departamento || norm.region || "";
    const zone = cov.zone || shippingAddress.address1 || "";
    if (!district && !province && !zone) return null; // sin senal de ubicacion, no verificable
    const res = await fetch(`${apiBase}/platform/v1/functions/${CHECK_COVERAGE_FUNCTION_ID}/invoke`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { district, province, region, zone } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.shippingMode || null;
  } catch {
    return null; // ante error de red, no bloquear (falla abierto)
  }
}

async function fetchCtwaReferral(env, input) {
  try {
    const { apiKey, apiBase } = getKapsoConfig(env);
    const conversationId = input.conversationId || input.conversation_id;
    const phoneNumberId =
      input.phoneNumberId || input.phone_number_id || input.whatsappPhoneNumberId || input.whatsapp_phone_number_id || DEFAULT_PHONE_NUMBER_ID;
    if (!apiKey || !conversationId || !phoneNumberId) return null;

    let url = `${apiBase}/meta/whatsapp/v24.0/${encodeURIComponent(phoneNumberId)}/messages?conversation_id=${encodeURIComponent(conversationId)}&direction=inbound&limit=100`;
    for (let page = 0; page < CTWA_MAX_PAGES && url; page += 1) {
      const response = await fetch(url, { headers: { "X-API-Key": apiKey, "Content-Type": "application/json" } });
      if (!response.ok) return null;
      const payload = await response.json();
      const messages = payload?.data || [];
      for (const message of messages) {
        const referral = extractReferral(message);
        if (referral) return referral;
      }
      const nextCursor = payload?.paging?.cursors?.after || payload?.paging?.next;
      if (!nextCursor || payload?.paging?.next === null) break;
      url = `${apiBase}/meta/whatsapp/v24.0/${encodeURIComponent(phoneNumberId)}/messages?conversation_id=${encodeURIComponent(conversationId)}&direction=inbound&limit=100&after=${encodeURIComponent(nextCursor)}`;
    }
    return null;
  } catch {
    return null;
  }
}

function extractReferral(message) {
  const referral = message?.referral || message?.message?.referral || message?.kapso?.referral;
  if (referral && (referral.source_id || referral.source_type || referral.ctwa_clid)) return referral;
  return null;
}

// Respaldo de atribucion CTWA: reconstruye el referral desde las vars del flujo
// (ad_referral_*) que customer-lookup resolvio al inicio de la conversacion. En
// esta tienda todo referral proviene de un anuncio Click-to-WhatsApp, asi que si
// hay headline/body/ad_id se marca source_type "ad" (para que buildTags etiquete
// ctwa-ad). Devuelve null si el lead no vino de un anuncio.
function ctwaFromVars(payload) {
  const v = payload?.execution_context?.vars || payload?.vars || {};
  const adId = v.ad_referral_ad_id || v.ad_referral_source_id || null;
  const headline = v.ad_referral_headline || null;
  const body = v.ad_referral_body || null;
  const sourceType = v.ad_referral_source_type || null;
  if (!adId && !headline && !body && !sourceType) return null;
  return {
    source_type: sourceType || "ad",
    source_id: adId,
    headline,
    body,
    source_url: v.ad_referral_source_url || null,
    ctwa_clid: v.ad_referral_ctwa_clid || null,
  };
}

async function buildOrderInput(config, input, options = {}) {
  const customer = input.customer || {};
  const quote = input.quote || {};
  const lineItems = await resolveLineItems(config, normalizeLineItems(input.lineItems || input.items || []));

  if (!lineItems.length) {
    throw new Error("Missing line items with valid Shopify variant IDs");
  }

  let discountTotal = Number(quote.discountTotal ?? quote.discount_total ?? 0);
  let shippingFee = Number(quote.shippingFee ?? quote.shipping_fee ?? 0);
  const computed = await computePricing(config, lineItems);
  if (computed) {
    discountTotal = computed.discountTotal;
    shippingFee = computed.shippingFee;
  }

  // Descuento extra autorizado (ej. el 10% del follow-up de recuperacion en 1
  // unidad). Se SUMA al descuento de promos, con tope de seguridad del 15% del
  // subtotal para que un error del agente no regale la orden.
  const extraDiscount = Number(quote.extraDiscountTotal ?? quote.extra_discount_total ?? 0);
  if (Number.isFinite(extraDiscount) && extraDiscount > 0) {
    const cap = computed ? money(computed.subtotalBeforeDiscount * 0.15) : money(extraDiscount);
    const applied = money(Math.min(extraDiscount, cap));
    discountTotal = money(discountTotal + applied);
    if (computed) {
      const paidAfter = money(computed.subtotalBeforeDiscount - discountTotal);
      shippingFee = paidAfter > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE_UNDER_THRESHOLD;
    }
  }

  const shippingAddress = buildAddress(customer, input);
  const billingAddress = buildAddress(customer, input);
  const customerLookup = await resolveOrderCustomer(config, input, customer, shippingAddress, {
    createMissingCustomer: options.createMissingCustomer === true,
  });

  const order = {
    lineItems: lineItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    phone: normalizePhone(customer.phone || input.phone || shippingAddress.phone),
    shippingAddress,
    billingAddress,
    tags: buildTags(input),
    note: buildNote(input, customerLookup),
    financialStatus: "PENDING",
    presentmentCurrency: "PEN",
  };

  // Asociar el cliente al pedido. OrderCreateOrderInput NO tiene un campo
  // `customerId`: se usa `customer.toAssociate` (cliente existente) o
  // `customer.toUpsert` (crear/actualizar). El bug anterior (order.customerId)
  // se ignoraba y el pedido quedaba SIN cliente.
  const email = normalizeEmail(customer.email || input.email || customerLookup?.email);
  if (customerLookup?.customerId) {
    order.customer = { toAssociate: { id: customerLookup.customerId } };
  } else if (email) {
    // Respaldo: si no logramos crear/encontrar el cliente pero hay email, que
    // Shopify lo cree/asocie como parte del pedido (toUpsert dedupe por email).
    const nameParts = splitCustomerName(
      String(customer.name || customer.fullName || customer.full_name || "").trim()
      || [shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(" ")
    );
    order.customer = {
      toUpsert: {
        email,
        firstName: nameParts.firstName || "Cliente",
        lastName: nameParts.lastName || "Kenku",
      },
    };
  }

  if (email) {
    order.email = email;
  }

  const customAttributes = buildCustomAttributes(input, customerLookup);
  if (customAttributes.length) {
    order.customAttributes = customAttributes;
  }

  if (discountTotal > 0) {
    order.discountCode = {
      itemFixedDiscountCode: {
        code: "KENKU-WHATSAPP-PROMO",
        amountSet: moneySet(discountTotal),
      },
    };
    if (!order.tags.includes("promo-whatsapp")) order.tags.push("promo-whatsapp");
  }

  if (shippingFee > 0) {
    order.shippingLines = [
      {
        title: "Envio Kenku",
        priceSet: moneySet(shippingFee),
      },
    ];
  }

  return { orderInput: order, customerLookup };
}

async function resolveOrderCustomer(config, input, customer, shippingAddress, options = {}) {
  const phone = normalizePhone(customer.phone || input.phone || shippingAddress.phone || "");
  const email = normalizeEmail(customer.email || input.email || "");
  const fullName = String(customer.name || customer.fullName || customer.full_name || "").trim();
  const nameParts = splitCustomerName(fullName || [shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(" "));

  const base = {
    searched: false,
    status: "skipped",
    customerId: null,
    phone: phone || null,
    email: email || null,
    displayName: fullName || null,
  };

  if (!phone && !email) {
    return { ...base, reason: "missing_phone_email" };
  }

  try {
    const existing = await findShopifyCustomer(config, { phone, email, fullName });
    if (existing) {
      return {
        ...base,
        searched: true,
        status: "found",
        customerId: existing.id,
        displayName: existing.displayName,
        email: existing.email || email || null,
        phone: existing.phone || phone || null,
      };
    }
  } catch (error) {
    return { ...base, searched: true, status: "lookup_failed", error: safeError(error) };
  }

  if (!options.createMissingCustomer) {
    return { ...base, searched: true, status: "not_found", createSkipped: true };
  }

  try {
    const created = await createShopifyCustomer(config, {
      phone,
      email,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      address: shippingAddress,
      note: buildCustomerNote(input),
    });

    if (created.customer) {
      return {
        ...base,
        searched: true,
        status: "created",
        customerId: created.customer.id,
        displayName: created.customer.displayName,
        email: created.customer.email || email || null,
        phone: created.customer.phone || phone || null,
      };
    }

    const retryExisting = await findShopifyCustomer(config, { phone, email, fullName });
    if (retryExisting) {
      return {
        ...base,
        searched: true,
        status: "found_after_create_error",
        customerId: retryExisting.id,
        displayName: retryExisting.displayName,
        email: retryExisting.email || email || null,
        phone: retryExisting.phone || phone || null,
        createErrors: created.userErrors || [],
      };
    }

    return {
      ...base,
      searched: true,
      status: "create_failed",
      createErrors: created.userErrors || [],
    };
  } catch (error) {
    try {
      const retryExisting = await findShopifyCustomer(config, { phone, email, fullName });
      if (retryExisting) {
        return {
          ...base,
          searched: true,
          status: "found_after_create_exception",
          customerId: retryExisting.id,
          displayName: retryExisting.displayName,
          email: retryExisting.email || email || null,
          phone: retryExisting.phone || phone || null,
          createError: safeError(error),
        };
      }
    } catch {
      // Ignore retry errors; return original create error below.
    }
    return { ...base, searched: true, status: "create_failed", error: safeError(error) };
  }
}

async function findShopifyCustomer(config, { phone, email, fullName }) {
  const queries = buildCustomerSearchQueries({ phone, email });
  const candidates = [];
  const seen = new Set();

  for (const query of queries) {
    const data = await shopifyGraphql(config, CUSTOMER_SEARCH_QUERY, { query });
    for (const node of data.customers?.nodes || []) {
      if (!node?.id || seen.has(node.id)) continue;
      seen.add(node.id);
      candidates.push(node);
    }
  }

  if (candidates.length === 0) return null;
  const scored = candidates
    .map((customer) => ({ customer, score: scoreCustomerCandidate(customer, { phone, email, fullName }) }))
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.customer || null;
}

function buildCustomerSearchQueries({ phone, email }) {
  const queries = [];
  const cleanEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const digits = phoneDigits(normalizedPhone || phone);
  const local = digits.startsWith("51") && digits.length === 11 ? digits.slice(2) : digits;

  if (cleanEmail) {
    queries.push(`email:${escapeCustomerSearch(cleanEmail)}`);
    queries.push(cleanEmail);
  }
  if (normalizedPhone) {
    queries.push(`phone:${escapeCustomerSearch(normalizedPhone)}`);
  }
  if (digits) {
    queries.push(`phone:${digits}`);
    queries.push(digits);
  }
  if (local && local !== digits) {
    queries.push(`phone:${local}`);
    queries.push(local);
  }
  return unique(queries);
}

function scoreCustomerCandidate(customer, { phone, email, fullName }) {
  let score = 0;
  const cleanEmail = normalizeEmail(email);
  const candidateEmail = normalizeEmail(customer.email);
  if (cleanEmail && candidateEmail && cleanEmail === candidateEmail) score += 120;

  const wantedDigits = phoneDigits(phone);
  const phones = [customer.phone, customer.defaultAddress?.phone].map(phoneDigits).filter(Boolean);
  if (wantedDigits && phones.some((candidate) => samePhoneDigits(candidate, wantedDigits))) score += 100;
  else if (wantedDigits && phones.some((candidate) => candidate.endsWith(wantedDigits.slice(-9)) || wantedDigits.endsWith(candidate.slice(-9)))) score += 80;

  const wantedName = normalizeSearchText(fullName || "");
  const candidateName = normalizeSearchText(customer.displayName || [customer.firstName, customer.lastName].filter(Boolean).join(" "));
  if (wantedName && candidateName) {
    const wantedTokens = wantedName.split(/\s+/).filter((token) => token.length >= 3);
    const matched = wantedTokens.filter((token) => candidateName.includes(token)).length;
    score += Math.min(30, matched * 10);
  }

  return score;
}

async function createShopifyCustomer(config, { phone, email, firstName, lastName, address, note }) {
  const input = {
    firstName: firstName || "Cliente",
    lastName: lastName || "Kenku",
    tags: ["kapso", "whatsapp", "kenku"],
  };

  const cleanPhone = normalizePhone(phone);
  const cleanEmail = normalizeEmail(email);
  if (cleanPhone) input.phone = cleanPhone;
  if (cleanEmail) input.email = cleanEmail;
  if (note) input.note = note;

  // NO adjuntar addresses aqui: CustomerInput.addresses esta deprecado (2026-01+)
  // y en 2026-04 hace fallar customerCreate -> antes el pedido quedaba SIN cliente.
  const data = await shopifyGraphql(config, CUSTOMER_CREATE_MUTATION, { input });
  const result = data.customerCreate || { customer: null, userErrors: [{ message: "empty customerCreate response" }] };

  // Best-effort: guarda la direccion como default en el perfil (para reconocer al
  // cliente recurrente). Nunca bloquea: si falla, el cliente ya quedo creado/asociado.
  if (result.customer?.id) {
    const mailingAddress = mailingAddressFromOrderAddress(address);
    if (mailingAddress) {
      try {
        await shopifyGraphql(config, CUSTOMER_ADDRESS_CREATE_MUTATION, {
          customerId: result.customer.id,
          address: mailingAddress,
          setAsDefault: true,
        });
      } catch (_) {
        // direccion best-effort; el cliente ya existe y se asociara al pedido igual
      }
    }
  }
  return result;
}

function mailingAddressFromOrderAddress(address) {
  if (!address) return null;
  const out = {
    firstName: address.firstName || "Cliente",
    lastName: address.lastName || "Kenku",
    phone: normalizePhone(address.phone),
    address1: address.address1 || "Por coordinar",
    address2: address.address2 || "",
    city: address.city || "",
    province: address.province || "",
    country: address.country || "PE",
    zip: address.zip || "",
  };
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== "" && value !== null && value !== undefined));
}

function buildCustomerNote(input) {
  const conversationId = input.conversationId || input.conversation_id;
  return [
    "Cliente creado desde WhatsApp/Kapso.",
    conversationId ? `Kapso conversation: ${conversationId}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeLineItems(items) {
  return items
    .map((item) => ({
      handle: String(item.handle || item.productHandle || item.product_handle || item.product?.handle || "").trim(),
      productTitle: String(item.productTitle || item.product_title || item.product?.title || item.title || item.name || "").trim(),
      productUrl: String(item.productUrl || item.product_url || item.url || item.link || "").trim(),
      variantId: normalizeVariantId(item.variantId || item.variant_id || item.variant?.id),
      variantTitle: String(item.variantTitle || item.variant_title || item.variant?.title || item.color || item.modelo || item.model || "").trim(),
      quantity: clampQuantity(item.quantity ?? item.qty ?? 1),
    }))
    .filter((item) => item.quantity > 0 && (item.variantId || item.handle || item.productTitle || item.productUrl));
}

async function resolveLineItems(config, items) {
  const resolved = [];
  for (const item of items) {
    if (item.variantId) {
      // Se marca para validar: el agente a veces manda un variantId inventado o
      // truncado (ej. "437"). Si no existe en Shopify se re-resuelve por producto.
      resolved.push({ ...item, variantId: normalizeVariantId(item.variantId), _agentVariant: true });
      continue;
    }
    const product = await findProductForItem(config, item);
    const variant = chooseVariant(product, item);
    if (variant?.id) resolved.push({ ...item, variantId: normalizeVariantId(variant.id) });
  }

  // Validar los variantId que dio el agente. Si alguno NO existe (Shopify
  // devolvia "Line items product variant X not found" y el pedido caia en
  // handoff), lo re-resolvemos desde handle/productUrl/productTitle del item.
  const toCheck = resolved.filter((it) => it._agentVariant && it.variantId).map((it) => it.variantId);
  if (toCheck.length) {
    const validIds = await fetchExistingVariantIds(config, toCheck);
    for (const it of resolved) {
      if (!it._agentVariant) continue;
      delete it._agentVariant;
      if (!it.variantId || validIds.has(it.variantId)) continue;
      const product = await findProductForItem(config, it);
      const variant = chooseVariant(product, it);
      it.variantId = variant?.id ? normalizeVariantId(variant.id) : "";
    }
  }
  return resolved.filter((item) => item.variantId);
}

// Devuelve el subconjunto de variantIds que SI existen en Shopify. Si la
// consulta falla, no bloquea: asume que todos son validos (comportamiento previo).
async function fetchExistingVariantIds(config, ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const out = new Set();
  if (!uniq.length) return out;
  const query = `#graphql
    query ValidateVariants($ids: [ID!]!) {
      nodes(ids: $ids) { ... on ProductVariant { id } }
    }`;
  try {
    const data = await shopifyGraphql(config, query, { ids: uniq });
    for (const node of data.nodes || []) {
      if (node?.id) out.add(node.id);
    }
  } catch {
    for (const id of uniq) out.add(id);
  }
  return out;
}

async function findProductForItem(config, item) {
  const handles = extractHandleCandidates([item.productUrl, item.handle].filter(Boolean).join(" "));
  for (const handle of handles) {
    const product = await getProductByHandle(config, handle);
    if (product) return product;
  }
  if (item.productTitle) {
    const products = await searchProducts(config, item.productTitle);
    return products[0] || null;
  }
  return null;
}

function chooseVariant(product, item) {
  const variants = product?.variants?.nodes || [];
  if (variants.length === 0) return null;
  if (!item.variantTitle) return variants.find((variant) => variant.availableForSale) || variants[0];

  const wanted = normalizeSearchText(item.variantTitle);
  const exact = variants.find((variant) => {
    const title = normalizeSearchText(variant.title);
    const options = normalizeSearchText((variant.selectedOptions || []).map((option) => option.value).join(" "));
    return title === wanted || options === wanted;
  });
  if (exact) return exact;

  return variants.find((variant) => {
    const haystack = normalizeSearchText([
      variant.title,
      ...(variant.selectedOptions || []).map((option) => option.value),
    ].join(" "));
    return haystack.includes(wanted);
  }) || variants.find((variant) => variant.availableForSale) || variants[0];
}

async function getProductByHandle(config, handle) {
  const query = `#graphql
    query ProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
        title
        variants(first: 100) { nodes { id title availableForSale selectedOptions { name value } } }
      }
    }`;
  try {
    const data = await shopifyGraphql(config, query, { handle });
    return data.productByHandle;
  } catch {
    return null;
  }
}

async function checkVariantsStock(config, variantIds) {
  const ids = [...new Set((variantIds || []).filter(Boolean))];
  if (ids.length === 0) return [];

  const query = `#graphql
    query VariantsStock($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant { id title availableForSale product { title } }
      }
    }`;

  try {
    const data = await shopifyGraphql(config, query, { ids });
    const nodes = (data.nodes || []).filter(Boolean);
    return nodes
      .filter((variant) => variant.availableForSale === false)
      .map((variant) => ({ id: variant.id, title: [variant.product?.title, variant.title].filter(Boolean).join(" - ") }));
  } catch {
    return [];
  }
}

async function computePricing(config, lineItems) {
  const variantIds = lineItems.map((li) => normalizeVariantId(li.variantId)).filter(Boolean);
  const pricing = await fetchVariantPricing(config, variantIds);
  if (!pricing.size) return null;

  const unitsByProduct = new Map();
  for (const item of lineItems) {
    const info = pricing.get(normalizeVariantId(item.variantId));
    if (!info || !Number.isFinite(info.price)) return null;
    const list = unitsByProduct.get(info.productId) || [];
    for (let i = 0; i < item.quantity; i += 1) list.push(info.price);
    unitsByProduct.set(info.productId, list);
  }

  let subtotalBeforeDiscount = 0;
  let discountTotal = 0;
  for (const prices of unitsByProduct.values()) {
    subtotalBeforeDiscount += prices.reduce((sum, price) => sum + price, 0);
    const freeUnits = countFreeUnits(prices.length);
    if (freeUnits > 0) {
      const cheapestFirst = [...prices].sort((a, b) => a - b);
      discountTotal += cheapestFirst.slice(0, freeUnits).reduce((sum, price) => sum + price, 0);
    }
  }

  discountTotal = money(discountTotal);
  const subtotalAfterDiscount = money(money(subtotalBeforeDiscount) - discountTotal);
  const shippingFee = subtotalAfterDiscount > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE_UNDER_THRESHOLD;
  return { discountTotal, shippingFee, subtotalAfterDiscount, subtotalBeforeDiscount: money(subtotalBeforeDiscount) };
}

function countFreeUnits(quantity) {
  const fivePacks = Math.floor(quantity / 5);
  const remainder = quantity % 5;
  const threePackFreeUnits = remainder >= 3 ? 1 : 0;
  return fivePacks * 2 + threePackFreeUnits;
}

async function fetchVariantPricing(config, variantIds) {
  const ids = [...new Set((variantIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const query = `#graphql
    query VariantPricing($ids: [ID!]!) {
      nodes(ids: $ids) { ... on ProductVariant { id price product { id } } }
    }`;

  try {
    const data = await shopifyGraphql(config, query, { ids });
    const map = new Map();
    for (const node of (data.nodes || []).filter(Boolean)) {
      map.set(node.id, { price: Number(node.price), productId: node.product?.id || node.id });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function searchProducts(config, text) {
  const searchQueries = buildProductSearchQueries(text);
  if (searchQueries.length === 0) return [];

  const query = `#graphql
    query SearchProducts($query: String!) {
      products(first: 5, query: $query) {
        nodes { id handle title variants(first: 100) { nodes { id title availableForSale selectedOptions { name value } } } }
      }
    }`;

  for (const searchQuery of searchQueries) {
    try {
      const data = await shopifyGraphql(config, query, { query: searchQuery });
      const products = data.products?.nodes || [];
      if (products.length > 0) return products;
    } catch {
      // Try the next query shape.
    }
  }
  return [];
}

function buildProductSearchQueries(text) {
  const normalized = normalizeSearchText(text);
  const words = unique(normalized.split(/\s+/).filter((word) => word.length >= 3).slice(0, 8));
  const queries = [];
  if (words.length > 0) {
    // 1) Todas las palabras (mas preciso).
    queries.push(words.map((word) => `title:*${escapeSearch(word)}*`).join(" AND "));
    // 2) Fallback tolerante: solo las palabras mas distintivas (las mas largas).
    //    Asi un titulo con una palabra extra o mal escrita ("Cooper" vs "Copper",
    //    "Saludable" de mas) igual resuelve, en vez de fallar y derivar a humano.
    const distinctive = [...words].sort((a, b) => b.length - a.length);
    for (const n of [3, 2]) {
      if (distinctive.length >= n) {
        queries.push(distinctive.slice(0, n).map((word) => `title:*${escapeSearch(word)}*`).join(" AND "));
      }
    }
    // 3) Texto libre.
    queries.push(words.slice(0, 5).join(" "));
  }
  if (normalized) queries.push(escapeSearch(normalized));
  return unique(queries);
}

function buildAddress(customer, input = {}) {
  const nameParts = splitCustomerName(customer.name || customer.fullName || customer.full_name || "");
  const firstName = nameParts.firstName || "Cliente";
  const lastName = nameParts.lastName || "Kenku";
  // Respaldo de ciudad/provincia desde la cobertura ya calculada (input.coverage)
  // y desde el input directo. El agente a veces manda la direccion pero NO el
  // distrito/provincia dentro de customer -> sin ciudad, la direccion de envio de
  // Shopify queda vacia. La cobertura SIEMPRE trae el distrito (se verifico con
  // check_coverage), asi que la usamos como fuente confiable.
  const cov = input.coverage || {};
  const covNorm = cov.normalized || {};
  let city = customer.district || customer.distrito || customer.city
    || cov.district || cov.distrito || covNorm.district || covNorm.distrito
    || input.district || input.distrito || "";
  let province = customer.province || customer.provincia
    || cov.province || cov.provincia || covNorm.province || covNorm.provincia
    || input.province || input.provincia || "";
  const address1 = customer.address || customer.direccion || "Por coordinar";

  // Respaldo: si el agente metio distrito/provincia dentro del texto de la
  // direccion en vez de mandarlos por separado (ej. "Av. Huanacure 221,
  // INDEPENDENCIA, Lima"), los extraemos de los ultimos segmentos separados por
  // coma. Sin ciudad, Shopify no muestra la direccion de envio.
  if ((!city || !province) && address1 && address1 !== "Por coordinar") {
    const parts = address1.split(",").map((s) => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
    if (parts.length >= 3) {
      if (!city) city = parts[parts.length - 2];
      if (!province) province = parts[parts.length - 1];
    } else if (parts.length === 2 && !city) {
      city = parts[parts.length - 1];
    }
  }

  // Shopify necesita una ciudad no vacia para poblar la direccion de envio.
  // Si aun no la tenemos, usamos la provincia; y si tampoco, dejamos una marca
  // clara para que logistica la complete (mejor que quede en blanco).
  if (!city) city = province || "Por coordinar";

  return {
    firstName,
    lastName,
    phone: normalizePhone(customer.phone || input.phone),
    address1,
    address2: customer.reference || customer.referencia || "",
    city,
    province,
    country: "PE",
    zip: "",
  };
}

function buildCustomAttributes(input, customerLookup) {
  const attrs = [];
  const conversationId = input.conversationId || input.conversation_id;
  const phoneNumberId = input.phoneNumberId || input.phone_number_id || input.whatsappPhoneNumberId || input.whatsapp_phone_number_id;

  if (conversationId) attrs.push({ key: "kapso_conversation_id", value: String(conversationId) });
  if (phoneNumberId) attrs.push({ key: "kapso_phone_number_id", value: String(phoneNumberId) });
  attrs.push({ key: "source", value: "whatsapp-bot" });

  if (customerLookup?.customerId) {
    attrs.push({ key: "kapso_shopify_customer_match", value: customerLookup.status });
    attrs.push({ key: "kapso_shopify_customer_id", value: customerLookup.customerId });
  } else if (customerLookup?.status) {
    attrs.push({ key: "kapso_shopify_customer_match", value: customerLookup.status });
  }

  const ref = input.ctwaReferral;
  if (ref) {
    const add = (key, value) => {
      const v = String(value ?? "").trim();
      if (v) attrs.push({ key, value: v.slice(0, 250) });
    };
    add("ctwa_source_type", ref.source_type);
    add("ctwa_ad_id", ref.source_id);
    add("ctwa_clid", ref.ctwa_clid);
    add("ctwa_headline", ref.headline);
    add("ctwa_source_url", ref.source_url);
  }
  return attrs;
}

// Asignacion A/B deterministica por telefono (misma logica que customer-lookup:
// FNV-1a mod 2). Al ser pura funcion del telefono, aqui se recalcula sin
// arrastrar el dato desde el agente.
function abVariant(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  let h = 2166136261;
  for (let i = 0; i < digits.length; i += 1) {
    h ^= digits.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? "A" : "B";
}

// Ventana del candado anti-duplicado por numero (segundos). Un pedido IDENTICO
// (mismos variantes+cantidades) al mismo numero dentro de esta ventana se
// considera duplicado y no se vuelve a crear. 6h cubre el caso de threads
// separados sin bloquear una re-compra genuina al dia siguiente.
const DUPLICATE_WINDOW_SECONDS = 6 * 3600;

// Firma determinista del pedido: variantes + cantidades ordenadas. Dos pedidos
// con la misma firma son el mismo pedido.
function orderSignature(lineItems) {
  return (lineItems || [])
    .map((li) => `${normalizeVariantId(li.variantId)}x${li.quantity}`)
    .sort()
    .join(",");
}

async function findRecentOrderLock(env, phoneKey, signature) {
  try {
    const kv = env?.KV || globalThis.KV;
    if (!kv || !phoneKey || !signature) return null;
    const raw = await kv.get(`order_lock:${phoneKey}`);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (rec && rec.orderName && rec.signature === signature) return rec;
    return null;
  } catch {
    return null;
  }
}

async function recordOrderLock(env, phoneKey, signature, orderName) {
  try {
    const kv = env?.KV || globalThis.KV;
    if (!kv || !phoneKey || !orderName) return;
    await kv.put(
      `order_lock:${phoneKey}`,
      JSON.stringify({ orderName, signature, at: new Date().toISOString() }),
      { expirationTtl: DUPLICATE_WINDOW_SECONDS },
    );
  } catch {
    // best effort
  }
}

// Registra la conversion A/B en KV (una por pedido). campaign-report cruza
// ab_lead:* (leads) con ab_order:* (pedidos) para la tasa por variante.
async function logAbOrder(env, orderName, variant, conversationId) {
  try {
    const kv = env?.KV || globalThis.KV;
    if (!kv || !orderName || !variant) return;
    // Fecha (dia Lima) y variante EN EL NOMBRE de la clave: el reporte cuenta
    // listando, sin un kv.get por clave.
    const day = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await kv.put(`abx_order:${day}:${variant}:${orderName}`, JSON.stringify({ variant, conversationId: conversationId || null, at: new Date().toISOString() }), { expirationTtl: 90 * 24 * 3600 });
  } catch {
    // best effort
  }
}

function buildTags(input) {
  const tags = new Set(["kapso", "whatsapp", "kenku"]);
  if (input.coverage?.shippingMode === "contraentrega" || input.coverage?.shipping_mode === "contraentrega" || input.coverage?.cashOnDelivery === true || input.coverage?.cash_on_delivery === true) {
    tags.add("contraentrega");
    tags.add("conversion-confirmada");
    tags.add("pedido-confirmado");
  }
  if (input.quote?.promoApplied || input.quote?.promo_applied) tags.add("promo-whatsapp");
  if (input.ctwaReferral?.source_type === "ad") tags.add("ctwa-ad");
  const variant = abVariant(input.phone || input.customer?.phone);
  if (variant) tags.add(`ab-${variant.toLowerCase()}`); // prueba A/B del arranque
  if (input.stockPorValidar || input.stock_por_validar || input.stockValidationRequired || input.stock_validation_required) tags.add("stock-por-validar");
  if (input.specialDeliveryNote || input.special_delivery_note) tags.add("fecha-hora-especial");
  return [...tags];
}

function buildNote(input, customerLookup) {
  // Nota acotada: solo lo que el equipo de logistica necesita de un vistazo.
  // Cliente/telefono ya salen en el bloque "Contacto"; el Shopify customer id y
  // el Kapso conversation id ya salen en "Informacion adicional" (metacampos);
  // por eso NO se repiten aqui. La direccion SI se conserva porque el campo
  // estructurado de Shopify a veces queda incompleto.
  const customer = input.customer || {};
  const cov = input.coverage || {};
  const covNorm = cov.normalized || {};
  const district = customer.district || customer.distrito || cov.district || cov.distrito || covNorm.district || covNorm.distrito || "";
  const province = customer.province || customer.provincia || cov.province || cov.provincia || covNorm.province || covNorm.provincia || "";
  const address = customer.address || customer.direccion || "";
  const reference = customer.reference || customer.referencia || "";
  const place = [district, province].filter(Boolean).join(", ");
  const entrega = [address, reference && `Ref: ${reference}`, place].filter(Boolean).join(" · ");
  const name = customer.name || customer.fullName || customer.full_name || "";
  const phone = customer.phone || input.phone || "";
  const contacto = [name, phone].filter(Boolean).join(" · ");

  const lines = [
    "Pedido WhatsApp/Kapso · Contraentrega (efectivo o Yape)",
    `Producto(s): ${summaryLine(input.lineItems || input.items || [])}`,
  ];
  if (contacto) lines.push(`Contacto: ${contacto}`);
  if (entrega) lines.push(`Entrega: ${entrega}`);

  const specialNote = sanitizeNoteText(input.specialDeliveryNote || input.special_delivery_note);
  if (specialNote) lines.push(`Fecha/hora solicitada: ${specialNote}`);
  return lines.filter(Boolean).join("\n");
}

function summaryLine(items) {
  return items.map((item) => `${item.quantity || 1} x ${item.productTitle || item.title || item.variantTitle || item.variantId}`).join("; ");
}

function moneySet(amount) {
  return {
    shopMoney: { amount: Number(amount), currencyCode: "PEN" },
    presentmentMoney: { amount: Number(amount), currencyCode: "PEN" },
  };
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

function enrichConversationContext(input, payload) {
  if (!input || typeof input !== "object") return;
  const p = payload || {};

  if (!input.conversationId && !input.conversation_id) {
    const conversationId = p.conversationId || p.conversation_id || p.conversation?.id || p.metadata?.conversation_id || p.metadata?.conversationId || p.execution_context?.context?.conversation_id;
    if (conversationId) input.conversationId = conversationId;
  }

  if (!input.phoneNumberId && !input.phone_number_id) {
    const phoneNumberId = p.phoneNumberId || p.phone_number_id || p.whatsapp?.phone_number_id || p.metadata?.phone_number_id || p.execution_context?.system?.whatsapp_config?.phone_number_id;
    if (phoneNumberId) input.phoneNumberId = phoneNumberId;
  }
}

function enrichCustomerFromContext(input, payload) {
  if (!input || typeof input !== "object") return;
  if (!input.customer || typeof input.customer !== "object") input.customer = {};
  const customer = input.customer;
  const context = payload?.execution_context?.context || {};
  const contact = context.contact || {};
  const wa = payload?.whatsapp_context || {};

  if (!customer.phone && !input.phone) {
    const phone = context.phone_number || wa.conversation?.phone_number;
    if (phone) input.phone = phone;
  }
  if (!customer.name && !customer.fullName) {
    const name = contact.name || contact.profile_name || contact.display_name || wa.conversation?.contact_name;
    if (name) customer.name = name;
  }
}

function unwrapInput(payload) {
  if (payload?.input && typeof payload.input === "object" && !Array.isArray(payload.input)) return payload.input;
  return payload || {};
}

function normalizeVariantId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("gid://shopify/ProductVariant/")) return text;
  const numeric = text.match(/\d+/)?.[0];
  return numeric ? `gid://shopify/ProductVariant/${numeric}` : "";
}

function extractHandleCandidates(value) {
  const text = String(value || "").trim();
  const candidates = [];
  if (/^[^\s/]{3,}$/.test(text)) candidates.push(text);

  const urls = text.match(/https?:\/\/[^\s]+/gi) || [];
  for (const rawUrl of urls) {
    try {
      const cleanedUrl = rawUrl.replace(/[)\].,!?]+$/g, "");
      const url = new URL(cleanedUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      const productIndex = parts.indexOf("products");
      if (productIndex !== -1 && parts[productIndex + 1]) candidates.push(parts[productIndex + 1].replace(/\.js$/i, ""));
    } catch {
      // Ignore malformed URLs.
    }
  }

  return unique(candidates.flatMap((handle) => {
    const decoded = safeDecode(handle);
    return [handle, decoded, slugifyHandle(decoded)];
  }));
}

function splitCustomerName(value) {
  const parts = sanitizeName(value).split(/\s+/).filter((p) => /\p{L}/u.test(p));
  if (parts.length === 0) return { firstName: "Cliente", lastName: "Kenku" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Kenku" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Shopify rechaza emojis y simbolos en los nombres de la direccion del cliente
// ("Customer addresses first name cannot contain emojis"). Muchos perfiles de
// WhatsApp traen emoji en el nombre — los quitamos dejando solo letras (con
// tildes/ñ), espacios, guion, apostrofe y punto. Colapsa espacios sobrantes.
function sanitizeName(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyHandle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value) {
  const text = String(value || "").trim().toLowerCase();
  return /.+@.+\..+/.test(text) ? text : "";
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

// Celular peruano valido: 9 digitos que empiezan en 9 (con o sin prefijo 51).
// Distingue un numero real de un vacio o de un placeholder tipo "por coordinar".
function isPeruMobile(value) {
  let digits = phoneDigits(value);
  if (digits.startsWith("51") && digits.length === 11) digits = digits.slice(2);
  return digits.length === 9 && digits.startsWith("9");
}

function samePhoneDigits(a, b) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.slice(-9) === db.slice(-9);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeSearch(value) {
  return String(value || "").replace(/["'\\:]/g, " ").trim();
}

function escapeCustomerSearch(value) {
  return String(value || "").replace(/["'\\]/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return money(value).toFixed(2);
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

globalThis.__kenkuCreateShopifyOrder = {
  buildOrderInput,
  computePricing,
  countFreeUnits,
  fetchCtwaReferral,
  findShopifyCustomer,
  handleRequest,
  handler,
  resolveOrderCustomer,
};
