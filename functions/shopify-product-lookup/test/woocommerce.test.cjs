#!/usr/bin/env node
// shopify-product-lookup con STORE_BACKEND=woocommerce (fetch simulado): el catalogo sale de WOO_STORE_URL
// (/products.json y /products/<handle>.js con formato Shopify, plugin cod-core), los links siguen en kenku.pe y
// no se usa la API de administracion de Shopify.
// Correr: node functions/shopify-product-lookup/test/woocommerce.test.cjs
const path = require("path");
const assert = require("assert");

const BLACK = "purely-nutrient-ethiopian-black-seed-oil-aceite-de-semilla-negra-etiope-alta-potencia-60-softgels";
const NATTO = "nattokinase-mejora-la-circulacion-arterial-90-capsulas";
const CATALOG = { products: [
  { id: 9001, handle: BLACK, title: "Black Seed Oil – Aceite de Semilla Negra Etíope (60 softgels)", tags: [], options: [], body_html: "Aceite de semilla negra.",
    variants: [{ id: 91, title: "Default Title", available: true, price: "119.00" }], images: [{ src: "https://img.test/black.jpg" }] },
  { id: 9002, handle: NATTO, title: "Nattokinase – Mejora la Circulación Arterial (90 cápsulas)", tags: [], options: [], body_html: "Circulación.",
    variants: [{ id: 92, title: "Default Title", available: false, price: "129.00" }], images: [] },
] };
const ADMIN_NATTO = {
  id: "gid://shopify/Product/9002", handle: NATTO, title: "Nattokinase (Shopify)", description: "", productType: "", vendor: "", tags: [], onlineStoreUrl: null,
  featuredImage: null, collections: { nodes: [] }, options: [],
  variants: { nodes: [{ id: "gid://shopify/ProductVariant/92", title: "Default Title", sku: "", availableForSale: true, inventoryQuantity: 489, price: "129.00", compareAtPrice: null, selectedOptions: [], image: null }] },
};

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes("graphql.json")) {
    const body = JSON.parse(opts.body);
    calls.push({ kind: "admin", url: u });
    if (body.query.includes("productByHandle")) return new Response(JSON.stringify({ data: { productByHandle: body.variables.handle === NATTO ? ADMIN_NATTO : null } }));
    return new Response(JSON.stringify({ data: { products: { nodes: [{ ...ADMIN_NATTO, handle: "otro-de-shopify", title: "Producto que solo esta en Shopify" }] } } }));
  }
  calls.push({ kind: "public", url: u });
  if (u.includes("/products.json")) return new Response(JSON.stringify(u.includes("page=1") ? CATALOG : { products: [] }));
  if (u.endsWith(`/products/${BLACK}.js`)) {
    return new Response(JSON.stringify({ ...CATALOG.products[0], url: `/products/${BLACK}`, price: 11900, variants: [{ id: 91, title: "Default Title", available: true, price: 11900 }] }));
  }
  return new Response("{}", { status: 404 });
};

require(path.join(__dirname, "..", "index.js"));
const api = globalThis.__kenkuProductLookup;

const SHOPIFY_ENV = { SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat", WOO_STORE_URL: "https://tienda.test/" };
const WOO_ENV = { ...SHOPIFY_ENV, STORE_BACKEND: "woocommerce" };
const lookup = async (input, env) => (await api.handleRequest({ method: "POST", url: "http://x", text: async () => JSON.stringify({ input }) }, env)).json();
const of = (kind) => calls.filter((c) => c.kind === kind);
const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso("Shopify (sin STORE_BACKEND): como hoy, el Admin rescata el stock del catalogo publico", async () => {
  const r = await lookup({ url: `https://kenku.pe/products/${NATTO}` }, SHOPIFY_ENV);
  assert.ok(of("public").every((c) => c.url.startsWith("https://kenku.pe/")), "catalogo de kenku.pe");
  assert.ok(of("admin").length > 0, "usa el Admin");
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.stockRescued, true);
  assert.strictEqual(api.getConfig(SHOPIFY_ENV).catalogBase, "https://kenku.pe");
});

caso("Shopify (sin STORE_BACKEND): el respaldo de busqueda del Admin sigue igual", async () => {
  const r = await lookup({ message: "quiero el zzproducto inventado" }, SHOPIFY_ENV);
  assert.ok(of("admin").length > 0);
  assert.strictEqual(r.product?.handle, "otro-de-shopify", "fallback amplio del Admin");
});

caso("WooCommerce: el link se resuelve en la tienda nueva y el link al cliente queda en kenku.pe", async () => {
  const r = await lookup({ url: `https://kenku.pe/products/${BLACK}` }, WOO_ENV);
  assert.strictEqual(of("public")[0].url, `https://tienda.test/products/${BLACK}.js`, "lee de WOO_STORE_URL");
  assert.strictEqual(of("admin").length, 0, "sin Admin de Shopify");
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.product.priceRange.min, 119, "precio del .js en centimos -> soles");
  assert.strictEqual(r.product.url, `https://kenku.pe/products/${BLACK}`);
  assert.strictEqual(r.reliableMatch, true);
});

caso("WooCommerce: agotado en la tienda nueva = agotado (no lo rescata el inventario viejo de Shopify)", async () => {
  const r = await lookup({ url: `https://kenku.pe/products/${NATTO}` }, WOO_ENV);
  assert.strictEqual(of("admin").length, 0);
  assert.ok(of("public").some((c) => c.url.startsWith("https://tienda.test/products.json")), "catalogo de la tienda nueva");
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.outOfStock, true);
  assert.ok(!r.stockRescued);
});

caso("WooCommerce: sin coincidencia no cae al Admin de Shopify", async () => {
  const r = await lookup({ message: "quiero el zzproducto inventado" }, WOO_ENV);
  assert.strictEqual(of("admin").length, 0);
  assert.strictEqual(r.found, false);
  assert.strictEqual(r.reason, "not_found");
});

caso("para probar sin cambiar el secreto: storeBackend en el input (y no ensucia la busqueda)", async () => {
  const r = await lookup({ message: "quiero el zzproducto inventado", storeBackend: "woocommerce" }, SHOPIFY_ENV);
  assert.strictEqual(of("admin").length, 0);
  assert.ok(of("public").every((c) => c.url.startsWith("https://tienda.test/")), "lee de la tienda nueva");
  assert.ok(!/woocommerce/i.test(r.input), r.input);
});

caso("WooCommerce sin WOO_STORE_URL: catalogo del dominio publico (kenku.pe ya es WooCommerce)", async () => {
  const config = api.getConfig({ STORE_BACKEND: "woocommerce", SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat" });
  assert.strictEqual(config.catalogBase, "https://kenku.pe");
  assert.strictEqual(config.token, null);
});

(async () => {
  let fallos = 0;
  for (const [n, fn] of casos) {
    calls.length = 0;
    try { await fn(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
