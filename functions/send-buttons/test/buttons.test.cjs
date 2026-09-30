#!/usr/bin/env node
// Test de send-buttons (fetch mockeado: no manda nada real).
// Correr: node functions/send-buttons/test/buttons.test.cjs
//
// Lo que se protege: la imagen de cabecera opcional (el testimonio junto a la
// pregunta, un mensaje en vez de dos) y que, si Meta la rechaza, la pregunta
// salga igual sin ella. Y la leccion BSUID de CLAUDE.md.
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const B = globalThis.__kenkuSendButtons;

let enviados, rechazarCabecera;
function mock() {
  enviados = []; rechazarCabecera = false;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (rechazarCabecera && body.interactive.header) return resp({ error: { code: 131053 } }, 400);
    enviados.push(body);
    return resp({ messages: [{ id: `wamid.${enviados.length}` }] });
  };
}
const resp = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });

const CON_TEL = { conversation: { id: "c1", phone_number_id: "1239315459260256", phone_number: "51965391481" } };
const SOLO_BSUID = { conversation: { id: "c2", phone_number_id: "1239315459260256", business_scoped_user_id: "PE.948592654941065" } };

async function correr(input, wa = CON_TEL) {
  const payload = { input: { bodyText: "¿Lima o provincia?", buttons: ["Lima", "Provincia"], ...input }, whatsapp_context: wa };
  const res = await B.handleRequest({ text: async () => JSON.stringify(payload) }, { KAPSO_API_KEY: "k-test" });
  return JSON.parse(await res.text());
}

const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

caso("sin cabecera: igual que siempre", async () => {
  mock(); const r = await correr({});
  assert.strictEqual(r.ok, true); assert.ok(!("headerImage" in r));
  assert.strictEqual(enviados.length, 1); assert.ok(!("header" in enviados[0].interactive));
});
caso("con headerImage: la imagen va de cabecera en el MISMO mensaje", async () => {
  mock(); const r = await correr({ headerImage: "https://cdn/t.jpg" });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.headerImage, true);
  assert.strictEqual(enviados.length, 1);
  assert.deepStrictEqual(enviados[0].interactive.header, { type: "image", image: { link: "https://cdn/t.jpg" } });
});
caso("Meta rechaza la cabecera: la pregunta sale igual sin ella", async () => {
  mock(); rechazarCabecera = true; const r = await correr({ headerImage: "https://cdn/t.jpg" });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.headerImage, false);
  assert.strictEqual(enviados.length, 1); assert.ok(!("header" in enviados[0].interactive));
  assert.strictEqual(enviados[0].interactive.body.text, "¿Lima o provincia?");
});
caso("una URL que no es https se ignora (no se manda cabecera rota)", async () => {
  for (const u of ["http://cdn/t.jpg", "t.jpg", "", "https://cdn/con espacio.jpg"]) {
    mock(); await correr({ headerImage: u });
    assert.ok(!("header" in enviados[0].interactive), u);
  }
});
caso("lead solo con BSUID: va en `recipient`, tambien con cabecera", async () => {
  mock(); await correr({ headerImage: "https://cdn/t.jpg" }, SOLO_BSUID);
  assert.strictEqual(enviados[0].recipient, "PE.948592654941065"); assert.ok(!("to" in enviados[0]));
});

(async () => {
  let fallas = 0;
  for (const [nombre, fn] of casos) {
    try { await fn(); console.log(`ok    ${nombre}`); } catch (e) { fallas += 1; console.log(`FALLA ${nombre}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - fallas}/${casos.length}`);
  process.exit(fallas ? 1 : 0);
})();
