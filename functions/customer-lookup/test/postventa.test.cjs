#!/usr/bin/env node
// Compra reciente -> variables recent_order_* para el modo postventa.
// Correr: node functions/customer-lookup/test/postventa.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const L = globalThis.__kenkuCustomerLookup;

const ahora = Date.parse("2026-11-03T12:00:00Z");
const hace = (h) => new Date(ahora - h * 3600000).toISOString().slice(0, 19);
const pedido = (n, h, status = "cod-pending") => ({ id: n, number: `KP${n}`, status, date_created_gmt: hace(h), billing: { phone: "+51957540566", first_name: "Victoria" } });

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("pedido de hace 1 minuto (el 'ok' a la confirmacion): postventa", () => {
  const c = L.wooCustomerFromOrders([pedido(201855, 1 / 60)]);
  const v = L.recentOrderVars(c.recentOrder, ahora);
  assert.strictEqual(v.recent_order_name, "#KP201855");
  assert.strictEqual(v.recent_order_hours, 0);
  assert.ok(v.recent_order_at.startsWith("2026-11-03T11:59"));
});
caso("pedido de hace 71 h: todavia postventa; de hace 73 h: ya no", () => {
  assert.strictEqual(L.recentOrderVars(L.wooCustomerFromOrders([pedido(1, 71)]).recentOrder, ahora).recent_order_hours, 71);
  assert.strictEqual(L.recentOrderVars(L.wooCustomerFromOrders([pedido(1, 73)]).recentOrder, ahora).recent_order_name, null);
});
caso("el pedido mas reciente esta cancelado: cuenta el anterior vigente", () => {
  const c = L.wooCustomerFromOrders([pedido(2, 2, "cancelled"), pedido(1, 30, "processing")]);
  assert.strictEqual(c.lastOrder.name, "#KP2", "lastOrder no cambia");
  assert.strictEqual(L.recentOrderVars(c.recentOrder, ahora).recent_order_name, "#KP1");
});
caso("solo cancelados o devueltos: sin postventa", () => {
  const c = L.wooCustomerFromOrders([pedido(2, 2, "cancelled"), pedido(1, 5, "refunded")]);
  assert.strictEqual(L.recentOrderVars(c.recentOrder, ahora).recent_order_name, null);
});
caso("sin cliente o sin pedido: las tres variables en null (no quedan valores viejos)", () => {
  for (const o of [undefined, null, {}, { name: "#KP1" }]) {
    assert.deepStrictEqual(L.recentOrderVars(o, ahora), { recent_order_name: null, recent_order_at: null, recent_order_hours: null, recent_order_items: null });
  }
});
caso("recent_order_items: cantidad y nombre corto de lo que compro", () => {
  const p = { ...pedido(202419, 37), line_items: [
    { name: "SUPER HUMAN Ethiopian Black Seed Oil – Aceite de Semilla Negra Etíope Alta Potencia (60 Cápsulas)", quantity: 2 },
    { name: "Cayenne Pepper (60 cápsulas)", quantity: 1 },
  ] };
  const v = L.recentOrderVars(L.wooCustomerFromOrders([p]).recentOrder, ahora);
  assert.strictEqual(v.recent_order_items, "2x SUPER HUMAN Ethiopian Black Seed Oil, 1x Cayenne Pepper");
});
caso("pedido sin line_items: recent_order_items null, el resto igual", () => {
  const v = L.recentOrderVars(L.wooCustomerFromOrders([pedido(1, 5)]).recentOrder, ahora);
  assert.strictEqual(v.recent_order_name, "#KP1");
  assert.strictEqual(v.recent_order_items, null);
});

let fallos = 0;
for (const [n, f] of casos) { try { f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); } }
console.log(`\n${casos.length - fallos}/${casos.length}`);
process.exit(fallos ? 1 : 0);
