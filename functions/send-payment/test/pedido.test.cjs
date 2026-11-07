#!/usr/bin/env node
// send-payment con total/resumen y candado de reenvio.
// Correr: node functions/send-payment/test/pedido.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const P = globalThis.__kenkuSendPayment;
const lunes = new Date("2026-10-05T12:00:00-05:00");

const enviados = [];
globalThis.fetch = async (url, opts) => {
  enviados.push(JSON.parse(opts.body));
  return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 });
};
function kvFalso() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}
async function pagar(env, input) {
  const req = new Request("http://x", { method: "POST", body: JSON.stringify({ input, whatsapp_context: { conversation: { id: "conv1", phone_number_id: "123", phone_number: "51957540566" } } }) });
  return (await P.handleRequest(req, { KAPSO_API_KEY: "k", ...env })).json();
}

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("con total: muestra el pedido y el saldo al recoger", () => {
  const m = P.shalomMessage(lunes, P.pedidoDe({ total: 298, resumen: "3x2 Black Seed Oil" }));
  assert.ok(m.includes("Tu pedido: *3x2 Black Seed Oil* — total *S/ 298*."), m);
  assert.ok(m.includes("al recoger pagas solo *S/ 268*"), m);
  assert.ok(m.includes("930 555 309"));
});
caso("sin total: el mensaje de siempre, byte a byte", () => {
  assert.strictEqual(P.shalomMessage(lunes, null), P.shalomMessage(lunes));
  assert.strictEqual(P.shalomMessage(lunes, P.pedidoDe({ total: 20 })), P.shalomMessage(lunes), "total <= adelanto no vale");
});
caso("el resumen no deja pasar numeros de cuenta ni links", () => {
  const p = P.pedidoDe({ total: "S/ 149", resumen: "1 Black Seed Oil yapea al 987 654 321 https://x.y/z 191-2434540-0-12" });
  assert.strictEqual(p.total, 149);
  assert.ok(!/\d{5}/.test(p.resumen.replace(/\D/g, "")), p.resumen);
  assert.ok(!/http/.test(p.resumen));
  assert.strictEqual(P.pedidoDe({ total: 149, resumen: "NAD+ Resveratrol 500mg 3x2" }).resumen, "NAD+ Resveratrol 500mg 3x2");
});
caso("Olva con total", () => {
  assert.ok(P.olvaMessage(P.pedidoDe({ total: 149, resumen: "1 Black Seed Oil" })).includes("total a pagar: *S/ 149*"));
});
caso("segunda llamada en la misma conversacion no reenvia; con reenviar=true si", async () => {
  enviados.length = 0;
  const env = { KV: kvFalso() };
  const a = await pagar(env, { courier: "shalom", total: 298, resumen: "3x2 Black Seed Oil" });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.conTotal, true);
  const b = await pagar(env, { courier: "shalom" });
  assert.strictEqual(b.reason, "ya_enviado");
  assert.strictEqual(enviados.length, 1);
  const c = await pagar(env, { courier: "shalom", reenviar: true });
  assert.strictEqual(c.ok, true);
  assert.strictEqual(enviados.length, 2);
  const d = await pagar(env, { courier: "olva" });
  assert.strictEqual(d.ok, true, "otro courier si sale");
});
caso("sin KV no bloquea", async () => {
  enviados.length = 0;
  await pagar({}, { courier: "shalom" });
  const b = await pagar({}, { courier: "shalom" });
  assert.strictEqual(b.ok, true);
  assert.strictEqual(enviados.length, 2);
});

(async () => {
  let f = 0;
  for (const [n, fn] of casos) {
    try { await fn(); console.log(`ok    ${n}`); } catch (e) { f += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - f}/${casos.length}`); process.exit(f ? 1 : 0);
})();
