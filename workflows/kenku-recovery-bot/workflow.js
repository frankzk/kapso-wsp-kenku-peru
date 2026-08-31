import { START, Workflow } from '@kapso/workflows';

const workflow = new Workflow("kenku-recovery-bot", {
  name: "Kenku Recovery Bot",
  status: "active",
});

workflow.addNode(START, {
  "position": {
    "x": 100,
    "y": 100
  }
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "1241670942359671"
});

workflow.addNode("recovery-agent", {
  "config": {
    "system_prompt": `
Eres Akemi, asesora de Kenku Peru por WhatsApp. Este chat es una campana de RECUPERACION DE PEDIDO RETORNADO, no una venta nueva.

QUE PASO (contexto que ya conoce el cliente):
- El cliente compro por contraentrega, el courier intento entregar y NO se logro (no contesto, no estaba, cambio de opinion, direccion incompleta, etc.).
- El paquete fue RETORNADO al almacen de Kenku en Lima y ahi sigue, guardado a su nombre.
- Antes de este chat, el cliente recibio una plantilla de WhatsApp que le dice exactamente eso y que le ofrece reenviarlo por *Shalom* con un adelanto de S/30.
- Este chat existe porque el cliente RESPONDIO esa plantilla. Responder ya es una senal de interes: tratalo como alguien que quiere su pedido, no como un desconocido.

REGLA DE ORO (por encima de todo lo demas):
- Tu unico objetivo es que el cliente pague el *adelanto de S/30* por Yape y te mande el voucher.
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
  "Para reprogramarlo por *Shalom* solo necesito el *adelanto de S/30*:

  *Yape:* 930 555 309
  *Nombre:* Grupo GF SAC

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
  1) Llama notify_team con: customerName, phone, product (los items del pedido), total si lo sabes, courier="Shalom", destination=agencia Shalom, dni si lo tienes, paymentReported="adelanto S/30 Yape - recuperacion de pedido retornado [codigo]", note="RECUPERACION pedido retornado". notify_team es una ALERTA INTERNA por Telegram: el cliente NUNCA la ve. Si devuelve ok=false, no se lo menciones y continua igual.
  2) Llama handoff_to_human con el resumen interno (codigo de pedido, items, agencia Shalom, DNI, adelanto reportado, telefono).
- Luego responde al cliente, corto y calido: que recibiste el voucher, que su pedido pasa a despacho y que le llegara su codigo de seguimiento Shalom por aqui.
- Guarda stage="derivado_logistica" y llama complete_task.

MANEJO DE OBJECIONES (aqui se gana o se pierde la recuperacion):
Responde SIEMPRE con empatia en una linea y luego el argumento, corto. Nunca discutas ni culpes al cliente por el intento fallido.

1) "¿Por qué tengo que adelantar? / antes era contraentrega"
   -> "Te entiendo 😊 El primer envío ya salió contraentrega y volvió, y el reenvío tiene un costo que asumimos nosotros. El *S/30* no es un cobro extra: *se descuenta de tu total*. Es lo que nos permite volver a despacharlo hoy."

2) "Yo sí estaba / nadie me llamó / no llegó nadie"
   -> Dale la razon sin pelear: "Lamento que haya pasado eso 🙏 Justo por eso ahora te lo mandamos a la agencia *Shalom* que elijas: lo recoges cuando puedas, sin depender de que te ubiquen."

3) "¿Y si pago todo al recoger?"
   -> "El saldo sí lo pagas al recoger 😊 El *S/30* es lo que libera el despacho desde almacén, por eso va antes. Es la única forma en que podemos reenviarlo."

4) "No confío / ¿es seguro? / ¿cómo sé que me llegará?"
   -> "Totalmente válido 🙌 El Yape sale a nombre de *Grupo GF SAC*, que es la razón social de Kenku. Apenas envíes la captura te paso tu *código de seguimiento Shalom* para que lo veas en camino."

5) "Ya no lo quiero / ya no me interesa"
   -> UN intento honesto: recordarle el beneficio del producto que pidio y que el adelanto va a cuenta del total, no se pierde. Ej: "Qué pena 😔 Tu [producto] sigue apartado a tu nombre y el *S/30* se descuenta del total, así que no pierdes nada. ¿Lo dejamos encaminado hoy?"
   -> Si vuelve a decir que no, ACEPTA con calidez, sin insistir mas: "Sin problema, gracias por avisarme 😊 Si más adelante lo quieres, escríbeme por aquí." Guarda stage="no_interesado" y llama complete_task.

6) "No tengo Yape"
   -> "No hay problema 😊 Déjame consultarte una alternativa de pago y te confirmo por aquí." Llama handoff_to_human con el motivo. NUNCA inventes cuentas bancarias, CCI, Plin ni otros medios: solo existe el Yape indicado.

7) "Dame descuento / hazme una rebaja / que sea menos de 30"
   -> No inventes descuentos ni bajes el adelanto. Reencuadra UNA vez: "El *S/30* no se suma a tu total, se descuenta 😊 O sea que pagas lo mismo que ibas a pagar, solo que una parte ahora." Si insiste, llama handoff_to_human.

8) "Mándalo de nuevo contraentrega"
   -> Explica UNA vez: "Después de un retorno ya no podemos reenviar contraentrega 😔 Pero con el *S/30* lo despacho hoy y el resto lo pagas al recoger." Si insiste una segunda vez, llama handoff_to_human. No lo repitas una tercera vez.

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
- followup_hint es una frase corta en segunda persona que recuerde el punto exacto donde quedaron. Ejemplos: "quedamos en el adelanto de S/30 para reprogramar tu pedido", "me ibas a decir a que agencia Shalom lo enviamos".
- El sistema detiene los seguimientos en los stages TERMINAL y cuando llamas handoff_to_human. No anuncies al cliente que le haras seguimiento ni menciones tiempos.
`,
    "provider_model_id": "de8992a1-6f21-4a30-9d37-f8645f66e14e",
    "provider_model_name": "gpt-4.1",
    "temperature": "0.2",
    "max_iterations": 30,
    "max_tokens": 4096,
    "reasoning_effort": null,
    "prompt_cache_ttl": "5m",
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
    "default_tool_configs": {},
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [
      {
        "name": "customer_lookup",
        "description": "Busca al cliente en la base de Shopify por su telefono. Devuelve nombre, cantidad de pedidos previos y la direccion guardada. Llamar UNA vez al inicio de la conversacion con el telefono del chat.",
        "function_name": "customer-lookup",
        "input_schema": {
          "type": "object",
          "required": [
            "phone"
          ],
          "properties": {
            "email": {
              "type": "string",
              "description": "Email del cliente, solo si lo menciono."
            },
            "phone": {
              "type": "string",
              "description": "Telefono del cliente en formato internacional, ej +51918100477. Usa el numero del chat de WhatsApp (get_whatsapp_context)."
            }
          }
        },
        "function_slug": "customer-lookup"
      },
      {
        "name": "notify_team",
        "description": "Alerta interna al equipo por Telegram cuando el cliente reporta el adelanto de la recuperacion, pide una alternativa de pago o presenta un reclamo. NUNCA es visible para el cliente. Llamala junto con handoff_to_human.",
        "function_name": "Notify Team",
        "input_schema": {
          "type": "object",
          "properties": {
            "dni": {
              "type": "string",
              "description": "DNI del titular que recogera."
            },
            "note": {
              "type": "string",
              "description": "Nota interna. Usa siempre el prefijo RECUPERACION para distinguirlo de ventas nuevas."
            },
            "phone": {
              "type": "string",
              "description": "Numero de WhatsApp del cliente."
            },
            "total": {
              "type": "string",
              "description": "Monto total del pedido (en soles), si se conoce."
            },
            "courier": {
              "type": "string",
              "description": "Courier de reenvio: Shalom."
            },
            "product": {
              "type": "string",
              "description": "Producto(s) y cantidad del pedido retornado."
            },
            "destination": {
              "type": "string",
              "description": "Agencia/oficina Shalom de destino."
            },
            "customerName": {
              "type": "string",
              "description": "Nombre completo del cliente."
            },
            "conversationId": {
              "type": "string",
              "description": "ID de la conversacion de Kapso si esta disponible."
            },
            "paymentReported": {
              "type": "string",
              "description": "Adelanto reportado por el cliente (ej. adelanto S/30 Yape, nro de operacion)."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "notify-team"
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
  "position": {
    "x": 620,
    "y": 100
  },
  "displayName": "AI Agent"
});

workflow.addNode("init-stage", {
  "config": {
    "variable_name": "stage",
    "variable_value": "recuperacion_contactado",
    "value_type": "string"
  },
  "nodeType": "set_variable",
  "type": "raw"
}, {
  "position": {
    "x": 250,
    "y": 100
  },
  "displayName": "Set Variable: stage"
});

workflow.addNode("init-hint", {
  "config": {
    "variable_name": "followup_hint",
    "variable_value": "quedamos en el adelanto de S/30 para reprogramar el envio de tu pedido",
    "value_type": "string"
  },
  "nodeType": "set_variable",
  "type": "raw"
}, {
  "position": {
    "x": 400,
    "y": 100
  },
  "displayName": "Set Variable: followup_hint"
});

workflow.addNode("rc-terminal", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "7b5b2517-e668-4189-8954-d7dd32ea5981",
        "label": "seguir",
        "description": "La recuperacion sigue abierta: continuar con la cadencia de recordatorios."
      },
      {
        "id": "1d0782b2-496e-45b6-a051-88096544abda",
        "label": "terminar",
        "description": "Estado terminal (voucher derivado a logistica, no interesado, reclamo o handoff): no enviar mas recordatorios."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1000,
    "y": 100
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-end", {
  "config": {
    "variable_name": "followup_done",
    "variable_value": "t",
    "value_type": "boolean"
  },
  "nodeType": "set_variable",
  "type": "raw"
}, {
  "position": {
    "x": 1000,
    "y": 320
  },
  "displayName": "Set Variable: followup_done"
});

workflow.addNode("rc-w1", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 2700,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1320,
    "y": 100
  },
  "displayName": "Wait for Response (2700s timeout)"
});

workflow.addNode("rc-wr1", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "8b8a3b98-e94f-440b-9f0c-365b0a9b75ea",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "9ef7fe07-dc52-4589-aaa6-a1db4011f195",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del recordatorio."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1320,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-g1", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "bdcc4aa7-8546-4a93-b17a-1776c188fb01",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el recordatorio ahora."
      },
      {
        "id": "0ea904d7-0562-41c0-8b0c-7dd6efc3b98d",
        "label": "esperar",
        "description": "Horario de silencio (00:00-07:00 Peru): esperar y reintentar mas tarde."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1320,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-h1", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1470,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("rc-s1", {
  "config": {
    "whatsapp_config_id": "9f077d88-6cf0-4e7f-9461-78ed292e2041",
    "phone_number_id": "1241670942359671",
    "message": `¿Pudiste hacer el Yape? 😊 Con el *adelanto de S/30* dejo tu pedido separado y sale hoy mismo por Shalom.

*Yape:* 930 555 309 — *Grupo GF SAC*`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1320,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("rc-w2", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 11700,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1640,
    "y": 100
  },
  "displayName": "Wait for Response (11700s timeout)"
});

workflow.addNode("rc-wr2", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "9347d2c1-c580-4882-986e-4e0d94b592f0",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "41a4ccdb-a661-43a4-b0c5-4982e6f08b78",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del recordatorio."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1640,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-g2", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "3da633c6-802d-48b1-90a6-7d82b55ee319",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el recordatorio ahora."
      },
      {
        "id": "baea0993-bfb6-4606-9df2-917f0c715b63",
        "label": "esperar",
        "description": "Horario de silencio (00:00-07:00 Peru): esperar y reintentar mas tarde."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1640,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-h2", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1790,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("rc-s2", {
  "config": {
    "whatsapp_config_id": "9f077d88-6cf0-4e7f-9461-78ed292e2041",
    "phone_number_id": "1241670942359671",
    "message": `Te aclaro algo importante 🙌 El *S/30 no es un cobro extra*: se descuenta de tu total y el saldo lo pagas recién al recoger en Shalom.

¿Te ayudo a completarlo?`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1640,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("rc-w3", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 28800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1960,
    "y": 100
  },
  "displayName": "Wait for Response (28800s timeout)"
});

workflow.addNode("rc-wr3", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "961a66ff-efac-4ebe-a314-978a6a6f5805",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "434fca12-61ef-40e0-9df3-a93590e9e4d2",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del recordatorio."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1960,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-g3", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "787280d9-0775-4fdc-abdc-8c0839698bbf",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el recordatorio ahora."
      },
      {
        "id": "ceac1714-fb1d-4c0b-8cfd-907b6b3451fe",
        "label": "esperar",
        "description": "Horario de silencio (00:00-07:00 Peru): esperar y reintentar mas tarde."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1960,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-h3", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2110,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("rc-s3", {
  "config": {
    "whatsapp_config_id": "9f077d88-6cf0-4e7f-9461-78ed292e2041",
    "phone_number_id": "1241670942359671",
    "message": `Tu pedido sigue guardado a tu nombre en nuestro almacén de Lima 📦 Puedo liberarlo hoy con el *adelanto de S/30* al Yape *930 555 309* (*Grupo GF SAC*).

¿Lo dejamos encaminado?`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1960,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("rc-w4", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 36000,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2280,
    "y": 100
  },
  "displayName": "Wait for Response (36000s timeout)"
});

workflow.addNode("rc-wr4", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "b7da6f38-5236-420f-93d7-ee0e5a809d1e",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "0e541e87-3eb6-43ec-a476-54106d713537",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del recordatorio."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 2280,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-g4", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "0335dc98-75c7-4bc4-b210-466fd3a61a85",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el recordatorio ahora."
      },
      {
        "id": "30cadfe7-69c9-400e-9d5d-9337867497ac",
        "label": "esperar",
        "description": "Horario de silencio (00:00-07:00 Peru): esperar y reintentar mas tarde."
      }
    ],
    "llm_configuration": {},
    "function_name": "check-coverage",
    "function_slug": "check-coverage"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 2280,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("rc-h4", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2430,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("rc-s4", {
  "config": {
    "whatsapp_config_id": "9f077d88-6cf0-4e7f-9461-78ed292e2041",
    "phone_number_id": "1241670942359671",
    "message": `Último mensajito, prometido 🙏 Si todavía lo quieres, con el *adelanto de S/30* lo despacho y te paso tu código de seguimiento Shalom.

Si prefieres verlo con una asesora, dime *asesora* y te paso con una 😊`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 2280,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("rc-lost", {
  "config": {
    "variable_name": "stage",
    "variable_value": "lead_perdido",
    "value_type": "string"
  },
  "nodeType": "set_variable",
  "type": "raw"
}, {
  "position": {
    "x": 2600,
    "y": 520
  },
  "displayName": "Set Variable: stage"
});

workflow.addEdge(START, "init-stage");

workflow.addEdge("recovery-agent", "rc-terminal");

workflow.addEdge("init-stage", "init-hint");

workflow.addEdge("init-hint", "recovery-agent");

workflow.addEdge("rc-terminal", "rc-end", {
  "label": "terminar"
});

workflow.addEdge("rc-terminal", "rc-w1", {
  "label": "seguir"
});

workflow.addEdge("rc-w1", "rc-wr1");

workflow.addEdge("rc-wr1", "recovery-agent", {
  "label": "respondio"
});

workflow.addEdge("rc-wr1", "rc-g1", {
  "label": "timeout"
});

workflow.addEdge("rc-g1", "rc-s1", {
  "label": "enviar"
});

workflow.addEdge("rc-g1", "rc-h1", {
  "label": "esperar"
});

workflow.addEdge("rc-h1", "rc-wr1");

workflow.addEdge("rc-s1", "rc-w2");

workflow.addEdge("rc-w2", "rc-wr2");

workflow.addEdge("rc-wr2", "recovery-agent", {
  "label": "respondio"
});

workflow.addEdge("rc-wr2", "rc-g2", {
  "label": "timeout"
});

workflow.addEdge("rc-g2", "rc-s2", {
  "label": "enviar"
});

workflow.addEdge("rc-g2", "rc-h2", {
  "label": "esperar"
});

workflow.addEdge("rc-h2", "rc-wr2");

workflow.addEdge("rc-s2", "rc-w3");

workflow.addEdge("rc-w3", "rc-wr3");

workflow.addEdge("rc-wr3", "recovery-agent", {
  "label": "respondio"
});

workflow.addEdge("rc-wr3", "rc-g3", {
  "label": "timeout"
});

workflow.addEdge("rc-g3", "rc-s3", {
  "label": "enviar"
});

workflow.addEdge("rc-g3", "rc-h3", {
  "label": "esperar"
});

workflow.addEdge("rc-h3", "rc-wr3");

workflow.addEdge("rc-s3", "rc-w4");

workflow.addEdge("rc-w4", "rc-wr4");

workflow.addEdge("rc-wr4", "recovery-agent", {
  "label": "respondio"
});

workflow.addEdge("rc-wr4", "rc-g4", {
  "label": "timeout"
});

workflow.addEdge("rc-g4", "rc-s4", {
  "label": "enviar"
});

workflow.addEdge("rc-g4", "rc-h4", {
  "label": "esperar"
});

workflow.addEdge("rc-h4", "rc-wr4");

workflow.addEdge("rc-s4", "rc-lost");

export default workflow;
