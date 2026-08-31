#!/usr/bin/env node
// Regresion del contacto de entrega: si el chat expone el celular del cliente,
// un telefono raro que mande el agente no puede tumbar el pedido.
//
// La puerta `phone_missing` existe para los leads que entran por username de
// WhatsApp (ahi el chat NO trae numero y sin celular el cliente queda
// inubicable). Este test fija las dos mitades: con numero en el chat el pedido
// avanza siempre; sin numero en el chat la puerta sigue cerrada.
//
// Correr:  node functions/create-shopify-order/test/phone.test.cjs

const path = require("path");

require(path.join(__dirname, "..", "index.js"));
const { applyContactPhoneFallback, buildNote, enrichCustomerFromContext, isPeruMobile, normalizePhone } =
  globalThis.__kenkuCreateShopifyOrder;

let failures = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FALLO ${label}\n  esperado: ${e}\n  obtenido: ${a}`);
  }
}

// --- isPeruMobile ---------------------------------------------------------
for (const value of ["940823875", "51940823875", "+51 940 823 875", "+51-940-823-875"]) {
  check(`isPeruMobile(${value})`, isPeruMobile(value), true);
}
for (const value of ["", "no tengo", "064123456", "12345", "999", "5164123456"]) {
  check(`isPeruMobile(${value})`, isPeruMobile(value), false);
}

// --- fallback al numero del chat -----------------------------------------
// 1) El agente no manda telefono: se usa el del chat.
{
  const input = { customer: {}, whatsappPhone: "51940823875" };
  applyContactPhoneFallback(input);
  check("sin telefono -> usa el del chat", input.customer.phone, "+51940823875");
  check("sin telefono -> sin alternativo", input.alternatePhone, undefined);
}

// 2) Un fijo de Huancayo: se usa el del chat y el fijo queda anotado.
{
  const input = { customer: { phone: "064 213456" }, whatsappPhone: "51940823875" };
  applyContactPhoneFallback(input);
  check("fijo -> usa el del chat", input.customer.phone, "+51940823875");
  check("fijo -> queda anotado", input.alternatePhone, "064 213456");
}

// 3) Texto en vez de numero ("por coordinar"): mismo fallback.
{
  const input = { customer: { phone: "por coordinar" }, whatsappPhone: "+51 940 823 875" };
  applyContactPhoneFallback(input);
  check("texto -> usa el del chat", input.customer.phone, "+51940823875");
  check("texto -> queda anotado", input.alternatePhone, "por coordinar");
}

// 4) Celular alternativo valido: manda el del cliente, normalizado.
{
  const input = { customer: { phone: "918 100 477" }, whatsappPhone: "51940823875" };
  applyContactPhoneFallback(input);
  check("celular alternativo -> se respeta", input.customer.phone, "+51918100477");
  check("celular alternativo -> sin nota", input.alternatePhone, undefined);
}

// 5) El mismo numero del chat escrito distinto: no se anota como alternativo.
{
  const input = { customer: { phone: "940823875" }, whatsappPhone: "+51940823875" };
  applyContactPhoneFallback(input);
  check("mismo numero -> normalizado", input.customer.phone, "+51940823875");
  check("mismo numero -> sin nota", input.alternatePhone, undefined);
}

// 6) Lead por username (el chat no expone numero): la puerta phone_missing
//    sigue cerrada, no se inventa un contacto.
{
  const input = { customer: { phone: "12345" } };
  applyContactPhoneFallback(input);
  check("sin chat -> deja lo que vino", input.customer.phone, "12345");
  check("sin chat -> sigue sin ser celular valido", isPeruMobile(input.customer.phone), false);
}

// --- el numero del chat llega por el contexto de la conversacion ----------
{
  const input = { customer: { phone: "no tiene" } };
  enrichCustomerFromContext(input, {
    execution_context: { context: { phone_number: "51940823875", contact: { name: "Javier Zanabria" } } },
  });
  check("contexto -> guarda el numero del chat", input.whatsappPhone, "51940823875");
  applyContactPhoneFallback(input);
  check("contexto -> usa el numero del chat", input.customer.phone, "+51940823875");
  check("contexto -> toma el nombre", input.customer.name, "Javier Zanabria");
}

// --- la nota de la orden muestra el alternativo --------------------------
{
  const input = {
    customer: {
      name: "Javier Zanabria",
      phone: "064 213456",
      address: "Santiago Carhuamaca 472",
      district: "Huancan",
      province: "Huancayo",
    },
    whatsappPhone: "51940823875",
    quote: { total: 89 },
    lineItems: [{ quantity: 1, productTitle: "Nails Repairing" }],
  };
  applyContactPhoneFallback(input);
  const note = buildNote(input, null);
  check("nota -> contacto con el numero del chat", note.includes("Contacto: Javier Zanabria · +51940823875"), true);
  check("nota -> el otro numero queda a la vista", note.includes("Otro numero que dio el cliente: 064 213456"), true);
}

// --- normalizePhone no rompe casos ya soportados -------------------------
check("normalizePhone(9 digitos)", normalizePhone("940823875"), "+51940823875");
check("normalizePhone(con 51)", normalizePhone("51940823875"), "+51940823875");
check("normalizePhone(vacio)", normalizePhone(""), "");

if (failures > 0) {
  console.error(`\n${failures} verificacion(es) fallaron`);
  process.exit(1);
}
console.log("OK: contacto de entrega (fallback al numero de WhatsApp)");
