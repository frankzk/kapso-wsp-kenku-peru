#!/usr/bin/env node
// Arnes de evaluacion de modelos para el bot de ventas de Kenku.
//
// Reproduce conversaciones reales contra un modelo candidato usando el prompt y
// las herramientas REALES del agente (evals/fixtures/agente.json, capturado del
// workflow vivo), y le devuelve resultados de herramienta GRABADOS en vez de
// llamar a las funciones de verdad. Eso hace la corrida deterministica, no toca
// Shopify ni manda mensajes a nadie, y aisla la decision del modelo de la
// variabilidad de las funciones.
//
// Uso:
//   OPENROUTER_API_KEY=sk-or-... node evals/runner.js
//   OPENROUTER_API_KEY=sk-or-... node evals/runner.js --modelos openai/gpt-4.1,google/gemini-3.7-flash
//   OPENROUTER_API_KEY=sk-or-... node evals/runner.js --caso pulsera-unidad --verbose
//
// Se corre desde la maquina del usuario: el proxy de las sesiones de Claude Code
// bloquea openrouter.ai, api.openai.com y api.x.ai (Anthropic y Google si pasan).

const fs = require("fs");
const path = require("path");
const { evaluarCaso } = require("./scoring");

const BASE = __dirname;
const AGENTE = JSON.parse(fs.readFileSync(path.join(BASE, "fixtures/agente.json"), "utf8"));
const CASOS = JSON.parse(fs.readFileSync(path.join(BASE, "casos/casos.json"), "utf8"));

// Candidatos por defecto. Los ids son de OpenRouter; ver evals/README.md para
// como se eligieron y que mirar de cada uno.
const MODELOS_DEFAULT = [
  "openai/gpt-4.1",              // el que corre hoy en produccion: es la linea base
  "openai/gpt-4.1-mini",         // el anterior, para tener el piso
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
  "google/gemini-3.7-flash",
  "x-ai/grok-4.3",             // 4.1-fast quedo deprecado: xAI devuelve 404 y recomienda 4.3
];

function args() {
  const a = process.argv.slice(2);
  const get = (flag) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : null;
  };
  return {
    modelos: (get("--modelos") || MODELOS_DEFAULT.join(",")).split(",").map((s) => s.trim()).filter(Boolean),
    // acepta uno o varios: --caso a,b,c
    caso: (get("--caso") || "").split(",").map((x) => x.trim()).filter(Boolean),
    verbose: a.includes("--verbose"),
    maxIter: Number(get("--max-iter") || 14),
  };
}

// Las herramientas del agente, en el formato de tool-calling de OpenAI (que es
// el que expone OpenRouter para todos los proveedores).
function herramientas() {
  const fn = AGENTE.herramientas.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema || { type: "object", properties: {} },
    },
  }));
  // Las por defecto de Kapso no tienen schema publicado; se declaran minimas
  // para que el modelo pueda usarlas y no invente otra forma de responder.
  const porDefecto = {
    send_media: { archivo: { type: "string" }, caption: { type: "string" } },
    save_variable: { name: { type: "string" }, value: { type: "string" } },
    get_variable: { name: { type: "string" } },
    complete_task: {},
    handoff_to_human: { reason: { type: "string" } },
    enter_waiting: {},
    get_whatsapp_context: {},
    get_current_datetime: {},
    get_execution_metadata: {},
    send_notification_to_user: { text: { type: "string" } },
  };
  for (const [name, props] of Object.entries(porDefecto)) {
    if (!AGENTE.herramientas_por_defecto.includes(name)) continue;
    fn.push({ type: "function", function: { name, description: `Herramienta por defecto de Kapso: ${name}`, parameters: { type: "object", properties: props } } });
  }
  return fn;
}

async function llamarModelo(modelo, mensajes, tools, key) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelo,
      messages: mensajes,
      tools,
      temperature: Number(AGENTE.temperature ?? 0.2),
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`${modelo}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error(`${modelo}: respuesta sin choices`);
  return { msg: choice.message, uso: data.usage || {} };
}

// Devuelve el resultado GRABADO de la herramienta. Si el caso no lo grabo, se
// responde algo neutro para que el modelo pueda seguir sin que eso lo premie ni
// lo castigue.
function resultadoHerramienta(caso, nombre, argumentos) {
  const grabados = caso.herramientas_grabadas || {};
  if (grabados[nombre] !== undefined) return grabados[nombre];
  if (nombre === "get_variable") {
    const v = (caso.variables || {})[argumentos?.name];
    return { value: v ?? null };
  }
  if (nombre === "check_coverage") return { cashOnDelivery: true, shippingMode: "contraentrega" };
  return { ok: true };
}

// Todo lo que el modelo le manda al CLIENTE: el texto suelto mas los argumentos
// de las herramientas de envio. Es lo que se evalua, porque es lo unico que el
// cliente llega a leer.
// `turnosCliente` son los textos que escribio el cliente en el caso. Los modelos
// a veces los repiten literalmente antes de responder ("El café" aparecia dos y
// tres veces en la corrida del 2026-09-06), y ese eco contaminaba el texto
// evaluado: una regla `prohibido_texto` podia dar falso negativo solo porque el
// cliente uso esa palabra.
function textoAlCliente(pasos, turnosCliente = []) {
  const ecos = new Set(turnosCliente.map((t) => String(t || "").trim().toLowerCase()));
  const esEco = (t) => ecos.has(String(t || "").trim().toLowerCase());
  const partes = [];
  for (const p of pasos) {
    if (p.tipo === "texto" && p.texto && !esEco(p.texto)) partes.push(p.texto);
    if (p.tipo === "tool") {
      const a = p.argumentos || {};
      for (const campo of ["text", "bodyText", "body_text", "caption", "message"]) {
        if (typeof a[campo] === "string" && a[campo].trim() && !esEco(a[campo])) partes.push(a[campo]);
      }
    }
  }
  return partes.join("\n");
}

async function correrCaso(modelo, caso, tools, key, maxIter) {
  const mensajes = [{ role: "system", content: AGENTE.system_prompt }];
  for (const t of caso.turnos) {
    mensajes.push({ role: t.rol === "cliente" ? "user" : "assistant", content: t.texto });
  }
  const pasos = [];
  const llamadas = [];
  let uso = { prompt_tokens: 0, completion_tokens: 0 };
  let empujones = 0;
  // Por que se termino el caso. Distingue "cotizo mal" de "nunca llego a
  // cotizar", que son fallas muy distintas y el puntaje solo las muestra igual.
  let corte = "max_iter";

  for (let i = 0; i < maxIter; i += 1) {
    const { msg, uso: u } = await llamarModelo(modelo, mensajes, tools, key);
    uso.prompt_tokens += u.prompt_tokens || 0;
    uso.completion_tokens += u.completion_tokens || 0;
    mensajes.push(msg);

    if (msg.content && msg.content.trim()) pasos.push({ tipo: "texto", texto: msg.content });

    const calls = msg.tool_calls || [];
    // El nodo real corre con message_delivery_mode="tool_only": el texto suelto
    // del agente NO se entrega, y Kapso lo obliga a usar la herramienta de
    // envio. Sin emular eso, el modelo contestaba con texto plano y el arnes
    // frenaba en el saludo, sin llegar nunca a la parte que se quiere medir.
    //
    // El empujon NO nombra la herramienta por su nombre literal a proposito. La
    // regla `sin_narracion` marca como falla que el texto al cliente contenga el
    // nombre de una herramienta, y los modelos tienden a repetir el empujon: si
    // el empujon dice "send_text", el modelo que lo eco queda marcado por una
    // palabra que le pusimos nosotros en la boca. El nombre igual esta en la
    // lista de tools, asi que el modelo lo tiene disponible sin que se lo dicten.
    if (!calls.length) {
      if (empujones >= 2) { corte = "empujones"; break; }
      empujones += 1;
      mensajes.push({
        role: "user",
        content: "[sistema] Tu texto suelto NO se entrega al cliente: este canal solo entrega lo que mandas con las herramientas de envio de tu lista. Usalas y continua desde donde quedaste.",
      });
      continue;
    }

    for (const c of calls) {
      let argumentos = {};
      try { argumentos = JSON.parse(c.function.arguments || "{}"); } catch { /* argumentos rotos: se registra igual */ }
      llamadas.push(c.function.name);
      pasos.push({ tipo: "tool", nombre: c.function.name, argumentos });
      mensajes.push({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify(resultadoHerramienta(caso, c.function.name, argumentos)),
      });
    }
    if (llamadas.includes("complete_task")) { corte = "complete_task"; break; }
  }

  const textoCliente = textoAlCliente(pasos, caso.turnos.filter((t) => t.rol === "cliente").map((t) => t.texto));
  const nota = evaluarCaso(caso, { textoCliente, herramientasLlamadas: llamadas });
  return { ...nota, modelo, textoCliente, herramientasLlamadas: llamadas, uso, pasos, corte, empujones };
}

async function main() {
  const { modelos, caso: filtro, verbose, maxIter } = args();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("Falta OPENROUTER_API_KEY.\n  OPENROUTER_API_KEY=sk-or-... node evals/runner.js");
    process.exit(1);
  }
  const casos = filtro.length ? CASOS.filter((c) => filtro.includes(c.id)) : CASOS;
  if (!casos.length) {
    console.error(`No hay ningun caso con id ${filtro.join(", ")}. Disponibles: ${CASOS.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }
  const tools = herramientas();
  console.log(`Prompt: ${AGENTE.system_prompt.length} chars | ${tools.length} herramientas | ${casos.length} casos | ${modelos.length} modelos\n`);

  const tabla = [];
  let gastados = 0;
  for (const modelo of modelos) {
    const filas = [];
    for (const caso of casos) {
      try {
        const r = await correrCaso(modelo, caso, tools, key, maxIter);
        filas.push(r);
        const marca = r.ok ? "ok  " : "FALLA";
        console.log(`  ${marca} ${modelo.padEnd(30)} ${caso.id.padEnd(24)} ${r.pasadas}/${r.total}`);
        for (const x of r.resultados.filter((y) => !y.ok)) {
          console.log(`        - ${x.regla}: ${x.detalle}${x.porque ? `  (${x.porque})` : ""}`);
        }
        // Sin esto, "se nego a usar herramientas" y "cotizo un precio inventado"
        // se leen igual en la tabla, y son fallas de naturaleza distinta.
        if (r.corte === "empujones") {
          console.log(`        ! nunca uso una herramienta de envio: contesto texto suelto y agoto los ${r.empujones} empujones.`);
          console.log(`          En produccion (tool_only) eso es un cliente que no recibe NADA.`);
        } else if (r.corte === "max_iter") {
          console.log(`        ! se quedo sin iteraciones (${maxIter}) sin cerrar con complete_task.`);
        }
        if (verbose) console.log(`        texto> ${r.textoCliente.replace(/\s+/g, " ").slice(0, 240)}`);
      } catch (e) {
        console.log(`  ERROR ${modelo.padEnd(30)} ${caso.id.padEnd(24)} ${e.message}`);
        filas.push({ caso: caso.id, modelo, pasadas: 0, total: (caso.reglas || []).length, ok: false, error: e.message, resultados: [] });
      }
    }
    const pas = filas.reduce((n, f) => n + f.pasadas, 0);
    const tot = filas.reduce((n, f) => n + f.total, 0);
    const casosOk = filas.filter((f) => f.ok).length;
    const tokens = filas.reduce((n, f) => n + (f.uso?.prompt_tokens || 0) + (f.uso?.completion_tokens || 0), 0);
    tabla.push({ modelo, reglas: `${pas}/${tot}`, pct: tot ? (100 * pas) / tot : 0, casosOk: `${casosOk}/${filas.length}`, tokens, filas });
    gastados += tokens;
    // Con credito ajustado conviene ver el acumulado entre modelo y modelo para
    // poder cortar a tiempo. El costo real depende del precio de cada uno; el
    // token total es el mejor proxy disponible sin consultar precios en vivo.
    console.log(`  subtotal acumulado: ${(gastados / 1000).toFixed(0)}k tokens en ${tabla.length} modelo(s)\n`);
  }

  tabla.sort((a, b) => b.pct - a.pct || Number(b.casosOk.split("/")[0]) - Number(a.casosOk.split("/")[0]));
  console.log("=== RANKING ===");
  console.log(`${"modelo".padEnd(32)} ${"reglas".padEnd(10)} ${"%".padEnd(7)} ${"casos".padEnd(8)} tokens`);
  for (const t of tabla) {
    console.log(`${t.modelo.padEnd(32)} ${t.reglas.padEnd(10)} ${t.pct.toFixed(1).padEnd(7)} ${t.casosOk.padEnd(8)} ${t.tokens}`);
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  // git no versiona carpetas vacias, asi que en una copia recien clonada
  // `resultados/` no existe y el write fallaria DESPUES de gastar los tokens.
  const dir = path.join(BASE, "resultados");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), promptChars: AGENTE.system_prompt.length, tabla }, null, 1));
  console.log(`\nGuardado en ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
