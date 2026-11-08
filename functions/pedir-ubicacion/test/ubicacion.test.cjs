#!/usr/bin/env node
// Correr: node functions/pedir-ubicacion/test/ubicacion.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const P = globalThis.__kenkuPedirUbicacion;
let enviados = []; let falla = false;
P.deps.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body); enviados.push(b);
  if (falla && b.type === "interactive") return new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 });
  return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 });
};
const CONF = "¡Listo Cesar! Tu pedido quedó registrado 🙌\n*Código de pedido:* #KP204038";
const req = (input, conv = { phone_number: "51900470443", phone_number_id: "951608524703564" }) =>
  new Request("http://x", { method: "POST", body: JSON.stringify({ input, whatsapp_context: { conversation: conv } }) });
const casos = []; const caso = (n, f) => casos.push([n, f]);
caso("un solo mensaje: confirmacion + pedido de ubicacion con boton nativo", async () => {
  enviados = []; falla = false;
  const r = await (await P.handleRequest(req({ texto: CONF }), { KAPSO_API_KEY: "k" })).json();
  assert.strictEqual(r.sent, "location_request");
  assert.strictEqual(enviados.length, 1);
  const m = enviados[0];
  assert.strictEqual(m.interactive.type, "location_request_message");
  assert.strictEqual(m.interactive.action.name, "send_location");
  assert.ok(m.interactive.body.text.startsWith(CONF));
  assert.ok(m.interactive.body.text.includes("#KP204038"));
  assert.ok(m.interactive.body.text.includes("Hagamos tu entrega más fácil"));
  assert.ok(m.interactive.body.text.length <= 1024);
});
caso("si WhatsApp rechaza el interactivo, sale la confirmacion como texto", async () => {
  enviados = []; falla = true;
  const r = await (await P.handleRequest(req({ texto: CONF }), { KAPSO_API_KEY: "k" })).json();
  assert.strictEqual(r.sent, "text_fallback");
  assert.strictEqual(enviados[1].type, "text");
  assert.ok(enviados[1].text.body.startsWith(CONF));
});
caso("lead por username: recipient, no to", async () => {
  enviados = []; falla = false;
  await P.handleRequest(req({ texto: CONF }, { business_scoped_user_id: "PE.123", phone_number_id: "951608524703564" }), { KAPSO_API_KEY: "k" });
  assert.strictEqual(enviados[0].recipient, "PE.123");
  assert.ok(!("to" in enviados[0]));
});
caso("sin texto no manda nada; texto largo se recorta y el pedido de ubicacion queda entero", async () => {
  enviados = [];
  const r = await (await P.handleRequest(req({}), { KAPSO_API_KEY: "k" })).json();
  assert.strictEqual(r.reason, "falta_texto"); assert.strictEqual(enviados.length, 0);
  const cuerpo = P.armarCuerpo("x".repeat(2000));
  assert.ok(cuerpo.length <= 1024 && cuerpo.endsWith(P.PEDIDO_UBICACION));
});
caso("quita links del texto del agente", () => {
  assert.ok(!P.armarCuerpo("Listo https://kenku.pe/x").includes("http"));
});
(async () => {
  let ok = 0;
  for (const [n, f] of casos) { try { await f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); } }
  console.log(`${ok}/${casos.length}`); if (ok !== casos.length) process.exit(1);
})();
