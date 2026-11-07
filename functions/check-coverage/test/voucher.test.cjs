#!/usr/bin/env node
// s3 y s6 no salen a quien espera el voucher de agencia (salida saltar_voucher
// de fu-g3 y fu-g6). Correr: node functions/check-coverage/test/voucher.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const { routeFollowup, brazoSeguimiento } = globalThis.__kenkuCheckCoverage;
const edge = async (edges, stage, phone = "51957540566") => JSON.parse(await (await routeFollowup({
  available_edges: edges,
  whatsapp_context: { conversation: { phone_number: phone } },
  execution_context: { vars: { stage }, system: {} },
}, {})).text()).next_edge;

const casos = [];
const caso = (n, f) => casos.push([n, f]);
const G36 = ["enviar", "esperar", "saltar_voucher"];

caso("esperando_voucher en fu-g3/fu-g6: saltar_voucher", async () => {
  assert.strictEqual(await edge(G36, "esperando_voucher"), "saltar_voucher");
});
caso("otros stages en fu-g3/fu-g6: la regla de horario de siempre", async () => {
  for (const st of ["producto_mostrado", "datos_envio", "esperando_confirmacion", ""]) {
    assert.ok(["enviar", "esperar"].includes(await edge(G36, st)), st);
  }
});
caso("gates sin la salida (s1, s2, s4, s5, s7): esperando_voucher sigue recibiendo", async () => {
  assert.ok(["enviar", "esperar"].includes(await edge(["enviar", "esperar"], "esperando_voucher")));
});
caso("fu-g4 (F/R) no cambia con esperando_voucher", async () => {
  const telR = Array.from({ length: 200 }, (_, i) => `5195${String(1000000 + i * 37).padStart(7, "0")}`).find((t) => brazoSeguimiento(t) === "R");
  assert.strictEqual(await edge(["enviar", "esperar", "saltar"], "esperando_voucher", telR), "saltar");
});

caso("comprar_despues corta la cadena (fu-terminal)", async () => {
  assert.strictEqual(await edge(["respondio", "seguir", "terminar"], "comprar_despues"), "terminar");
});

(async () => {
  let ok = 0;
  for (const [n, f] of casos) {
    try { await f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); }
  }
  console.log(`${ok}/${casos.length}`);
  if (ok !== casos.length) process.exit(1);
})();
