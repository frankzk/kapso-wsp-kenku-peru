#!/usr/bin/env node
// Test del calendario de reparto: los domingos no hay reparto contraentrega.
// Falla real: el sabado 2026-10-03 a las 23:56 el bot confirmo "tu pedido para
// mañana antes de las 3 pm" (#KP138696) y mañana era domingo.
// Correr: node functions/check-coverage/test/calendario.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const C = globalThis.__kenkuCheckCoverage;

// Horas en UTC; Lima = UTC-5.
const lima = (iso) => new Date(new Date(iso + "-05:00").getTime());

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("sabado 23:56 (el caso real): mañana domingo NO, ofrece el lunes 5", () => {
  const c = C.calendarioEntrega(lima("2026-10-03T23:56:00"));
  assert.strictEqual(c.hoy, "sábado"); assert.strictEqual(c.hayRepartoManana, false);
  assert.strictEqual(c.proximoDiaReparto, "lunes 5 de octubre");
  assert.ok(c.aviso.includes("NO hay reparto") && c.aviso.includes("lunes 5 de octubre"));
});
caso("domingo: hoy no, mañana lunes si", () => {
  const c = C.calendarioEntrega(lima("2026-10-04T08:00:00"));
  assert.strictEqual(c.hayRepartoHoy, false); assert.strictEqual(c.hayRepartoManana, true);
  assert.strictEqual(c.proximoDiaReparto, "lunes 5 de octubre");
  assert.ok(c.aviso.includes("no prometas entrega hoy"));
});
caso("dia de semana: sin aviso", () => {
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]) {
    const c = C.calendarioEntrega(lima(`${d}T12:00:00`));
    assert.strictEqual(c.aviso, null, d); assert.strictEqual(c.hayRepartoHoy, true, d); assert.strictEqual(c.hayRepartoManana, true, d);
  }
});
caso("viernes: mañana sabado si hay reparto", () => {
  const c = C.calendarioEntrega(lima("2026-10-09T20:00:00"));
  assert.strictEqual(c.manana, "sábado"); assert.strictEqual(c.hayRepartoManana, true); assert.strictEqual(c.aviso, null);
});
caso("el dia se toma en hora Lima, no UTC (sabado 21:00 Lima = domingo 02:00 UTC)", () => {
  const c = C.calendarioEntrega(lima("2026-10-03T21:00:00"));
  assert.strictEqual(c.hoy, "sábado");
});
caso("cambio de mes: sabado 31 de octubre -> lunes 2 de noviembre", () => {
  assert.strictEqual(C.calendarioEntrega(lima("2026-10-31T10:00:00")).proximoDiaReparto, "lunes 2 de noviembre");
});
caso("entrega urgente: domingo antes de las 10 NO es 'hoy'", () => {
  const u = C.sameDayUrgentInfo(lima("2026-10-04T08:00:00"));
  assert.strictEqual(u.window, "cerrado"); assert.strictEqual(u.canDeliverToday, false);
});
caso("entrega urgente: lunes antes de las 10 sigue siendo 'hoy'", () => {
  const u = C.sameDayUrgentInfo(lima("2026-10-05T08:00:00"));
  assert.strictEqual(u.window, "antes_10"); assert.strictEqual(u.canDeliverToday, true);
});
caso("la respuesta de contraentrega trae el calendario", async () => {
  const req = { method: "POST", text: async () => JSON.stringify({ input: { district: "Cercado de Lima", province: "Lima", region: "Lima" } }) };
  const res = await C.handleRequest(req, {});
  const body = JSON.parse(await res.text());
  assert.strictEqual(body.shippingMode, "contraentrega");
  assert.ok(body.calendario && typeof body.calendario.hayRepartoManana === "boolean");
  if (body.calendario.aviso) assert.ok(body.message.includes(body.calendario.aviso));
});

(async () => {
  let f = 0;
  for (const [n, fn] of casos) {
    try { await fn(); console.log(`ok    ${n}`); } catch (e) { f += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - f}/${casos.length}`); process.exit(f ? 1 : 0);
})();
