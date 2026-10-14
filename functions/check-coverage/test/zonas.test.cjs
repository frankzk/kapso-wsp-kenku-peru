#!/usr/bin/env node
// Zonas que van por agencia con adelanto S/30 (decision 2026-10-07): Cajamarca,
// Huancayo, San Martin y Pucallpa. Y las que siguen con contraentrega.
// Correr: node functions/check-coverage/test/zonas.test.cjs
const path = require("path");
const assert = require("assert");
require(path.join(__dirname, "..", "index.js"));
const C = globalThis.__kenkuCheckCoverage;
async function modo(input) {
  const r = await C.handleRequest({ method: "POST", text: async () => JSON.stringify({ input }) }, {});
  return JSON.parse(await r.text()).shippingMode;
}
const AGENCIA = [
  { district: "Cajamarca", province: "Cajamarca", region: "Cajamarca" },
  { district: "Baños del Inca", province: "Cajamarca", region: "Cajamarca" },
  { district: "Cajamarca" },
  { district: "Huancayo", province: "Huancayo", region: "Junin" },
  { district: "El Tambo", province: "Huancayo", region: "Junin" },
  { district: "Tarapoto", province: "San Martin", region: "San Martin" },
  { district: "Moyobamba", province: "Moyobamba", region: "San Martin" },
  { district: "Calleria", province: "Coronel Portillo", region: "Ucayali" },
  { district: "Yarinacocha", province: "Coronel Portillo", region: "Ucayali" },
  { district: "Pucallpa" },
  // Region Lima fuera de Lima Metropolitana (2026-10-07): los motorizados no llegan.
  { district: "Huaral", province: "Huaral", region: "Lima" },
  { district: "Chancay", province: "Huaral", region: "Lima" },
  { district: "Huacho", province: "Huaura", region: "Lima" },
  { district: "Huacho", province: "Lima", region: "Lima" },
  { district: "Lima/Huaral" },
  { district: "huaral lima" },
  { district: "Barranca", province: "Barranca", region: "Lima" },
  { district: "Paramonga", region: "Lima" },
  { district: "San Vicente de Cañete", province: "Cañete", region: "Lima" },
  { district: "Mala", province: "Cañete", region: "Lima" },
  { district: "San Luis", province: "Cañete", region: "Lima" },
  { district: "Mala", region: "Lima" },
  { district: "Imperial", province: "Lima", region: "Lima" },
  { district: "Matucana", province: "Huarochiri", region: "Lima" },
  { district: "Santa Eulalia", region: "Lima" },
  { district: "Ricardo Palma", province: "Huarochirí", region: "Lima" },
  { district: "Canta", province: "Canta", region: "Lima" },
];
const CONTRAENTREGA = [
  { district: "San Martin de Porres", province: "Lima", region: "Lima" },
  { district: "Trujillo", province: "Trujillo", region: "La Libertad" },
  { district: "Chiclayo", province: "Chiclayo", region: "Lambayeque" },
  { district: "Cerro Colorado", province: "Arequipa", region: "Arequipa" },
  { district: "Juliaca", province: "San Roman", region: "Puno" },
  // Lima Metropolitana y Callao siguen igual, aunque el nombre se parezca.
  { district: "Barranco", province: "Lima", region: "Lima" },
  { district: "San Luis", province: "Lima", region: "Lima" },
  { district: "San Luis" },
  { district: "Santa Rosa", province: "Lima", region: "Lima" },
  { district: "Santa Maria del Mar", province: "Lima", region: "Lima" },
  { district: "Lurigancho-Chosica", province: "Lima", region: "Lima" },
  { district: "Cieneguilla", region: "Lima" },
  { district: "San Martin de Porres", address: "Av. Canta Callao 1234" },
  { district: "Ventanilla", province: "Callao", region: "Callao" },
  { district: "Lima", province: "Lima", region: "Lima" },
  { district: "Ate" },
];
(async () => {
  let f = 0;
  for (const i of AGENCIA) { const m = await modo(i); if (m !== "agencia") { f += 1; console.log("FALLA agencia:", JSON.stringify(i), "->", m); } }
  for (const i of CONTRAENTREGA) { const m = await modo(i); if (m !== "contraentrega") { f += 1; console.log("FALLA contraentrega:", JSON.stringify(i), "->", m); } }
  const n = AGENCIA.length + CONTRAENTREGA.length;
  console.log(`${n - f}/${n}`); process.exit(f ? 1 : 0);
})();
