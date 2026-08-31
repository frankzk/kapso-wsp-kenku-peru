#!/usr/bin/env node
// Regresion del telefono en el estado del pedido.
//
// Caso real (31/08/2026, Javier, Huancan/Huancayo, Nails Repairing): `phone`
// estaba en REQUIRED pero nadie lo sembraba con el numero del propio chat, asi
// que el estado salia con missing=[phone]. El agente se lo pidio al cliente, el
// cliente respondio tres veces con el numero de su propio chat (940823875) y el
// bot le contesto "no es un celular valido" cada vez. Termino en alerta al
// equipo y la conversacion cortada por loop-guard.
//
// Correr:  node functions/save-order-state/test/phone.test.cjs

const fs = require("fs");
const path = require("path");

// El archivo registra un listener de `fetch` al cargarse (runtime de Kapso);
// en Node se evalua sin esa parte.
const source = fs
  .readFileSync(path.join(__dirname, "..", "index.js"), "utf8")
  .replace('if (typeof addEventListener === "function") {', "if (false) {");
(0, eval)(source); // eval indirecto: se evalua en el scope global, no en este modulo

const { buildState, chatPhone, isPeruMobile, pickPhoneLoose, handleRequest } = globalThis.__kenkuSaveOrderState;

let failures = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FALLO ${label}\n  esperado: ${e}\n  obtenido: ${a}`);
  }
}

// --- el numero del cliente es valido y siempre lo fue ---------------------
check("isPeruMobile(940823875)", isPeruMobile("940823875"), true);
check("isPeruMobile(51940823875)", isPeruMobile("51940823875"), true);
check("isPeruMobile(+51 940 823 875)", isPeruMobile("+51 940 823 875"), true);
check("isPeruMobile(fijo 064213456)", isPeruMobile("064213456"), false);
check("isPeruMobile(vacio)", isPeruMobile(""), false);

check("buildState(phone) lo guarda", buildState({}, { phone: "940823875" }).state.phone, "940823875");

// --- alias que antes se perdian en silencio -------------------------------
for (const alias of ["customer_phone", "phone_number", "numero_celular", "telefono_contacto", "movil"]) {
  check(`alias ${alias}`, buildState({}, { [alias]: "940823875" }).state.phone, "940823875");
}
check("phone_number_id no se toma como telefono", pickPhoneLoose({ phone_number_id: "1239315459260256" }), undefined);
check("conversationId no se toma como telefono", pickPhoneLoose({ conversationId: "33d9f4f1" }), undefined);

// --- el numero del chat -----------------------------------------------------
check(
  "chatPhone desde execution_context",
  chatPhone({ execution_context: { context: { phone_number: "51940823875" } } }),
  "51940823875",
);
check(
  "chatPhone desde wa_id",
  chatPhone({ execution_context: { context: { contact: { wa_id: "51940823875" } } } }),
  "51940823875",
);
check(
  "chatPhone desde whatsapp_context",
  chatPhone({ whatsapp_context: { conversation: { phone_number: "51940823875" } } }),
  "51940823875",
);
check("chatPhone sin datos", chatPhone({}), "");

// --- el flujo completo: lo que le pasaba a Javier -------------------------
async function post(body) {
  const req = new Request("https://f.test/", { method: "POST", body: JSON.stringify(body) });
  const res = await handleRequest(req, {});
  return res.json();
}

const CHAT = { execution_context: { context: { phone_number: "51940823875" } } };

(async () => {
  // 1) El agente guarda los datos de envio SIN telefono: no debe faltar, porque
  //    el numero del chat ya es el contacto.
  const out = await post({
    ...CHAT,
    input: {
      district: "Huancan",
      province: "Huancayo",
      quantity: 1,
      address: "Santiago Carhuamaca 472",
      receiver_name: "Javier Zanabria",
    },
  });
  check("no pide telefono si el chat lo expone", out.missing, []);
  check("siembra el telefono del chat", out.saved.phone, "940823875");
  check("estado completo", out.complete, true);
  check("lo expone como variable", out.vars.order_phone, "940823875");

  // 2) Lead por username (el chat NO expone numero): ahi si falta y hay que pedirlo.
  const sinChat = await post({
    input: { district: "Huancan", province: "Huancayo", quantity: 1, address: "Santiago Carhuamaca 472", receiver_name: "Javier Zanabria" },
  });
  check("sin numero en el chat si lo pide", sinChat.missing, ["phone"]);

  // 3) El cliente manda su propio numero: se acepta, nada que reprocharle.
  const conNumero = await post({ ...CHAT, input: { phone: "940823875" } });
  check("acepta el numero del cliente", conNumero.saved.phone, "940823875");
  check("sin rechazos", conNumero.rejected, []);
  check("ok=true", conNumero.ok, true);

  // 4) El cliente da un fijo: se conserva el del chat y el agente NO debe
  //    decirle al cliente que su numero es invalido.
  const fijo = await post({ ...CHAT, input: { phone: "064213456" } });
  check("fijo -> se queda el del chat", fijo.saved.phone, "940823875");
  check("fijo -> no lo reporta como rechazo", fijo.rejected, []);
  check("fijo -> avisa al agente que no lo mencione", fijo.message.includes("NO le digas al cliente que su numero es invalido"), true);

  if (failures > 0) {
    console.error(`\n${failures} verificacion(es) fallaron`);
    process.exit(1);
  }
  console.log("OK: telefono del pedido (siembra desde el chat y alias tolerantes)");
})();
