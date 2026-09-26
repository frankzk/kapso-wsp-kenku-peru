#!/usr/bin/env node
// Test del cableado de la prueba A/D (send-presentation).
// Correr: node functions/send-presentation/test/ab.test.cjs
//
// Protege lo que rompe un A/B sin que nadie se entere:
//  - que customer-lookup (asigna el lead) y create-shopify-order (atribuye el
//    pedido) calculen LA MISMA variante — hasta el 2026-09-26 no lo hacian;
//  - que el reparto sea 50/50 e independiente de los ejes de pruebas anteriores;
//  - que el pedido se atribuya a la variante que el lead RECIBIO, no a la que
//    daria el celular que dio al cerrar;
//  - que el reporte cuente D y deje fuera a N.
const path = require("path");
const assert = require("assert");
const raiz = path.join(__dirname, "..", "..");
require(path.join(raiz, "customer-lookup", "index.js"));
require(path.join(raiz, "create-shopify-order", "index.js"));
require(path.join(raiz, "campaign-report", "index.js"));
const CL = globalThis.__kenkuCustomerLookup;
const CO = globalThis.__kenkuCreateShopifyOrder;
const CR = globalThis.__kenkuCampaignReport;

// Hashes de las pruebas anteriores, replicados para medir independencia.
function fnv1a(t) { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mix32(v) { let h = v >>> 0; h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return h >>> 0; }
const viejaAC = (d) => (fnv1a(d) % 2 === 0 ? "A" : "C");
const viejaPromo = (d) => (mix32(fnv1a(`promo:${d}`)) % 2 === 0 ? "P1" : "P2");

// Celulares peruanos sinteticos, deterministas.
const TELEFONOS = Array.from({ length: 20000 }, (_, i) => `519${String((i * 7919 + 12345) % 100000000).padStart(8, "0")}`);

const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("las dos copias de abVariant coinciden en 20.000 celulares", () => {
  for (const t of TELEFONOS) assert.strictEqual(CL.abVariant(t), CO.abVariant(t), t);
  for (const t of ["+51 965 391 481", "965391481", "51-965-391-481"]) assert.strictEqual(CL.abVariant(t), CO.abVariant(t));
});
caso("las dos copias de promoVariant coinciden (P1 forzado en ambas)", () => {
  for (const t of TELEFONOS.slice(0, 2000)) assert.strictEqual(CL.promoVariant(t), CO.promoVariant(t));
  assert.strictEqual(CO.promoVariant("51965391481"), "P1");
});
caso("sin telefono: N en las dos (fuera del experimento)", () => {
  for (const t of ["", null, undefined, "PE.948592654941065".replace(/\d/g, "")]) {
    assert.strictEqual(CL.abVariant(t), "N"); assert.strictEqual(CO.abVariant(t), "N");
  }
});
caso("solo salen A y D, ~50/50", () => {
  const n = { A: 0, D: 0 };
  for (const t of TELEFONOS) n[CL.abVariant(t)] += 1;
  assert.deepStrictEqual(Object.keys(n).sort(), ["A", "D"]);
  const share = n.D / TELEFONOS.length;
  assert.ok(Math.abs(share - 0.5) < 0.01, `D = ${(share * 100).toFixed(2)}%`);
});
caso("independiente del reparto A/C viejo (los ex-C no caen en bloque en D)", () => {
  const exC = TELEFONOS.filter((t) => viejaAC(t) === "C");
  const share = exC.filter((t) => CL.abVariant(t) === "D").length / exC.length;
  assert.ok(Math.abs(share - 0.5) < 0.015, `de los ex-C, ${(share * 100).toFixed(1)}% en D`);
});
caso("independiente del eje de promo (las 4 celdas ~25%)", () => {
  const c = {};
  for (const t of TELEFONOS) { const k = `${CL.abVariant(t)}/${viejaPromo(t)}`; c[k] = (c[k] || 0) + 1; }
  for (const k of ["A/P1", "A/P2", "D/P1", "D/P2"]) {
    const share = (c[k] || 0) / TELEFONOS.length;
    assert.ok(Math.abs(share - 0.25) < 0.015, `${k} = ${(share * 100).toFixed(1)}%`);
  }
});

caso("pedido: se atribuye a la variante que RECIBIO el lead", () => {
  // Entro sin telefono (N, control) y dio su celular al cerrar: sigue siendo N.
  const telD = TELEFONOS.find((t) => CL.abVariant(t) === "D");
  assert.strictEqual(CO.varianteAsignada({ execution_context: { vars: { ab_variant: "N" } } }, telD), "N");
  assert.strictEqual(CO.varianteAsignada({ execution_context: { vars: { ab_variant: "A" } } }, telD), "A");
});
caso("pedido sin variante en las vars (o con una vieja): se recalcula", () => {
  const t = TELEFONOS[0];
  assert.strictEqual(CO.varianteAsignada({ execution_context: { vars: {} } }, t), CL.abVariant(t));
  assert.strictEqual(CO.varianteAsignada({ execution_context: { vars: { ab_variant: "C" } } }, t), CL.abVariant(t));
  assert.strictEqual(CO.varianteAsignada({}, t), CL.abVariant(t));
});

caso("lead: re-lookup a mitad de charla no lo cambia de brazo", () => {
  // Entro sin telefono (N) y despues el agente vuelve a buscarlo con el celular
  // que dio: tiene que seguir en N, no pasar a A/D.
  const telD = TELEFONOS.find((t) => CL.abVariant(t) === "D");
  assert.strictEqual(CL.varianteDelLead({ execution_context: { vars: { ab_variant: "N" } } }, telD), "N");
  // Conversacion anterior al cambio: quedo en A (forzado) y ahi se queda.
  assert.strictEqual(CL.varianteDelLead({ execution_context: { vars: { ab_variant: "A" } } }, telD), "A");
  // Lead nuevo: se asigna por hash.
  assert.strictEqual(CL.varianteDelLead({ execution_context: { vars: {} } }, telD), "D");
});

caso("reporte: cuenta D, ignora N, calcula lift, z y adopcion", async () => {
  const dia = "2026-09-27";
  const keys = [];
  const valores = new Map();
  const lead = (v, i) => keys.push(`abx_lead:${dia}:${v}:otro:P1:conv-${v}-${i}`);
  for (let i = 0; i < 1000; i += 1) { lead("A", i); lead("D", i); }
  for (let i = 0; i < 40; i += 1) lead("N", i);
  const pedido = (v, i, total) => { const k = `abx_order:${dia}:${v}:conv-${v}-${i}:#KP${v}${i}`; keys.push(k); valores.set(k, JSON.stringify({ total, units: 1 })); };
  for (let i = 0; i < 40; i += 1) pedido("A", i, 149);
  for (let i = 0; i < 50; i += 1) pedido("D", i, 149);
  for (let i = 0; i < 5; i += 1) pedido("N", i, 149);
  keys.push(`abx_present:${dia}:completa:c1`, `abx_present:${dia}:completa:c2`, `abx_present:${dia}:parcial:c3`);
  const KV = {
    async list({ prefix }) { return { keys: keys.filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
    async get(k) { return valores.get(k) || null; },
  };
  const env = { dASHBOARDACCESSKEY: "K", KV };
  const req = { method: "GET", url: `https://x/?key=K&format=json&only=ab&since=${dia}&until=${dia}`, headers: { get: () => null } };
  const r = await (await CR.handleRequest(req, env)).json();
  assert.strictEqual(r.ab.A.leads, 1000); assert.strictEqual(r.ab.A.orders, 40);
  assert.strictEqual(r.ab.D.leads, 1000); assert.strictEqual(r.ab.D.orders, 50);
  assert.strictEqual(r.ab.N, undefined, "N no se reporta como columna");
  assert.strictEqual(r.pruebaD.liftDvsA, 0.25);
  // p1=4%, p2=5%: z binomial ~1,08; corregida ~0,72. NO es significativo.
  assert.ok(Math.abs(r.pruebaD.z - 1.08) < 0.02, `z=${r.pruebaD.z}`);
  assert.ok(Math.abs(r.pruebaD.zCorregida - 0.72) < 0.02, `zc=${r.pruebaD.zCorregida}`);
  assert.deepStrictEqual(r.pruebaD.revenuePerLead, { A: 5.96, D: 7.45 });
  assert.deepStrictEqual(r.pruebaD.presentacionesPorFuncion, { completa: 2, completa_sin_media: 0, parcial: 1, fallo_inicial: 0, sin_tiempo: 0 });
});

// Tope por caso: un caso colgado (una promesa que nunca resuelve) haria que
// Node se quede sin nada pendiente y salga con codigo 0 SIN imprimir el
// resumen — o sea, un test colgado pasaria como verde. El timer lo convierte en
// FALLA y mantiene vivo el proceso mientras tanto.
function conTope(promesa, ms = 3000) {
  let timer;
  const tope = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`colgado: no termino en ${ms} ms`)), ms); });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(timer));
}

caso("lead nuevo A/D: guarda telefono -> variante (para las ventas de asesora)", async () => {
  const store = new Map();
  const KV = { async get(k) { return store.get(k) || null; }, async put(k, v) { store.set(k, v); } };
  await CL.logAbLead({ KV }, "conv-1", "D", "otro", "P1", "+51 965 391 481");
  await CL.logAbLead({ KV }, "conv-2", "N", "otro", "P1", "");
  await CL.logAbLead({ KV }, "conv-3", "A", "otro", "P1", "51911222333");
  const tel = JSON.parse(store.get("abx_phone:965391481"));
  assert.strictEqual(tel.variant, "D"); assert.strictEqual(tel.conversationId, "conv-1");
  assert.strictEqual(JSON.parse(store.get("abx_phone:911222333")).variant, "A");
  assert.ok(![...store.keys()].some((k) => k.startsWith("abx_phone:") && !["abx_phone:965391481", "abx_phone:911222333"].includes(k)), "la N no deja telefono");
});

caso("reporte: suma las ventas de asesora a su variante, y solo esas", async () => {
  const dia = "2026-09-28";
  const keys = []; const valores = new Map();
  for (let i = 0; i < 100; i += 1) { keys.push(`abx_lead:${dia}:A:otro:P1:cA${i}`); keys.push(`abx_lead:${dia}:D:otro:P1:cD${i}`); }
  // 1 pedido del bot en D (ya contado por abx_order).
  keys.push(`abx_order:${dia}:D:cD0:#KP1`); valores.set(`abx_order:${dia}:D:cD0:#KP1`, JSON.stringify({ total: 149, units: 1 }));
  // Telefonos de leads del experimento.
  valores.set("abx_phone:965000001", JSON.stringify({ variant: "D", day: dia }));
  valores.set("abx_phone:965000002", JSON.stringify({ variant: "A", day: dia }));
  valores.set("abx_phone:965000003", JSON.stringify({ variant: "D", day: "2026-09-29" })); // lead POSTERIOR al pedido
  const KV = {
    async list({ prefix }) { return { keys: keys.filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
    async get(k) { return valores.get(k) || null; },
  };
  const orden = (name, phone, total, bot = false) => ({
    name, createdAt: `${dia}T18:00:00Z`, phone, customer: null, shippingAddress: null,
    totalPriceSet: { shopMoney: { amount: String(total) } },
    customAttributes: bot ? [{ key: "source", value: "whatsapp-bot" }] : [],
  });
  const ORDENES = [
    orden("#KP1", "+51965000001", 149, true),     // del bot: NO se suma otra vez
    orden("#KP2", "+51 965 000 001", 298),        // asesora, lead D -> cuenta en D
    orden("#KP3", "965000002", 149),              // asesora, lead A -> cuenta en A
    orden("#KP4", "+51999888777", 149),           // web, no es lead -> no cuenta
    orden("#KP5", "+51965000003", 149),           // anterior al lead -> no cuenta
  ];
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("graphql.json")) return { ok: true, json: async () => ({ data: { orders: { nodes: ORDENES, pageInfo: { hasNextPage: false } } } }) };
    throw new Error(`fetch inesperado ${url}`);
  };
  try {
    const env = { dASHBOARDACCESSKEY: "K", KV, sHOPIFYADMINACCESSTOKEN: "t", sHOPIFYSHOPDOMAIN: "kenkuperu.myshopify.com", sHOPIFYAPIVERSION: "2026-04" };
    const req = { method: "GET", url: `https://x/?key=K&format=json&only=ab&since=${dia}&until=${dia}`, headers: { get: () => null } };
    const r = await (await CR.handleRequest(req, env)).json();
    assert.strictEqual(r.ab.D.orders, 1, "bot");
    assert.strictEqual(r.ab.D.ordersAsesora, 1); assert.strictEqual(r.ab.D.ordersTotal, 2);
    assert.strictEqual(r.ab.A.orders, 0); assert.strictEqual(r.ab.A.ordersAsesora, 1); assert.strictEqual(r.ab.A.ordersTotal, 1);
    assert.deepStrictEqual(r.ab.pedidosAsesora.map((p) => p.name).sort(), ["#KP2", "#KP3"]);
    assert.strictEqual(r.pruebaD.liftDvsA_total, 1);            // 2% vs 1%
    assert.deepStrictEqual(r.pruebaD.revenuePerLead, { A: 1.49, D: 4.47 });
    assert.ok(r.pruebaD.total && typeof r.pruebaD.total.zCorregida === "number");
  } finally {
    globalThis.fetch = fetchAntes;
  }
});

(async () => {
  let fallos = 0;
  for (const [n, f] of casos) {
    try { await conTope(f()); console.log(`ok    ${n}`); }
    catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message.split("\n")[0]}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
