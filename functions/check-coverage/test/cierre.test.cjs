#!/usr/bin/env node
// Cierre trivial sin respuesta: no debe terminar en loop_detectado.
// Correr: node functions/check-coverage/test/cierre.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const C = globalThis.__kenkuCheckCoverage;

function kv() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
let historial = [];
globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: historial }) });
const ENV = () => ({ KAPSO_API_KEY: "k", KV: kv() });
const payload = (edges, vars = {}) => ({
  available_edges: edges,
  whatsapp_context: { conversation: { id: "c1", phone_number_id: "1239315459260256" } },
  execution_context: { vars: { stage: "producto_mostrado", ...vars }, system: {} },
});
const msg = (dir, ts, type, text, id) => ({ id: id || `m${ts}`, timestamp: String(ts), type, text: type === "text" ? { body: text } : undefined, kapso: { direction: dir, content: text } });
async function ruta(env, edges = ["respondio", "seguir", "terminar"]) {
  const r = await C.routeFollowup(payload(edges), env); return JSON.parse(await r.text()).next_edge;
}
const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("sticker sin responder: 1a vez al agente, 2a vez siguen los seguimientos", async () => {
  historial = [msg("outbound", 100, "text", "¡Que tengas un lindo dia!"), msg("inbound", 200, "sticker", "Sticker attached (s.webp)")];
  const env = ENV();
  assert.strictEqual(await ruta(env), "respondio");
  assert.strictEqual(await ruta(env), "seguir");
  assert.strictEqual(await ruta(env), "seguir");
});
caso("'ok gracias' y 👍: igual", async () => {
  for (const t of ["ok gracias", "👍", "Gracias!", "ya está bien"]) {
    historial = [msg("outbound", 100, "text", "Quedo atenta"), msg("inbound", 200, "text", t)];
    const env = ENV();
    assert.strictEqual(await ruta(env), "respondio", t);
    assert.strictEqual(await ruta(env), "seguir", t);
  }
});
caso("una pregunta real SIEMPRE vuelve al agente", async () => {
  historial = [msg("outbound", 100, "text", "Quedo atenta"), msg("inbound", 200, "text", "cuanto cuesta el 3x2?")];
  const env = ENV();
  for (let i = 0; i < 4; i += 1) assert.strictEqual(await ruta(env), "respondio");
});
caso("audio o imagen: siempre al agente (pueden traer contenido)", async () => {
  for (const tipo of ["audio", "image"]) {
    historial = [msg("outbound", 100, "text", "x"), msg("inbound", 200, tipo, "")];
    const env = ENV();
    assert.strictEqual(await ruta(env), "respondio"); assert.strictEqual(await ruta(env), "respondio");
  }
});
caso("en la espera (respondio/timeout) el cierre ya visto deja vencer el timeout", async () => {
  historial = [msg("outbound", 100, "text", "x"), msg("inbound", 200, "sticker", "Sticker")];
  const env = ENV();
  assert.strictEqual(await ruta(env), "respondio");
  const r = await ruta(env, ["respondio", "timeout"]);
  assert.notStrictEqual(r, undefined);
  const live = await C.hasLiveUnansweredInbound(payload(["respondio", "timeout"]), env);
  assert.strictEqual(live, false);
});
caso("un sticker NUEVO despues vuelve a pasar una vez por el agente", async () => {
  const env = ENV();
  historial = [msg("outbound", 100, "text", "x"), msg("inbound", 200, "sticker", "S", "a")];
  await ruta(env); await ruta(env);
  historial = [...historial, msg("outbound", 300, "text", "seguimiento"), msg("inbound", 400, "sticker", "S", "b")];
  assert.strictEqual(await ruta(env), "respondio");
});
caso("ya respondido por el bot: seguir, como siempre", async () => {
  historial = [msg("inbound", 100, "text", "gracias"), msg("outbound", 200, "text", "A ti!")];
  assert.strictEqual(await ruta(ENV()), "seguir");
});
caso("sin KV: comportamiento anterior (siempre al agente)", async () => {
  historial = [msg("outbound", 100, "text", "x"), msg("inbound", 200, "sticker", "S")];
  const env = { KAPSO_API_KEY: "k" };
  assert.strictEqual(await ruta(env), "respondio"); assert.strictEqual(await ruta(env), "respondio");
});
(async () => {
  let f = 0;
  for (const [n, fn] of casos) { try { await fn(); console.log(`ok    ${n}`); } catch (e) { f += 1; console.log(`FALLA ${n}\n      ${e.message}`); } }
  console.log(`\n${casos.length - f}/${casos.length}`); process.exit(f ? 1 : 0);
})();
