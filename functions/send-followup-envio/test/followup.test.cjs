#!/usr/bin/env node
// Contrato del seguimiento s2: UN solo texto y la forma de pago exacta de la
// zona. Red simulada: no sale nada a Meta.
// Correr: node functions/send-followup-envio/test/followup.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const F = globalThis.__kenkuSendFollowupEnvio;
const env = { KAPSO_API_KEY: "k" };

const COD = { cashOnDelivery: true, shippingMode: "contraentrega", advanceAmount: 0 };
const SHALOM = { cashOnDelivery: false, shippingMode: "agencia", courier: "Shalom", advanceAmount: 30 };
const OLVA = { cashOnDelivery: false, shippingMode: "agencia", courier: "Olva Courier", advanceAmount: 0, requiresFullPrepayment: true };
const SIN_ZONA = { cashOnDelivery: false, shippingMode: "needs_location" };

F.deps.dormir = async () => {};
function red({ cobertura = COD, fallas = 0 } = {}) {
  const enviados = [];
  const consultas = [];
  F.deps.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url.includes("/invoke")) {
      consultas.push(body.input);
      if (consultas.length <= fallas) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ data: cobertura }) };
    }
    enviados.push(body);
    return { ok: true, json: async () => ({ messages: [{ id: `wamid.${enviados.length}` }] }) };
  };
  return { enviados, consultas };
}

const ZONA = { order_region: "Ayacucho", order_province: "Huanta", order_district: "Llochegua" };
function req(vars, conv = { phone_number: "51999999999", phone_number_id: "951608524703564" }, input) {
  return { json: async () => ({ whatsapp_context: { conversation: conv }, execution_context: { vars }, ...(input ? { input } : {}) }) };
}
const leer = async (res) => JSON.parse(await res.text());
const HINT = "quedaste viendo el Black Seed Oil";

(async () => {
  let fallos = 0;
  const caso = async (n, f) => { try { await f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); } };

  await caso("contraentrega: pagas al recibir en su distrito", async () => {
    const { enviados, consultas } = red({ cobertura: COD });
    const r = await leer(await F.handleRequest(req({ ...ZONA, order_district: "San Miguel", order_region: "Lima", order_province: "Lima", followup_hint: HINT }), env));
    assert.strictEqual(r.sent, "text");
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].text.body, `Cuando gustes lo retomamos: ${HINT}. A *San Miguel* te lo llevamos a tu puerta y *pagas recién al recibir* 😊`);
    assert.deepStrictEqual(consultas[0], { region: "Lima", province: "Lima", district: "San Miguel" });
  });
  await caso("agencia Shalom: adelanto de S/ 30, nunca 'pagas al recibir'", async () => {
    const { enviados } = red({ cobertura: SHALOM });
    const r = await leer(await F.handleRequest(req({ ...ZONA, followup_hint: HINT }), env));
    assert.strictEqual(r.diag.modo, "agencia_adelanto");
    const t = enviados[0].text.body;
    assert.strictEqual(t, `Cuando gustes lo retomamos: ${HINT}. A *Llochegua* va por agencia *Shalom*: lo separas con *S/ 30* (se descuenta del total) y el saldo lo pagas al recoger 😊`);
    assert.ok(!/pagas recién al recibir/.test(t));
  });
  await caso("agencia sin adelanto (Olva, pago completo): sin frase de pago", async () => {
    const { enviados } = red({ cobertura: OLVA });
    await F.handleRequest(req({ ...ZONA, followup_hint: HINT, order_address: "Olva de Huanta" }), env);
    assert.strictEqual(enviados[0].text.body, `Cuando gustes lo retomamos: ${HINT} 😊`);
  });
  await caso("la direccion guardada va a check-coverage (detecta el courier elegido)", async () => {
    const { consultas } = red({ cobertura: SHALOM });
    await F.handleRequest(req({ ...ZONA, order_address: "Shalom Huanta", order_reference: "frente al mercado" }), env);
    assert.strictEqual(consultas[0].address, "Shalom Huanta frente al mercado");
  });
  await caso("sin zona guardada: frase de siempre y no consulta cobertura", async () => {
    const { enviados, consultas } = red();
    await F.handleRequest(req({ followup_hint: HINT }), env);
    assert.strictEqual(consultas.length, 0);
    assert.strictEqual(enviados[0].text.body, `Cuando gustes lo retomamos: ${HINT}. ${F.FRASE_GENERICA}`);
  });
  await caso("solo distrito, sin provincia ni region: frase de siempre", async () => {
    const { enviados, consultas } = red();
    await F.handleRequest(req({ order_district: "Llochegua", followup_hint: HINT }), env);
    assert.strictEqual(consultas.length, 0);
    assert.ok(enviados[0].text.body.endsWith(F.FRASE_GENERICA));
  });
  await caso("cobertura sin confirmar (needs_location): frase de siempre", async () => {
    const { enviados } = red({ cobertura: SIN_ZONA });
    await F.handleRequest(req({ ...ZONA, followup_hint: HINT }), env);
    assert.ok(enviados[0].text.body.endsWith(F.FRASE_GENERICA));
  });
  await caso("check-coverage falla una vez (rafaga de las 07:00): reintenta y sale exacta", async () => {
    const { enviados, consultas } = red({ cobertura: SHALOM, fallas: 1 });
    await F.handleRequest(req({ ...ZONA, followup_hint: HINT }), env);
    assert.strictEqual(consultas.length, 2);
    assert.ok(/adelanto|separas/.test(enviados[0].text.body));
  });
  await caso("check-coverage falla siempre: frase de siempre, un solo mensaje", async () => {
    const { enviados } = red({ cobertura: SHALOM, fallas: 9 });
    await F.handleRequest(req({ ...ZONA, followup_hint: HINT }), env);
    assert.strictEqual(enviados.length, 1);
    assert.ok(enviados[0].text.body.endsWith(F.FRASE_GENERICA));
  });
  await caso("hint vacio o con punto final: no queda ': .' ni '..'", async () => {
    red({ cobertura: COD });
    assert.strictEqual(F.armarTexto("", null, null), `Cuando gustes lo retomamos 🙌 ${F.FRASE_GENERICA}`);
    assert.ok(!F.armarTexto("solo faltan tus datos de envio.", null, null).includes(".."));
  });
  await caso("lead por username (BSUID): va en recipient, no en to", async () => {
    const { enviados } = red({ cobertura: COD });
    await F.handleRequest(req({ ...ZONA }, { business_scoped_user_id: "PE.123", phone_number_id: "951608524703564" }), env);
    assert.strictEqual(enviados[0].recipient, "PE.123");
    assert.ok(!("to" in enviados[0]));
  });
  await caso("dryRun: devuelve el texto y no envia", async () => {
    const { enviados } = red({ cobertura: SHALOM });
    const r = await leer(await F.handleRequest(req(undefined, {}, { dryRun: true, vars: { ...ZONA, followup_hint: HINT } }), env));
    assert.strictEqual(r.dryRun, true);
    assert.ok(r.texto.includes("Shalom"));
    assert.strictEqual(enviados.length, 0);
  });
  await caso("sin contexto del chat: no manda nada", async () => {
    const { enviados } = red({ cobertura: COD });
    const r = await leer(await F.handleRequest(req({ ...ZONA }, {}), env));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(enviados.length, 0);
  });
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nok");
  process.exit(fallos ? 1 : 0);
})();
