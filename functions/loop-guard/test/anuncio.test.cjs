#!/usr/bin/env node
// Tres toques al anuncio no son un robot. Correr: node functions/loop-guard/test/anuncio.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const { detectLoopRisk } = globalThis.__kenkuLoopGuard;
const msg = (ts, dir, text, referral) => ({ timestamp: String(ts), kapso: { direction: dir, content: text }, ...(referral ? { referral: { source_type: "ad", source_id: "1" } } : {}) });
const CTA = "¡Hola! Quiero más información";

const casos = [];
const caso = (n, f) => casos.push([n, f]);
caso("tres toques al anuncio (e476f871): no es loop", () => {
  const r = detectLoopRisk([msg(1, "inbound", CTA, true), msg(2, "outbound", "¡Hola Roxana!"), msg(40, "inbound", CTA, true), msg(61, "inbound", CTA, false)]);
  assert.strictEqual(r.risk, false, JSON.stringify(r));
});
caso("tres identicos sin anuncio (auto-responder): sigue siendo loop", () => {
  const r = detectLoopRisk([msg(1, "inbound", "Gracias por escribir, te responderemos pronto"), msg(2, "inbound", "Gracias por escribir, te responderemos pronto"), msg(3, "inbound", "Gracias por escribir, te responderemos pronto")]);
  assert.strictEqual(r.risk, true);
  assert.ok(r.reasons.includes("inbound_repetido") || r.reasons.includes("auto_respuesta"));
});
caso("identicos 'hola' sin anuncio: loop como antes", () => {
  const r = detectLoopRisk([msg(1, "inbound", "hola"), msg(5, "inbound", "hola"), msg(9, "inbound", "hola")]);
  assert.ok(r.reasons.includes("inbound_repetido"));
});
let ok = 0;
for (const [n, f] of casos) { try { f(); ok += 1; } catch (e) { console.error(`✗ ${n}\n  ${e.message}`); } }
console.log(`${ok}/${casos.length}`);
if (ok !== casos.length) process.exit(1);
