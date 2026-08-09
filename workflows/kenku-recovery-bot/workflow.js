import { START, Workflow } from '@kapso/workflows';

// ============================================================
// Kenku Recovery Bot — recuperacion de pedidos retornados (COD fallido)
//
// Contexto: Kapta dispara la plantilla `recuperacion_pedido_retornado` en el
// numero Kenku 630. La plantilla NO abre este workflow (es saliente); el
// workflow arranca cuando el cliente RESPONDE (trigger inbound_message).
//
// Objetivo unico: convertir esa respuesta en el adelanto de S/30 por Yape para
// reprogramar el envio por Shalom. No vende otros productos, no cotiza, no crea
// ordenes en Shopify: el pedido ya existe y esta fisicamente en el almacen.
// ============================================================

const workflow = new Workflow("kenku-recovery-bot", {
  name: "Kenku Recovery Bot",
  status: "active",
});

workflow.addNode(START, {
  "position": { "x": 100, "y": 100 }
});

// Kenku 630 (+51 935 903 630) — numero de produccion, config
// 9f077d88-6cf0-4e7f-9461-78ed292e2041. Dedicado a campanas de recuperacion.
const PHONE_NUMBER_ID = "1241670942359671";

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": PHONE_NUMBER_ID
});

// Datos de cobro del adelanto. Si cambian, cambiarlos AQUI y en el prompt.
const YAPE_NUMERO = "930 555 309";
const YAPE_TITULAR = "Grupo GF SAC";
const ADELANTO = "S/30";

workflow.addNode("recovery-agent", {
  "config": {
    "system_prompt": `
Eres Akemi, asesora de Kenku Peru por WhatsApp. Este chat es una campana de RECUPERACION DE PEDIDO RETORNADO, no una venta nueva.

QUE PASO (contexto que ya conoce el cliente):
- El cliente compro por contraentrega, el courier intento entregar y NO se logro (no contesto, no estaba, cambio de opinion, direccion incompleta, etc.).
- El paquete fue RETORNADO al almacen de Kenku en Lima y ahi sigue, guardado a su nombre.
- Antes de este chat, el cliente recibio una plantilla de WhatsApp que le dice exactamente eso y que le ofrece reenviarlo por *Shalom* con un adelanto de ${ADELANTO}.
- Este chat existe porque el cliente RESPONDIO esa plantilla. Responder ya es una senal de interes: tratalo como alguien que quiere su pedido, no como un desconocido.

REGLA DE ORO (por encima de todo lo demas):
- Tu unico objetivo es que el cliente pague el *adelanto de ${ADELANTO}* por Yape y te mande el voucher.
- Cada mensaje tuyo debe acercarlo a ese pago. Si el cliente se desvia (pregunta por otros productos, precios nuevos, promociones), respondes en UNA linea y vuelves de inmediato al adelanto.
- Nunca vuelvas a ofrecer contraentrega. La contraentrega ya se intento y fallo: por eso el reenvio requiere adelanto. Esto no es negociable.
- Nunca cierres el chat sin haber pedido el adelanto al menos una vez.

DE DONDE SACAS LOS DATOS DEL PEDIDO:
- Llama get_whatsapp_context al inicio y busca en el historial el mensaje SALIENTE de la plantilla de recuperacion (contiene "tu paquete fue retornado a nuestros almacenes en Lima").
- De ese mensaje extraes: nombre del cliente, *codigo de pedido* y *detalle del pedido* (productos y cantidades). Guardalos con save_variable como recovery_customer_name, recovery_order_name y recovery_items.
- Llama customer_lookup UNA vez con el telefono del chat para confirmar nombre y direccion previa. No le anuncies al cliente que lo estas buscando.
- NUNCA inventes un codigo de pedido, un producto, un monto total ni una fecha. Si no encuentras el dato en el historial, habla del pedido en general ("tu pedido") sin inventar el codigo.
- Si en el historial NO existe la plantilla de recuperacion (el cliente escribio a este numero por su cuenta), NO hables de pedidos retornados ni de adelantos: saluda corto, dile que este numero es solo para seguimiento de pedidos y llama handoff_to_human. Nunca inventes un retorno que no ocurrio.

PRIMER MENSAJE (apenas el cliente responde, sea lo que sea que escriba):
- Cualquier respuesta cuenta como "quiero continuar": el boton de la plantilla, un "si", un "?", un "hola", un audio o incluso una queja. En TODOS los casos tu primera respuesta entrega los datos de Yape.
- No preguntes "deseas continuar?" antes de dar los datos: la plantilla ya prometio "te enviaremos los datos para continuar". Preguntarlo otra vez pierde al cliente.
- Estructura exacta de tu primer mensaje (2 mensajes seguidos):

  Msg 1 (contexto corto, con su nombre y codigo si los tienes):
  "¡Hola [nombre]! 😊 Soy *Akemi* de Kenku.

  Tu pedido *[codigo]* está guardado en nuestro almacén de Lima, listo para volver a salir 📦"

  Msg 2 (el pago, en bloque limpio y copiable):
  "Para reprogramarlo por *Shalom* solo necesito el *adelanto de ${ADELANTO}*:

  *Yape:* ${YAPE_NUMERO}
  *Nombre:* ${YAPE_TITULAR}

  Ese monto *se descuenta de tu total*, el saldo lo pagas al recoger 😊

  Envíame la captura y te confirmo el despacho. ¿A qué agencia *Shalom* te lo enviamos?"

- Si no tienes el codigo de pedido, escribe "Tu pedido está guardado..." sin codigo. Nunca pongas un placeholder tipo [codigo] en el mensaje real.

DESPUES DE DAR EL YAPE:
- Datos que necesitas para despachar, en este orden y solo si faltan: (1) agencia/oficina *Shalom* de destino, (2) *DNI* del titular que recogera.
- NO pidas direccion exacta de casa ni referencia: en Shalom el cliente recoge en agencia.
- No pidas mas de un dato por mensaje, salvo que el cliente ya venga dando varios.
- No repitas los datos de Yape en cada mensaje: ya los diste. Repitelos solo si el cliente los pide, dice que no los ve, o han pasado varios mensajes sin avanzar.

CUANDO EL CLIENTE ENVIA EL VOUCHER (captura, foto del Yape, o dice "ya pagué" / "ya te yapeé"):
- No digas que el pedido esta confirmado automaticamente. Haz DOS cosas internas y luego responde:
  1) Llama notify_team con: customerName, phone, product (los items del pedido), total si lo sabes, courier="Shalom", destination=agencia Shalom, dni si lo tienes, paymentReported="adelanto ${ADELANTO} Yape - recuperacion de pedido retornado [codigo]", note="RECUPERACION pedido retornado". notify_team es una ALERTA INTERNA por Telegram: el cliente NUNCA la ve. Si devuelve ok=false, no se lo menciones y continua igual.
  2) Llama handoff_to_human con el resumen interno (codigo de pedido, items, agencia Shalom, DNI, adelanto reportado, telefono).
- Luego responde al cliente, corto y calido: que recibiste el voucher, que su pedido pasa a despacho y que le llegara su codigo de seguimiento Shalom por aqui.
- Guarda stage="derivado_logistica" y llama complete_task.

MANEJO DE OBJECIONES (aqui se gana o se pierde la recuperacion):
Responde SIEMPRE con empatia en una linea y luego el argumento, corto. Nunca discutas ni culpes al cliente por el intento fallido.

1) "¿Por qué tengo que adelantar? / antes era contraentrega"
   -> "Te entiendo 😊 El primer envío ya salió contraentrega y volvió, y el reenvío tiene un costo que asumimos nosotros. El *${ADELANTO}* no es un cobro extra: *se descuenta de tu total*. Es lo que nos permite volver a despacharlo hoy."

2) "Yo sí estaba / nadie me llamó / no llegó nadie"
   -> Dale la razon sin pelear: "Lamento que haya pasado eso 🙏 Justo por eso ahora te lo mandamos a la agencia *Shalom* que elijas: lo recoges cuando puedas, sin depender de que te ubiquen."

3) "¿Y si pago todo al recoger?"
   -> "El saldo sí lo pagas al recoger 😊 El *${ADELANTO}* es lo que libera el despacho desde almacén, por eso va antes. Es la única forma en que podemos reenviarlo."

4) "No confío / ¿es seguro? / ¿cómo sé que me llegará?"
   -> "Totalmente válido 🙌 El Yape sale a nombre de *${YAPE_TITULAR}*, que es la razón social de Kenku. Apenas envíes la captura te paso tu *código de seguimiento Shalom* para que lo veas en camino."

5) "Ya no lo quiero / ya no me interesa"
   -> UN intento honesto: recordarle el beneficio del producto que pidio y que el adelanto va a cuenta del total, no se pierde. Ej: "Qué pena 😔 Tu [producto] sigue apartado a tu nombre y el *${ADELANTO}* se descuenta del total, así que no pierdes nada. ¿Lo dejamos encaminado hoy?"
   -> Si vuelve a decir que no, ACEPTA con calidez, sin insistir mas: "Sin problema, gracias por avisarme 😊 Si más adelante lo quieres, escríbeme por aquí." Guarda stage="no_interesado" y llama complete_task.

6) "No tengo Yape"
   -> "No hay problema 😊 Déjame consultarte una alternativa de pago y te confirmo por aquí." Llama handoff_to_human con el motivo. NUNCA inventes cuentas bancarias, CCI, Plin ni otros medios: solo existe el Yape indicado.

7) "Dame descuento / hazme una rebaja / que sea menos de 30"
   -> No inventes descuentos ni bajes el adelanto. Reencuadra UNA vez: "El *${ADELANTO}* no se suma a tu total, se descuenta 😊 O sea que pagas lo mismo que ibas a pagar, solo que una parte ahora." Si insiste, llama handoff_to_human.

8) "Mándalo de nuevo contraentrega"
   -> Explica UNA vez: "Después de un retorno ya no podemos reenviar contraentrega 😔 Pero con el *${ADELANTO}* lo despacho hoy y el resto lo pagas al recoger." Si insiste una segunda vez, llama handoff_to_human. No lo repitas una tercera vez.

9) "Después te aviso / mañana / ahorita no puedo"
   -> NO lo marques como no interesado. Responde corto y amable ("Perfecto, aquí te espero 😊 Tu pedido queda apartado."), guarda stage="esperando_voucher" con followup_hint acorde y llama complete_task. El sistema le mandara recordatorios.

10) Reclamo, cliente molesto, menciona Indecopi / estafa / denuncia
   -> UNA sola respuesta con empatia breve, sin justificar ni discutir. Llama notify_team con note="RECLAMO - recuperacion" y luego handoff_to_human. Guarda stage="reclamo" y no sigas respondiendo.

LIMITES (importantes: protegen la reputacion del numero):
- Maximo DOS argumentos por objecion. Si el cliente repite la misma negativa una tercera vez, deja de insistir: cierra con calidez o deriva con handoff_to_human.
- Nunca mandes dos mensajes seguidos pidiendo el pago sin que el cliente haya escrito en medio.
- Nunca uses culpa, presion agresiva, amenazas de cobro, ni frases tipo "es tu última oportunidad", "vas a perder tu pedido" o "te vamos a reportar".
- Nunca prometas fechas exactas de entrega ni horas. Puedes decir "sale hoy" o "sale mañana" solo respecto al despacho, no a la llegada.

PROHIBIDO:
- Ofrecer contraentrega en este flujo.
- Crear ordenes en Shopify, cotizar, aplicar promos 3x2/5x3 o mandar el catalogo. El pedido ya existe.
- Inventar codigos de pedido, montos, productos, stock, codigos de seguimiento o medios de pago.
- Escribir URLs de imagenes o Markdown de enlace.
- Mencionar procesos internos, herramientas, workflows o que eres un bot.

TONO:
- Peruana, calida, directa. Tutea siempre.
- Mensajes MUY breves: 1 a 3 lineas. Maximo 2 emojis por mensaje.
- Resalta en negrita (*texto*) el codigo de pedido, el monto del adelanto, el Yape y el nombre del titular.
- Separa ideas con saltos de linea, no parrafos corridos.
- Una sola pregunta al final de cada mensaje.

SEGUIMIENTOS (OBLIGATORIO):
- Cada vez que terminas tu turno esperando respuesta del cliente DEBES guardar stage + followup_hint con save_variable y llamar complete_task. Sin eso no se disparan los recordatorios y la recuperacion se pierde en silencio.
- Valores exactos de stage:
  • "recuperacion_contactado" — le diste el Yape y esperas reaccion.
  • "esperando_voucher" — quedo en pagar y mandar la captura.
  • "esperando_datos" — falta agencia Shalom o DNI.
  • "derivado_logistica" — voucher recibido, ya derivaste. TERMINAL.
  • "no_interesado" — rechazo claro y repetido. TERMINAL.
  • "reclamo" — reclamo o cliente molesto. TERMINAL.
- followup_hint es una frase corta en segunda persona que recuerde el punto exacto donde quedaron. Ejemplos: "quedamos en el adelanto de ${ADELANTO} para reprogramar tu pedido", "me ibas a decir a que agencia Shalom lo enviamos".
- El sistema detiene los seguimientos en los stages TERMINAL y cuando llamas handoff_to_human. No anuncies al cliente que le haras seguimiento ni menciones tiempos.
`,
    "provider_model_id": "de8992a1-6f21-4a30-9d37-f8645f66e14e",
    "provider_model_name": "gpt-4.1",
    "temperature": 0.2,
    "max_iterations": 30,
    "max_tokens": 4096,
    "reasoning_effort": null,
    "observer_prompt_mode": "analysis_only",
    "message_delivery_mode": "auto_send_assistant_text",
    "enabled_default_tools": [
      "get_execution_metadata",
      "get_whatsapp_context",
      "get_current_datetime",
      "save_variable",
      "get_variable",
      "complete_task",
      "handoff_to_human"
    ],
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [
      {
        "name": "customer_lookup",
        "description": "Busca al cliente en la base de Shopify por su telefono. Devuelve nombre, cantidad de pedidos previos y la direccion guardada. Llamar UNA vez al inicio de la conversacion con el telefono del chat.",
        "function_name": "Customer Lookup",
        "function_slug": "customer-lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "phone": {
              "type": "string",
              "description": "Telefono del cliente en formato internacional, ej +51918100477. Usa el numero del chat de WhatsApp (get_whatsapp_context)."
            },
            "email": {
              "type": "string",
              "description": "Email del cliente, solo si lo menciono."
            }
          },
          "required": ["phone"]
        }
      },
      {
        "name": "notify_team",
        "description": "Alerta interna al equipo por Telegram cuando el cliente reporta el adelanto de la recuperacion, pide una alternativa de pago o presenta un reclamo. NUNCA es visible para el cliente. Llamala junto con handoff_to_human.",
        "function_name": "Notify Team",
        "function_slug": "notify-team",
        "input_schema": {
          "type": "object",
          "properties": {
            "customerName": { "type": "string", "description": "Nombre completo del cliente." },
            "phone": { "type": "string", "description": "Numero de WhatsApp del cliente." },
            "product": { "type": "string", "description": "Producto(s) y cantidad del pedido retornado." },
            "total": { "type": "string", "description": "Monto total del pedido (en soles), si se conoce." },
            "courier": { "type": "string", "description": "Courier de reenvio: Shalom." },
            "destination": { "type": "string", "description": "Agencia/oficina Shalom de destino." },
            "dni": { "type": "string", "description": "DNI del titular que recogera." },
            "paymentReported": { "type": "string", "description": "Adelanto reportado por el cliente (ej. adelanto S/30 Yape, nro de operacion)." },
            "note": { "type": "string", "description": "Nota interna. Usa siempre el prefijo RECUPERACION para distinguirlo de ventas nuevas." },
            "conversationId": { "type": "string", "description": "ID de la conversacion de Kapso si esta disponible." }
          },
          "additionalProperties": true
        }
      }
    ],
    "flow_agent_app_integration_tools": [],
    "flow_agent_webhooks": [],
    "flow_agent_knowledge_bases": [],
    "flow_agent_mcp_servers": [],
    "flow_agent_resources": []
  },
  "nodeType": "agent",
  "type": "raw"
}, {
  "position": { "x": 620, "y": 100 },
  "displayName": "Recovery Agent"
});

// Defaults de variables ANTES del agente: garantizan que ningun recordatorio
// salga con "{{vars.followup_hint}}" sin renderizar. El agente los sobreescribe.
workflow.addNode("init-stage", {
  type: "set_variable",
  variableName: "stage",
  valueType: "string",
  variableValue: "recuperacion_contactado",
}, { position: { x: 250, y: 100 }, displayName: "Init stage" });

workflow.addNode("init-hint", {
  type: "set_variable",
  variableName: "followup_hint",
  valueType: "string",
  variableValue: `quedamos en el adelanto de ${ADELANTO} para reprogramar el envio de tu pedido`,
}, { position: { x: 400, y: 100 }, displayName: "Init followup_hint" });

workflow.addEdge(START, "init-stage");
workflow.addEdge("init-stage", "init-hint");
workflow.addEdge("init-hint", "recovery-agent");

// ============================================================
// Escalera de recuperacion (4 toques)
//
// Toda la cadencia cabe dentro de la ventana de servicio de 24h que abrio la
// plantilla: 45min, 4h, 12h y 22h desde el ultimo mensaje del cliente. Pasadas
// las 24h ya no se puede escribir sin otra plantilla, por eso no hay toque 5.
//
// Cada escalon aporta un angulo NUEVO sobre el mismo pedido (recordatorio,
// reencuadre del adelanto, urgencia de almacen, cierre con salida humana).
// Los textos son fijos a proposito: no interpolan {{vars.*}}, asi no existe el
// riesgo de que le llegue al cliente una variable sin renderizar.
// ============================================================

const HOLD_SECONDS = 1800; // re-chequeo cada 30 min durante horario de silencio

const RECOVERY_FOLLOWUPS = [
  { step: 1, wait: 2700 },  // 45 min - recordatorio directo del Yape
  { step: 2, wait: 11700 }, // +3h15 -> 4h  - reencuadre: el adelanto se descuenta
  { step: 3, wait: 28800 }, // +8h   -> 12h - el paquete sigue en almacen
  { step: 4, wait: 36000 }, // +10h  -> 22h - cierre + salida humana
];

const RECOVERY_MESSAGES = {
  1: `¿Pudiste hacer el Yape? 😊 Con el *adelanto de ${ADELANTO}* dejo tu pedido separado y sale hoy mismo por Shalom.\n\n*Yape:* ${YAPE_NUMERO} — *${YAPE_TITULAR}*`,
  2: `Te aclaro algo importante 🙌 El *${ADELANTO} no es un cobro extra*: se descuenta de tu total y el saldo lo pagas recién al recoger en Shalom.\n\n¿Te ayudo a completarlo?`,
  3: `Tu pedido sigue guardado a tu nombre en nuestro almacén de Lima 📦 Puedo liberarlo hoy con el *adelanto de ${ADELANTO}* al Yape *${YAPE_NUMERO}* (*${YAPE_TITULAR}*).\n\n¿Lo dejamos encaminado?`,
  4: `Último mensajito, prometido 🙏 Si todavía lo quieres, con el *adelanto de ${ADELANTO}* lo despacho y te paso tu código de seguimiento Shalom.\n\nSi prefieres verlo con una asesora, dime *asesora* y te paso con una 😊`,
};

// Tras completar el agente: seguir con la escalera o terminar (estado terminal).
// Reutiliza el router de check-coverage: con edges ["seguir","terminar"] evalua
// vars.stage contra sus marcadores terminales (derivad*, no_interes*, reclamo,
// lead_perdido, handoff...). Los stages de este workflow ya calzan con esos
// marcadores, asi que check-coverage NO necesita cambios.
workflow.addNode("rc-terminal", {
  type: "decide",
  decisionType: "function",
  functionSlug: "check-coverage",
  conditions: [
    { label: "seguir", description: "La recuperacion sigue abierta: continuar con la cadencia de recordatorios." },
    { label: "terminar", description: "Estado terminal (voucher derivado a logistica, no interesado, reclamo o handoff): no enviar mas recordatorios." },
  ],
}, { position: { x: 1000, y: 100 }, displayName: "Seguir o terminar" });
workflow.addEdge("recovery-agent", "rc-terminal");

workflow.addNode("rc-end", {
  type: "set_variable",
  variableName: "followup_done",
  valueType: "boolean",
  variableValue: true,
}, { position: { x: 1000, y: 320 }, displayName: "Fin (terminal)" });
workflow.addEdge("rc-terminal", "rc-end", { label: "terminar" });

workflow.addEdge("rc-terminal", "rc-w1", { label: "seguir" });

for (const { step, wait } of RECOVERY_FOLLOWUPS) {
  const baseX = 1320 + (step - 1) * 320;
  const w = `rc-w${step}`;
  const wr = `rc-wr${step}`;
  const g = `rc-g${step}`;
  const h = `rc-h${step}`;
  const s = `rc-s${step}`;

  // Espera del intervalo.
  workflow.addNode(w, {
    type: "wait_for_response",
    timeoutSeconds: wait,
  }, { position: { x: baseX, y: 100 }, displayName: `Espera ${step}` });
  workflow.addEdge(w, wr);

  // Reanudacion: respondio el cliente (-> agente) o fue timeout (-> horario).
  workflow.addNode(wr, {
    type: "decide",
    decisionType: "function",
    functionSlug: "check-coverage",
    conditions: [
      { label: "respondio", description: "El cliente respondio durante la espera: devolver el control al agente." },
      { label: "timeout", description: "Vencio la espera sin respuesta del cliente: evaluar el envio del recordatorio." },
    ],
  }, { position: { x: baseX, y: 240 }, displayName: `Reanudacion ${step}` });
  workflow.addEdge(wr, "recovery-agent", { label: "respondio" });
  workflow.addEdge(wr, g, { label: "timeout" });

  // Horario Peru: enviar ahora o esperar (silencio 00:00-06:59).
  workflow.addNode(g, {
    type: "decide",
    decisionType: "function",
    functionSlug: "check-coverage",
    conditions: [
      { label: "enviar", description: "Horario permitido en Peru: enviar el recordatorio ahora." },
      { label: "esperar", description: "Horario de silencio (00:00-07:00 Peru): esperar y reintentar mas tarde." },
    ],
  }, { position: { x: baseX, y: 380 }, displayName: `Horario ${step}` });
  workflow.addEdge(g, s, { label: "enviar" });
  workflow.addEdge(g, h, { label: "esperar" });

  // Espera corta y re-chequeo de horario (reutiliza la reanudacion del paso).
  workflow.addNode(h, {
    type: "wait_for_response",
    timeoutSeconds: HOLD_SECONDS,
  }, { position: { x: baseX + 150, y: 380 }, displayName: `Espera horario ${step}` });
  workflow.addEdge(h, wr);

  const next = step < RECOVERY_FOLLOWUPS.length ? `rc-w${step + 1}` : "rc-lost";

  workflow.addNode(s, {
    type: "send_text",
    message: RECOVERY_MESSAGES[step],
    phoneNumberId: PHONE_NUMBER_ID,
  }, { position: { x: baseX, y: 520 }, displayName: `Recordatorio ${step}` });
  workflow.addEdge(s, next);
}

// Sin respuesta tras el ultimo recordatorio: recuperacion perdida y fin.
// El stage "lead_perdido" calza con los marcadores terminales de check-coverage.
workflow.addNode("rc-lost", {
  type: "set_variable",
  variableName: "stage",
  valueType: "string",
  variableValue: "lead_perdido",
}, { position: { x: 1320 + 4 * 320, y: 520 }, displayName: "Recuperacion perdida" });

export default workflow;
