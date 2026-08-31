async function handler(request, env) {
  try {
    const body = await readJson(request);
    const input = unwrapInput(body);
    const adReferralPromise = fetchAdReferral(env, body);

    const phoneInput = pickFirst([
      input.phone,
      input.customer_phone,
      input.whatsapp_phone,
      input.from,
      input.contact?.phone,
      input.contact?.phone_number,
      body.whatsapp_context?.conversation?.phone_number,
      body.execution_context?.context?.phone_number,
      body.execution_context?.context?.contact?.phone_number,
      body.execution_context?.trigger?.from,
    ]);

    const emailInput = pickFirst([
      input.email,
      input.customer_email,
      input.contact?.email,
      body.execution_context?.context?.contact?.email,
    ]);

    const normalizedPhone = normalizePhone(phoneInput);
    const normalizedEmail = normalizeEmail(emailInput);

    const shopDomain = env.SHOPIFY_STORE_DOMAIN || env.SHOPIFY_SHOP_DOMAIN || "kenkuperu.myshopify.com";
    const accessToken = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    const apiVersion = env.SHOPIFY_API_VERSION || "2024-10";

    if (!shopDomain) {
      return json({ ok: false, found: false, error: "missing_secret", message: "Missing SHOPIFY_STORE_DOMAIN secret" }, 500);
    }

    if (!accessToken) {
      return json({ ok: false, found: false, error: "missing_secret", message: "Missing SHOPIFY_ADMIN_ACCESS_TOKEN secret" }, 500);
    }

    if (!normalizedPhone && !normalizedEmail) {
      const adReferral = await adReferralPromise;
      return json({
        ok: true,
        found: false,
        has_shipping_address: false,
        hasShippingAddress: false,
        matched_by: null,
        customer: null,
        address: null,
        addressSummary: null,
        adReferral,
        lookup: {
          attempted_phone: phoneInput || null,
          normalized_phone: normalizedPhone || null,
          attempted_email: emailInput || null,
        },
        message: "No phone or email provided",
      });
    }

    let customer = null;
    let matchedBy = null;

    if (normalizedPhone) {
      customer = await findCustomerByPhone({ shopDomain, accessToken, apiVersion }, normalizedPhone);
      if (customer) matchedBy = "phone";
    }

    if (!customer && normalizedEmail) {
      customer = await findCustomerByEmail({ shopDomain, accessToken, apiVersion }, normalizedEmail);
      if (customer) matchedBy = "email";
    }

    const adReferral = await adReferralPromise;

    if (!customer) {
      return json({
        ok: true,
        found: false,
        has_shipping_address: false,
        hasShippingAddress: false,
        matched_by: null,
        customer: null,
        address: null,
        addressSummary: null,
        adReferral,
        lookup: {
          attempted_phone: phoneInput || null,
          normalized_phone: normalizedPhone || null,
          attempted_email: emailInput || null,
        },
        message: "Cliente nuevo: no hay registro previo en Shopify. Captura los datos normalmente."
          + (adReferral ? " OJO: llego desde un anuncio (adReferral); si su mensaje no deja claro el producto, deducelo del headline/body del anuncio." : ""),
      });
    }

    const defaultAddress = customer.defaultAddress || null;
    const formattedAddress = formatAddress(defaultAddress);
    const displayName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.displayName || null;
    const ordersCount = Number(customer.numberOfOrders || 0);

    return json({
      ok: true,
      found: true,
      matched_by: matchedBy,
      customer_id: customer.id || null,
      first_name: customer.firstName || null,
      last_name: customer.lastName || null,
      display_name: displayName,
      email: customer.email || null,
      phone: customer.phone || null,
      tags: customer.tags || [],
      number_of_orders: ordersCount,
      has_shipping_address: Boolean(defaultAddress && formattedAddress),
      hasShippingAddress: Boolean(defaultAddress && formattedAddress),
      default_address: defaultAddress ? {
        firstName: defaultAddress.firstName || null,
        lastName: defaultAddress.lastName || null,
        phone: defaultAddress.phone || null,
        address1: defaultAddress.address1 || null,
        address2: defaultAddress.address2 || null,
        city: defaultAddress.city || null,
        province: defaultAddress.province || null,
        zip: defaultAddress.zip || null,
        country: defaultAddress.country || null,
        company: defaultAddress.company || null,
        formatted: formattedAddress,
      } : null,

      customer: {
        id: customer.id || null,
        firstName: customer.firstName || null,
        lastName: customer.lastName || null,
        displayName,
        email: customer.email || null,
        phone: customer.phone || null,
        ordersCount,
        tags: customer.tags || [],
      },
      address: defaultAddress ? {
        firstName: defaultAddress.firstName || customer.firstName || null,
        lastName: defaultAddress.lastName || customer.lastName || null,
        phone: defaultAddress.phone || customer.phone || phoneInput || null,
        address1: defaultAddress.address1 || null,
        address2: defaultAddress.address2 || null,
        city: defaultAddress.city || null,
        province: defaultAddress.province || null,
        zip: defaultAddress.zip || null,
        country: defaultAddress.country || null,
        company: defaultAddress.company || null,
      } : null,
      addressSummary: formattedAddress,
      adReferral,
      hint: (formattedAddress
        ? "Cliente recurrente: al llegar a los datos de envio, confirma esta direccion guardada en vez de pedirla de nuevo. Pide solo referencia o cambios si hace falta."
        : "Cliente encontrado sin direccion guardada: pide los datos de envio normalmente.")
        + (adReferral ? " Llego desde un anuncio (adReferral): si su mensaje no deja claro el producto, deducelo del headline/body del anuncio." : ""),
      lookup: {
        attempted_phone: phoneInput || null,
        normalized_phone: normalizedPhone || null,
        attempted_email: emailInput || null,
      },
    });
  } catch (error) {
    return json({
      ok: false,
      found: false,
      has_shipping_address: false,
      hasShippingAddress: false,
      error: "internal_error",
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
    }, 500);
  }
}

async function findCustomerByPhone(config, normalizedPhone) {
  const variants = phoneVariants(normalizedPhone);

  for (const phone of variants) {
    const data = await shopifyGraphQL(config, CUSTOMER_SEARCH_QUERY, {
      query: `phone:${escapeSearchValue(phone)}`,
    });

    const customer = pickBestCustomer(data?.customers?.edges || [], normalizedPhone);
    if (customer) return customer;
  }

  return null;
}

async function findCustomerByEmail(config, email) {
  const data = await shopifyGraphQL(config, CUSTOMER_SEARCH_QUERY, {
    query: `email:${escapeSearchValue(email)}`,
  });

  return data?.customers?.edges?.[0]?.node || null;
}

function pickBestCustomer(edges, normalizedPhone) {
  if (!Array.isArray(edges) || edges.length === 0) return null;

  const exact = edges.find((edge) => {
    const phone = normalizePhone(edge?.node?.phone || edge?.node?.defaultAddress?.phone || "");
    return phone && phone === normalizedPhone;
  });

  return exact?.node || edges[0]?.node || null;
}

async function shopifyGraphQL(config, query, variables = {}) {
  const url = `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status}: ${JSON.stringify(payload)}`);
  }

  if (payload.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data;
}

async function fetchAdReferral(env, payload) {
  const apiKey = env.KAPSO_API_KEY || env.kAPSOAPIKEY || "";
  if (!apiKey) return null;

  const p = payload || {};
  const conv = p.whatsapp_context?.conversation || {};
  const conversationId =
    conv.id ||
    p.execution_context?.context?.conversation_id;

  const phoneNumberId =
    conv.phone_number_id ||
    p.whatsapp_context?.phone_number_id ||
    p.execution_context?.context?.phone_number_id ||
    p.execution_context?.system?.whatsapp_config?.phone_number_id ||
    p.execution_context?.system?.whatsapp_config?.phone_number;

  if (!conversationId || !phoneNumberId) return null;

  try {
    const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`
      + `?conversation_id=${encodeURIComponent(conversationId)}&limit=100`;
    const response = await fetchWithTimeout(url, { headers: { "X-API-Key": apiKey } }, 1200);
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));

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
    return null;
  }

  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 1200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePhone(value) {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `51${digits}`;

  return digits;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function phoneVariants(normalized) {
  if (!normalized) return [];

  const variants = new Set();
  variants.add(normalized);
  variants.add(`+${normalized}`);

  if (normalized.startsWith("51") && normalized.length === 11) {
    const local = normalized.slice(2);
    variants.add(local);
    variants.add(`+51${local}`);
  }

  return Array.from(variants);
}

function formatAddress(address) {
  if (!address) return null;
  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
  ].map((v) => String(v || "").trim()).filter(Boolean).join(", ") || null;
}

function escapeSearchValue(value) {
  return String(value || "").replace(/["'\\]/g, " ").trim();
}

function pickFirst(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function unwrapInput(payload) {
  if (payload && typeof payload.input === "object" && payload.input !== null) return payload.input;
  return payload || {};
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CUSTOMER_SEARCH_QUERY = `
  query GetCustomers($query: String!) {
    customers(first: 10, query: $query) {
      edges {
        node {
          id
          displayName
          firstName
          lastName
          email
          phone
          numberOfOrders
          tags
          defaultAddress {
            firstName
            lastName
            phone
            address1
            address2
            city
            province
            zip
            country
            company
          }
        }
      }
    }
  }
`;
