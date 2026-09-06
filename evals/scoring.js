// Reglas de evaluacion. TODAS deterministas y auditables: cada punto que un
// modelo gana o pierde se puede rastrear a una linea de su respuesta.
//
// A proposito NO se usa otro LLM como juez. Un juez-LLM introduce su propio
// criterio y su propia varianza, y despues no se puede discutir por que un
// modelo salio mejor que otro. Acá todo se reduce a: ¿dijo un precio que no
// existe? ¿nego un uso que el producto tiene? ¿narro su proceso? Eso se mide
// con una comparacion, no con una opinion.
//
// Las reglas viven en casos/casos.json, una por falla real que ya nos paso.

const unicodedata = { strip: (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "") };

function sa(text) {
  return unicodedata.strip(String(text || "")).toLowerCase();
}

// Mismos patrones que el filtro de send-text. Si un modelo narra su proceso, es
// una falla grave: el cliente termina leyendo el plan interno del bot.
const TOOL_NAMES = [
  "complete_task", "handoff_to_human", "save_variable", "get_variable",
  "enter_waiting", "send_media", "send_notification_to_user", "send_text",
  "get_whatsapp_context", "product_media_lookup", "shopify_product_lookup",
  "check_coverage", "create_shopify_order", "customer_lookup", "send_buttons",
  "quote_order", "notify_team", "save_order_state",
];

const NARRACION = [
  /\bprocedo\s+con\b/i, /\bahora\s+(procedo|llamo|completo|envio|uso)\b/i,
  /\bvoy\s+a\s+(llamar|usar|ejecutar|invocar)\b/i, /\bpaso\s+\d+\s*:/i,
  /\bel\s+resultado\s+(muestra|devolvio|indica)\b/i, /\bambos\s+valores\s+existen\b/i,
  /\bla\s+herramienta\s+(devolvio|indica|dice)\b/i, /\bcompleto\s+la\s+tarea\b/i,
  /\bsegun\s+(las\s+)?instrucciones\b/i, /\bdebo\s+(llamar|usar|ejecutar|enviar)\b/i,
  /\bbusqueda\s+de\s+medios\b/i, /\bno\s+(devolvio|arrojo)\s+(resultados|nada|datos)\b/i,
];

// Extrae los montos en soles que el modelo le dijo al cliente.
// Ignora numeros que no son precios (cantidades, capsulas, ml, dias de garantia).
function preciosMencionados(texto) {
  const out = [];
  const re = /S\/\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi;
  let m;
  while ((m = re.exec(String(texto || "")))) {
    const n = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

const REGLAS = {
  // El modelo NO puede decir estas palabras.
  prohibido_texto(regla, ctx) {
    const t = sa(ctx.textoCliente);
    const hits = (regla.valor || []).filter((v) => t.includes(sa(v)));
    return hits.length
      ? { ok: false, detalle: `dijo ${hits.map((h) => JSON.stringify(h)).join(", ")}` }
      : { ok: true };
  },

  prohibido_regex(regla, ctx) {
    const t = sa(ctx.textoCliente);
    const hits = (regla.valor || []).filter((p) => new RegExp(p, "i").test(t));
    return hits.length ? { ok: false, detalle: `matcheo ${hits[0]}` } : { ok: true };
  },

  requerido_texto(regla, ctx) {
    const t = sa(ctx.textoCliente);
    return (regla.valor || []).some((v) => t.includes(sa(v)))
      ? { ok: true }
      : { ok: false, detalle: `falto mencionar ${JSON.stringify(regla.valor)}` };
  },

  requerido_regex(regla, ctx) {
    const t = sa(ctx.textoCliente);
    return (regla.valor || []).some((p) => new RegExp(p, "i").test(t))
      ? { ok: true }
      : { ok: false, detalle: `no matcheo ${JSON.stringify(regla.valor)}` };
  },

  // La falla mas cara: cotizar un monto que no existe en el catalogo.
  precio_valido(regla, ctx) {
    const dichos = preciosMencionados(ctx.textoCliente);
    if (!dichos.length) return { ok: true, detalle: "no menciono precios" };
    const validos = new Set((regla.valor || []).map(Number));
    // Tolerancia de 1 sol: los modelos a veces redondean el precio por unidad.
    const malos = dichos.filter((d) => ![...validos].some((v) => Math.abs(v - d) <= 1));
    return malos.length
      ? { ok: false, detalle: `precios inventados: ${malos.map((m) => `S/${m}`).join(", ")} (validos: ${[...validos].join(", ")})` }
      : { ok: true };
  },

  // Para busquedas ambiguas o productos agotados: no se cotiza NADA.
  sin_precio(regla, ctx) {
    const dichos = preciosMencionados(ctx.textoCliente);
    return dichos.length
      ? { ok: false, detalle: `cotizo ${dichos.map((d) => `S/${d}`).join(", ")} cuando no debia` }
      : { ok: true };
  },

  sin_narracion(regla, ctx) {
    const t = ctx.textoCliente;
    const porNombre = TOOL_NAMES.filter((n) => sa(t).includes(n));
    const porPatron = NARRACION.filter((re) => re.test(unicodedata.strip(t)));
    return (porNombre.length || porPatron.length)
      ? { ok: false, detalle: `narro (${porNombre[0] || porPatron[0]})` }
      : { ok: true };
  },

  herramienta_esperada(regla, ctx) {
    const faltan = (regla.valor || []).filter((h) => !ctx.herramientasLlamadas.includes(h));
    return faltan.length
      ? { ok: false, detalle: `no llamo ${faltan.join(", ")}` }
      : { ok: true };
  },
};

// ctx = { textoCliente, herramientasLlamadas }
function evaluarCaso(caso, ctx) {
  const resultados = (caso.reglas || []).map((regla) => {
    const fn = REGLAS[regla.tipo];
    if (!fn) return { regla: regla.tipo, ok: false, detalle: "regla desconocida" };
    const r = fn(regla, ctx);
    return { regla: regla.tipo, ok: r.ok, detalle: r.detalle || null, porque: regla.porque || null };
  });
  const pasadas = resultados.filter((r) => r.ok).length;
  return {
    caso: caso.id,
    pasadas,
    total: resultados.length,
    ok: pasadas === resultados.length,
    resultados,
  };
}

module.exports = { evaluarCaso, preciosMencionados, REGLAS };
