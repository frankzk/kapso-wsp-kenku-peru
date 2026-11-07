// Escenarios de la variante D (y de los leads sin anuncio) para el test de
// "D no cambia byte a byte" (t11.test.cjs). Corre send-presentation con fetch,
// reloj y KV simulados y devuelve, por escenario, EXACTAMENTE lo que se habria
// posteado a Meta, la respuesta al agente y las claves KV escritas.
//
// d-golden.json se genero con este mismo archivo contra el send-presentation
// ANTERIOR a la prueba T11 (commit 4fbdd33). Si un cambio altera algo de D, el
// test lo marca. Para regenerarlo a proposito (cambio deliberado de D):
//   node functions/send-presentation/test/d-escenarios.cjs > functions/send-presentation/test/d-golden.json
const path = require("path");

const LOOKUP_FN = "21cd24f1-ed57-4303-988c-043bf4bc8069";
const MEDIA_FN = "d4e6365e-4736-4e92-872a-259adb6634f2";
const COVERAGE_FN = "05a6107d-6488-4bb3-8088-9f2fce140b5e";

const producto = (over = {}) => ({
  found: true, reliableMatch: true, outOfStock: false,
  product: {
    handle: "black-seed-oil",
    title: "SUPER HUMAN Ethiopian Black Seed Oil – Aceite de Semilla Negra Prensado en Frío",
    variants: [{ id: "v1", availableForSale: true, price: 149, compareAtPrice: null }],
    ...over,
  },
});
const MEDIA_COMPLETA = {
  ok: true, found: true, media: [
    { type: "image", role: "principal", url: "https://cdn/principal.jpg" },
    { type: "image", role: "antes_despues", url: "https://cdn/ad.jpg" },
    { type: "video", role: "video", url: "https://cdn/v.mp4" },
    { type: "image", role: "testimonio", url: "https://cdn/t.jpg" },
  ],
};
const MEDIA_SIN_TESTIMONIO = { ok: true, found: true, media: MEDIA_COMPLETA.media.filter((m) => m.role !== "testimonio") };
const MEDIA_MINIMA = { ok: true, found: true, media: [{ type: "image", role: "principal", url: "https://cdn/p.jpg" }] };
const COD = { cashOnDelivery: true, shippingMode: "contraentrega", advanceAmount: 0, courier: null };
const SHALOM = { cashOnDelivery: false, shippingMode: "agencia", advanceAmount: 30, courier: "Shalom" };
const CON_TEL = { conversation: { id: "c1", phone_number_id: "1239315459260256", phone_number: "51965391481" } };
const SOLO_BSUID = { conversation: { id: "c2", phone_number_id: "1239315459260256", business_scoped_user_id: "PE.948592654941065" } };
const ANUNCIO = { ad_referral_ad_id: "120253987459770120" };
const WEB = "Hola, quiero pedir. Soy de La Libertad / Sánchez Carrión / Huamachuco. https://kenku.pe/products/black-seed-oil";

// Variante "D" en todos: es lo que tiene que quedar identico.
const ESCENARIOS = [
  { n: "anuncio_media_completa" },
  { n: "anuncio_con_ancla", lookup: producto({ variants: [{ availableForSale: true, price: 149, compareAtPrice: 200 }] }) },
  { n: "anuncio_media_minima", media: MEDIA_MINIMA },
  { n: "anuncio_sin_media", media: null },
  { n: "anuncio_sin_testimonio", media: MEDIA_SIN_TESTIMONIO },
  { n: "anuncio_known_address", vars: { known_address: "Av. Arequipa 123, Lince" } },
  { n: "anuncio_zona_cod", input: { ubicacion: "Lima / Lima / Ate" }, cobertura: COD },
  { n: "anuncio_zona_shalom", input: { ubicacion: WEB }, cobertura: SHALOM },
  { n: "anuncio_zona_caida", input: { ubicacion: WEB }, cobertura: null },
  { n: "anuncio_bsuid", wa: SOLO_BSUID },
  { n: "anuncio_falla_video", falla: 3 },
  { n: "anuncio_falla_precio", falla: 5 },
  { n: "anuncio_falla_saludo", falla: 0 },
  { n: "anuncio_falla_botones", falla: 7 },
  { n: "anuncio_meta_lenta", latenciaMs: 4000 },
  { n: "anuncio_catalogo_lento", lookupMs: 20000 },
  { n: "anuncio_wait_until", waitUntil: true },
  { n: "anuncio_par", lookup: producto({ title: "Zapatillas Ortopédicas – Comodidad", variants: [{ availableForSale: true, price: 134.1 }] }) },
  { n: "anuncio_agotado", lookup: { ...producto(), outOfStock: true } },
  { n: "anuncio_ambiguo", lookup: { ...producto(), reliableMatch: false } },
  { n: "anuncio_precio_variable", lookup: producto({ variants: [{ availableForSale: true, price: 149 }, { availableForSale: true, price: 179 }] }) },
  { n: "organico_media_completa", sinAnuncio: true },
  { n: "organico_media_minima", sinAnuncio: true, media: MEDIA_MINIMA },
  { n: "organico_sin_media", sinAnuncio: true, media: null },
  { n: "organico_known_address", sinAnuncio: true, vars: { known_address: "Av. Arequipa 123, Lince" } },
  { n: "organico_zona_shalom", sinAnuncio: true, input: { ubicacion: WEB }, cobertura: SHALOM },
  { n: "organico_falla_cabecera", sinAnuncio: true, falla: 4 },
  { n: "organico_falla_foto", sinAnuncio: true, falla: 0 },
  { n: "organico_bsuid", sinAnuncio: true, wa: SOLO_BSUID },
];

const resp = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });

async function correrEscenario(P, e, variante = "D") {
  const enviados = []; const pausas = []; const kvPuts = [];
  let reloj = 0; let intentos = 0;
  const latencia = e.latenciaMs ?? 1700;
  P.deps.dormir = async (ms) => { pausas.push(ms); reloj += ms; };
  P.deps.azar = () => 0.5;
  P.deps.ahora = () => reloj;
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes(`/functions/${LOOKUP_FN}/invoke`)) { reloj += e.lookupMs || 0; return resp(e.lookup === undefined ? producto() : e.lookup); }
    if (u.includes(`/functions/${MEDIA_FN}/invoke`)) return resp(e.media === undefined ? MEDIA_COMPLETA : e.media);
    if (u.includes(`/functions/${COVERAGE_FN}/invoke`)) return e.cobertura ? resp(e.cobertura) : resp({ error: "caido" }, 500);
    if (u.endsWith("/messages")) {
      reloj += latencia;
      const n = intentos; intentos += 1;
      // `falla`: el numero de intento de envio (o lista de intentos) que Meta rechaza.
      if ([].concat(e.falla ?? []).includes(n)) return resp({ error: { code: 131000 } }, 400);
      enviados.push(JSON.parse(opts.body));
      return resp({ messages: [{ id: `wamid.${enviados.length}` }] });
    }
    throw new Error(`fetch inesperado: ${u}`);
  };
  const KV = { async put(k) { kvPuts.push(k); } };
  const vars = { ab_variant: variante, ...(e.sinAnuncio ? {} : ANUNCIO), ...(e.vars || {}) };
  const payload = {
    input: {
      product: "black-seed-oil",
      saludo: "¡Hola! Soy *Akemi* de Kenku 😊",
      beneficio: "Refuerza tus defensas y tu energía desde adentro, de forma natural 🌿",
      nombre: "Black Seed Oil",
      ...(e.input || {}),
    },
    whatsapp_context: e.wa || CON_TEL,
    execution_context: { vars },
  };
  const pendientes = [];
  const execCtx = e.waitUntil ? { waitUntil: (p) => pendientes.push(p) } : null;
  // registrar() fecha la clave con Date.now(): se fija para que sea determinista.
  const nowAntes = Date.now;
  Date.now = () => Date.parse("2026-11-17T15:00:00Z");
  try {
    const res = await P.handleRequest({ text: async () => JSON.stringify(payload) }, { KAPSO_API_KEY: "k-test", KV }, execCtx);
    const respuesta = JSON.parse(await res.text());
    const segundoPlano = pendientes.length ? await pendientes[0] : null;
    return { respuesta, segundoPlano, enviados, pausas, kvPuts };
  } finally {
    Date.now = nowAntes;
    globalThis.fetch = fetchAntes;
  }
}

async function correrTodos(P, variante = "D") {
  const out = {};
  for (const e of ESCENARIOS) out[e.n] = await correrEscenario(P, e, variante);
  return out;
}

module.exports = { ESCENARIOS, correrEscenario, correrTodos, producto, MEDIA_COMPLETA, MEDIA_SIN_TESTIMONIO, MEDIA_MINIMA, COD, SHALOM, CON_TEL, SOLO_BSUID, ANUNCIO, WEB };

if (require.main === module) {
  require(path.join(__dirname, "..", "index.js"));
  correrTodos(globalThis.__kenkuSendPresentation).then((r) => {
    process.stdout.write(`${JSON.stringify(r, null, 1)}\n`);
  });
}
