#!/usr/bin/env node
// customer-lookup con STORE_BACKEND=woocommerce (fetch simulado): busca al cliente en los pedidos de WooCommerce
// por el celular (billing.phone con o sin +51) y, mientras siga el token, tambien en Shopify.
// Correr: node functions/customer-lookup/test/woocommerce.test.cjs
const path = require("path");
const assert = require("assert");

// Datos de prueba (no son clientes reales).
const ORDERS = {
  // Lo que devuelve ?search=987654321: dos pedidos del cliente, uno fallido, un Flow sin pagar y uno de otra persona
  // que coincide por el texto de la direccion.
  "987654321": [
    { id: 505, number: "KP200005", status: "cod-pending", payment_method: "cod", total: "149.00", currency: "PEN", date_created_gmt: "2026-10-27T15:00:00", customer_id: 0,
      billing: { first_name: "Rosa", last_name: "Pérez", phone: "+51987654321", email: "", address_1: "Av. Arequipa 2450", address_2: "Frente al colegio", city: "Lince", state: "LMA", country: "PE" } },
    { id: 503, number: "KP200003", status: "completed", payment_method: "cod", total: "238.00", currency: "PEN", date_created_gmt: "2026-10-26T15:00:00", customer_id: 0,
      billing: { first_name: "Rosa", last_name: "P.", phone: "+51987654321", address_1: "Jr. Viejo 123", city: "Lince", state: "LMA", country: "PE" } },
    { id: 506, number: "KP200006", status: "failed", payment_method: "flow", total: "99.00", date_created_gmt: "2026-10-28T15:00:00", billing: { phone: "+51987654321", city: "Otro" } },
    { id: 507, number: "KP200007", status: "pending", payment_method: "flow", total: "99.00", date_created_gmt: "2026-10-28T16:00:00", billing: { phone: "+51987654321", city: "Otro" } },
    { id: 504, number: "KP200004", status: "cod-pending", payment_method: "cod", total: "59.00", date_created_gmt: "2026-10-28T17:00:00", billing: { phone: "+51911111111", address_1: "Calle 987654321", city: "Surco", state: "LMA" } },
  ],
  // Guardado sin el +51 (pedido hecho a mano).
  "912345678": [
    { id: 601, number: "KP200010", status: "processing", payment_method: "cod", total: "119.00", currency: "PEN", date_created_gmt: "2026-10-27T10:00:00", customer_id: 7,
      billing: { first_name: "Luis", last_name: "Rojas", phone: "912345678", address_1: "Calle Real 45", city: "Cerro Colorado", state: "ARE", country: "PE" } },
  ],
};
const SHOPIFY_CUSTOMER = {
  id: "gid://shopify/Customer/1", displayName: "Ana Torres", firstName: "Ana", lastName: "Torres", email: null, phone: "+51955555555",
  numberOfOrders: 4, amountSpent: { amount: "500.00", currencyCode: "PEN" }, tags: [],
  defaultAddress: { firstName: "Ana", lastName: "Torres", phone: "+51955555555", address1: "Av. Sol 1", address2: null, city: "Miraflores", province: "Lima", zip: null },
  lastOrder: { id: "gid://shopify/Order/9", name: "#KP139999", processedAt: "2026-10-20T10:00:00Z" },
};

const calls = [];
let wooStatus = 200;
let shopifyMode = "ok"; // ok | down | hang
globalThis.fetch = (url, opts = {}) => {
  const u = String(url);
  if (u.includes("/wp-json/wc/v3/orders")) {
    const term = new URL(u).searchParams.get("search");
    calls.push({ kind: "woo", url: u, term, auth: opts.headers?.Authorization });
    if (wooStatus !== 200) return Promise.resolve(new Response("{\"code\":\"error\"}", { status: wooStatus }));
    return Promise.resolve(new Response(JSON.stringify(ORDERS[term] || [])));
  }
  if (u.includes("graphql.json")) {
    calls.push({ kind: "shopify", q: JSON.parse(opts.body).variables.query });
    if (shopifyMode === "hang") {
      return new Promise((_, reject) => opts.signal?.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); }));
    }
    if (shopifyMode === "down") return Promise.resolve(new Response(JSON.stringify({ errors: "Unavailable Shop" }), { status: 402 }));
    const q = JSON.parse(opts.body).variables.query;
    const nodes = q.includes("955555555") ? [SHOPIFY_CUSTOMER] : [];
    return Promise.resolve(new Response(JSON.stringify({ data: { customers: { nodes } } })));
  }
  return Promise.resolve(new Response("{}", { status: 404 }));
};

require(path.join(__dirname, "..", "index.js"));
const api = globalThis.__kenkuCustomerLookup;

const WOO = { WOO_STORE_URL: "https://tienda.test/", WOO_CONSUMER_KEY: "ck_x", WOO_CONSUMER_SECRET: "cs_y" };
const env = { ...WOO, STORE_BACKEND: "woocommerce" };
const lookup = async (input, e) => JSON.parse(await (await api.handleRequest({ text: async () => JSON.stringify({ input }) }, e)).text());
const of = (kind) => calls.filter((c) => c.kind === kind);
const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("sin STORE_BACKEND: solo Shopify, como hoy (aunque esten las claves de WooCommerce)", async () => {
  const r = await lookup({ phone: "+51955555555" }, { ...WOO, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(of("woo").length, 0);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.customer.id, "gid://shopify/Customer/1");
  assert.strictEqual(r.store, undefined, "la respuesta de Shopify no cambia");
  assert.strictEqual(api.getStoreBackend({}), "shopify");
  assert.strictEqual(api.getStoreBackend({ sTOREBACKEND: "woocommerce" }), "woocommerce", "nombre deformado por el CLI");
});

caso("WooCommerce: lo encuentra por celular y arma la direccion del pedido mas reciente", async () => {
  const r = await lookup({ phone: "+51 987 654 321" }, env);
  const woo = of("woo");
  assert.strictEqual(woo.length, 1);
  assert.strictEqual(woo[0].term, "987654321", "busca por los 9 digitos");
  assert.strictEqual(woo[0].auth, `Basic ${Buffer.from("ck_x:cs_y").toString("base64")}`);
  assert.ok(woo[0].url.startsWith("https://tienda.test/wp-json/wc/v3/orders?"), "sin doble barra");
  assert.strictEqual(new URL(woo[0].url).searchParams.get("status"), "any");
  assert.strictEqual(of("shopify").length, 0, "sin token no llama a Shopify");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.store, "woocommerce");
  assert.deepStrictEqual([r.customer.firstName, r.customer.lastName, r.customer.phone], ["Rosa", "Pérez", "+51987654321"]);
  assert.strictEqual(r.customer.ordersCount, 2, "sin el fallido, el Flow sin pagar ni el de otra persona");
  assert.strictEqual(r.customer.totalSpent, "387.00 PEN");
  assert.strictEqual(r.customer.lastOrderName, "#KP200005");
  assert.strictEqual(r.customer.lastOrderAt, "2026-10-27T15:00:00Z");
  assert.strictEqual(r.customer.id, null, "pedido de invitado");
  assert.deepStrictEqual([r.address.address1, r.address.address2, r.address.city, r.address.province], ["Av. Arequipa 2450", "Frente al colegio", "Lince", "Lima"]);
  assert.strictEqual(r.addressSummary, "Av. Arequipa 2450, Frente al colegio, Lince, Lima");
  assert.strictEqual(r.vars.known_customer_found, true);
  assert.strictEqual(r.vars.known_customer_name, "Rosa");
  assert.strictEqual(r.vars.known_address, r.addressSummary);
  assert.ok(r.hint.startsWith("Cliente recurrente"));
});

caso("WooCommerce: celular guardado sin +51", async () => {
  const r = await lookup({ phone: "51912345678" }, env);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.customer.id, "woo-customer-7");
  assert.strictEqual(r.addressSummary, "Calle Real 45, Cerro Colorado, Arequipa");
});

caso("WooCommerce sin el cliente y Shopify con token: lo encuentra en Shopify", async () => {
  const r = await lookup({ phone: "+51955555555" }, { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.store, "shopify");
  assert.strictEqual(r.customer.lastOrderName, "#KP139999");
});

caso("WooCommerce lo encuentra: no espera a Shopify aunque este colgado", async () => {
  shopifyMode = "hang";
  const t0 = Date.now();
  const r = await lookup({ phone: "+51987654321" }, { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.ok(Date.now() - t0 < 2000, `tardo ${Date.now() - t0} ms`);
  assert.strictEqual(r.store, "woocommerce");
  shopifyMode = "ok";
});

caso("Shopify cerrado (402): un solo intento y el lead queda como cliente nuevo", async () => {
  shopifyMode = "down";
  const r = await lookup({ phone: "+51900000001" }, { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(of("shopify").length, 1, "no insiste con las otras consultas");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.found, false);
  assert.strictEqual(r.store, null);
  shopifyMode = "ok";
});

caso("sin token de Shopify y sin el cliente: cliente nuevo (no rompe por el token)", async () => {
  const r = await lookup({ phone: "+51900000002" }, env);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.found, false);
  assert.ok(r.message.includes("no hay registro previo en la tienda"), r.message);
  assert.strictEqual(r.vars.known_customer_found, false);
  assert.strictEqual(r.vars.needs_phone, false);
});

caso("WooCommerce caido pero Shopify responde: cliente nuevo", async () => {
  wooStatus = 500;
  const r = await lookup({ phone: "+51900000003" }, { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.found, false);
  wooStatus = 200;
});

caso("las dos tiendas caidas: lookup_failed, pero con las vars del flujo", async () => {
  wooStatus = 500;
  shopifyMode = "down";
  const r = await lookup({ phone: "+51900000004" }, { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "lookup_failed");
  assert.ok(r.error.includes("WooCommerce 500"), r.error);
  assert.strictEqual(r.vars.known_customer_found, false);
  assert.ok(["A", "D"].includes(r.vars.ab_variant));
  wooStatus = 200;
  shopifyMode = "ok";
});

caso("sin claves de WooCommerce ni token: lookup_failed claro", async () => {
  const r = await lookup({ phone: "+51900000005" }, { STORE_BACKEND: "woocommerce" });
  assert.strictEqual(r.reason, "lookup_failed");
  assert.ok(r.error.includes("WOO_CONSUMER_KEY"), r.error);
});

caso("para probar sin cambiar el secreto: storeBackend en el input", async () => {
  const r = await lookup({ phone: "+51987654321", storeBackend: "woocommerce" }, { ...WOO, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(of("woo").length, 1);
  assert.strictEqual(r.store, "woocommerce");
});

(async () => {
  let fallos = 0;
  for (const [n, fn] of casos) {
    calls.length = 0;
    try { await fn(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
