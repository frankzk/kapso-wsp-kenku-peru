#!/usr/bin/env node
// Direcciones vagas y referencia obligatoria cuando la calle no tiene numero.
// Correr: node functions/save-order-state/test/direccion.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const S = globalThis.__kenkuSaveOrderState;

function kvFalso() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}
async function guardar(env, input) {
  const req = new Request("http://x", { method: "POST", body: JSON.stringify({ input: { conversationId: "c1", ...input }, execution_context: { context: { phone_number: "51957540566" } } }) });
  return (await S.handleRequest(req, env)).json();
}
const base = { distrito: "Lince", provincia: "Lima", promo: "3x2", receiver_name: "Ana Torres" };

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("'casa', 'aqui', 'la misma' se rechazan", async () => {
  for (const v of ["casa", "Mi casa", "aquí", "La misma", "domicilio"]) {
    const r = await guardar({ KV: kvFalso() }, { ...base, direccion: v });
    assert.ok(r.rejected.some((x) => x.field === "address"), v);
    assert.ok(r.missing.includes("address"), v);
  }
});
caso("'Casa verde frente al parque' vale (es una seña)", async () => {
  const r = await guardar({ KV: kvFalso() }, { ...base, direccion: "Casa verde frente al parque" });
  assert.deepStrictEqual(r.rejected, []);
  assert.deepStrictEqual(r.missing, []);
});
caso("calle sin numero ni referencia: se guarda y falta reference (#KP200248)", async () => {
  const r = await guardar({ KV: kvFalso() }, { ...base, direccion: "Jr. Mamá Ocllo" });
  assert.strictEqual(r.saved.address, "Jr. Mamá Ocllo");
  assert.deepStrictEqual(r.missing, ["reference"]);
  assert.ok(/referencia/.test(r.message));
});
caso("con referencia aparte ya no falta", async () => {
  const env = { KV: kvFalso() };
  await guardar(env, { ...base, direccion: "Jr. Mamá Ocllo" });
  const r = await guardar(env, { referencia: "a una cuadra del mercado Santa Rosa" });
  assert.deepStrictEqual(r.missing, []);
});
caso("con numero o manzana/lote no hace falta referencia", async () => {
  for (const v of ["Av. Arequipa 2450", "Mz B Lt 5 AAHH Los Pinos", "Carretera Central km 12"]) {
    const r = await guardar({ KV: kvFalso() }, { ...base, direccion: v });
    assert.deepStrictEqual(r.missing, [], v);
  }
});
caso("agencia Shalom como direccion: no pide referencia", async () => {
  const r = await guardar({ KV: kvFalso() }, { ...base, direccion: "Shalom Juliaca principal" });
  assert.deepStrictEqual(r.missing, []);
});
caso("pide todo lo que falta en un solo mensaje", async () => {
  const r = await guardar({ KV: kvFalso() }, { distrito: "Lince", provincia: "Lima" });
  assert.deepStrictEqual(r.missing, ["quantity", "address", "receiver_name"]);
  assert.ok(/UN solo mensaje/.test(r.message));
  assert.ok(!/de a un dato por turno/.test(r.message));
});

(async () => {
  let ok = 0;
  for (const [n, f] of casos) {
    try { await f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); }
  }
  console.log(`${ok}/${casos.length}`);
  if (ok !== casos.length) process.exit(1);
})();
