#!/usr/bin/env node
// Alternativas para productos agotados, sobre una muestra fija del catalogo real
// (14-oct). Correr: node functions/shopify-product-lookup/test/alternativas.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const { findInStockAlternatives } = globalThis.__kenkuProductLookup;
const fs = require("fs");
const CAT = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogo-muestra.json"), "utf8"))
  .map((p) => ({ handle: p.h, title: p.t, description: p.d, priceRange: { min: Number(p.pr) }, variants: [{ availableForSale: p.a, available: p.a }] }));
const by = (re) => CAT.find((p) => re.test(p.title));
const alt = (re) => findInStockAlternatives(CAT, by(re)).map((a) => a.title);
const casos = [];
const caso = (n, f) => casos.push([n, f]);
caso("mascarilla de cabello grueso -> la linea de cabello grueso", () => {
  const a = alt(/^Mascarilla de Nutrición Intensa para Cabello Grueso/);
  assert.ok(a.length && /Cabello Grueso|Romero/.test(a[0]), JSON.stringify(a));
});
caso("ashwagandha en gomitas -> ashwagandha o animo/estres en capsulas", () => {
  const a = alt(/^Ashwagandha Gummies/);
  assert.ok(a.some((t) => /Ashwagandha|Saffron/.test(t)), JSON.stringify(a));
});
caso("Compeed anti-ampollas: ya NO ofrece shampoo (antes salia por 'cocina')", () => {
  assert.ok(!alt(/^Compeed Stick/).some((t) => /Shampoo|Collagen|GLP/.test(t)));
});
caso("WartRemover: sin alternativa (no hay nada parecido de verdad)", () => {
  assert.deepStrictEqual(alt(/^WartRemover/), []);
});
caso("nunca ofrece un agotado ni el mismo producto", () => {
  for (const p of CAT.filter((x) => !x.variants[0].availableForSale)) {
    for (const a of findInStockAlternatives(CAT, p)) {
      assert.ok(a.available, a.title); assert.notStrictEqual(a.handle, p.handle);
    }
  }
});
caso("como mucho 2 y con puntaje >= 0,25", () => {
  for (const p of CAT.filter((x) => !x.variants[0].availableForSale)) {
    const a = findInStockAlternatives(CAT, p);
    assert.ok(a.length <= 2); assert.ok(a.every((x) => x.score >= 0.25));
  }
});
caso("catalogo vacio o producto sin texto: []", () => {
  assert.deepStrictEqual(findInStockAlternatives([], CAT[0]), []);
  assert.deepStrictEqual(findInStockAlternatives(CAT, { handle: "x", title: "", description: "" }), []);
});
let f = 0;
for (const [n, fn] of casos) { try { fn(); console.log(`ok    ${n}`); } catch (e) { f += 1; console.log(`FALLA ${n}\n      ${e.message}`); } }
console.log(`\n${casos.length - f}/${casos.length}`); process.exit(f ? 1 : 0);
