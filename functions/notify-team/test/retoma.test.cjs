#!/usr/bin/env node
// agendar_retoma (aplazo con fecha). Correr: node functions/notify-team/test/retoma.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const N = globalThis.__kenkuNotifyTeam;

const enviados = [];
globalThis.fetch = async (url, opts) => { enviados.push({ url: String(url), body: JSON.parse(opts.body), headers: opts.headers }); return new Response("{}", { status: 200 }); };
const ENV = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1", STORE_WEBHOOK_URL: "https://dash.example/hook", STORE_WEBHOOK_SECRET: "s" };
const hoy = N.hoyLima();
const masDias = (n) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
async function llamar(input, env = ENV) {
  const req = new Request("http://x", { method: "POST", body: JSON.stringify({ input, execution_context: { context: { phone_number: "51957540566", conversation_id: "conv-1" }, vars: { last_product_title: "Black Seed Oil" } } }) });
  return (await N.handleRequest(req, env)).json();
}
const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("fecha mal escrita o 'mañana': fecha_invalida, sin Telegram ni Kapta", async () => {
  enviados.length = 0;
  for (const f of ["mañana", "15/11", "2026-02-30", masDias(1), masDias(0), masDias(-3), masDias(120)]) {
    const r = await llamar({ fecha_retoma: f });
    assert.strictEqual(r.ok, false, f);
    assert.strictEqual(r.reason, "fecha_invalida", f);
    assert.ok(!r.vars, f);
  }
  assert.strictEqual(enviados.length, 0);
});
caso("fecha valida: Telegram, vars y Kapta apagado por defecto", async () => {
  enviados.length = 0;
  const f = masDias(5);
  const r = await llamar({ fecha_retoma: f, producto: "Black Seed Oil", zona: "Huancayo", nota: "el viernes sale de libres" });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.vars, { stage: "comprar_despues", comprar_despues_fecha: f, comprar_despues_producto: "Black Seed Oil", comprar_despues_nota: "el viernes sale de libres" });
  assert.strictEqual(r.kapta, "apagado");
  assert.ok(enviados.length >= 1 && enviados.every((e) => e.url.includes("api.telegram.org")), "solo Telegram, nada al dashboard");
  assert.ok(enviados[0].body.text.includes("COMPRAR DESPUÉS"));
  assert.ok(enviados[0].body.text.includes("957540566"));
});
caso("RETOMA_A_KAPTA=on: evento firmado al dashboard con la fecha", async () => {
  enviados.length = 0;
  const f = masDias(10);
  const r = await llamar({ fecha_retoma: f, producto: "Vital Moo", zona: "Cusco" }, { ...ENV, RETOMA_A_KAPTA: "on" });
  assert.strictEqual(r.kapta, "enviado");
  const k = enviados.find((e) => e.url.startsWith("https://dash.example"));
  assert.strictEqual(k.body.event, "kenku.retoma.agendada");
  assert.strictEqual(k.body.fecha, f);
  assert.strictEqual(k.body.phone_number, "51957540566");
  assert.strictEqual(k.body.conversation_id, "conv-1");
  assert.ok(k.headers["X-Kapso-Signature"]);
});
caso("sin fecha: el notify_team de siempre (handoff con reason) no cambia", async () => {
  enviados.length = 0;
  const req = new Request("http://x", { method: "POST", body: JSON.stringify({ input: { reason: "RECLAMO", note: "x" } }) });
  const r = await (await N.handleRequest(req, ENV)).json();
  assert.strictEqual(r.ok, true);
  assert.ok(enviados.some((e) => e.body.event === "workflow.execution.handoff"));
});
caso("un 'fecha' suelto en un aviso comun NO lo desvia a la retoma", async () => {
  enviados.length = 0;
  const r = await llamar({ note: "COMPRAR_DESPUES: el lunes", fecha: "el lunes" });
  assert.strictEqual(r.ok, true);
  assert.ok(!r.retoma);
  assert.ok(enviados.length >= 1);
});
caso("fecha legible en español", () => {
  assert.strictEqual(N.fechaLegible("2026-11-16"), "lunes 16/11");
});

(async () => {
  let ok = 0;
  for (const [n, f] of casos) { try { await f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); } }
  console.log(`${ok}/${casos.length}`);
  if (ok !== casos.length) process.exit(1);
})();
