#!/usr/bin/env node
// fu-terminal con compra reciente: termina sin seguimientos de venta.
// Correr: node functions/check-coverage/test/postventa.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const { routeFollowup, compraReciente } = globalThis.__kenkuCheckCoverage;

const hace = (h) => new Date(Date.now() - h * 3600000).toISOString();
const terminal = async (vars) => JSON.parse(await (await routeFollowup({
  available_edges: ["terminar", "seguir", "respondio"],
  whatsapp_context: { conversation: { phone_number: "51957540566" } },
  execution_context: { vars, system: {} },
}, {})).text());

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("compro hace 1 h: termina (sin seguimientos)", async () => {
  const r = await terminal({ stage: "producto_mostrado", recent_order_name: "#KP201855", recent_order_at: hace(1) });
  assert.deepStrictEqual([r.next_edge, r.reason], ["terminar", "compra_reciente"]);
});
caso("compro hace 80 h (la ejecucion lleva dias abierta): sigue normal", async () => {
  assert.strictEqual((await terminal({ stage: "producto_mostrado", recent_order_name: "#KP1", recent_order_at: hace(80) })).next_edge, "seguir");
});
caso("sin compra reciente: sigue normal", async () => {
  assert.strictEqual((await terminal({ stage: "producto_mostrado", recent_order_name: null, recent_order_at: null })).next_edge, "seguir");
  assert.strictEqual((await terminal({ stage: "producto_mostrado" })).next_edge, "seguir");
});
caso("stage terminal sigue mandando primero", async () => {
  const r = await terminal({ stage: "orden_creada", recent_order_name: "#KP1", recent_order_at: hace(1) });
  assert.strictEqual(r.next_edge, "terminar");
  assert.strictEqual(r.reason, undefined);
});
caso("fecha invalida: no corta los seguimientos", () => {
  assert.strictEqual(compraReciente({ recent_order_name: "#KP1", recent_order_at: "ayer" }), false);
});

(async () => {
  let fallos = 0;
  for (const [n, f] of casos) { try { await f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); } }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
