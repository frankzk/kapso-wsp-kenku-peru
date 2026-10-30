#!/usr/bin/env node
// Contrato del recordatorio p5: EXACTAMENTE un mensaje al cliente, la foto con
// el texto al pie o el texto solo. Red simulada: no sale nada a Meta.
// Correr: node functions/send-reminder/test/reminder.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const R = globalThis.__kenkuSendReminder;
const env = { KAPSO_API_KEY: "k" };

function red({ media = [], lookupOk = true, imagenFalla = false } = {}) {
  const enviados = [];
  R.deps.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url.includes("/invoke")) {
      return { ok: lookupOk, json: async () => ({ data: { ok: true, media } }) };
    }
    enviados.push(body);
    if (body.type === "image" && imagenFalla) return { ok: false, status: 400, json: async () => ({ error: "x" }) };
    return { ok: true, json: async () => ({ messages: [{ id: `wamid.${enviados.length}` }] }) };
  };
  return enviados;
}

function req(vars, conv = { phone_number: "51999999999", phone_number_id: "951608524703564" }) {
  return { json: async () => ({ whatsapp_context: { conversation: conv }, execution_context: { vars } }) };
}

const leer = async (res) => JSON.parse(await res.text());
const foto = { mediaType: "image", url: "https://kenku.pe/wp-content/uploads/foto.jpg", mediaUrl: "https://kenku.pe/wp-content/uploads/foto.jpg" };

(async () => {
  let fallos = 0;
  const caso = async (n, f) => { try { await f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); } };

  await caso("con producto y foto: una sola imagen con el texto al pie", async () => {
    const enviados = red({ media: [foto] });
    const r = await leer(await R.handleRequest(req({ last_product_handle: "cayenne", last_product_title: "Cayenne Pepper" }), env));
    assert.strictEqual(r.sent, "image");
    assert.strictEqual(enviados.length, 1);
    assert.deepStrictEqual(enviados[0].image, { link: foto.url, caption: R.TEXTO });
    assert.strictEqual(enviados[0].to, "51999999999");
  });
  await caso("sin producto en las variables: solo el texto", async () => {
    const enviados = red({ media: [foto] });
    const r = await leer(await R.handleRequest(req({}), env));
    assert.strictEqual(r.sent, "text");
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].text.body, R.TEXTO);
  });
  await caso("la busqueda de fotos falla o no trae nada: solo el texto", async () => {
    for (const opts of [{ lookupOk: false }, { media: [] }]) {
      const enviados = red(opts);
      const r = await leer(await R.handleRequest(req({ last_product_handle: "cayenne" }), env));
      assert.strictEqual(r.sent, "text");
      assert.strictEqual(enviados.length, 1);
    }
  });
  await caso("si Meta rechaza la foto, sale el texto (el cliente recibe uno)", async () => {
    const enviados = red({ media: [foto], imagenFalla: true });
    const r = await leer(await R.handleRequest(req({ last_product_handle: "cayenne" }), env));
    assert.strictEqual(r.sent, "text");
    assert.deepStrictEqual(enviados.map((e) => e.type), ["image", "text"]);
  });
  await caso("ignora videos y usa la primera foto", async () => {
    const enviados = red({ media: [{ mediaType: "video", url: "https://x/v.mp4" }, foto] });
    await R.handleRequest(req({ last_product_title: "Biru" }), env);
    assert.strictEqual(enviados[0].image.link, foto.url);
  });
  await caso("lead por username (BSUID): va en recipient, no en to", async () => {
    const enviados = red({});
    await R.handleRequest(req({}, { business_scoped_user_id: "PE.123", phone_number_id: "951608524703564" }), env);
    assert.strictEqual(enviados[0].recipient, "PE.123");
    assert.ok(!("to" in enviados[0]));
  });
  await caso("sin contexto del chat: no manda nada", async () => {
    const enviados = red({ media: [foto] });
    const r = await leer(await R.handleRequest(req({ last_product_handle: "x" }, {}), env));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(enviados.length, 0);
  });
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nok");
  process.exit(fallos ? 1 : 0);
})();
