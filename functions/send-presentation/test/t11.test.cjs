#!/usr/bin/env node
// Test de la prueba T11 (brazo K, "ficha compacta de 2 mensajes"; PRUEBAS_AB_MIREVA.md).
// Correr: node functions/send-presentation/test/t11.test.cjs
//
// Protege:
//  - el reparto: dormido -> todos D; activo -> leads de anuncio con telefono
//    50/50 D/K, ortogonal a las sales "present:" (A/D) y "fu4:" (seguimientos);
//    sin anuncio o sin telefono -> D; las dos copias (customer-lookup y
//    create-shopify-order) iguales; el brazo se recalcula desde el telefono;
//  - la secuencia K: 2 mensajes, limites de Meta, las 3 preguntas finales y los
//    respaldos (sin foto, foto rechazada, botones rechazados);
//  - que D no cambie ni un byte (contra d-golden.json, generado con el codigo
//    anterior a T11);
//  - que campaign-report cuente K contra la D DE ANUNCIO y por telefono.
const path = require("path");
const fs = require("fs");
const assert = require("assert");
const raiz = path.join(__dirname, "..", "..");
require(path.join(raiz, "send-presentation", "index.js"));
require(path.join(raiz, "customer-lookup", "index.js"));
require(path.join(raiz, "create-shopify-order", "index.js"));
require(path.join(raiz, "check-coverage", "index.js"));
require(path.join(raiz, "campaign-report", "index.js"));
const P = globalThis.__kenkuSendPresentation;
const CL = globalThis.__kenkuCustomerLookup;
const CO = globalThis.__kenkuCreateShopifyOrder;
const { brazoSeguimiento } = globalThis.__kenkuCheckCoverage;
const CR = globalThis.__kenkuCampaignReport;
const E = require("./d-escenarios.cjs");

function fnv1a(t) { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mix32(v) { let h = v >>> 0; h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return h >>> 0; }
const brazoPresent = (d) => (mix32(fnv1a(`present:${d}`)) % 2 === 0 ? "A" : "D");

// 10.000 celulares peruanos sinteticos, deterministas (forma 51 + 9 digitos).
const TELEFONOS = Array.from({ length: 10000 }, (_, i) => `519${String((i * 7919 + 12345) % 100000000).padStart(8, "0")}`);
const ACTIVA = { anuncio: true, activa: true };

const casos = [];
const caso = (n, f) => casos.push([n, f]);
const pct = (x) => `${(x * 100).toFixed(2)}%`;

// ===========================================================================
// Reparto
// ===========================================================================

caso("dormida: el interruptor esta apagado y es el mismo en las dos copias", () => {
  assert.strictEqual(CL.PRUEBA_K_ACTIVA, CO.PRUEBA_K_ACTIVA, "customer-lookup y create-shopify-order tienen que tener el mismo interruptor");
  // Si la activaste a proposito para arrancar T11, actualiza esta linea.
  assert.strictEqual(CL.PRUEBA_K_ACTIVA, false, "T11 se entrega dormida");
});
caso("dormida: todos D, con o sin anuncio, con o sin telefono", () => {
  for (const t of [...TELEFONOS, "", null, undefined]) {
    for (const anuncio of [true, false]) {
      assert.strictEqual(CL.abVariant(t, { anuncio }), "D");
      assert.strictEqual(CO.abVariant(t, { anuncio }), "D");
    }
    assert.strictEqual(CL.abVariant(t), "D");
  }
  // Lead de anuncio nuevo (sin variante en las vars): sigue siendo D.
  assert.strictEqual(CL.varianteDelLead({ execution_context: { vars: {} } }, TELEFONOS[0], { anuncio: true }), "D");
  assert.strictEqual(CO.varianteAsignada({ execution_context: { vars: { ad_referral_ad_id: "1" } } }, TELEFONOS[0]), "D");
});
caso("activa: anuncio + telefono -> ~50/50 D/K sobre 10.000 telefonos", () => {
  const k = TELEFONOS.filter((t) => CL.abVariant(t, ACTIVA) === "K").length / TELEFONOS.length;
  assert.ok(Math.abs(k - 0.5) < 0.015, `K = ${pct(k)}`);
  assert.ok(TELEFONOS.every((t) => ["D", "K"].includes(CL.abVariant(t, ACTIVA))));
});
caso("activa: sin anuncio o sin telefono -> D", () => {
  for (const t of TELEFONOS) assert.strictEqual(CL.abVariant(t, { anuncio: false, activa: true }), "D");
  for (const t of ["", null, undefined, "PE.948592654941065".replace(/\d/g, "")]) {
    assert.strictEqual(CL.abVariant(t, ACTIVA), "D"); assert.strictEqual(CO.abVariant(t, ACTIVA), "D");
  }
});
caso("activa: ortogonal a present: (A/D) y a fu4: (seguimientos): las 4 celdas ~25%", () => {
  for (const [nombre, otro] of [["present:", brazoPresent], ["fu4:", brazoSeguimiento]]) {
    const celdas = {};
    for (const t of TELEFONOS) {
      const c = `${CL.abVariant(t, ACTIVA)}x${otro(t)}`;
      celdas[c] = (celdas[c] || 0) + 1;
    }
    assert.strictEqual(Object.keys(celdas).length, 4, `${nombre}: ${JSON.stringify(celdas)}`);
    for (const [c, n] of Object.entries(celdas)) {
      assert.ok(Math.abs(n / TELEFONOS.length - 0.25) < 0.015, `${nombre} celda ${c} = ${pct(n / TELEFONOS.length)}`);
    }
  }
});
caso("activa: ortogonal tambien al reparto viejo A/C (FNV-1a crudo): exige el mix32", () => {
  // El bit bajo de FNV-1a crudo es la paridad de los XOR: `fnv1a("ficha:"+d) % 2`
  // sin mix32 quedaria pegado a `fnv1a(d) % 2` (2 celdas de 50%). present: y fu4:
  // ya pasan por mix32, asi que contra ellas no se veria; contra el A/C viejo si.
  const viejaAC = (t) => (fnv1a(t) % 2 === 0 ? "A" : "C");
  const crudoPegado = TELEFONOS.filter((t) => fnv1a(`ficha:${t}`) % 2 === fnv1a(t) % 2).length;
  assert.ok(crudoPegado === 0 || crudoPegado === TELEFONOS.length, "control: sin mix32 la sal no alcanza");
  const celdas = {};
  for (const t of TELEFONOS) { const c = `${CL.abVariant(t, ACTIVA)}x${viejaAC(t)}`; celdas[c] = (celdas[c] || 0) + 1; }
  assert.strictEqual(Object.keys(celdas).length, 4, JSON.stringify(celdas));
  for (const [c, n] of Object.entries(celdas)) assert.ok(Math.abs(n / TELEFONOS.length - 0.25) < 0.015, `celda ${c} = ${pct(n / TELEFONOS.length)}`);
});
caso("las dos copias reparten igual (create-shopify-order recalcula con el celular del cierre)", () => {
  for (const t of TELEFONOS) {
    assert.strictEqual(CL.abVariant(t, ACTIVA), CO.abVariant(t, ACTIVA), t);
    assert.strictEqual(CL.brazoFicha(t), CO.brazoFicha(t), t);
  }
  // El mismo celular escrito de cualquier forma cae en el mismo brazo.
  const formas = ["+51 965 391 481", "965391481", "51965391481", "51-965-391-481"];
  for (const f of formas) {
    assert.strictEqual(CL.abVariant(f, ACTIVA), CL.abVariant(formas[0], ACTIVA), f);
    assert.strictEqual(CO.abVariant(f, ACTIVA), CL.abVariant(formas[0], ACTIVA), f);
  }
});
caso("el brazo se recalcula desde el telefono (lectura offline)", () => {
  for (const t of TELEFONOS) {
    const v = CL.abVariant(t, ACTIVA);
    assert.strictEqual(CL.brazoFicha(t), v);
    assert.strictEqual(CL.brazoFicha(t.slice(2)), v, "con los 9 digitos tambien");
    // Formula documentada para el script de lectura: sal "ficha:" sobre 51XXXXXXXXX.
    assert.strictEqual(mix32(fnv1a(`ficha:${t}`)) % 2 === 0 ? "D" : "K", v);
  }
});
caso("la variante que RECIBIO el lead manda: K sigue K aunque se apague, D sigue D", () => {
  const telK = TELEFONOS.find((t) => CL.brazoFicha(t) === "K");
  const telD = TELEFONOS.find((t) => CL.brazoFicha(t) === "D");
  const conVar = (v) => ({ execution_context: { vars: { ab_variant: v } } });
  assert.strictEqual(CL.varianteDelLead(conVar("K"), telD, { anuncio: true }), "K");
  assert.strictEqual(CL.varianteDelLead(conVar("D"), telK, ACTIVA), "D", "entro como D antes de activar: no cambia de brazo");
  assert.strictEqual(CO.varianteAsignada(conVar("K"), telD), "K");
  assert.strictEqual(CO.varianteAsignada(conVar("D"), telK), "D");
  // Nuevo (sin variante): se asigna por hash.
  assert.strictEqual(CL.varianteDelLead(conVar(""), telK, ACTIVA), "K");
});
caso("'de anuncio' es el mismo criterio en customer-lookup y en send-presentation", () => {
  const refs = [
    null,
    { entryType: "consulta" },
    { entryType: "otro", body: "solo body" },
    { adId: "120253987459770120", entryType: "otro" },
    { headline: "Black Seed Oil", entryType: "otro" },
    { headline: "   ", entryType: "otro" },
    { sourceUrl: "https://fb.me/x", entryType: "otro" },
    { sourceType: "ad", mediaType: "image", entryType: "otro" },
  ];
  for (const ref of refs) {
    const vars = CL.buildFlowVars(null, null, ref, "+51965391481", {}, { ab: "D", promo: "P1" });
    assert.strictEqual(CL.esLeadDeAnuncio(ref), !P.conversacionPaga(vars), JSON.stringify(ref));
  }
});
caso("registro del lead: canal en la clave, y K deja telefono (ventas de asesora y conteo por telefono)", async () => {
  const store = new Map();
  const KV = { async get(k) { return store.get(k) || null; }, async put(k, v) { store.set(k, v); } };
  await CL.logAbLead({ KV }, "conv-k", "K", "otro", "P1", "+51 965 391 481", "anuncio");
  await CL.logAbLead({ KV }, "conv-d", "D", "otro", "P1", "51911222333", "organico");
  const claves = [...store.keys()];
  assert.ok(claves.some((k) => /^abx_lead:\d{4}-\d\d-\d\d:K:otro:P1:anuncio:conv-k$/.test(k)), claves.join(" "));
  assert.ok(claves.some((k) => /^abx_lead:\d{4}-\d\d-\d\d:D:otro:P1:organico:conv-d$/.test(k)), claves.join(" "));
  assert.strictEqual(JSON.parse(store.get("abx_phone:965391481")).variant, "K");
  assert.strictEqual(JSON.parse(store.get("abx_phone:965391481")).canal, "anuncio");
  assert.ok(claves.some((k) => /^abx_tel:\d{4}-\d\d-\d\d:K:anuncio:965391481$/.test(k)));
  // Conocido que vuelve por anuncio con la misma variante: marca el canal sin mover el primer contacto.
  const at = JSON.parse(store.get("abx_phone:911222333")).at;
  await CL.logAbLead({ KV }, "conv-d2", "D", "otro", "P1", "51911222333", "anuncio");
  assert.strictEqual(JSON.parse(store.get("abx_phone:911222333")).canal, "anuncio");
  assert.strictEqual(JSON.parse(store.get("abx_phone:911222333")).at, at);
  assert.ok([...store.keys()].some((k) => /^abx_tel:.*:D:anuncio:911222333$/.test(k)), "el conocido D cuenta en D/anuncio igual que contaria en K");
});

// ===========================================================================
// Secuencia K
// ===========================================================================

const SALUDO = "¡Hola! Soy *Akemi* de Kenku 😊";
const BENEFICIO = "Refuerza tus defensas y tu energía desde adentro, de forma natural 🌿";
const CABEZA_BSO = "*Black Seed Oil* queda en *S/ 149* por unidad con *envío gratis* 📦, en la mayoría de zonas *pagas al recibir* y con *garantía de 30 días* 🛡️ 😊.";
const ESCALERA_BSO = "🔥 Promociones disponibles:\n• 1 unidad: *S/ 149*\n• 3x2: Lleva 3 unidades por *S/ 298* (pagas solo 2)\n• 5x3: Lleva 5 unidades por *S/ 447* (pagas solo 3)";
const LIMA = "Por cierto 😊, ¿te encuentras en *Lima* o en *provincia*?";
const K = (over = {}) => ({ ...over, vars: { ...(over.vars || {}) } });
const correrK = (e = {}) => E.correrEscenario(P, { n: "k", ...e }, "K");
const titulos = (env) => env.interactive.action.buttons.map((b) => b.reply.title);
function limites(r) {
  for (const env of r.enviados) {
    if (env.image?.caption) assert.ok(env.image.caption.length <= 1024, `caption ${env.image.caption.length}`);
    if (env.interactive) {
      assert.ok(env.interactive.body.text.length <= 1024, `body ${env.interactive.body.text.length}`);
      assert.ok(env.interactive.action.buttons.length <= 3);
      for (const t of titulos(env)) assert.ok(t.length <= 20, `boton "${t}" ${t.length}`);
    }
  }
}

caso("K con anuncio y media completa: EXACTAMENTE 2 mensajes (foto + botones), sin video ni antes/despues", async () => {
  const r = await correrK();
  assert.strictEqual(r.respuesta.ok, true);
  assert.deepStrictEqual(r.respuesta.enviados, ["ficha", "pregunta_final"]);
  assert.deepStrictEqual(r.enviados.map((b) => b.type), ["image", "interactive"]);
  assert.ok(!r.enviados.some((b) => b.type === "video"));
  assert.ok(!JSON.stringify(r.enviados).includes("https://cdn/ad.jpg"), "sin antes/despues");
  assert.strictEqual(r.enviados[0].image.link, "https://cdn/principal.jpg");
  assert.deepStrictEqual(r.enviados[1].interactive.header, { type: "image", image: { link: "https://cdn/t.jpg" } });
  assert.strictEqual(r.respuesta.variante, "K");
  limites(r);
});
caso("K: pie y cuerpo exactos del ejemplo Black Seed Oil (ficha T11)", async () => {
  const r = await correrK();
  assert.strictEqual(r.enviados[0].image.caption, `${SALUDO}\n\n${BENEFICIO}\n\n${CABEZA_BSO}`);
  assert.ok(!r.enviados[0].image.caption.includes("Promociones"), "la escalera NO va en el pie");
  assert.strictEqual(r.enviados[1].interactive.body.text, `${ESCALERA_BSO}\n\n${LIMA}`);
  assert.deepStrictEqual(titulos(r.enviados[1]), ["Lima", "Provincia"]);
});
caso("K: el orden de D se conserva (saludo -> beneficio -> precio -> testimonio -> promos -> pregunta)", async () => {
  const r = await correrK();
  const pie = r.enviados[0].image.caption;
  assert.ok(pie.indexOf(SALUDO) < pie.indexOf(BENEFICIO) && pie.indexOf(BENEFICIO) < pie.indexOf("queda en"));
  const cuerpo = r.enviados[1].interactive.body.text;
  assert.ok(cuerpo.indexOf("Promociones") < cuerpo.indexOf("¿te encuentras"));
});
caso("K con direccion guardada: 'como la vez pasada' con Si, la misma / Cambiar direccion", async () => {
  const r = await correrK(K({ vars: { known_address: "Av. Arequipa 123, Lince" } }));
  const i = r.enviados[1].interactive;
  assert.strictEqual(i.body.text, `${ESCALERA_BSO}\n\n¿Te lo enviamos a Av. Arequipa 123, Lince, como la vez pasada? 😊`);
  assert.deepStrictEqual(titulos(r.enviados[1]), ["Si, la misma", "Cambiar direccion"]);
  limites(r);
});
caso("K con zona del boton web (contraentrega): linea de envio + '¿Qué promoción prefieres?' con 3 botones", async () => {
  const r = await correrK({ input: { ubicacion: "Lima / Lima / Ate" }, cobertura: E.COD });
  const pie = r.enviados[0].image.caption;
  assert.ok(pie.endsWith("*Black Seed Oil* queda en *S/ 149* por unidad con *envío gratis* 📦 y *garantía de 30 días* 🛡️ 😊."), pie);
  assert.ok(!pie.includes("mayoría de zonas"));
  const i = r.enviados[1].interactive;
  assert.strictEqual(i.body.text, `${ESCALERA_BSO}\n\n🏠 A *Ate* te lo llevamos a tu puerta y *pagas al recibir*.\n\n¿Qué promoción prefieres? 😊`);
  assert.deepStrictEqual(titulos(r.enviados[1]), ["1 unidad (S/ 149)", "3x2 (S/ 298)", "5x3 (S/ 447)"]);
  assert.ok(/NO preguntes Lima\/provincia/.test(r.respuesta.message));
  limites(r);
});
caso("K con zona por agencia: explica Shalom y el adelanto en los botones, sin prometer pago al recibir", async () => {
  const r = await correrK({ input: { ubicacion: E.WEB }, cobertura: E.SHALOM });
  const todo = r.enviados[0].image.caption + r.enviados[1].interactive.body.text;
  assert.ok(todo.includes("📦 A *Huamachuco* lo enviamos por agencia *Shalom*: separas tu pedido con un adelanto de *S/ 30* (se descuenta del total) y el saldo lo pagas al recoger."));
  assert.ok(!todo.includes("pagas al recibir"));
  assert.ok(r.enviados[1].interactive.body.text.endsWith("¿Qué promoción prefieres? 😊"));
});
caso("K con zona y check-coverage caido: pide la promo nombrando el distrito", async () => {
  const r = await correrK({ input: { ubicacion: E.WEB }, cobertura: null });
  assert.ok(r.enviados[1].interactive.body.text.endsWith("¿Qué promoción prefieres para tu envío a *Huamachuco*? 😊"));
  assert.ok(r.enviados[0].image.caption.includes("en la mayoría de zonas *pagas al recibir*"));
});
caso("K sin testimonio: botones sin cabecera", async () => {
  const r = await correrK({ media: E.MEDIA_SIN_TESTIMONIO });
  assert.deepStrictEqual(r.enviados.map((b) => b.type), ["image", "interactive"]);
  assert.ok(!("header" in r.enviados[1].interactive));
});
caso("K sin foto principal: saludo + beneficio + precio en UN texto, y los botones", async () => {
  for (const media of [null, { ok: true, found: true, media: [{ type: "image", role: "testimonio", url: "https://cdn/t.jpg" }] }]) {
    const r = await correrK({ media });
    assert.deepStrictEqual(r.enviados.map((b) => b.type), ["text", "interactive"]);
    assert.strictEqual(r.enviados[0].text.body, `${SALUDO}\n\n${BENEFICIO}\n\n${CABEZA_BSO}`);
    assert.strictEqual(r.respuesta.ok, true);
  }
});
caso("K con ancla de precio y producto en 'par': limites de Meta respetados", async () => {
  const r1 = await correrK({ lookup: E.producto({ variants: [{ availableForSale: true, price: 149, compareAtPrice: 200 }] }) });
  assert.ok(r1.enviados[0].image.caption.includes("(antes *S/ 200*)"));
  limites(r1);
  const r2 = await correrK({ lookup: E.producto({ title: "Zapatillas Ortopédicas – x", variants: [{ availableForSale: true, price: 134.1 }] }), input: { ubicacion: "Lima / Lima / Ate", nombre: "" }, cobertura: E.COD });
  assert.deepStrictEqual(titulos(r2.enviados[1]), ["1 par (S/ 134.10)", "3x2 (S/ 268.20)", "5x3 (S/ 402.30)"]);
  limites(r2);
});
caso("K: con los topes del prompt (saludo 350, beneficio 400) el pie entra entero en 1.024", async () => {
  const saludo = `¡Hola! ${"a".repeat(343)}`;
  const beneficio = "b".repeat(400);
  const { cabeza } = P.partesPrecio({ nombre: "SUPER HUMAN Ethiopian Black Seed Oil", precio: 149, antes: 200, unidad: P.unidadDe("x") });
  const pie = P.pieFicha(saludo, beneficio, cabeza);
  assert.strictEqual(pie, `${saludo}\n\n${beneficio}\n\n${cabeza}`);
  assert.ok(pie.length <= 1024, `${pie.length}`);
});
caso("K: si el modelo se pasa, se recorta el saludo/beneficio y NUNCA el precio", async () => {
  const r = await correrK({ input: { beneficio: `${"Mejora tu energía 🌿 ".repeat(80)}` } });
  const pie = r.enviados[0].image.caption;
  assert.ok(pie.length <= 1024, `${pie.length}`);
  assert.ok(pie.endsWith(`…\n\n${CABEZA_BSO}`), pie.slice(-200));
  assert.ok(pie.startsWith(SALUDO));
  assert.ok(!/[\uD800-\uDBFF]…/.test(pie), "no parte un emoji a la mitad");
});
caso("K: Meta rechaza la foto -> el mismo texto como mensaje de texto, y siguen los botones", async () => {
  const r = await correrK({ falla: 0 });
  assert.strictEqual(r.respuesta.ok, true);
  assert.deepStrictEqual(r.enviados.map((b) => b.type), ["text", "interactive"]);
  assert.strictEqual(r.enviados[0].text.body, `${SALUDO}\n\n${BENEFICIO}\n\n${CABEZA_BSO}`);
  assert.deepStrictEqual(r.respuesta.respaldoTexto, ["ficha"]);
});
caso("K: foto Y texto rechazados -> no salio nada, presenta a mano (sin duplicar)", async () => {
  const r = await correrK({ falla: [0, 1] });
  assert.strictEqual(r.respuesta.ok, false); assert.strictEqual(r.respuesta.reason, "envio_fallido");
  assert.strictEqual(r.enviados.length, 0);
  assert.deepStrictEqual(r.kvPuts, ["abx_present:2026-11-17:fallo_inicial:K:c1"]);
});
caso("K: botones rechazados con cabecera, sin cabecera y como texto -> corta y dice que falta", async () => {
  const r = await correrK({ falla: [1, 2, 3] });
  assert.strictEqual(r.respuesta.ok, false); assert.strictEqual(r.respuesta.reason, "envio_parcial");
  assert.deepStrictEqual(r.respuesta.enviados, ["ficha"]);
  assert.strictEqual(r.respuesta.pendientes[0].paso, "pregunta_final");
  assert.strictEqual(r.respuesta.pendientes[0].bodyText, `${ESCALERA_BSO}\n\n${LIMA}`);
});
caso("K: la foto de la ficha cuenta como critica (lleva el precio) para el tope de tiempo", async () => {
  const pasos = P.armarSecuencia({ variante: "K", compacta: false, saludo: SALUDO, beneficio: BENEFICIO, nombre: "Black Seed Oil", media: E.MEDIA_COMPLETA.media, precio: 149, antes: null, unidad: P.unidadDe("x"), knownAddress: "" });
  assert.strictEqual(pasos[0].critico, true);
  assert.deepStrictEqual(pasos[0].respaldo, { tipo: "text", body: { body: pasos[0].body.caption } });
  const r = await correrK({ latenciaMs: 4000 });
  assert.strictEqual(r.respuesta.ok, true);
  assert.deepStrictEqual(r.respuesta.omitidos, [], "con Meta lenta la K no se salta nada");
});
caso("K: Meta rechaza la cabecera -> botones sin testimonio", async () => {
  const r = await correrK({ falla: 1 });
  assert.strictEqual(r.respuesta.ok, true);
  assert.ok(!("header" in r.enviados[1].interactive));
  assert.strictEqual(r.enviados[1].interactive.body.text, `${ESCALERA_BSO}\n\n${LIMA}`);
});
caso("K: Meta rechaza los botones -> la pregunta sale como texto", async () => {
  // Sin testimonio hay un solo intento de botones (intento 1); con respaldo de texto.
  const r = await correrK({ media: E.MEDIA_SIN_TESTIMONIO, falla: 1 });
  assert.strictEqual(r.respuesta.ok, true);
  assert.deepStrictEqual(r.enviados.map((b) => b.type), ["image", "text"]);
  assert.strictEqual(r.enviados[1].text.body, `${ESCALERA_BSO}\n\n${LIMA}`);
  assert.deepStrictEqual(r.respuesta.respaldoTexto, ["pregunta_final"]);
});
caso("K: una sola pausa entre los 2 mensajes, de 1-1,5 s", async () => {
  const r = await correrK();
  assert.strictEqual(r.pausas.length, 1);
  assert.ok(r.pausas[0] >= 1000 && r.pausas[0] <= 1500, `${r.pausas[0]}`);
});
caso("K: lead solo con BSUID va en `recipient`", async () => {
  const r = await correrK({ wa: E.SOLO_BSUID });
  assert.strictEqual(r.enviados.length, 2);
  assert.ok(r.enviados.every((b) => b.recipient === "PE.948592654941065" && !("to" in b)));
});
caso("K: adopcion registrada con la variante (abx_present:<dia>:<resultado>:K:<conv>)", async () => {
  assert.deepStrictEqual((await correrK()).kvPuts, ["abx_present:2026-11-17:completa:K:c1"]);
  assert.deepStrictEqual((await correrK({ lookupMs: 20000 })).kvPuts, ["abx_present:2026-11-17:sin_tiempo:K:c1"]);
});
caso("K: el mensaje al agente avisa que NO lleva video ni antes/despues", async () => {
  const r = await correrK();
  assert.ok(/NO lleva video ni antes\/despues/.test(r.respuesta.message), r.respuesta.message);
  assert.ok(/stage="producto_mostrado"/.test(r.respuesta.message));
  const w = await correrK({ waitUntil: true });
  assert.ok(/NO lleva video/.test(w.respuesta.message) && w.segundoPlano.ok);
});
caso("K: agotado / ambiguo / precio variable se niegan igual que en D", async () => {
  for (const [n, reason] of [["anuncio_agotado", "agotado"], ["anuncio_ambiguo", "producto_ambiguo"], ["anuncio_precio_variable", "precio_variable"]]) {
    const e = E.ESCENARIOS.find((x) => x.n === n);
    const r = await E.correrEscenario(P, e, "K");
    assert.strictEqual(r.respuesta.reason, reason); assert.strictEqual(r.enviados.length, 0);
  }
});
caso("A, N y vacia siguen negadas (la K no abre la puerta a otras)", async () => {
  for (const v of ["A", "N", "", "C"]) {
    const r = await E.correrEscenario(P, { n: "x" }, v);
    assert.strictEqual(r.respuesta.reason, "variante_control", v); assert.strictEqual(r.enviados.length, 0);
  }
});
caso("K SIN anuncio: la compacta de siempre, identica a la de D", async () => {
  for (const e of E.ESCENARIOS.filter((x) => x.sinAnuncio)) {
    const d = await E.correrEscenario(P, e, "D");
    const k = await E.correrEscenario(P, e, "K");
    assert.deepStrictEqual(k.enviados, d.enviados, e.n);
    assert.deepStrictEqual(k.respuesta.enviados, d.respuesta.enviados, e.n);
  }
});

// ===========================================================================
// D no cambia
// ===========================================================================

caso("D no cambia byte a byte (envios, respuestas, pausas y claves KV de 29 escenarios)", async () => {
  const golden = fs.readFileSync(path.join(__dirname, "d-golden.json"), "utf8");
  const ahora = `${JSON.stringify(await E.correrTodos(P, "D"), null, 1)}\n`;
  if (ahora !== golden) {
    const g = JSON.parse(golden); const a = JSON.parse(ahora);
    const distintos = Object.keys(g).filter((k) => JSON.stringify(g[k]) !== JSON.stringify(a[k]));
    assert.fail(`D cambio en: ${distintos.join(", ") || "(formato)"}`);
  }
  assert.strictEqual(Object.keys(JSON.parse(golden)).length, E.ESCENARIOS.length);
});
caso("D: armarSecuencia sin variante (llamada vieja) es D", async () => {
  const base = { compacta: false, saludo: SALUDO, beneficio: BENEFICIO, nombre: "X", media: E.MEDIA_COMPLETA.media, precio: 149, antes: null, unidad: P.unidadDe("x"), knownAddress: "" };
  assert.deepStrictEqual(P.armarSecuencia(base), P.armarSecuencia({ ...base, variante: "D" }));
  assert.strictEqual(P.armarSecuencia(base).length, 8);
});

// ===========================================================================
// Reporte
// ===========================================================================

caso("reporte: K contra la D DE ANUNCIO, por telefono, y adopcion por variante", async () => {
  const dia = "2026-11-18";
  const keys = []; const valores = new Map();
  const lead = (v, canal, i) => keys.push(`abx_lead:${dia}:${v}:otro:P1:${canal}:c-${v}-${canal}-${i}`);
  for (let i = 0; i < 1000; i += 1) { lead("D", "anuncio", i); lead("K", "anuncio", i); }
  for (let i = 0; i < 500; i += 1) lead("D", "organico", i);
  for (let i = 0; i < 30; i += 1) keys.push(`abx_lead:${dia}:D:otro:P1:viejo-${i}`); // clave anterior a T11 (sin canal)
  const pedido = (v, conv, n, total) => { const k = `abx_order:${dia}:${v}:${conv}:#KP${n}`; keys.push(k); valores.set(k, JSON.stringify({ total, units: 1 })); };
  for (let i = 0; i < 100; i += 1) pedido("D", `c-D-anuncio-${i}`, `DA${i}`, 149);
  for (let i = 0; i < 120; i += 1) pedido("K", `c-K-anuncio-${i}`, `KA${i}`, 149);
  for (let i = 0; i < 120; i += 1) pedido("D", `c-D-organico-${i}`, `DO${i}`, 149); // organicos compran mas
  // Telefonos: un K que abrio 2 conversaciones cuenta una vez.
  keys.push(`abx_tel:${dia}:K:anuncio:965000001`, `abx_tel:${dia}:K:anuncio:965000002`, `abx_tel:${dia}:D:anuncio:965000003`, `abx_tel:2026-11-19:K:anuncio:965000001`);
  keys.push(`abx_present:${dia}:completa:c1`, `abx_present:${dia}:completa:K:c2`, `abx_present:${dia}:parcial:K:c3`);
  const KV = {
    async list({ prefix }) { return { keys: keys.filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true }; },
    async get(k) { return valores.get(k) || null; },
  };
  const req = { method: "GET", url: `https://x/?key=K&format=json&only=ab&since=${dia}&until=2026-11-19`, headers: { get: () => null } };
  const r = await (await CR.handleRequest(req, { dASHBOARDACCESSKEY: "K", KV })).json();
  assert.strictEqual(r.ab.K.leads, 1000); assert.strictEqual(r.ab.K.orders, 120);
  assert.strictEqual(r.ab.D.leads, 1530, "la D entera incluye organicos y claves viejas");
  assert.strictEqual(r.ab.byCanal.D.anuncio.leads, 1000);
  assert.strictEqual(r.ab.byCanal.D.organico.orders, 120);
  assert.strictEqual(r.ab.byCanal.D["?"].leads, 30);
  const k = r.pruebaK;
  assert.strictEqual(k.D_anuncio.leads, 1000); assert.strictEqual(k.D_anuncio.orders, 100);
  assert.strictEqual(k.liftKvsD, 0.2, "12% vs 10%, NO contra la D entera");
  assert.ok(typeof k.zCorregida === "number" && typeof k.total.zCorregida === "number");
  assert.deepStrictEqual(k.revenuePerLead, { D: 14.9, K: 17.88 });
  assert.deepStrictEqual(k.telefonos, { D: 1, K: 2 });
  assert.deepStrictEqual(k.presentaciones.K, { completa: 1, completa_sin_media: 0, parcial: 1, fallo_inicial: 0, sin_tiempo: 0 });
  assert.strictEqual(k.presentaciones.D.completa, 1);
  // El total historico no cambia de forma: suma D y K.
  assert.deepStrictEqual(r.pruebaD.presentacionesPorFuncion, { completa: 2, completa_sin_media: 0, parcial: 1, fallo_inicial: 0, sin_tiempo: 0 });
});
caso("reporte: sin leads K en el rango, pruebaK es null (prueba dormida)", async () => {
  const dia = "2026-11-10";
  const keys = [`abx_lead:${dia}:D:otro:P1:anuncio:c1`];
  const KV = { async list({ prefix }) { return { keys: keys.filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }, async get() { return null; } };
  const req = { method: "GET", url: `https://x/?key=K&format=json&only=ab&since=${dia}&until=${dia}`, headers: { get: () => null } };
  const r = await (await CR.handleRequest(req, { dASHBOARDACCESSKEY: "K", KV })).json();
  assert.strictEqual(r.pruebaK, null);
  assert.strictEqual(r.ab.K.leads, 0);
});
caso("reporte: venta de asesora de un lead K cuenta en K/anuncio", async () => {
  const dia = "2026-11-18";
  const keys = [`abx_lead:${dia}:K:otro:P1:anuncio:cK1`, `abx_lead:${dia}:D:otro:P1:anuncio:cD1`];
  const valores = new Map([
    ["abx_phone:965000001", JSON.stringify({ variant: "K", canal: "anuncio", day: dia, at: `${dia}T10:00:00Z` })],
  ]);
  const KV = {
    async list({ prefix }) { return { keys: keys.filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
    async get(k) { return valores.get(k) || null; },
  };
  const ORDENES = [{ name: "#KP9", createdAt: `${dia}T18:00:00Z`, phone: "+51965000001", customer: null, shippingAddress: null, totalPriceSet: { shopMoney: { amount: "298" } }, customAttributes: [] }];
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { orders: { nodes: ORDENES, pageInfo: { hasNextPage: false } } } }) });
  try {
    const env = { dASHBOARDACCESSKEY: "K", KV, sHOPIFYADMINACCESSTOKEN: "t", sHOPIFYSHOPDOMAIN: "kenkuperu.myshopify.com", sHOPIFYAPIVERSION: "2026-04" };
    const req = { method: "GET", url: `https://x/?key=K&format=json&only=ab&since=${dia}&until=${dia}`, headers: { get: () => null } };
    const r = await (await CR.handleRequest(req, env)).json();
    assert.strictEqual(r.ab.K.ordersAsesora, 1);
    assert.strictEqual(r.pruebaK.K_anuncio.ordersAsesora, 1);
    assert.strictEqual(r.pruebaK.K_anuncio.ordersTotal, 1);
    assert.strictEqual(r.ab.pedidosAsesora[0].canal, "anuncio");
  } finally {
    globalThis.fetch = fetchAntes;
  }
});

function conTope(promesa, ms = 5000) {
  let timer;
  const tope = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`colgado: no termino en ${ms} ms`)), ms); });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(timer));
}

(async () => {
  let fallos = 0;
  for (const [n, f] of casos) {
    try { await conTope(Promise.resolve().then(f)); console.log(`ok    ${n}`); }
    catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message.split("\n")[0]}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
