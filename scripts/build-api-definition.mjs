#!/usr/bin/env node
// Convierte el definition.json canonico de un workflow (el que produce el SDK y
// consume `kapso push`) en el payload que espera la Platform API.
//
// Por que existe: la API NO resuelve `function_slug` -> `function_id` (eso lo
// hace el CLI en `kapso push`). Si se hace PATCH/POST del definition tal cual,
// las referencias a funciones quedan en null y el workflow se rompe en runtime:
// los decide de tipo function dejan de rutear y el agente pierde sus tools.
//
// Uso:
//   node scripts/build-api-definition.mjs workflows/kenku-recovery-bot > /tmp/def.json
//
// Salida: el mismo definition con `function_id` inyectado en (a) cada nodo
// decide con decision_type=function y (b) cada item de flow_agent_function_tools.
// Aborta si algun slug no esta en el mapa: mejor fallar aqui que dejar un null
// silencioso en produccion.

import fs from "node:fs";
import path from "node:path";

// IDs de las funciones del proyecto Kenku Peru (cf65efcf-38ab-475c-85b3-c2b89f304652).
const FUNCTION_IDS = {
  "shopify-product-lookup": "21cd24f1-ed57-4303-988c-043bf4bc8069",
  "product-media-lookup": "d4e6365e-4736-4e92-872a-259adb6634f2",
  "quote-order": "ae2db7b7-918c-4b73-b36e-979668920347",
  "check-coverage": "05a6107d-6488-4bb3-8088-9f2fce140b5e",
  "create-shopify-order": "f513d5ea-7d45-4623-af58-3b1b810abed0",
  "notify-team": "00dd67bd-df4b-4477-af5c-2530c44a5b60",
  "customer-lookup": "1708bd8d-0a55-4a1e-9ed7-fe2e543c4305",
  "campaign-report": "e7c39748-c57c-4322-b532-a31d9ac5949b",
};

const dir = process.argv[2];
if (!dir) {
  console.error("uso: node scripts/build-api-definition.mjs <dir-del-workflow>");
  process.exit(1);
}

const definition = JSON.parse(
  fs.readFileSync(path.join(dir, "definition.json"), "utf8"),
);

const missing = new Set();

function resolve(slug) {
  const id = FUNCTION_IDS[slug];
  if (!id) missing.add(slug);
  return id;
}

for (const node of definition.nodes) {
  const config = node.data?.config;
  if (!config) continue;

  if (node.data.node_type === "decide" && config.decision_type === "function") {
    config.function_id = resolve(config.function_slug);
  }

  for (const tool of config.flow_agent_function_tools || []) {
    tool.function_id = resolve(tool.function_slug);
  }
}

if (missing.size > 0) {
  console.error(`slugs sin function_id en el mapa: ${[...missing].join(", ")}`);
  console.error("agregalos a FUNCTION_IDS antes de desplegar.");
  process.exit(1);
}

process.stdout.write(JSON.stringify(definition, null, 2) + "\n");
