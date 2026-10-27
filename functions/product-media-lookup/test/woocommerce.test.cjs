#!/usr/bin/env node
// Con la tienda WooCommerce (kenku.pe desde el 26-10-2026) toda la media de la
// presentacion sale de kenku.pe: galeria, `extras` (antes/despues, testimonio)
// y video de `media`. Nunca se llama a la API de administracion de Shopify.
// Fixture: respuesta real de kenku.pe/products/<handle>.js del 26-10-2026.
// Correr: node functions/product-media-lookup/test/woocommerce.test.cjs
const path = require("path");
const assert = require("assert");
const fx = require("./woo-fixture.json");
let llamadasShopify = 0;
globalThis.fetch = async (url) => { llamadasShopify += String(url).includes("myshopify") || String(url).includes("graphql") ? 1 : 0; throw new Error(`fetch inesperado ${url}`); };
require(path.join(__dirname, "..", "index.js"));
const M = globalThis.__kenkuProductMediaLookup;
const config = { publicShopDomain: "kenku.pe", adminShopDomain: "kenkuperu.myshopify.com", adminApiVersion: "2026-04", adminToken: "token-de-shopify" };

(async () => {
  let fallos = 0;
  const caso = async (n, f) => { try { await f(); console.log(`ok    ${n}`); } catch (e) { fallos += 1; console.log(`FALLA ${n}\n      ${e.message}`); } };
  await caso("Cayenne: principal, antes/despues y testimonio, todo de kenku.pe", async () => {
    const r = await M.buildPresentationResponse(config, fx.cayenne, null);
    assert.ok(r.ok);
    const roles = Object.fromEntries(r.media.map((m) => [m.role, m.url]));
    assert.ok(roles.principal && roles.antes_despues && roles.testimonio, JSON.stringify(Object.keys(roles)));
    assert.ok(/antes-y-despues/.test(roles.antes_despues));
    assert.ok(/testimonio/.test(roles.testimonio));
    for (const m of r.media) assert.ok(m.url.startsWith("https://kenku.pe/"), m.url);
  });
  await caso("Biru: el video sale de media de kenku.pe", async () => {
    const r = await M.buildPresentationResponse(config, fx.biru, null);
    const video = r.media.find((m) => m.role === "video");
    assert.ok(video && video.url.startsWith("https://kenku.pe/") && /\.mp4$/.test(video.url), JSON.stringify(video));
    for (const m of r.media) assert.ok(m.url.startsWith("https://kenku.pe/"), m.url);
  });
  await caso("video con ™ en el nombre: la URL sale codificada (Meta rechaza no ASCII)", async () => {
    const crudo = "https://kenku.pe/wp-content/uploads/2026/10/magnesio-12-en-1-superhuman™-video.mp4";
    const prod = JSON.parse(JSON.stringify(fx.biru));
    const v = prod.media.find((m) => m.media_type === "video");
    v.sources = v.sources.map((s) => ({ ...s, url: crudo }));
    const r = await M.buildPresentationResponse(config, prod, null);
    const video = r.media.find((m) => m.role === "video");
    assert.strictEqual(video.url, "https://kenku.pe/wp-content/uploads/2026/10/magnesio-12-en-1-superhuman%E2%84%A2-video.mp4");
    // una URL ya codificada no se codifica dos veces
    v.sources = v.sources.map((s) => ({ ...s, url: video.url }));
    assert.strictEqual((await M.buildPresentationResponse(config, prod, null)).media.find((m) => m.role === "video").url, video.url);
  });
  await caso("nunca llama a la API de Shopify con producto de WooCommerce", async () => {
    assert.strictEqual(llamadasShopify, 0);
    assert.ok(M.isWooProduct(fx.cayenne));
    assert.deepStrictEqual(await M.fetchPresentationMetafieldImages(config, { id: 1, woo_id: 9 }), { testimonial: null, beforeAfter: null });
  });
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nok");
  process.exit(fallos ? 1 : 0);
})();
