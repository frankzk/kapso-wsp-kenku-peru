#!/usr/bin/env node
// Test de send-presentation (fetch y pausas mockeados: no manda nada real).
// Correr: node functions/send-presentation/test/presentation.test.cjs
//
// Lo que se protege: que la variante de control NUNCA reciba la presentacion
// automatica, que los leads sin telefono vayan por `recipient`, que un fallo a
// mitad corte y avise que falta, y que el precio y las promos digan lo mismo
// que despues cotiza quote-order.
const path = require("path");
const fs = require("fs");
const assert = require("assert");
const raiz = path.join(__dirname, "..", "..");
require(path.join(raiz, "send-presentation", "index.js"));
require(path.join(raiz, "quote-order", "index.js"));
require(path.join(raiz, "send-text", "index.js"));
const P = globalThis.__kenkuSendPresentation;
const { quoteGroup } = globalThis.__kenkuQuoteOrder;
const SendText = globalThis.__kenkuSendText;

const LOOKUP_FN = "21cd24f1-ed57-4303-988c-043bf4bc8069";
const MEDIA_FN = "d4e6365e-4736-4e92-872a-259adb6634f2";

// --- Fixtures: la forma real que devuelven las dos funciones (capturada 2026-09-26) ---
const producto = (over = {}) => ({
  found: true, reliableMatch: true, outOfStock: false,
  product: {
    handle: "magnesio-12-en-1",
    title: "Magnesio 12 en 1 Complex – Cápsulas para Energía, Relajación Muscular y Bienestar Integral (120 Cápsulas)",
    variants: [{ id: "v1", availableForSale: true, price: 149, compareAtPrice: 250 }],
    ...over,
  },
});
const MEDIA_COMPLETA = {
  ok: true, found: true, media: [
    { type: "image", role: "principal", url: "https://cdn/principal.jpg" },
    { type: "image", role: "antes_despues", url: "https://cdn/ad.jpg" },
    { type: "video", role: "video", url: "https://cdn/v.mp4" },
    { type: "image", role: "testimonio", url: "https://cdn/t.jpg" },
  ],
};
const MEDIA_MINIMA = { ok: true, found: true, media: [{ type: "image", role: "principal", url: "https://cdn/p.jpg" }] };

let enviados, pausas, falloEnvioN;
function mock({ lookup = producto(), media = MEDIA_COMPLETA } = {}) {
  enviados = []; pausas = []; falloEnvioN = null;
  P.deps.dormir = async (ms) => { pausas.push({ ms, antesDelEnvio: enviados.length }); };
  P.deps.azar = () => 0.5;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes(`/functions/${LOOKUP_FN}/invoke`)) return resp(lookup);
    if (u.includes(`/functions/${MEDIA_FN}/invoke`)) return resp(media);
    if (u.endsWith("/messages")) {
      const body = JSON.parse(opts.body);
      if (falloEnvioN !== null && enviados.length === falloEnvioN) return resp({ error: { code: 131000 } }, 400);
      enviados.push(body);
      return resp({ messages: [{ id: `wamid.${enviados.length}` }] });
    }
    throw new Error(`fetch inesperado: ${u}`);
  };
}
const resp = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });

const CON_TEL = { conversation: { id: "c1", phone_number_id: "1239315459260256", phone_number: "51965391481" } };
const SOLO_BSUID = { conversation: { id: "c2", phone_number_id: "1239315459260256", business_scoped_user_id: "PE.948592654941065" } };

async function correr({ vars = { ab_variant: "D" }, wa = CON_TEL, input = {} } = {}) {
  const payload = {
    input: { product: "magnesio-12-en-1", saludo: "¡Hola Federico! Soy *Akemi* de Kenku 😊", beneficio: "Recupera tu energía y mejora tu descanso de forma natural 🌿", ...input },
    whatsapp_context: wa,
    execution_context: { vars },
  };
  const res = await P.handleRequest({ text: async () => JSON.stringify(payload) }, { KAPSO_API_KEY: "k-test" });
  return JSON.parse(await res.text());
}
const tipos = () => enviados.map((b) => b.type);

const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

// --- La separacion del experimento ---
caso("variante A: se niega y no manda nada", async () => {
  mock(); const r = await correr({ vars: { ab_variant: "A" } });
  assert.strictEqual(r.reason, "variante_control"); assert.strictEqual(enviados.length, 0);
});
caso("sin variante: se niega (lead sin telefono o viejo)", async () => {
  mock(); const r = await correr({ vars: {} });
  assert.strictEqual(r.reason, "variante_control"); assert.strictEqual(enviados.length, 0);
});
caso("variante N (sin telefono, fuera del experimento): se niega", async () => {
  mock(); const r = await correr({ vars: { ab_variant: "N" } });
  assert.strictEqual(r.reason, "variante_control");
});

// --- La secuencia ---
caso("media completa: 8 pasos en el orden del prompt", async () => {
  mock(); const r = await correr();
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.enviados, ["saludo", "foto_principal", "foto_antes_despues", "video", "beneficio", "precio", "testimonio", "pregunta_final"]);
  assert.deepStrictEqual(tipos(), ["text", "image", "image", "video", "text", "text", "image", "interactive"]);
  assert.strictEqual(enviados[3].video.caption, "Mira este video corto del *Magnesio 12 en 1 Complex* 🎬");
  assert.strictEqual(enviados[6].image.caption, "Lo que dicen nuestros clientes 💬");
  assert.ok(!("caption" in enviados[2].image), "la foto antes/despues va sin caption");
});
caso("solo foto principal: omite sin avisar lo que no hay", async () => {
  mock({ media: MEDIA_MINIMA }); const r = await correr();
  assert.deepStrictEqual(r.enviados, ["saludo", "foto_principal", "beneficio", "precio", "pregunta_final"]);
});
caso("sin ninguna media: los textos y los botones van igual", async () => {
  mock({ media: null }); const r = await correr();
  assert.deepStrictEqual(r.enviados, ["saludo", "beneficio", "precio", "pregunta_final"]);
});
caso("pregunta final sin direccion: Lima / Provincia", async () => {
  mock(); await correr();
  const i = enviados.at(-1).interactive;
  assert.strictEqual(i.body.text, "Por cierto 😊, ¿te encuentras en *Lima* o en *provincia*?");
  assert.deepStrictEqual(i.action.buttons.map((b) => b.reply.title), ["Lima", "Provincia"]);
});
caso("pregunta final con direccion conocida: la confirma", async () => {
  mock(); await correr({ vars: { ab_variant: "D", known_address: "Av. Arequipa 123, Lince" } });
  const i = enviados.at(-1).interactive;
  assert.ok(i.body.text.includes("Av. Arequipa 123, Lince"));
  assert.deepStrictEqual(i.action.buttons.map((b) => b.reply.title), ["Si, la misma", "Cambiar direccion"]);
});

// --- Ritmo ---
caso("pausa entre cada envio, nunca antes del primero", async () => {
  mock(); await correr();
  assert.strictEqual(pausas.length, enviados.length - 1);
  assert.ok(pausas.every((p) => p.antesDelEnvio >= 1));
});
caso("pausa mas larga despues del video", async () => {
  mock(); await correr();
  assert.strictEqual(pausas[3].ms, 4500);            // despues del paso 4 (video)
  assert.ok(pausas.filter((_, i) => i !== 3).every((p) => p.ms >= 2000 && p.ms <= 4000));
});

// --- Destinatario (la leccion BSUID de CLAUDE.md) ---
caso("lead con telefono: va en `to`", async () => {
  mock(); await correr();
  assert.ok(enviados.every((b) => b.to === "51965391481" && !("recipient" in b)));
});
caso("lead solo con BSUID: va en `recipient`, nunca en `to`", async () => {
  mock(); await correr({ wa: SOLO_BSUID });
  assert.ok(enviados.length > 0);
  assert.ok(enviados.every((b) => b.recipient === "PE.948592654941065" && !("to" in b)));
});

// --- Falla a mitad ---
caso("falla el 4to envio: corta, no manda nada mas y dice que falta", async () => {
  mock(); falloEnvioN = 3;
  const r = await correr();
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, "envio_parcial");
  assert.deepStrictEqual(r.enviados, ["saludo", "foto_principal", "foto_antes_despues"]);
  assert.strictEqual(r.fallo.paso, "video");
  assert.deepStrictEqual(r.pendientes.map((p) => p.paso), ["video", "beneficio", "precio", "testimonio", "pregunta_final"]);
  assert.strictEqual(enviados.length, 3, "no siguio mandando despues del error");
  assert.strictEqual(r.pendientes[2].texto.split("\n")[0].startsWith("*Magnesio 12 en 1 Complex* queda en"), true);
});
caso("falla el primero: no se mando nada, presenta a mano", async () => {
  mock(); falloEnvioN = 0;
  const r = await correr();
  assert.strictEqual(r.reason, "envio_parcial"); assert.deepStrictEqual(r.enviados, []);
  assert.ok(r.message.startsWith("No se envio nada"));
});

// --- Casos que NO son limpios: se devuelven al agente sin mandar nada ---
caso("agotado", async () => {
  mock({ lookup: { ...producto(), outOfStock: true } }); const r = await correr();
  assert.strictEqual(r.reason, "agotado"); assert.strictEqual(enviados.length, 0);
});
caso("busqueda ambigua", async () => {
  mock({ lookup: { ...producto(), reliableMatch: false } }); const r = await correr();
  assert.strictEqual(r.reason, "producto_ambiguo"); assert.strictEqual(enviados.length, 0);
});
caso("no encontrado / lookup caido", async () => {
  mock({ lookup: null }); const r = await correr();
  assert.strictEqual(r.reason, "producto_no_encontrado"); assert.strictEqual(enviados.length, 0);
});
caso("precio distinto segun variante", async () => {
  mock({ lookup: producto({ variants: [
    { availableForSale: true, price: 149 }, { availableForSale: true, price: 179 },
  ] }) });
  const r = await correr();
  assert.strictEqual(r.reason, "precio_variable"); assert.strictEqual(enviados.length, 0);
});
caso("variante agotada con otro precio no cuenta", async () => {
  mock({ lookup: producto({ variants: [
    { availableForSale: true, price: 149, compareAtPrice: 250 }, { availableForSale: false, price: 179 },
  ] }) });
  const r = await correr();
  assert.strictEqual(r.ok, true);
});
caso("beneficio con precio: se rechaza", async () => {
  mock(); const r = await correr({ input: { beneficio: "Solo S/ 149 y te cambia la vida" } });
  assert.strictEqual(r.reason, "beneficio_con_precio"); assert.strictEqual(enviados.length, 0);
});
caso("saludo que es pura narracion: se rechaza", async () => {
  mock(); const r = await correr({ input: { saludo: "Ahora procedo con el shopify_product_lookup" } });
  assert.strictEqual(r.reason, "faltan_textos"); assert.strictEqual(enviados.length, 0);
});

// --- El precio: tiene que decir lo mismo que despues cotiza quote-order ---
caso("linea de precio exacta (con ancla y envio gratis)", async () => {
  const t = P.lineaPrecio({ nombre: "Magnesio 12 en 1 Complex", precio: 149, antes: 250, unidad: P.unidadDe("Magnesio") });
  assert.strictEqual(t, [
    "*Magnesio 12 en 1 Complex* queda en *S/ 149* por unidad (antes *S/ 250*) con *envío gratis* 📦, en la mayoría de zonas *pagas al recibir* y con *garantía de 30 días* 🛡️ 😊.",
    "",
    "🔥 Promociones disponibles:",
    "• 1 unidad: *S/ 149*",
    "• 3x2: Lleva 3 unidades por *S/ 298* (pagas solo 2)",
    "• 5x3: Lleva 5 unidades por *S/ 447* (pagas solo 3)",
  ].join("\n"));
});
caso("sin envio gratis a S/40 o menos (mismo umbral que quote-order)", async () => {
  const src = fs.readFileSync(path.join(raiz, "quote-order", "index.js"), "utf8");
  const umbral = Number(src.match(/FREE_SHIPPING_THRESHOLD\s*=\s*(\d+)/)[1]);
  const u = P.unidadDe("x");
  assert.ok(!P.lineaPrecio({ nombre: "X", precio: umbral, unidad: u }).includes("envío gratis"));
  assert.ok(P.lineaPrecio({ nombre: "X", precio: umbral + 1, unidad: u }).includes("envío gratis"));
});
caso("3x2 y 5x3 iguales a los de quote-order", async () => {
  for (const precio of [149, 99, 134.1, 35]) {
    const t = P.lineaPrecio({ nombre: "X", precio, unidad: P.unidadDe("x") });
    for (const q of [3, 5]) {
      const esperado = quoteGroup([{ productTitle: "X", quantity: q, unitPrice: precio }]).subtotalAfterDiscount;
      const montos = [...t.matchAll(new RegExp(`Lleva ${q} unidades por \\*S/ ([\\d.]+)\\*`, "g"))].map((m) => Number(m[1]));
      assert.deepStrictEqual(montos, [esperado], `precio ${precio}, ${q} unidades`);
    }
  }
});
caso("sin ancla si no hay compareAt", async () => {
  assert.ok(!P.lineaPrecio({ nombre: "X", precio: 149, antes: null, unidad: P.unidadDe("x") }).includes("antes"));
});

// --- Unidad / par: la falla de la pulsera ---
caso("pulsera, capsulas, shampoo: unidad", async () => {
  for (const t of ["Pulsera Magnética de Cobre", "Magnesio 12 en 1 (120 Cápsulas)", "Shampoo Anticaída", "Serum de Uñas"]) {
    assert.strictEqual(P.unidadDe(t).sing, "unidad", t);
  }
});
caso("calzado y medias: par", async () => {
  for (const t of ["Zapatillas Ortopédicas", "Medias de Compresión", "Pantuflas Térmicas", "Sandalia Anatómica"]) {
    assert.strictEqual(P.unidadDe(t).sing, "par", t);
  }
});

// --- Nombre corto ---
caso("nombre corto desde el titulo", async () => {
  assert.strictEqual(P.nombreCorto("Magnesio 12 en 1 Complex – Cápsulas para Energía"), "Magnesio 12 en 1 Complex");
  assert.strictEqual(P.nombreCorto("SUPER HUMAN Ethiopian Black Seed Oil – Aceite de Semilla Negra"), "SUPER HUMAN Ethiopian Black Seed Oil");
  assert.strictEqual(P.nombreCorto("Vital Moo™ - Calostro Bovino en Polvo"), "Vital Moo™");
});
caso("si el agente manda `nombre`, se usa ese", async () => {
  mock(); await correr({ input: { nombre: "Vital Moo™ Calostro Bovino" } });
  assert.strictEqual(enviados[1].image.caption, "Vital Moo™ Calostro Bovino");
});

// --- El sanitizador es copia del de send-text: no puede divergir ---
caso("sanitizador identico al de send-text", async () => {
  for (const t of [
    "¡Hola Federico! Soy *Akemi* de Kenku 😊",
    "Ambos valores existen, asi que procedo con el product_media_lookup",
    "Refuerza tus defensas. Ahora completo la tarea.",
    "Según las instrucciones debo enviar el saludo",
    "🙌",
  ]) {
    assert.deepStrictEqual(P.sanitize(t).clean, SendText.sanitize(t).clean, t);
  }
});

(async () => {
  let fallos = 0;
  for (const [nombre, fn] of casos) {
    try { await fn(); console.log(`ok    ${nombre}`); }
    catch (e) { fallos += 1; console.log(`FALLA ${nombre}\n      ${e.message.split("\n")[0]}`); }
  }
  console.log(`\n${casos.length - fallos}/${casos.length}`);
  process.exit(fallos ? 1 : 0);
})();
