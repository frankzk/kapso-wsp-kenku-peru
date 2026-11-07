#!/usr/bin/env node
// Prueba T7 (s1 con la pregunta pendiente en botones). Red simulada: no sale
// nada a Meta ni a Kapso.
// Correr: node functions/send-followup-s1/test/s1.test.cjs
//
// Protege:
//  - el reparto (50/50, ortogonal a F/R "fu4:", A/D "present:" y T11 "ficha:");
//  - que dormida todos reciban el texto de siempre, byte a byte;
//  - cada caso (ubicacion / cantidad / otro) y sus guardas de precio;
//  - el respaldo a texto si WhatsApp rechaza los botones (y el 429);
//  - BSUID en `recipient`, limites de WhatsApp (titulos <= 20, max 3 botones);
//  - el registro por telefono para la lectura.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const raiz = path.join(__dirname, "..", "..");
const indexPath = path.join(__dirname, "..", "index.js");
require(path.join(raiz, "check-coverage", "index.js"));
const { brazoSeguimiento } = globalThis.__kenkuCheckCoverage;

// Carga la funcion; con `activa` reescribe la constante (como un redeploy con
// PRUEBA_T_ACTIVA = true) en una copia en memoria.
function cargar(activa) {
  const fuente = fs.readFileSync(indexPath, "utf8");
  assert.ok(/const PRUEBA_T_ACTIVA = false;/.test(fuente), "en el repo la prueba tiene que estar dormida");
  const codigo = activa ? fuente.replace("const PRUEBA_T_ACTIVA = false;", "const PRUEBA_T_ACTIVA = true;") : fuente;
  delete globalThis.__kenkuSendFollowupS1;
  new Function(codigo)();
  const mod = globalThis.__kenkuSendFollowupS1;
  mod.deps.dormir = async () => {};
  return mod;
}
const DORMIDA = cargar(false);
const ACTIVA = cargar(true);

// Hashes de las otras pruebas, replicados para medir independencia.
function fnv1a(t) { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mix32(v) { let h = v >>> 0; h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return h >>> 0; }
const conSal = (sal) => (t) => mix32(fnv1a(`${sal}${String(t).replace(/\D/g, "")}`)) % 2;

const TELS = Array.from({ length: 10000 }, (_, i) => `519${String((i * 7919 + 12345) % 100000000).padStart(8, "0")}`);

// El texto que tenia el nodo fu-s1 (repo: workflows/kenku-sales-bot/definition.json).
const DEF = JSON.parse(fs.readFileSync(path.join(raiz, "..", "workflows", "kenku-sales-bot", "definition.json"), "utf8"));
const NODO_S1 = (DEF.definition || DEF).nodes.find((n) => n.id === "fu-s1");
const PLANTILLA_S1 = NODO_S1.data.config.message;
const renderKapso = (hint) => PLANTILLA_S1.replace("{{vars.followup_hint}}", hint);

const HINT = "quedaste viendo el *Black Seed Oil*";
const HANDLE = "black-seed-oil";
const TITULO = "Black Seed Oil – Aceite de Comino Negro 1000 mg";
const producto = (over = {}) => ({
  found: true,
  reliableMatch: true,
  outOfStock: false,
  product: { handle: HANDLE, title: TITULO, variants: [{ price: "149.00", availableForSale: true }] },
  ...over,
});

// Red simulada. `envios` son los POST a Meta; `respuestasEnvio` una lista de
// {status, body} que se consumen en orden (lo que falte responde 200).
function red({ lookup = producto(), lookupFalla = 0, historial = null, respuestasEnvio = [] } = {}, mod) {
  const envios = [];
  const consultas = [];
  const historiales = [];
  let lookups = 0;
  const cola = [...respuestasEnvio];
  mod.deps.fetch = async (url, opts = {}) => {
    if (url.includes("/invoke")) {
      lookups += 1;
      consultas.push(JSON.parse(opts.body).input);
      if (lookups <= lookupFalla) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: lookup }) };
    }
    if (url.includes("/messages?")) {
      historiales.push(url);
      if (!historial) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: historial }) };
    }
    const body = JSON.parse(opts.body);
    envios.push(body);
    const r = cola.shift() || { status: 200, body: { messages: [{ id: `wamid.${envios.length}` }] } };
    return { ok: r.status < 300, status: r.status, json: async () => r.body || {} };
  };
  return { envios, consultas, historiales, lookups: () => lookups };
}

const CONV = { id: "conv-1", phone_number_id: "1145171692021464" };
function req(vars, { phone, bsuid, input, messages } = {}) {
  const conversation = { ...CONV, ...(phone ? { phone_number: phone } : {}), ...(bsuid ? { business_scoped_user_id: bsuid } : {}) };
  return {
    text: async () => JSON.stringify({
      whatsapp_context: { conversation, ...(messages ? { messages } : {}) },
      execution_context: { vars },
      ...(input ? { input } : {}),
    }),
  };
}
const leer = async (res) => JSON.parse(await res.text());
const kvFalso = () => {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
};

const TEL_T = TELS.find((t) => ACTIVA.brazoS1(t) === "T");
const TEL_S = TELS.find((t) => ACTIVA.brazoS1(t) === "S");
const env = { KAPSO_API_KEY: "k" };

const UBICACION = { stage: "producto_mostrado", followup_hint: HINT, last_product_handle: HANDLE, last_product_title: TITULO };
const CANTIDAD = { ...UBICACION, stage: "datos_envio", followup_hint: "te quedó pendiente el *Black Seed Oil*", order_district: "Miraflores", order_province: "Lima", order_region: "Lima" };

const casos = [];
const caso = (n, f) => casos.push([n, f]);

// ---------------------------------------------------------------- reparto

caso("reparto ~50/50 en 10.000 telefonos; sin telefono -> null (S)", () => {
  const t = TELS.filter((x) => ACTIVA.brazoS1(x) === "T").length / TELS.length;
  assert.ok(Math.abs(t - 0.5) < 0.015, `T = ${(t * 100).toFixed(2)}%`);
  console.log(`      T = ${(t * 100).toFixed(2)}% de ${TELS.length}`);
  for (const x of ["", null, undefined, "PE."]) assert.strictEqual(ACTIVA.brazoS1(x), null);
  assert.strictEqual(ACTIVA.brazoS1("+51 965 391 481"), ACTIVA.brazoS1("51965391481"));
});
caso("ortogonal a F/R (fu4:): las 4 celdas ~25%", () => {
  const celdas = { TF: 0, TR: 0, SF: 0, SR: 0 };
  for (const x of TELS) celdas[ACTIVA.brazoS1(x) + brazoSeguimiento(x)] += 1;
  for (const [k, n] of Object.entries(celdas)) {
    const p = n / TELS.length;
    assert.ok(Math.abs(p - 0.25) < 0.015, `celda ${k} = ${(p * 100).toFixed(2)}%`);
  }
  console.log(`      ${Object.entries(celdas).map(([k, n]) => `${k} ${(n / TELS.length * 100).toFixed(2)}%`).join(" · ")}`);
});
caso("ortogonal a A/D (present:) y a T11 (ficha:): celdas ~25%", () => {
  for (const sal of ["present:", "ficha:"]) {
    const otra = conSal(sal);
    const celdas = {};
    for (const x of TELS) { const k = ACTIVA.brazoS1(x) + otra(x); celdas[k] = (celdas[k] || 0) + 1; }
    for (const [k, n] of Object.entries(celdas)) {
      const p = n / TELS.length;
      assert.ok(Math.abs(p - 0.25) < 0.015, `${sal} celda ${k} = ${(p * 100).toFixed(2)}%`);
    }
  }
});
caso("mismo hash que brazoSeguimiento (solo cambia la sal)", () => {
  const conFu4 = (t) => (conSal("fu4:")(t) === 0 ? "F" : "R");
  for (const x of TELS.slice(0, 2000)) assert.strictEqual(conFu4(x), brazoSeguimiento(x));
  const conFu1 = (t) => (conSal("fu1:")(t) === 0 ? "S" : "T");
  for (const x of TELS.slice(0, 2000)) assert.strictEqual(conFu1(x), ACTIVA.brazoS1(x));
  assert.strictEqual(ACTIVA.SAL, "fu1:");
});

// ---------------------------------------------------------------- dormida

caso("dormida: un telefono T en caso ubicacion recibe el texto de siempre", async () => {
  const n = red({}, DORMIDA);
  const r = await leer(await DORMIDA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.strictEqual(r.prueba, "dormida");
  assert.strictEqual(r.brazo, "S");
  assert.strictEqual(r.sorteo, "T");
  assert.strictEqual(r.caso, "ubicacion");
  assert.strictEqual(r.sent, "text");
  assert.strictEqual(n.envios.length, 1);
  assert.strictEqual(n.envios[0].type, "text");
  assert.strictEqual(n.envios[0].text.body, renderKapso(HINT));
});
caso("dormida: no escribe el registro de la prueba", async () => {
  red({}, DORMIDA);
  const kv = kvFalso();
  await DORMIDA.handleRequest(req(UBICACION, { phone: TEL_T }), { ...env, KV: kv });
  assert.strictEqual(kv.m.size, 0);
});
caso("dormida: los telefonos de prueba (S1_TELEFONOS_PRUEBA) reciben T", async () => {
  const n = red({}, DORMIDA);
  const kv = kvFalso();
  const r = await leer(await DORMIDA.handleRequest(req(UBICACION, { phone: TEL_S }), { ...env, KV: kv, S1_TELEFONOS_PRUEBA: `999,${TEL_S}` }));
  assert.strictEqual(r.brazo, "T");
  assert.strictEqual(r.forzado, true);
  assert.strictEqual(r.sent, "buttons");
  assert.strictEqual(n.envios[0].type, "interactive");
  assert.strictEqual(kv.m.size, 0, "los de prueba no cuentan");
});

// ---------------------------------------------------------------- control

caso("texto de siempre = render del nodo fu-s1, byte a byte (varios hints)", () => {
  assert.strictEqual(PLANTILLA_S1, "{{vars.followup_hint}} — ¿te quedó alguna duda? Con gusto te la respondo.");
  for (const h of [HINT, "  con espacios. ", "tu consulta quedo pendiente — te ayudo a retomarla cuando quieras", "", "¿seguimos?"]) {
    assert.strictEqual(ACTIVA.armarTextoControl(h), renderKapso(h));
  }
  // Sin variable: lo que habria dejado init-hint.
  assert.strictEqual(ACTIVA.armarTextoControl(undefined), renderKapso(ACTIVA.HINT_INICIAL));
});
caso("brazo S en caso ubicacion: texto de siempre, caso registrado", async () => {
  const n = red({}, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_S }), env));
  assert.deepStrictEqual([r.brazo, r.caso, r.sent, r.prueba], ["S", "ubicacion", "text", "activa"]);
  assert.strictEqual(n.envios[0].text.body, renderKapso(HINT));
});
caso("brazo S en caso cantidad: hace la misma busqueda de precio y manda texto", async () => {
  const n = red({}, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_S }), env));
  assert.deepStrictEqual([r.brazo, r.caso, r.sent], ["S", "cantidad", "text"]);
  assert.strictEqual(n.lookups(), 1, "el caso se decide igual en los dos brazos");
  assert.strictEqual(n.envios[0].text.body, renderKapso(CANTIDAD.followup_hint));
});

// ---------------------------------------------------------------- casos T

caso("T ubicacion: pregunta abierta + Lima / Provincia", async () => {
  const n = red({}, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.brazo, r.caso, r.sent], ["T", "ubicacion", "buttons"]);
  const m = n.envios[0];
  assert.strictEqual(m.to, TEL_T);
  assert.strictEqual(m.type, "interactive");
  assert.strictEqual(m.interactive.type, "button");
  assert.strictEqual(m.interactive.body.text, "Quedaste viendo el *Black Seed Oil* 😊 ¿Te quedó alguna duda? Y para dejarlo listo: ¿estás en *Lima* o en *provincia*?");
  assert.deepStrictEqual(m.interactive.action.buttons.map((b) => b.reply.title), ["Lima", "Provincia"]);
  assert.strictEqual(n.lookups(), 0, "ubicacion no necesita precio");
});
caso("T cantidad: precio real del buscador, 1 unidad / 3x2", async () => {
  const n = red({}, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.brazo, r.caso, r.sent], ["T", "cantidad", "buttons"]);
  assert.deepStrictEqual(n.consultas[0], { product: HANDLE, message: HANDLE });
  const m = n.envios[0];
  assert.strictEqual(m.interactive.body.text, "Te quedó pendiente el *Black Seed Oil* 😊 ¿Te quedó alguna duda? Si quieres lo dejo listo: ¿1 unidad por *S/ 149* o el *3x2* (3 por *S/ 298*, pagas solo 2)?");
  assert.deepStrictEqual(m.interactive.action.buttons.map((b) => b.reply.title), ["1 unidad (S/ 149)", "3x2 (S/ 298)"]);
  assert.strictEqual(r.diag.precio.valor, 149);
});
caso("T cantidad: precio con decimales y calzado ('par')", async () => {
  const n = red({ lookup: producto({ product: { handle: HANDLE, title: "Zapatillas Ortopedicas", variants: [{ price: "89.9" }] } }) }, ACTIVA);
  await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env);
  assert.deepStrictEqual(n.envios[0].interactive.action.buttons.map((b) => b.reply.title), ["1 par (S/ 89.90)", "3x2 (S/ 179.80)"]);
  assert.ok(n.envios[0].interactive.body.text.includes("¿1 par por *S/ 89.90* o el *3x2* (3 por *S/ 179.80*"));
});
caso("T cantidad -> texto de siempre si el precio no es seguro", async () => {
  const variantes = [
    ["precio_variable", producto({ product: { handle: HANDLE, title: TITULO, variants: [{ price: "149" }, { price: "199" }] } })],
    ["agotado", producto({ outOfStock: true })],
    ["producto_ambiguo", producto({ reliableMatch: false })],
    ["producto_no_encontrado", { found: false }],
    ["producto_distinto", producto({ product: { handle: "otro-producto", title: "Otro", variants: [{ price: "50" }] } })],
    ["sin_precio", producto({ product: { handle: HANDLE, title: TITULO, variants: [{ price: "149", availableForSale: false }] } })],
    ["boton_largo", producto({ product: { handle: HANDLE, title: TITULO, variants: [{ price: "1299.90" }] } })],
  ];
  for (const [motivo, lookup] of variantes) {
    const n = red({ lookup }, ACTIVA);
    const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env));
    assert.deepStrictEqual([r.caso, r.sent, r.diag.motivo], ["otro", "text", motivo], motivo);
    assert.strictEqual(n.envios[0].text.body, renderKapso(CANTIDAD.followup_hint), motivo);
  }
});
caso("T cantidad: el buscador falla dos veces -> texto de siempre; una vez -> reintenta", async () => {
  let n = red({ lookupFalla: 2 }, ACTIVA);
  let r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.caso, r.sent, r.diag.precio.estado], ["otro", "text", "http_500"]);
  assert.strictEqual(n.lookups(), 2);
  n = red({ lookupFalla: 1 }, ACTIVA);
  r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.caso, r.sent], ["cantidad", "buttons"]);
});
caso("otros estados -> texto de siempre en T", async () => {
  const otros = [
    ["stage_esperando_voucher", { ...CANTIDAD, stage: "esperando_voucher" }],
    ["stage_esperando_confirmacion", { ...CANTIDAD, stage: "esperando_confirmacion" }],
    ["stage_esperando_variante", { ...UBICACION, stage: "esperando_variante" }],
    ["stage_explorando", { ...UBICACION, stage: "explorando" }],
    ["stage_datos_envio", { ...UBICACION, stage: "datos_envio" }], // dijo Lima y falta el distrito
    ["stage_vacio", { ...UBICACION, stage: "" }],
    ["cliente_con_direccion", { ...UBICACION, known_address: "Av. Arequipa 123, Miraflores" }],
    ["direccion_guardada", { ...CANTIDAD, order_address: "Jr. Union 456" }],
    ["cantidad_elegida", { ...CANTIDAD, order_promo: "3x2", order_quantity: 3 }],
    ["cantidad_elegida", { ...CANTIDAD, order_quantity: 1 }],
    ["zona_parcial", { ...UBICACION, order_province: "Lima" }],
    ["sin_producto", { ...UBICACION, last_product_handle: "", last_product_title: "" }],
    ["sin_producto", { ...CANTIDAD, last_product_handle: "" }],
  ];
  for (const [motivo, vars] of otros) {
    const n = red({}, ACTIVA);
    const r = await leer(await ACTIVA.handleRequest(req(vars, { phone: TEL_T }), env));
    assert.deepStrictEqual([r.brazo, r.caso, r.sent, r.diag.motivo], ["T", "otro", "text", motivo], motivo);
    assert.strictEqual(n.envios.length, 1, motivo);
    assert.strictEqual(n.envios[0].text.body, renderKapso(vars.followup_hint), motivo);
  }
});
caso("historial: ya contesto Lima/provincia o eligio cantidad -> otro", async () => {
  const msgs = (texto) => [
    { direction: "outbound", content: "Por cierto 😊, ¿te encuentras en *Lima* o en *provincia*?", timestamp: 1 },
    { direction: "inbound", interactive: { button_reply: { title: texto } }, timestamp: 2 },
  ];
  red({}, ACTIVA);
  let r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T, messages: msgs("Lima") }), env));
  assert.deepStrictEqual([r.caso, r.diag.motivo, r.diag.historial], ["otro", "ya_contesto_ubicacion", "payload"]);
  red({}, ACTIVA);
  r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T, messages: msgs("3x2 (S/ 298)") }), env));
  assert.deepStrictEqual([r.caso, r.diag.motivo], ["otro", "ya_contesto_cantidad"]);
  // Historial por la API (formato del proxy: kapso.direction).
  const n = red({ historial: [{ kapso: { direction: "inbound", content: "soy de provincia" }, timestamp: "5" }] }, ACTIVA);
  r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.caso, r.diag.historial], ["otro", "api"]);
  assert.ok(n.historiales[0].includes("conversation_id=conv-1"));
});
caso("historial: en ruta de agencia (el bot pidio la oficina Shalom) -> otro", async () => {
  red({}, ACTIVA);
  const messages = [{ direction: "outbound", content: "Para enviarlo por Shalom, ¿a qué agencia/oficina de Shalom deseas que enviemos tu pedido?", timestamp: 3 }];
  const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T, messages }), env));
  assert.deepStrictEqual([r.caso, r.diag.motivo], ["otro", "ruta_agencia"]);
});
caso("historial no disponible: decide solo con las variables", async () => {
  red({ historial: null }, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.caso, r.sent, r.diag.historial], ["ubicacion", "buttons", "no_disponible"]);
});
caso("hint que no sirve: se arma con el titulo del producto", () => {
  for (const h of ["", undefined, ACTIVA.HINT_INICIAL, "¿te animas con el Black Seed Oil?", "mira https://kenku.pe/x", "x".repeat(130)]) {
    assert.strictEqual(ACTIVA.cabeza(h, TITULO), "Quedaste viendo *Black Seed Oil*", String(h));
  }
  assert.strictEqual(ACTIVA.cabeza("quedaste viendo el *black seed oil*.", TITULO), "Quedaste viendo el *black seed oil*");
  assert.strictEqual(ACTIVA.cabeza("*nad+ resveratrol* pendiente", ""), "*Nad+ resveratrol* pendiente");
  assert.strictEqual(ACTIVA.cabeza("", ""), "");
});

// ---------------------------------------------------------------- respaldo

caso("WhatsApp rechaza los botones -> texto de siempre, sent text_fallback (cuenta en T)", async () => {
  const n = red({ respuestasEnvio: [{ status: 400, body: { error: { code: 131009, message: "Parameter value is not valid" } } }] }, ACTIVA);
  const kv = kvFalso();
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), { ...env, KV: kv }));
  assert.deepStrictEqual([r.ok, r.brazo, r.caso, r.sent], [true, "T", "ubicacion", "text_fallback"]);
  assert.strictEqual(n.envios.length, 2);
  assert.strictEqual(n.envios[0].type, "interactive");
  assert.strictEqual(n.envios[1].text.body, renderKapso(HINT));
  assert.ok(r.diag.botonesRechazados.startsWith("400"));
  assert.strictEqual(JSON.parse([...kv.m.values()][0]).sent, "text_fallback");
});
caso("429 en los botones: reintenta y si pasa salen los botones", async () => {
  const n = red({ respuestasEnvio: [{ status: 429 }, { status: 429 }] }, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.strictEqual(r.sent, "buttons");
  assert.strictEqual(n.envios.length, 3);
  assert.ok(n.envios.every((e) => e.type === "interactive"));
});
caso("429 persistente: tras 2 reintentos, texto de siempre", async () => {
  const n = red({ respuestasEnvio: [{ status: 429 }, { status: 429 }, { status: 429 }] }, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.strictEqual(r.sent, "text_fallback");
  assert.deepStrictEqual(n.envios.map((e) => e.type), ["interactive", "interactive", "interactive", "text"]);
});
caso("falla todo: ok:false sin lanzar (el flujo sigue a fu-w2)", async () => {
  red({ respuestasEnvio: [{ status: 500 }, { status: 500 }] }, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.ok, r.sent, r.reason], [false, false, "envio_fallido"]);
});
caso("error de red en el buscador: se reintenta y no rompe nada", async () => {
  const n = red({}, ACTIVA);
  const original = ACTIVA.deps.fetch;
  let primera = true;
  ACTIVA.deps.fetch = async (url, opts) => {
    if (primera && url.includes("/invoke")) { primera = false; throw new TypeError("boom"); }
    return original(url, opts);
  };
  const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env));
  assert.deepStrictEqual([r.ok, r.caso, r.sent], [true, "cantidad", "buttons"]);
  assert.strictEqual(n.envios.length, 1);
});
caso("error inesperado antes de enviar: sale igual el texto de siempre", async () => {
  const n = red({}, ACTIVA);
  const ahora = ACTIVA.deps.ahora;
  let llamadas = 0;
  ACTIVA.deps.ahora = () => { llamadas += 1; if (llamadas === 2) throw new Error("boom"); return ahora(); };
  try {
    const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), env));
    assert.deepStrictEqual([r.ok, r.sent, r.reason, r.brazo], [true, "text", "error", "S"]);
    assert.strictEqual(n.envios.length, 1);
    assert.strictEqual(n.envios[0].text.body, renderKapso(HINT));
  } finally {
    ACTIVA.deps.ahora = ahora;
  }
});
caso("sin contexto (sin api key): ok:false, no envia", async () => {
  const n = red({}, ACTIVA);
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), {}));
  assert.deepStrictEqual([r.ok, r.reason], [false, "sin_contexto"]);
  assert.strictEqual(n.envios.length, 0);
});

// ---------------------------------------------------------------- BSUID

caso("BSUID: va en `recipient` (nunca en `to`), brazo S, fuera de la cuenta", async () => {
  const n = red({}, ACTIVA);
  const kv = kvFalso();
  const r = await leer(await ACTIVA.handleRequest(req(UBICACION, { bsuid: "PE.948592654941065" }), { ...env, KV: kv }));
  assert.deepStrictEqual([r.brazo, r.sorteo, r.sent], ["S", null, "text"]);
  assert.strictEqual(n.envios[0].recipient, "PE.948592654941065");
  assert.ok(!("to" in n.envios[0]));
  assert.strictEqual(kv.m.size, 0);
});
// ---------------------------------------------------------------- limites

caso("limites de WhatsApp: titulos <= 20, max 3 botones, cuerpo <= 1024", async () => {
  for (const precio of [9.9, 49, 79, 89.9, 149, 149.9, 199.9, 499.9, 999.9]) {
    const n = red({ lookup: producto({ product: { handle: HANDLE, title: TITULO, variants: [{ price: String(precio) }] } }) }, ACTIVA);
    const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T }), env));
    assert.strictEqual(r.sent, "buttons", `precio ${precio}`);
    const b = n.envios[0].interactive.action.buttons;
    assert.ok(b.length <= 3);
    for (const x of b) assert.ok(x.reply.title.length <= 20, `${x.reply.title} (${x.reply.title.length})`);
  }
  const inter = ACTIVA.interactivo("x".repeat(2000), [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: `Boton numero ${i} demasiado largo` })));
  assert.strictEqual(inter.interactive.action.buttons.length, 3);
  assert.ok(inter.interactive.action.buttons.every((x) => x.reply.title.length <= 20));
  assert.strictEqual(inter.interactive.body.text.length, 1024);
  // Ubicacion con el hint mas largo permitido entra holgado.
  const largo = ACTIVA.cabeza("a".repeat(120), "");
  assert.ok(`${largo} 😊 ¿Te quedó alguna duda? Y para dejarlo listo: ¿estás en *Lima* o en *provincia*?`.length < 1024);
});

// ---------------------------------------------------------------- dryRun y lectura

caso("dryRun: devuelve texto y botones sin enviar ni registrar", async () => {
  const n = red({}, ACTIVA);
  const kv = kvFalso();
  const r = await leer(await ACTIVA.handleRequest(req(CANTIDAD, { phone: TEL_T, input: { dryRun: true } }), { ...env, KV: kv }));
  assert.deepStrictEqual([r.ok, r.sent, r.dryRun, r.brazo, r.caso], [true, false, true, "T", "cantidad"]);
  assert.strictEqual(r.mensaje.tipo, "buttons");
  assert.deepStrictEqual(r.mensaje.botones.map((b) => b.title), ["1 unidad (S/ 149)", "3x2 (S/ 298)"]);
  assert.strictEqual(r.texto, renderKapso(CANTIDAD.followup_hint));
  assert.strictEqual(n.envios.length, 0);
  assert.strictEqual(kv.m.size, 0);
});
caso("dryRun dormida con simularBrazo T: muestra el tratamiento", async () => {
  red({}, DORMIDA);
  const r = await leer(await DORMIDA.handleRequest(req(UBICACION, { phone: TEL_S, input: { dryRun: true, simularBrazo: "T" } }), env));
  assert.deepStrictEqual([r.brazo, r.prueba, r.mensaje.tipo], ["T", "dormida", "buttons"]);
  // Sin dryRun simularBrazo no hace nada.
  const n = red({}, DORMIDA);
  const r2 = await leer(await DORMIDA.handleRequest(req(UBICACION, { phone: TEL_S, input: { simularBrazo: "T" } }), env));
  assert.deepStrictEqual([r2.brazo, r2.sent, n.envios[0].type], ["S", "text", "text"]);
});
caso("registro KV s1x_phone: solo el primer s1 del telefono, con brazo y caso", async () => {
  const kv = kvFalso();
  red({}, ACTIVA);
  await ACTIVA.handleRequest(req(UBICACION, { phone: TEL_T }), { ...env, KV: kv });
  red({}, ACTIVA);
  await ACTIVA.handleRequest(req({ ...UBICACION, stage: "esperando_voucher" }, { phone: TEL_T }), { ...env, KV: kv });
  const key = `s1x_phone:${TEL_T.slice(-9)}`;
  assert.deepStrictEqual([...kv.m.keys()], [key]);
  const v = JSON.parse(kv.m.get(key));
  assert.deepStrictEqual([v.brazo, v.caso, v.sent, v.stage, v.conversationId], ["T", "ubicacion", "buttons", "producto_mostrado", "conv-1"]);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(v.day));
});

(async () => {
  let fallos = 0;
  for (const [n, f] of casos) {
    try { await f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length} ok`);
  process.exit(fallos ? 1 : 0);
})();
