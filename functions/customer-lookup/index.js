const DEFAULT_SHOP_DOMAIN = "kenkuperu.myshopify.com";
const DEFAULT_API_VERSION = "2026-04";

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
      return json({ ok: false, found: false, reason: "missing_phone", message: "Falta el telefono (o email) del cliente para buscarlo." });
    }

    const config = getConfig(env);
    const search = await searchCustomers(config, { phone, email, debugQuery: input.debugQuery });
    if (!search.candidates.length && search.allFailed) {
      return json({ ok: false, found: false, reason: "lookup_failed", error: search.lastError });
    }
    const match = pickBestMatch(search.candidates, { phone, email, debug: Boolean(input.debugQuery) });

    if (!match) {
      return json({ ok: true, found: false, phone: phone || null, email: email || null, message: "Cliente nuevo: no hay registro previo en Shopify. Captura los datos normalmente." });
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
      hint: ordersCount > 0
        ? "Cliente recurrente: saludalo con cercania y, al llegar al envio, CONFIRMA la direccion guardada en vez de pedir todos los datos de nuevo."
        : "Cliente registrado sin pedidos previos: confirma sus datos guardados antes de usarlos.",
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
