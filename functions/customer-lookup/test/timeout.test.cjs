#!/usr/bin/env node
// Regresion 2026-10-14: con Shopify y el proxy de Kapso colgados, customer-lookup
// debe responder (como cliente nuevo / lookup_failed) muy por debajo de los 30s
// del nodo init-customer, en vez de colgarse y dejar al lead sin respuesta.
// Correr: node functions/customer-lookup/test/timeout.test.cjs

const path = require("path");

let llamadas = 0;
globalThis.fetch = (url, opts = {}) => {
  llamadas += 1;
  return new Promise((_, reject) => {
    opts.signal?.addEventListener("abort", () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      reject(e);
    });
  });
};

require(path.join(__dirname, "..", "index.js"));
const { handleRequest } = globalThis.__kenkuCustomerLookup || {};

(async () => {
  if (!handleRequest) {
    console.error("✗ no se encontro handleRequest exportado");
    process.exit(1);
  }
  const body = {
    input: { phone: "+51987654321" },
    whatsapp_context: { conversation: { id: "conv-test", phone_number_id: "123" } },
  };
  const env = { SHOPIFY_ADMIN_ACCESS_TOKEN: "x", KAPSO_API_KEY: "k" };
  const t0 = Date.now();
  const res = await handleRequest({ text: async () => JSON.stringify(body) }, env);
  const seg = (Date.now() - t0) / 1000;
  const out = JSON.parse(await res.text());
  console.log(`respondio en ${seg.toFixed(1)}s, reason=${out.reason}, fetches=${llamadas}`);
  let fallos = 0;
  if (seg >= 20) { console.error("✗ tardo 20s o mas"); fallos += 1; }
  if (out.reason !== "lookup_failed") { console.error("✗ esperaba reason=lookup_failed"); fallos += 1; }
  if (fallos) process.exit(1);
  console.log("✓ customer-lookup no se cuelga con Shopify/Kapso caidos");
})();
