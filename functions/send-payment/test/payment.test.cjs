#!/usr/bin/env node
// Test de send-payment: el Yape fijo y el dia de despacho de Shalom.
// Correr: node functions/send-payment/test/payment.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const P = globalThis.__kenkuSendPayment;
const lima = (iso) => new Date(iso + "-05:00");
const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("lunes a viernes: mañana (despacho al dia siguiente)", () => {
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]) {
    assert.strictEqual(P.cuandoDespacha(lima(`${d}T12:00:00`)), "mañana", d);
  }
});
caso("sabado (Shalom no despacha domingos): el lunes", () => {
  assert.strictEqual(P.cuandoDespacha(lima("2026-10-03T23:56:00")), "el lunes");
});
caso("domingo: mañana lunes", () => {
  assert.strictEqual(P.cuandoDespacha(lima("2026-10-04T10:00:00")), "mañana lunes");
});
caso("el dia es el de Lima (sabado 21:00 Lima = domingo 02:00 UTC)", () => {
  assert.strictEqual(P.cuandoDespacha(lima("2026-10-03T21:00:00")), "el lunes");
});
caso("el mensaje de Shalom nunca dice 'mañana' un sabado ni 'hoy' un domingo", () => {
  const sab = P.shalomMessage(lima("2026-10-03T20:00:00"));
  const dom = P.shalomMessage(lima("2026-10-04T10:00:00"));
  assert.ok(sab.includes("despacharlo el lunes") && !/despacharlo[^(]*mañana/.test(sab));
  assert.ok(dom.includes("despacharlo mañana lunes") && !/despacharlo hoy/.test(dom));
});
caso("el mensaje menciona el ticket de envio", () => {
  assert.ok(P.shalomMessage(lima("2026-10-06T10:00:00")).includes("despacharlo mañana (ese día te compartimos el ticket con tu *código de seguimiento*)"));
});
caso("el Yape sigue fijo en el mensaje", () => {
  const m = P.shalomMessage(lima("2026-10-05T10:00:00"));
  assert.ok(m.includes("*Grupo GF SAC*") && m.includes("930 555 309") && m.includes("*S/30*"));
});

let f = 0;
for (const [n, fn] of casos) {
  try { fn(); console.log(`ok    ${n}`); } catch (e) { f += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
}
console.log(`\n${casos.length - f}/${casos.length}`); process.exit(f ? 1 : 0);
