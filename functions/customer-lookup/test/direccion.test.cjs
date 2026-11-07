#!/usr/bin/env node
// Direccion guardada que se muestra en el Msg 8 ("¿Te lo enviamos a [..], como
// la vez pasada?"). Casos reales de direcciones basura del 2026-11-05.
// Correr: node functions/customer-lookup/test/direccion.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const L = globalThis.__kenkuCustomerLookup;
const s = (address1, address2, city, province) => L.buildAddressSummary({ address1, address2, city, province });

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("direccion normal: sin cambios", () => {
  assert.strictEqual(s("Av. Arequipa 2450", "Frente al colegio", "Lince", "Lima"), "Av. Arequipa 2450, Frente al colegio, Lince, Lima");
});
caso("guiones y celular metidos (4b0c8b7e): sin calle -> null", () => {
  assert.strictEqual(s("-, 980187619, -", "", "Puente Piedra", "Lima"), null);
  assert.strictEqual(s("-", "-", "Callao", "Callao"), null);
});
caso("repetidos sin importar mayusculas ni tildes (0799ade2, d1d45fc3)", () => {
  assert.strictEqual(s("Jr. Bolognesi 120", "", "CARHUAZ / Carhuaz / Carhuaz", "Áncash"), "Jr. Bolognesi 120, CARHUAZ, Áncash");
  assert.strictEqual(s("Por el mercado", "Por el mercado", "Chumbivilcas", "Cusco"), "Por el mercado, Chumbivilcas, Cusco");
});
caso("numero de puerta separado por coma se conserva", () => {
  assert.strictEqual(s("Av. Los Olivos, 345", "", "Comas", "Lima"), "Av. Los Olivos, 345, Comas, Lima");
});
caso("celular pegado al final de la referencia se quita", () => {
  assert.strictEqual(s("Calle Real 45", "987 654 321", "Cerro Colorado", "Arequipa"), "Calle Real 45, Cerro Colorado, Arequipa");
});
caso("solo numeros o solo letras de 2: null", () => {
  assert.strictEqual(s("123", "", "Lince", "Lima"), null);
  assert.strictEqual(s("Mz", "", "Lince", "Lima"), null);
});
caso("woo: la direccion sale del pedido vigente, no del cancelado", () => {
  const o = (id, fecha, status, address_1) => ({ id, number: `KP${id}`, status, date_created_gmt: fecha, total: "149", billing: { first_name: "Ana", phone: "+51957540566", address_1, city: "Lince", state: "LMA" } });
  const c = L.wooCustomerFromOrders([
    o(2, "2026-11-04T10:00:00", "cancelled", "-"),
    o(1, "2026-10-01T10:00:00", "completed", "Av. Arequipa 2450"),
  ]);
  assert.strictEqual(L.buildAddressSummary(c.defaultAddress), "Av. Arequipa 2450, Lince, Lima");
  assert.strictEqual(c.lastOrder.name, "#KP2", "lastOrder sigue siendo el mas reciente");
});

let ok = 0;
for (const [n, f] of casos) {
  try { f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); }
}
console.log(`${ok}/${casos.length}`);
if (ok !== casos.length) process.exit(1);
