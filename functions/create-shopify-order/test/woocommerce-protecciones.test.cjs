#!/usr/bin/env node
// create-shopify-order en modo WooCommerce: las mismas protecciones que en Shopify, en el mismo orden y con los mismos
// reason y mensajes (fetch y KV simulados). Correr: node functions/create-shopify-order/test/woocommerce-protecciones.test.cjs
const assert = require("assert");

const CATALOG = { products: [
  { id: 9612721488092, woo_id: 25, handle: "bividi-camiseta-de-alta-compresion", title: "Bividi Camiseta de Alta Compresión",
    options: [{ name: "Talla", position: 1, values: ["M", "L"] }],
    variants: [
      { id: 52484401955036, woo_id: 26, title: "M", option1: "M", sku: "36710849", available: true, price: "119.00" },
      { id: 52484401987804, woo_id: 27, title: "L", option1: "L", sku: "36710850", available: true, price: "119.00" },
    ] },
  { id: 7628322373852, woo_id: 46, handle: "rodillera-x-pro", title: "Rodillera X Pro", options: [],
    variants: [{ id: 42775201251548, woo_id: 46, title: "Default Title", sku: "81852859", available: false, price: "35.00" }] },
] };

let calls = [];
let coverageMode = "contraentrega";
let orderNumber = 200123;
// Pedidos que devuelve la busqueda de la tienda (GET /orders?search=): los que hacen las vendedoras a mano.
let storeOrders = [];
let storeFails = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: u, method: opts.method || "GET", body });
  if (u.startsWith("https://tienda.test/products.json")) return new Response(JSON.stringify(u.includes("page=1") ? CATALOG : { products: [] }));
  if (u === "https://tienda.test/wp-json/wc/v3/orders" && opts.method === "POST") {
    const n = orderNumber++;
    return new Response(JSON.stringify({ id: n - 199600, number: `KP${n}`, total: "273.00" }), { status: 201 });
  }
  if (u.startsWith("https://tienda.test/wp-json/wc/v3/orders?") && (opts.method || "GET") === "GET") {
    if (storeFails) return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    return new Response(JSON.stringify(storeOrders));
  }
  if (/\/wp-json\/wc\/v3\/orders\/\d+\/notes$/.test(u)) return new Response("{}", { status: 201 });
  if (u.includes("/functions/05a6107d-6488-4bb3-8088-9f2fce140b5e/invoke")) return new Response(JSON.stringify({ shippingMode: coverageMode }));
  if (u.includes("/meta/whatsapp/") && u.includes("/messages")) {
    const referral = u.includes("conversation_id=conv-ad") ? [{ referral: { source_type: "ad", source_id: "AD-CONV", headline: "Del chat" } }] : [];
    return new Response(JSON.stringify({ data: referral, paging: {} }));
  }
  // Shopify (solo para comparar los mensajes con el camino de Shopify).
  if (u.includes("graphql.json")) {
    const q = body.query;
    const ids = body.variables?.ids || [];
    if (q.includes("ValidateVariants")) return new Response(JSON.stringify({ data: { nodes: ids.map((id) => ({ id })) } }));
    if (q.includes("VariantPricing")) return new Response(JSON.stringify({ data: { nodes: ids.map((id) => ({ id, price: "119.00", product: { id: "p" } })) } }));
    if (q.includes("VariantsStock")) return new Response(JSON.stringify({ data: { nodes: [] } }));
    return new Response(JSON.stringify({ data: { customers: { nodes: [] }, productByHandle: null, products: { nodes: [] } } }));
  }
  return new Response("{}", { status: 404 });
};

function fakeKV(init = {}) {
  const m = new Map(Object.entries(init));
  const puts = [];
  return { puts, m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v, o) { puts.push({ k, v: JSON.parse(v), o }); m.set(k, v); } };
}

require("../index.js");
const api = globalThis.__kenkuCreateShopifyOrder;
const WOO = { WOO_STORE_URL: "https://tienda.test/", WOO_CONSUMER_KEY: "ck_x", WOO_CONSUMER_SECRET: "cs_y", KAPSO_API_KEY: "kap" };
const envWoo = (kv = fakeKV(), extra = { STORE_DUPLICATE_CHECK: "on" }) => ({ ...WOO, STORE_BACKEND: "woocommerce", KV: kv, ...extra });
const call = async (body, env) => (await api.handleRequest(new Request("https://x/", { method: "POST", body: JSON.stringify(body) }), env)).json();
const posts = () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/wp-json/wc/v3/orders"));
const meta = (order) => Object.fromEntries(order.meta_data.map((m) => [m.key, m.value]));

const base = {
  conversationId: "conv1",
  customer: { name: "Rosa Pérez", phone: "987654321", district: "Lince", address: "Av. Arequipa 2450", reference: "Frente al colegio" },
  coverage: { shippingMode: "contraentrega", normalized: { district: "lince", province: "lima", region: "lima" } },
  items: [{ variantId: "gid://shopify/ProductVariant/52484401987804", quantity: 3 }, { handle: "rodillera-x-pro", quantity: 1 }],
};
const vars = { execution_context: { vars: { ab_variant: "D", ad_referral_ad_id: "AD9", ad_referral_headline: "El poder de la semilla negra", ad_referral_source_type: "ad" } } };
const SIG = "gid://shopify/ProductVariant/42775201251548x1,gid://shopify/ProductVariant/52484401987804x3";
const limaDay = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("caso feliz: crea el pedido, guarda el candado y registra el A/D (misma respuesta que Shopify)", async () => {
  const kv = fakeKV();
  const r = await call({ input: base, ...vars }, envWoo(kv));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.order.name, "#KP200123");
  for (const key of ["stage", "conversionStatus", "conversionType", "conversionTotal", "stockToValidate", "outOfStockVariants", "customerLookup", "order", "customerMessage"]) assert.ok(key in r, key);
  for (const key of ["id", "name", "legacyResourceId", "statusUrl", "customer"]) assert.ok(key in r.order, key);
  assert.strictEqual(posts().length, 1);
  // Candado: misma clave y misma firma que en Shopify (IDs de variante de Shopify del catalogo).
  const lock = kv.puts.find((p) => p.k === "order_lock:987654321");
  assert.deepStrictEqual([lock.v.orderName, lock.v.signature, lock.o.expirationTtl], ["#KP200123", SIG, 48 * 3600]);
  // A/D: la variante asignada al lead (vars), el total y las unidades.
  const ab = kv.puts.find((p) => p.k.startsWith("abx_order:"));
  assert.strictEqual(ab.k, `abx_order:${limaDay}:D:conv1:#KP200123`);
  assert.deepStrictEqual([ab.v.variant, ab.v.promo, ab.v.total, ab.v.units], ["D", "P1", 273, 4]);
  // Cobertura re-verificada con check-coverage, como en Shopify.
  const cov = calls.find((c) => c.url.includes("/functions/05a6107d"));
  assert.deepStrictEqual(cov.body.input.district, "lince");
  // Etiquetas en kapta_tags (lo que lee Kapta), con las mismas que pone Shopify.
  const m = meta(posts()[0].body);
  const tags = m.kapta_tags.split(",");
  for (const t of ["kapso", "whatsapp", "kenku", "contraentrega", "ab-d", "promo-whatsapp", "stock-por-validar", "ctwa-ad"]) assert.ok(tags.includes(t), `${t} en ${m.kapta_tags}`);
  assert.strictEqual(m.kapso_tags, undefined, "ya no va kapso_tags (nadie lo lee)");
  assert.strictEqual(r.stockToValidate, true, "la rodillera esta agotada en el catalogo");
});

caso("repetido dentro de la ventana: no crea el segundo pedido", async () => {
  const kv = fakeKV();
  await call({ input: base }, envWoo(kv));
  const r = await call({ input: base }, envWoo(kv));
  assert.strictEqual(r.reason, "duplicate_prevented");
  assert.strictEqual(r.duplicate, true);
  assert.strictEqual(r.order.name, "#KP200123", "el pedido que ya existe");
  assert.ok(r.message.includes("#KP200123"), r.message);
  assert.strictEqual(posts().length, 1, "un solo POST");
});

caso("candado de un pedido identico hecho en Shopify: tampoco lo duplica en WooCommerce", async () => {
  const kv = fakeKV({ "order_lock:987654321": JSON.stringify({ orderName: "#KP140001", signature: SIG }) });
  const r = await call({ input: base }, envWoo(kv));
  assert.strictEqual(r.reason, "duplicate_prevented");
  assert.strictEqual(r.order.name, "#KP140001");
  assert.strictEqual(posts().length, 0);
});

caso("otra cantidad: no es repetido y se crea", async () => {
  const kv = fakeKV();
  await call({ input: base }, envWoo(kv));
  const r = await call({ input: { ...base, items: [{ variantId: "gid://shopify/ProductVariant/52484401987804", quantity: 1 }] } }, envWoo(kv));
  assert.strictEqual(r.ok, true);
  assert.ok(!r.duplicate);
  assert.strictEqual(posts().length, 2);
});

// Mismo input por el camino de Shopify, para comparar reason y mensaje.
const shopify = (body) => call(body, { SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat", KAPSO_API_KEY: "kap" });

caso("direccion de relleno: address_incomplete, mismo mensaje que Shopify", async () => {
  const input = { ...base, customer: { ...base.customer, address: "-, -", reference: "" } };
  const kv = fakeKV();
  const r = await call({ input }, envWoo(kv));
  const s = await shopify({ input });
  assert.strictEqual(r.reason, "address_incomplete");
  assert.strictEqual(r.message, s.message);
  assert.deepStrictEqual(Object.keys(r), Object.keys(s), "misma forma");
  assert.strictEqual(posts().length, 0);
  assert.strictEqual(kv.puts.length, 0);
});

caso("sin celular (lead por username): phone_missing, mismo mensaje que Shopify", async () => {
  const input = { ...base, customer: { ...base.customer, phone: "" } };
  const r = await call({ input, whatsapp_context: { conversation: { username: "rosa" } } }, envWoo());
  const s = await shopify({ input });
  assert.strictEqual(r.reason, "phone_missing");
  assert.strictEqual(r.message, s.message);
  assert.strictEqual(posts().length, 0);
});

caso("cobertura distinta (check-coverage dice agencia): coverage_mismatch, mismo mensaje que Shopify", async () => {
  coverageMode = "agencia";
  const r = await call({ input: base }, envWoo());
  const s = await shopify({ input: base });
  assert.strictEqual(r.reason, "coverage_mismatch");
  assert.strictEqual(r.verifiedShippingMode, "agencia");
  assert.strictEqual(r.message, s.message);
  assert.deepStrictEqual(Object.keys(r), Object.keys(s));
  assert.strictEqual(posts().length, 0);
});

caso("anuncio desde las vars del flujo (sin conversacion): ctwa_* y utm en el pedido", async () => {
  const r = await call({ input: { ...base, conversationId: undefined }, ...vars }, envWoo());
  assert.strictEqual(r.ok, true);
  const m = meta(posts()[0].body);
  assert.deepStrictEqual([m.ctwa_ad_id, m.ctwa_headline, m.ctwa_source_type, m.utm_id, m.utm_source, m.utm_medium], ["AD9", "El poder de la semilla negra", "ad", "AD9", "facebook", "ctwa"]);
  assert.ok(m.kapta_tags.split(",").includes("ctwa-ad"));
});

caso("anuncio: el que manda el agente gana; si no, el de la conversacion", async () => {
  await call({ input: { ...base, conversationId: "conv-ad", ctwaReferral: { source_type: "ad", source_id: "AD-AGENTE" } }, ...vars }, envWoo());
  assert.strictEqual(meta(posts()[0].body).ctwa_ad_id, "AD-AGENTE");
  calls = [];
  await call({ input: { ...base, conversationId: "conv-ad" }, ...vars }, envWoo());
  assert.strictEqual(meta(posts()[0].body).ctwa_ad_id, "AD-CONV", "el de la conversacion antes que el de las vars");
});

caso("dryRun: corren las comprobaciones, no crea ni escribe nada y devuelve el orderPreview", async () => {
  const kv = fakeKV();
  const bad = await call({ input: { ...base, dryRun: true, customer: { ...base.customer, address: "", reference: "" } } }, envWoo(kv));
  assert.strictEqual(bad.reason, "address_incomplete", "en dryRun tambien se valida la direccion");
  const noPhone = await call({ input: { ...base, dryRun: true, customer: { ...base.customer, phone: "" } } }, envWoo(kv));
  assert.strictEqual(noPhone.reason, "phone_missing");
  const ok = await call({ input: { ...base, dryRun: true }, ...vars }, envWoo(kv));
  assert.strictEqual(ok.dryRun, true);
  assert.strictEqual(ok.orderPreview.status, "cod-pending");
  assert.ok(ok.orderPreview.meta_data.some((x) => x.key === "kapta_tags"));
  assert.strictEqual(posts().length, 0);
  assert.strictEqual(kv.puts.length, 0, "sin candado ni registro A/D");
  const locked = fakeKV({ "order_lock:987654321": JSON.stringify({ orderName: "#KP200001", signature: SIG }) });
  const dup = await call({ input: { ...base, dryRun: true } }, envWoo(locked));
  assert.deepStrictEqual([dup.reason, dup.dryRun, dup.order.name], ["duplicate_prevented", true, "#KP200001"]);
});

// --- Pedido identico ya registrado en la tienda (las vendedoras cierran a mano) ---
const hace = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString().slice(0, 19);
// Mismo pedido que base: Bividi L (producto 25, variacion 27) x3 + Rodillera (simple, 46) x1.
const manual = (extra = {}) => ({
  id: 9001, number: "KP201478", status: "cod-pending", date_created_gmt: hace(20),
  billing: { phone: "+51 987 654 321" },
  line_items: [{ product_id: 46, variation_id: 0, quantity: 1 }, { product_id: 25, variation_id: 27, quantity: 3 }],
  ...extra,
});

caso("tienda: pedido identico de una vendedora hace 20 h -> no crea, avisa y pide handoff", async () => {
  storeOrders = [manual()];
  const kv = fakeKV();
  const r = await call({ input: base }, envWoo(kv));
  assert.deepStrictEqual([r.ok, r.duplicate, r.reason, r.order.name], [false, true, "duplicate_store_order", "#KP201478"]);
  assert.ok(r.message.includes("#KP201478") && r.message.includes("handoff_to_human"), r.message);
  assert.strictEqual(posts().length, 0, "no se crea el segundo pedido");
  assert.strictEqual(kv.puts.length, 0, "ni candado ni registro A/D");
  const q = new URL(calls.find((c) => c.url.includes("/wc/v3/orders?")).url).searchParams;
  assert.deepStrictEqual([q.get("search"), q.get("dates_are_gmt"), q.get("status")], ["987654321", "true", "any"]);
  assert.ok(Math.abs(Date.parse(q.get("after") + "Z") - (Date.now() - 48 * 3600 * 1000)) < 60000, "ventana de 48 h");
});

caso("tienda: misma cantidad pero en otro orden de lineas -> igual es duplicado", async () => {
  storeOrders = [manual({ line_items: [{ product_id: 25, variation_id: 27, quantity: 3 }, { product_id: 46, variation_id: 0, quantity: 1 }] })];
  const r = await call({ input: base }, envWoo());
  assert.strictEqual(r.reason, "duplicate_store_order");
});

for (const [n, extra] of [
  ["otra cantidad", { line_items: [{ product_id: 46, variation_id: 0, quantity: 1 }, { product_id: 25, variation_id: 27, quantity: 1 }] }],
  ["otra talla (otra variacion)", { line_items: [{ product_id: 46, variation_id: 0, quantity: 1 }, { product_id: 25, variation_id: 26, quantity: 3 }] }],
  ["un producto de mas", { line_items: [{ product_id: 46, variation_id: 0, quantity: 1 }, { product_id: 25, variation_id: 27, quantity: 3 }, { product_id: 99, variation_id: 0, quantity: 1 }] }],
  ["un producto de menos", { line_items: [{ product_id: 25, variation_id: 27, quantity: 3 }] }],
  ["hace 49 h (fuera de la ventana)", { date_created_gmt: hace(49) }],
  ["pedido cancelado", { status: "cancelled" }],
  ["otro celular (la busqueda trae coincidencias parciales)", { billing: { phone: "+51 987 654 329" } }],
]) {
  caso(`tienda: ${n} -> no es duplicado y se crea`, async () => {
    storeOrders = [manual(extra)];
    const r = await call({ input: base }, envWoo());
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(!r.duplicate);
    assert.strictEqual(posts().length, 1);
  });
}

caso("tienda: si la busqueda falla, el pedido se crea igual (no se bloquea a ciegas)", async () => {
  storeFails = true;
  const r = await call({ input: base }, envWoo());
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(posts().length, 1);
});

caso("tienda: el candado del bot va primero (reintento en el mismo chat: solo confirma)", async () => {
  storeOrders = [manual()];
  const kv = fakeKV({ "order_lock:987654321": JSON.stringify({ orderName: "#KP200001", signature: SIG }) });
  const r = await call({ input: base }, envWoo(kv));
  assert.deepStrictEqual([r.reason, r.order.name], ["duplicate_prevented", "#KP200001"]);
});

caso("tienda: en dryRun tambien se detecta, y sin duplicado lo informa en la respuesta", async () => {
  storeOrders = [manual()];
  const dup = await call({ input: { ...base, dryRun: true } }, envWoo());
  assert.deepStrictEqual([dup.reason, dup.dryRun], ["duplicate_store_order", true]);
  storeOrders = [];
  const ok = await call({ input: { ...base, dryRun: true } }, envWoo());
  assert.strictEqual(ok.storeDuplicateCheck, "sin_duplicado");
  storeFails = true;
  const err = await call({ input: { ...base, dryRun: true } }, envWoo());
  assert.ok(err.storeDuplicateCheck.startsWith("error:"), err.storeDuplicateCheck);
  assert.strictEqual(posts().length, 0);
});

caso("tienda: sin STORE_DUPLICATE_CHECK=on los pedidos reales no consultan la tienda (dryRun si)", async () => {
  storeOrders = [manual()];
  const r = await call({ input: base }, envWoo(fakeKV(), {}));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(!calls.some((c) => c.url.includes("/wc/v3/orders?")), "no consulto la tienda");
  const dry = await call({ input: { ...base, dryRun: true } }, envWoo(fakeKV(), {}));
  assert.strictEqual(dry.reason, "duplicate_store_order");
});

caso("agencia declarada por el agente: logistics_validation_required antes de todo (igual que Shopify)", async () => {
  const r = await call({ input: { ...base, coverage: { shippingMode: "agencia" } } }, envWoo());
  assert.strictEqual(r.reason, "logistics_validation_required");
  assert.strictEqual(calls.length, 0);
});

(async () => {
  let fallos = 0;
  for (const [n, fn] of casos) {
    calls = [];
    coverageMode = "contraentrega";
    orderNumber = 200123;
    storeOrders = [];
    storeFails = false;
    try { await fn(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
