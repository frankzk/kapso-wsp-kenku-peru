#!/usr/bin/env node
// guardar_ubicacion: la ubicacion que comparte el cliente despues del pedido va
// a `_cod_ubicacion` del pedido de WooCommerce.
// Correr: node functions/create-shopify-order/test/ubicacion.test.cjs [ruta/al/index.js]
const path = require("path");
const assert = require("assert");
require(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..", "index.js"));
const C = globalThis.__kenkuCreateShopifyOrder || globalThis.__kenkuCreateOrder;
const handleRequest = C.handleRequest;

const ahora = Date.now();
let mensajes = [];
let pedidos = [];
const llamadas = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  llamadas.push({ url: u, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes("/meta/whatsapp/")) return new Response(JSON.stringify({ data: mensajes }), { status: 200 });
  if (u.includes("/wp-json/wc/v3/orders?")) return new Response(JSON.stringify(pedidos), { status: 200 });
  if (u.includes("/wp-json/wc/v3/orders/")) return new Response(JSON.stringify({ id: 1 }), { status: 200 });
  return new Response("{}", { status: 404 });
};
const ENV = { KAPSO_API_KEY: "k", WOO_STORE_URL: "https://kenku.pe", WOO_CONSUMER_KEY: "ck", WOO_CONSUMER_SECRET: "cs" };
const loc = (lat, lng, horasAtras = 0, id = "wamid.L") => ({ id, type: "location", timestamp: String(Math.floor((ahora - horasAtras * 3600000) / 1000)), location: { latitude: lat, longitude: lng } });
const pedido = (id, number, status = "cod-pending", phone = "+51900470443") => ({ id, number, status, billing: { phone }, date_created_gmt: new Date(ahora - 3600000).toISOString().slice(0, 19) });
async function guardar(input = {}) {
  const body = { input: { guardar_ubicacion_pedido: "", ...input }, execution_context: { context: { phone_number: "51900470443", conversation_id: "conv-1" } }, whatsapp_context: { conversation: { id: "conv-1", phone_number_id: "951608524703564", phone_number: "51900470443" } } };
  return (await handleRequest(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), ENV)).json();
}

const casos = [];
const caso = (n, f) => casos.push([n, f]);
caso("guarda la ultima ubicacion del chat en el pedido vigente", async () => {
  llamadas.length = 0;
  mensajes = [loc(-15.49, -70.13, 2, "wamid.viejo"), loc(-15.4991, -70.1351, 0.1, "wamid.nuevo")];
  pedidos = [pedido(204038, "KP204038")];
  const r = await guardar();
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.order, "#KP204038");
  const put = llamadas.find((l) => l.method === "PUT");
  assert.ok(put.url.endsWith("/orders/204038"));
  const meta = put.body.meta_data[0];
  assert.strictEqual(meta.key, "_cod_ubicacion");
  const v = JSON.parse(meta.value);
  assert.deepStrictEqual([v.lat, v.lng, v.fuente, v.confirmado, v.wamid], [-15.4991, -70.1351, "whatsapp", true, "wamid.nuevo"]);
  assert.ok(llamadas.some((l) => l.method === "POST" && l.url.endsWith("/orders/204038/notes")));
});
caso("sin ubicacion en el chat, fuera del Peru o de hace mas de 72 h: no escribe nada", async () => {
  for (const ms of [[], [loc(40.4, -3.7)], [loc(-12.1, -77.0, 80)]]) {
    llamadas.length = 0; mensajes = ms; pedidos = [pedido(1, "KP1")];
    const r = await guardar();
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "sin_ubicacion");
    assert.ok(!llamadas.some((l) => l.method === "PUT"));
  }
});
caso("sin pedido vigente (cancelado u otro celular): no escribe", async () => {
  llamadas.length = 0;
  mensajes = [loc(-12.1, -77.0)];
  pedidos = [pedido(1, "KP1", "cancelled"), pedido(2, "KP2", "cod-pending", "+51911111111")];
  const r = await guardar();
  assert.strictEqual(r.reason, "sin_pedido");
  assert.ok(!llamadas.some((l) => l.method === "PUT"));
});
caso("si el agente nombra el pedido, usa ese", async () => {
  llamadas.length = 0;
  mensajes = [loc(-12.1, -77.0)];
  pedidos = [pedido(9, "KP9"), pedido(8, "KP8")];
  const r = await guardar({ guardar_ubicacion_pedido: "#KP8" });
  assert.strictEqual(r.order, "#KP8");
});
caso("dryRun no escribe", async () => {
  llamadas.length = 0;
  mensajes = [loc(-12.1, -77.0)]; pedidos = [pedido(9, "KP9")];
  const r = await guardar({ dryRun: true });
  assert.strictEqual(r.dryRun, true);
  assert.ok(!llamadas.some((l) => l.method !== "GET"));
});

(async () => {
  let ok = 0;
  for (const [n, f] of casos) { try { await f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); } }
  console.log(`${ok}/${casos.length}`);
  if (ok !== casos.length) process.exit(1);
})();
