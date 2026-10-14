#!/usr/bin/env node
// Test de verify-payment-account. Correr: node functions/verify-payment-account/test/verify.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const V = globalThis.__kenkuVerifyAccount;
async function ver(numero, env = {}) {
  const r = await V.handleRequest({ json: async () => ({ input: { number: numero } }) }, env);
  return JSON.parse(await r.text());
}
const LISTA = { PAYMENT_ACCOUNTS: JSON.stringify([{ number: "987754147", name: "Yape 2", holder: "Gabriela" }]) };
const casos = [];
const caso = (n, f) => casos.push([n, f]);
caso("Yape principal: principal, aun sin lista", async () => {
  for (const n of ["930 555 309", "+51 930555309", "930-555-309"]) assert.strictEqual((await ver(n)).status, "principal", n);
});
caso("BCP: cuenta y CCI son nuestras, aun sin lista", async () => {
  for (const n of ["191-2434540-0-12", "1912434540012", "00219100243454001251", "002-191-002434540012-51"]) assert.strictEqual((await ver(n)).status, "nuestra", n);
});
caso("sin lista, un numero desconocido sigue siendo sin_lista (nunca desconocida)", async () => {
  assert.strictEqual((await ver("912345678")).status, "sin_lista");
});
caso("con lista: las del secret siguen funcionando y lo ajeno es desconocida", async () => {
  assert.strictEqual((await ver("987754147", LISTA)).status, "nuestra");
  assert.strictEqual((await ver("912345678", LISTA)).status, "desconocida");
  assert.strictEqual((await ver("930 555 390", LISTA)).status, "desconocida");
});
caso("un CCI parecido pero distinto NO pasa", async () => {
  assert.notStrictEqual((await ver("00219100243454001252", LISTA)).status, "nuestra");
});
(async () => {
  let f = 0;
  for (const [n, fn] of casos) { try { await fn(); console.log(`ok    ${n}`); } catch (e) { f += 1; console.log(`FALLA ${n}\n      ${e.message}`); } }
  console.log(`\n${casos.length - f}/${casos.length}`); process.exit(f ? 1 : 0);
})();
