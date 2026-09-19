// Test local (fetch mockeado) de los sinonimos y su tolerancia a errores de
// escritura: el cliente nombra el activo ("timoquinona") o lo escribe de oido
// ("kimokimona") y debe caer igual en el producto.
// Ejecutar: node functions/shopify-product-lookup/test/synonyms.test.cjs
require("../index.js");
const assert = require("assert");
const api = globalThis.__kenkuProductLookup;

// Titulos reales del catalogo de Kenku (recortados a lo que importa aqui).
const CATALOG = [
  {
    id: 1,
    handle: "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels",
    title: "SUPER HUMAN Ethiopian Black Seed Oil – Aceite de Semilla Negra Etíope Alta Potencia (60 Cápsulas)",
    product_type: "Suplementos",
    vendor: "Kenku",
    tags: "salud, suplementos",
    options: [{ name: "Title", position: 1, values: ["Default Title"] }],
    variants: [{ id: 11, title: "Default Title", option1: "Default Title", price: "99.00", available: true }],
  },
  {
    id: 2,
    handle: "nad-resveratrol",
    title: "NAD + Resveratrol - Cápsulas de Reparación Celular Antienvejecimiento",
    product_type: "Suplementos",
    vendor: "Kenku",
    tags: "salud, antiedad",
    options: [{ name: "Title", position: 1, values: ["Default Title"] }],
    variants: [{ id: 21, title: "Default Title", option1: "Default Title", price: "129.00", available: true }],
  },
  {
    id: 3,
    handle: "nattokinase-liposomal",
    title: "Nattokinase Liposomal - Salud Cardiovascular",
    product_type: "Suplementos",
    vendor: "Kenku",
    tags: "salud",
    options: [{ name: "Title", position: 1, values: ["Default Title"] }],
    variants: [{ id: 31, title: "Default Title", option1: "Default Title", price: "149.00", available: true }],
  },
  {
    id: 4,
    handle: "cuchillo-hokkaido",
    title: "Cuchillo Hokkaido Forjado",
    product_type: "Cocina",
    vendor: "Kenku",
    tags: "cocina",
    options: [{ name: "Title", position: 1, values: ["Default Title"] }],
    variants: [{ id: 41, title: "Default Title", option1: "Default Title", price: "59.00", available: true }],
  },
];

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/products.json")) {
    const page = Number(new URL(u).searchParams.get("page") || 1);
    return { ok: true, json: async () => ({ products: page === 1 ? CATALOG : [] }) };
  }
  // Ningun handle directo resuelve: obliga a pasar por la busqueda de catalogo.
  return { ok: false, status: 404, json: async () => ({}) };
};

// Sin token admin: el test cubre la ruta publica (catalogo), que es la que
// resuelve estas consultas en produccion.
const env = { sHOPIFYPUBLICSHOPDOMAIN: "kenku.pe", sHOPIFYSHOPDOMAIN: "kenkuperu.myshopify.com" };

async function lookup(message) {
  globalThis.__KENKU_PUBLIC_CATALOG_CACHE = null;
  const request = { method: "POST", url: "https://x/", text: async () => JSON.stringify({ message }) };
  return (await api.handleRequest(request, env)).json();
}

const BLACK_SEED = CATALOG[0].handle;

(async () => {
  // 1) El caso real de produccion: el cliente nombra el activo y lo escribe de
  //    oido. Antes devolvia not_found y el bot quedaba pidiendo el nombre.
  const typo = await lookup("Deseo información de la kimokimona");
  assert.strictEqual(typo.found, true, "kimokimona deberia resolver a un producto");
  assert.strictEqual(typo.product.handle, BLACK_SEED);

  // 2) El activo bien escrito y sus otros nombres.
  for (const text of ["timoquinona", "temoquinona", "quiero info de la nigella sativa", "tienen comino negro?"]) {
    const result = await lookup(text);
    assert.strictEqual(result.found, true, `deberia encontrar producto para: ${text}`);
    assert.strictEqual(result.product.handle, BLACK_SEED, `handle incorrecto para: ${text}`);
  }

  // 3) Lo que ya funcionaba sigue funcionando.
  const byName = await lookup("black seed oil");
  assert.strictEqual(byName.product.handle, BLACK_SEED);
  const nad = await lookup("cuanto cuesta el resveratrol");
  assert.strictEqual(nad.product.handle, "nad-resveratrol");
  const knife = await lookup("tienes cuchillo hokkaido");
  assert.strictEqual(knife.product.handle, "cuchillo-hokkaido");

  // 4) Un sinonimo mal escrito de otro grupo tambien entra (natoquinasa ya
  //    estaba listado; "natokinaza" no, y ahora cae igual).
  const natto = await lookup("tienen natokinaza");
  assert.strictEqual(natto.product.handle, "nattokinase-liposomal");

  // 5) Sin falsos positivos: una palabra desconocida sigue siendo not_found.
  const unknown = await lookup("deseo informacion del tarantulon");
  assert.strictEqual(unknown.found, false);
  assert.strictEqual(unknown.reason, "not_found");

  console.log("OK synonyms: activos y sinonimos mal escritos resuelven al producto correcto");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
