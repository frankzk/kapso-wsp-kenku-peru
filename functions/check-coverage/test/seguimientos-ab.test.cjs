#!/usr/bin/env node
// Prueba A/B de seguimientos (2026-10-25): el brazo R se salta el s4.
// Correr: node functions/check-coverage/test/seguimientos-ab.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const { brazoSeguimiento, routeFollowup } = globalThis.__kenkuCheckCoverage;

const TELS = Array.from({ length: 20000 }, (_, i) => `519${String((i * 7919 + 12345) % 100000000).padStart(8, "0")}`);
const casos = [];
const caso = (n, f) => casos.push([n, f]);
const edge = async (edges, phone) => JSON.parse(await (await routeFollowup({
  available_edges: edges,
  whatsapp_context: { conversation: { phone_number: phone } },
  execution_context: { vars: {}, system: {} },
}, {})).text()).next_edge;

caso("reparto ~50/50 y sin telefono va a F", () => {
  const r = TELS.filter((t) => brazoSeguimiento(t) === "R").length / TELS.length;
  assert.ok(Math.abs(r - 0.5) < 0.01, `R = ${(r * 100).toFixed(2)}%`);
  for (const t of ["", null, undefined]) assert.strictEqual(brazoSeguimiento(t), "F");
  assert.strictEqual(brazoSeguimiento("+51 965 391 481"), brazoSeguimiento("51965391481"));
});
caso("independiente del reparto A/D viejo", () => {
  const fnv = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mix = (v) => { let h = v >>> 0; h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return h >>> 0; };
  const exD = TELS.filter((t) => mix(fnv(`present:${t}`)) % 2 === 1);
  const r = exD.filter((t) => brazoSeguimiento(t) === "R").length / exD.length;
  assert.ok(Math.abs(r - 0.5) < 0.015, `de los D, ${(r * 100).toFixed(1)}% en R`);
});
caso("gate con 'saltar': R salta, F sigue la regla de horario", async () => {
  const telR = TELS.find((t) => brazoSeguimiento(t) === "R");
  const telF = TELS.find((t) => brazoSeguimiento(t) === "F");
  assert.strictEqual(await edge(["enviar", "esperar", "saltar"], telR), "saltar");
  assert.ok(["enviar", "esperar"].includes(await edge(["enviar", "esperar", "saltar"], telF)));
});
caso("gates sin 'saltar' (s1-s3, s5-s7): R nunca salta", async () => {
  const telR = TELS.find((t) => brazoSeguimiento(t) === "R");
  assert.ok(["enviar", "esperar"].includes(await edge(["enviar", "esperar"], telR)));
});

(async () => {
  let fallos = 0;
  for (const [n, f] of casos) {
    try { await f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
