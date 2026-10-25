// Reporte con STORE_BACKEND=woocommerce (fetch y KV simulados): pedidos de WooCommerce por la API REST, en dos
// paginas, mas los de Shopify de antes del cierre (28-10-2026 00:00 UTC) mientras siga el token.
// Correr: node functions/campaign-report/test/woocommerce.test.cjs
require("../index.js");
const assert = require("assert");
const api = globalThis.__kenkuCampaignReport;

const meta = (pairs) => Object.entries(pairs).map(([key, value], i) => ({ id: i + 1, key, value }));
const PAGE1 = [
  // Bot, por anuncio, 3x2 de un producto de S/ 119 (lista 357, cobra 238).
  { id: 11, number: "KP200011", status: "cod-pending", payment_method: "cod", total: "238.00", shipping_total: "0.00", currency: "PEN", date_created_gmt: "2026-10-26T15:00:00", date_paid_gmt: null,
    billing: { phone: "+51987000111" }, meta_data: meta({ kapta_channel: "whatsapp_bot", source: "whatsapp-bot", ctwa_ad_id: "AD1", ctwa_headline: "El poder de la semilla negra" }),
    line_items: [{ name: "Black Seed Oil", quantity: 3, subtotal: "357.00", total: "238.00" }], refunds: [] },
  // Web pagado con Flow; el celular es de un lead A del experimento (lo cierra una asesora).
  { id: 12, number: "KP200012", status: "processing", payment_method: "flow", total: "149.00", shipping_total: "0.00", currency: "PEN", date_created_gmt: "2026-10-26T20:00:00", date_paid_gmt: "2026-10-26T20:01:00",
    billing: { phone: "+51911222333" }, meta_data: meta({ kapta_channel: "web_formulario" }), line_items: [{ name: "NAD+", quantity: 1, subtotal: "149.00", total: "149.00" }], refunds: [] },
  // Flow sin pagar: no es un pedido (en Shopify seria un checkout abandonado).
  { id: 13, number: "KP200013", status: "pending", payment_method: "flow", total: "500.00", shipping_total: "0.00", currency: "PEN", date_created_gmt: "2026-10-26T21:00:00", date_paid_gmt: null,
    billing: { phone: "+51900000000" }, meta_data: [], line_items: [], refunds: [] },
];
const PAGE2 = [
  // Bot, el martes 27 a las 22:00 de Lima (en UTC ya es 28).
  { id: 14, number: "KP200014", status: "cod-pending", payment_method: "cod", total: "99.00", shipping_total: "0.00", currency: "PEN", date_created_gmt: "2026-10-28T03:00:00", date_paid_gmt: null,
    billing: { phone: "+51987000222" }, meta_data: meta({ source: "whatsapp-bot" }), line_items: [{ name: "Focus+", quantity: 1, subtotal: "99.00", total: "99.00" }], refunds: [] },
  { id: 15, number: "KP200015", status: "failed", payment_method: "flow", total: "500.00", currency: "PEN", date_created_gmt: "2026-10-27T17:00:00", meta_data: meta({ source: "whatsapp-bot", ctwa_ad_id: "AD1" }), line_items: [], refunds: [] },
  // Bot anulado: cuenta como pedido, con S/ 0 (como currentTotalPriceSet de Shopify).
  { id: 16, number: "KP200016", status: "cancelled", payment_method: "cod", total: "50.00", shipping_total: "10.00", currency: "PEN", date_created_gmt: "2026-10-27T16:00:00", date_paid_gmt: null,
    billing: { phone: "+51987000333" }, meta_data: meta({ source: "whatsapp-bot" }), line_items: [{ name: "Rodillera", quantity: 1, subtotal: "40.00", total: "40.00" }], refunds: [] },
  // Reembolsado entero: cuenta, con S/ 0.
  { id: 17, number: "KP200017", status: "refunded", payment_method: "flow", total: "80.00", shipping_total: "0.00", currency: "PEN", date_created_gmt: "2026-10-27T18:00:00", date_paid_gmt: "2026-10-27T18:01:00",
    billing: { phone: "+51987000444" }, meta_data: [], line_items: [{ name: "Crema", quantity: 1, subtotal: "80.00", total: "80.00" }], refunds: [{ id: 1, total: "-80.00" }] },
];
const SHOPIFY = [
  { id: "1", name: "#KP140001", createdAt: "2026-10-26T14:00:00Z", phone: "+51987000555",
    currentTotalPriceSet: { shopMoney: { amount: "219.00", currencyCode: "PEN" } }, totalPriceSet: { shopMoney: { amount: "219.00" } }, totalShippingPriceSet: { shopMoney: { amount: "0.00" } },
    cancelledAt: null, displayFinancialStatus: "PENDING", customAttributes: [{ key: "source", value: "whatsapp-bot" }, { key: "ctwa_ad_id", value: "AD1" }],
    lineItems: { nodes: [{ title: "Black Seed Oil", quantity: 2, originalUnitPriceSet: { shopMoney: { amount: "109.50" } } }] } },
];

const calls = [];
let shopifyStatus = 200;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("/wp-json/wc/v3/orders")) {
    calls.push({ kind: "woo", url: u, auth: init.headers?.Authorization });
    const page = new URL(u).searchParams.get("page");
    return new Response(JSON.stringify(page === "1" ? PAGE1 : PAGE2), { status: 200, headers: { "x-wp-totalpages": "2", "Content-Type": "application/json" } });
  }
  if (u.includes("/admin/api/") && u.includes("graphql.json")) {
    calls.push({ kind: "shopify", url: u, q: JSON.parse(init.body).variables.q });
    if (shopifyStatus !== 200) return new Response(JSON.stringify({ errors: "Unavailable Shop" }), { status: shopifyStatus });
    return new Response(JSON.stringify({ data: { orders: { nodes: SHOPIFY, pageInfo: { hasNextPage: false, endCursor: null } } } }));
  }
  return new Response("{}", { status: 404 });
};

function fakeKV(entries) {
  const m = new Map(Object.entries(entries).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}

const WOO = { WOO_STORE_URL: "https://tienda.test/", WOO_CONSUMER_KEY: "ck_x", WOO_CONSUMER_SECRET: "cs_y", DASHBOARD_ACCESS_KEY: "K" };
const env = { ...WOO, STORE_BACKEND: "woocommerce" };
const get = (query, e) => api.handleRequest({ method: "GET", url: `https://x/?key=K&format=json&${query}`, headers: { get: () => null } }, e);
const report = async (query, e) => (await get(query, e)).json();
const of = (kind) => calls.filter((c) => c.kind === kind);

(async () => {
  // 1) Sin STORE_BACKEND: Shopify como siempre, aunque esten las claves de WooCommerce.
  let r = await report("since=2026-10-26&until=2026-10-27", { ...WOO, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(of("woo").length, 0, "sin STORE_BACKEND no toca WooCommerce");
  assert.ok(of("shopify")[0].q.includes("created_at:<='2026-10-28T04:59:59Z'"), "Shopify con el rango entero, como hoy");
  assert.strictEqual(r.totals.ordersScanned, 1);
  assert.strictEqual(r.storeBackend, undefined, "el JSON de Shopify no cambia");
  assert.strictEqual(api.getConfig({}).storeBackend, "shopify");
  assert.strictEqual(api.getConfig({ STORE_BACKEND: "WooCommerce" }).storeBackend, "woocommerce");
  assert.strictEqual(api.getConfig({ sTOREBACKEND: "woocommerce" }).storeBackend, "woocommerce", "nombre deformado por el CLI");

  // 2) Solo WooCommerce (sin token de Shopify).
  calls.length = 0;
  r = await report("since=2026-10-26&until=2026-10-27", env);
  const woo = of("woo");
  assert.strictEqual(woo.length, 2, "lee las 2 paginas");
  assert.strictEqual(woo[0].auth, `Basic ${Buffer.from("ck_x:cs_y").toString("base64")}`, "Basic Auth con la clave");
  const q = new URL(woo[0].url).searchParams;
  assert.ok(woo[0].url.startsWith("https://tienda.test/wp-json/wc/v3/orders?"), "sin doble barra");
  assert.strictEqual(q.get("after"), "2026-10-26T04:59:59", "desde las 00:00 de Lima del 26 (UTC, exclusivo)");
  assert.strictEqual(q.get("before"), "2026-10-28T05:00:00", "hasta las 23:59:59 de Lima del 27");
  assert.strictEqual(q.get("dates_are_gmt"), "true");
  assert.strictEqual(q.get("status"), "any", "incluye cod-pending (Por confirmar)");
  assert.strictEqual(of("shopify").length, 0, "sin token no llama a Shopify");
  assert.strictEqual(r.totals.ordersScanned, 5, "sin el fallido ni el Flow sin pagar");
  assert.strictEqual(r.totals.totalRevenue, 486, "238 + 149 + 99 + 0 (anulado) + 0 (reembolsado)");
  assert.strictEqual(r.totals.attributedOrders, 1);
  assert.deepStrictEqual([r.ads[0].adId, r.ads[0].orders, r.ads[0].revenue, r.ads[0].headline], ["AD1", 1, 238, "El poder de la semilla negra"]);
  assert.strictEqual(r.conversation.orders, 3, "3 pedidos del bot (con el anulado, como en Shopify)");
  assert.strictEqual(r.conversation.revenue, 337);
  assert.deepStrictEqual(r.conversation.byDay.map((d) => [d.day, d.orders]), [["2026-10-26", 1], ["2026-10-27", 2]], "dias de Lima");
  assert.strictEqual(r.currency, "PEN");
  assert.strictEqual(r.storeBackend, "woocommerce");
  assert.deepStrictEqual(r.orderSources, { woocommerce: 5, shopify: null });
  const htmlPage = await (await api.handleRequest({ method: "GET", url: "https://x/?key=K&since=2026-10-26&until=2026-10-27", headers: { get: () => null } }, env)).text();
  assert.ok(htmlPage.includes("Datos: WooCommerce y Shopify antes de su cierre"), "pie del tablero");

  // 3) Con token de Shopify, rango que cruza el cierre: suma Shopify hasta el cierre.
  calls.length = 0;
  r = await report("since=2026-10-26&until=2026-10-28", { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.ok(of("shopify")[0].q.includes("created_at:>='2026-10-26T05:00:00Z'"), of("shopify")[0].q);
  assert.ok(of("shopify")[0].q.includes("created_at:<='2026-10-27T23:59:59Z'"), "Shopify solo hasta el cierre");
  assert.strictEqual(r.totals.ordersScanned, 6, "5 de WooCommerce + 1 de Shopify");
  assert.strictEqual(r.ads[0].orders, 2, "AD1: uno en cada tienda");
  assert.strictEqual(r.ads[0].revenue, 457, "238 + 219");
  assert.deepStrictEqual(r.orderSources, { woocommerce: 5, shopify: 1 });

  // 4) Rango despues del cierre: no llama a Shopify aunque siga el token.
  calls.length = 0;
  await report("since=2026-10-28&until=2026-10-29", { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(of("shopify").length, 0, "despues del cierre no hay nada en Shopify");
  calls.length = 0;
  await report("since=2026-10-28&until=2026-10-29", { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat", SHOPIFY_CLOSED_AT: "2026-11-05T05:00:00Z" });
  assert.strictEqual(of("shopify").length, 1, "SHOPIFY_CLOSED_AT mueve la fecha de cierre");

  // 5) Shopify ya cerrado: el reporte sale igual, con un aviso.
  shopifyStatus = 402;
  r = await report("since=2026-10-26&until=2026-10-27", { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(r.totals.ordersScanned, 5, "solo WooCommerce");
  assert.ok(r.warnings.some((w) => w.includes("pedidos de Shopify de antes del cierre")), JSON.stringify(r.warnings));
  shopifyStatus = 200;

  // 6) Sin las claves de WooCommerce: error claro.
  const sinClave = await get("since=2026-10-26&until=2026-10-27", { ...env, WOO_CONSUMER_KEY: undefined });
  assert.strictEqual(sinClave.status, 500);
  assert.ok((await sinClave.json()).message.includes("WOO_CONSUMER_KEY"));

  // 7) Para probar sin cambiar el secreto: storeBackend=woocommerce en los parametros.
  calls.length = 0;
  r = await report("since=2026-10-26&until=2026-10-27&storeBackend=woocommerce", WOO);
  assert.strictEqual(of("woo").length, 2);
  assert.strictEqual(r.totals.ordersScanned, 5);

  // 8) only=orders: auditoria de los pedidos del bot de las dos tiendas.
  r = await report("since=2026-10-26&until=2026-10-27&only=orders", { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.deepStrictEqual(r.orders.map((o) => o.name), ["#KP140001", "#KP200011", "#KP200016", "#KP200014"], "por fecha");
  const o11 = r.orders.find((o) => o.name === "#KP200011");
  assert.deepStrictEqual([o11.units, o11.listPrice, o11.subtotal, o11.priceOk], [3, 357, 238, true], "3x2 en la escalera");
  const o16 = r.orders.find((o) => o.name === "#KP200016");
  assert.deepStrictEqual([o16.cancelled, o16.total, o16.originalTotal, o16.subtotal], [true, 0, 50, 40]);
  assert.strictEqual(r.cancelled, 1);

  // 9) only=ab: el pedido web de un lead A cuenta como pedido de asesora (cruce por celular).
  const kv = fakeKV({
    "abx_lead:2026-10-26:A:otro:P1:conv1": { variant: "A", at: "2026-10-26T12:00:00.000Z" },
    "abx_phone:911222333": { variant: "A", day: "2026-10-26", conversationId: "conv1", at: "2026-10-26T12:00:00.000Z" },
  });
  calls.length = 0;
  r = await report("since=2026-10-26&until=2026-10-27&only=ab", { ...env, KV: kv });
  assert.deepStrictEqual(r.ab.pedidosAsesora, [{ name: "#KP200012", day: "2026-10-26", variant: "A", total: 149 }], JSON.stringify(r.ab));
  assert.strictEqual(r.ab.A.ordersAsesora, 1);
  assert.strictEqual(r.ab.pedidosAsesoraNota, null);

  // 10) Una sola lectura de WooCommerce por reporte (ventas + cruce A/D).
  calls.length = 0;
  await report("since=2026-10-26&until=2026-10-27", { ...env, KV: kv });
  assert.strictEqual(of("woo").length, 2, "2 paginas, una sola vez");

  // Normalizacion suelta.
  assert.strictEqual(api.normalizeWooOrder({ status: "checkout-draft" }), null);
  assert.strictEqual(api.normalizeWooOrder({ status: "cancelled", payment_method: "flow", total: "10" }), null, "Flow anulado sin pagar");
  assert.strictEqual(api.normalizeWooOrder({ status: "processing", payment_method: "flow", date_paid_gmt: "2026-10-26T00:00:00", total: "100", refunds: [{ total: "-30.00" }] }).amount, 70, "reembolso parcial");

  console.log("OK: todos los asserts de WooCommerce pasaron");
})().catch((e) => { console.error("FALLO:", e); process.exit(1); });
