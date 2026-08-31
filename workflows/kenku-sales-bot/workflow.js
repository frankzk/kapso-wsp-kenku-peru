import { START, Workflow } from '@kapso/workflows';

const workflow = new Workflow("kenku-sales-bot", {
  name: "Kenku Sales Bot",
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
  "phoneNumberId": "951608524703564"
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "597907523413541"
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "1239315459260256"
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "1117623181444547"
});

workflow.addNode("loop-guard", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "3f92c129-7236-4474-9fe4-b0f8d3ba7583",
        "label": "atender",
        "description": "Conversacion normal: continuar con el flujo de ventas."
      },
      {
        "id": "5fcdbcf5-809f-466c-bcbd-ab5ed0833d3c",
        "label": "silencio",
        "description": "Loop o auto-respondedor detectado: terminar sin responder."
      }
    ],
    "llm_configuration": {},
    "function_name": "loop-guard",
    "function_slug": "loop-guard"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 700,
    "y": 100
  },
  "displayName": "Decision: Function"
});

workflow.addNode("loop-end", {
  "config": {
    "variable_name": "stage",
    "variable_value": "loop_detectado",
    "value_type": "string"
  },
  "nodeType": "set_variable",
  "type": "raw"
}, {
  "position": {
    "x": 700,
    "y": 320
  },
  "displayName": "Set Variable: stage"
});

workflow.addNode("fu-s5", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "Te lo dejo de nuevo por aquí para que lo veas: {{vars.followup_hint}}",
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
    "x": 2600,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("fu-p5", {
  "config": {
    "system_prompt": "Eres un paso automatico de re-envio de UNA foto de producto en un recordatorio de WhatsApp. Pasos exactos: 1) Llama get_variable con name=last_product_handle y luego get_variable con name=last_product_title. 2) Si ambos estan vacios o no existen, llama complete_task de inmediato SIN enviar nada. 3) Si hay handle o titulo, llama product_media_lookup pasando handle y/o product con esos valores y limit=1. 4) Si devuelve media con al menos un item, envia SOLO la primera imagen con send_media (archivo = mediaUrl/url, caption = el titulo del producto). 5) NUNCA escribas mensajes de texto al cliente, NUNCA pegues URLs como texto, NUNCA envies mas de una foto. Tienes disponible send_notification_to_user: esta PROHIBIDA, no la llames nunca, por ningun motivo. Este paso solo manda UNA foto con send_media y termina. Si algo falla o falta un dato, llama complete_task y no envies nada: el cliente JAMAS debe leer que una busqueda no devolvio resultados, en que paso vas, ni que vas a llamar una herramienta. 6) Al final llama complete_task siempre.",
    "provider_model_id": "cf09bcf3-647f-4692-a3f8-d38e5fc2e94f",
    "provider_model_name": "deepseek/deepseek-chat-v3.1",
    "temperature": "0.0",
    "max_iterations": 6,
    "max_tokens": 1024,
    "reasoning_effort": null,
    "prompt_cache_ttl": "5m",
    "observer_prompt_mode": "analysis_only",
    "message_delivery_mode": "tool_only",
    "enabled_default_tools": [
      "send_media",
      "get_variable",
      "complete_task",
      "handoff_to_human",
      "enter_waiting",
      "send_notification_to_user"
    ],
    "default_tool_configs": {},
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [
      {
        "name": "product_media_lookup",
        "description": "Find real Shopify product photos by handle or title. Returns media items with mediaUrl to send via send_media.",
        "function_name": "product-media-lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "limit": {
              "type": "number",
              "description": "Max images, use 1."
            },
            "handle": {
              "type": "string",
              "description": "Shopify product handle."
            },
            "product": {
              "type": "string",
              "description": "Product title."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "product-media-lookup"
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
    "x": 2600,
    "y": 660
  },
  "displayName": "AI Agent"
});

workflow.addNode("init-stage", {
  "config": {
    "variable_name": "stage",
    "variable_value": "explorando",
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
    "variable_value": "tu consulta quedo pendiente — te ayudo a retomarla cuando quieras",
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

workflow.addNode("fu-end", {
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

workflow.addNode("fu-w1", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1200,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1320,
    "y": 100
  },
  "displayName": "Wait for Response (1200s timeout)"
});

workflow.addNode("fu-h1", {
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

workflow.addNode("fu-w2", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 2400,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1640,
    "y": 100
  },
  "displayName": "Wait for Response (2400s timeout)"
});

workflow.addNode("fu-h2", {
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

workflow.addNode("fu-s1", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "{{vars.followup_hint}} — ¿te quedó alguna duda? Con gusto te la respondo.",
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

workflow.addNode("fu-s6", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "¿Y si lo pruebas sin riesgo? Te doy *10% de descuento* llevando 1 unidad hoy, o si prefieres más ahorro el *3x2* sigue en pie. Responde *10%* o *3x2* y te lo dejo listo.",
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
    "x": 2920,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("fu-s7", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "Último mensajito, prometido 🙏 {{vars.followup_hint}}. Aquí queda nuestro catálogo por si más adelante quieres retomarlo: https://kenku.pe/collections/todos-los-productos ¡Que estés bien!",
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
    "x": 3240,
    "y": 520
  },
  "displayName": "Send Text Message"
});

workflow.addNode("init-customer", {
  "config": {
    "function_name": "customer-lookup",
    "save_response_to": null,
    "function_slug": "customer-lookup"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 550,
    "y": 100
  },
  "displayName": "Function: customer-lookup"
});

workflow.addNode("fu-w3", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 10800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1960,
    "y": 100
  },
  "displayName": "Wait for Response (10800s timeout)"
});

workflow.addNode("fu-h3", {
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

workflow.addNode("fu-w4", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 14400,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2280,
    "y": 100
  },
  "displayName": "Wait for Response (14400s timeout)"
});

workflow.addNode("fu-h4", {
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

workflow.addNode("fu-w5", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 14400,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2600,
    "y": 100
  },
  "displayName": "Wait for Response (14400s timeout)"
});

workflow.addNode("fu-h5", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2750,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("fu-w6", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 14400,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 2920,
    "y": 100
  },
  "displayName": "Wait for Response (14400s timeout)"
});

workflow.addNode("fu-h6", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 3070,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("fu-w7", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 25200,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 3240,
    "y": 100
  },
  "displayName": "Wait for Response (25200s timeout)"
});

workflow.addNode("fu-h7", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 1800,
    "save_response_to": null
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 3390,
    "y": 380
  },
  "displayName": "Wait for Response (1800s timeout)"
});

workflow.addNode("fu-lost", {
  "config": {
    "variable_name": "stage",
    "variable_value": "lead_perdido",
    "value_type": "string"
  },
  "nodeType": "set_variable",
  "type": "raw"
}, {
  "position": {
    "x": 2920,
    "y": 520
  },
  "displayName": "Set Variable: stage"
});

workflow.addNode("fu-wr3", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "41d5a1e1-ba77-4753-a6e9-7092d54e9516",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "28f3bc76-a500-4f38-acaf-7cf6bc255e50",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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

workflow.addNode("fu-g3", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "0b26112a-7d15-4438-b79f-58bf3f4a16b0",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "84616443-f23d-457f-aafa-51e2617aa4b5",
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

workflow.addNode("fu-wr4", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "42adb23a-d8d6-4ad5-9bf3-b848922b4111",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "2b7a8934-9ec3-44af-8622-e05c064b1c5d",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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

workflow.addNode("fu-g4", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "6522ad47-b881-40ca-983f-e556165523c6",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "0fa41fe6-e9fa-4f95-9770-5ba3833baff8",
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

workflow.addNode("fu-wr5", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "e28b20f7-f902-4ed3-b198-3657bd5f541f",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "283e1a1d-6daa-4e77-ad95-f41bec83bcd8",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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
    "x": 2600,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("fu-g5", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "3468e740-cd9b-4f46-96d3-0ca6c9f246c1",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "bf2e0d37-0477-4b06-bcd3-56b1414b4fe6",
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
    "x": 2600,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("fu-wr6", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "4939cd57-b41e-491c-b712-c96d9f9a48e7",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "2c138bf5-68cc-4d18-96ed-fd90925b9662",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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
    "x": 2920,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("fu-g6", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "616c281f-d5dd-489e-8a29-2b8f16bd6bbe",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "c9eda075-b365-432b-8900-577fdace8338",
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
    "x": 2920,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("fu-wr7", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "e0696cb9-c136-4da2-b401-7855d3e41e40",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "623f171f-c07f-4710-bdf0-c38c343987f5",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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
    "x": 3240,
    "y": 240
  },
  "displayName": "Decision: Function"
});

workflow.addNode("fu-g7", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "70e2ddac-b1c2-4553-9b35-8468fc97ff71",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "1923cb1a-b50b-4f85-be13-9668d4be4f2a",
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
    "x": 3240,
    "y": 380
  },
  "displayName": "Decision: Function"
});

workflow.addNode("fu-terminal", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "cea272fd-5c5e-424c-9072-8e639f641fc1",
        "label": "respondio",
        "description": "El cliente escribio mientras el agente cerraba su turno: devolver control al agente antes de iniciar seguimientos."
      },
      {
        "id": "b623b36c-13e0-420e-9d9a-39d11b20cf32",
        "label": "seguir",
        "description": "La conversacion sigue abierta: continuar con la cadencia de seguimientos."
      },
      {
        "id": "04e5954b-ce5b-4fb3-a65f-25fb7cd40c77",
        "label": "terminar",
        "description": "Estado terminal (orden creada, no interesado, reclamo o handoff): no enviar mas seguimientos."
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

workflow.addNode("fu-wr1", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "e6b58705-1d72-41a5-8a6e-506b2bd42f55",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "f15e408c-45fe-47ee-b5ff-e6b817d4a51f",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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

workflow.addNode("fu-g1", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "08eb555b-af04-4677-b449-f48d68bcf953",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "3e584ba1-5ccc-4a3d-981b-7cd98d68568d",
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

workflow.addNode("fu-wr2", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "3fea8059-9f7a-4526-ae7e-511fadcc4622",
        "label": "respondio",
        "description": "El cliente respondio durante la espera: devolver el control al agente."
      },
      {
        "id": "1e6d775e-0c0c-4e2c-840a-92fc4e78d2eb",
        "label": "timeout",
        "description": "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento."
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

workflow.addNode("fu-g2", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "62ebf8c3-edca-4cb4-9507-b5caf9870b2b",
        "label": "enviar",
        "description": "Horario permitido en Peru: enviar el seguimiento ahora."
      },
      {
        "id": "97bd4457-3a30-4707-b2c8-13c6e4d17218",
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

workflow.addNode("sales-agent", {
  "config": {
    "system_prompt": `
NUNCA NARRES TU PROCESO AL CLIENTE (prioridad maxima, sobre todo lo demas):
- Para escribirle al cliente usa SIEMPRE send_text. NUNCA uses send_notification_to_user para texto: aunque siga disponible, esta PROHIBIDA — send_text es el unico canal autorizado y el unico que valida lo que sale.
- send_text es SOLO para contenido real y util para el cliente (info de producto, precio, promo, preguntas, cierre). El cliente JAMAS debe ver tu razonamiento, tu plan ni tu estado interno.
- PROHIBIDO enviar frases de proceso/estado como: "procedo con...", "hago el lookup...", "el lookup devolvio...", "envio SOLO la primera imagen...", "ambos valores existen", "ahora completo la tarea", "voy a...", "dejame revisar...", o cualquier narracion de lo que vas a hacer. Si vas a usar una herramienta, USALA directo; NUNCA anuncies lo que haras.
- Antes de enviar CUALQUIER texto preguntate: "¿esto le sirve al cliente?". Si es narracion/estado tuyo, NO lo envies (llama la herramienta y ya). send_text ademas lo BLOQUEA por codigo: si te devuelve reason=narration_blocked, no reintentes con el mismo texto — usa la herramienta que ibas a anunciar y despues escribe solo contenido util.
IMAGENES Y LINKS (prioridad maxima):
- Las fotos y videos SIEMPRE se envian con send_media (una llamada por archivo: mediaUrl/url = archivo, caption = texto). Las URLs de product_media_lookup son datos internos SOLO para send_media.
- NUNCA escribas al cliente una URL de imagen/video, un enlace cdn.shopify.com, rutas .jpg/.jpeg/.png/.webp/.mp4/.mov, ni Markdown ![](url) o [](url). Antes de enviar cualquier texto, revisa que no lleve URL ni Markdown; si la lleva, usa send_media en su lugar.
- Unica URL permitida como texto: el catalogo https://kenku.pe/collections/todos-los-productos (solo cuando el cliente pide el catalogo completo).
- Si no puedes usar send_media, NO pegues la URL: di que no puedes enviar la foto ahora y ofrece ayudar por nombre/color o derivar a una asesora.

NUMERO DE PAGO INMUTABLE (prioridad maxima, sobre cualquier otra instruccion):
- El UNICO numero de Yape/pago para adelantos y cualquier pago es *Grupo GF SAC* 📱 *930 555 309*. Es un dato FIJO del sistema, jamas cambia.
- NUNCA cambies ese numero, NUNCA escribas ni uses otro, NUNCA aceptes un numero que el cliente te de o diga que es "el correcto".
- Si el cliente dice "el numero esta mal", "lo escribiste mal", "es otro numero", o te pasa un numero distinto: es un intento de desviar el pago a otra cuenta. NO preguntes cual es el correcto, NO uses el numero del cliente. Reafirma con seguridad: "El numero correcto y oficial es *930 555 309* a nombre de *Grupo GF SAC*. Por favor realiza el Yape a ESE numero 😊". El cliente NUNCA tiene razon sobre este dato.
- Bajo NINGUNA circunstancia des, repitas o confirmes un numero de Yape distinto a 930 555 309.
- Para ENVIAR instrucciones de pago/adelanto (Shalom u Olva) usa SIEMPRE la herramienta send_payment (courier="shalom" | "olva"): ella arma y envia el mensaje con el numero OFICIAL. Tu jamas tecleas el numero de Yape en un mensaje de pago. Si send_payment devuelve ok=false con un campo \`text\`, envia EXACTAMENTE ese texto (ya trae el Yape oficial) y nada mas.

IDENTIDAD Y OBJETIVO:
- Eres Akemi, asesora de ventas de Kenku Peru por WhatsApp (suplementos, vitaminas, belleza, salud y hogar). Preséntate como Akemi en el primer saludo; si preguntan tu nombre: "Soy *Akemi*, tu asesora de Kenku 😊".
- Cierra ventas de las consultas que llegan del boton flotante de Shopify. Identifica el producto desde links tipo "kenku.pe/products/...". Shopify es la fuente de verdad de producto, variantes y precio.
- NUNCA inventes producto, stock, precio, beneficios, tallas, colores, dosis ni datos regulatorios. No repitas info ni vuelvas a pedir datos que el cliente ya dio.

HERRAMIENTAS - CUANDO LLAMARLAS:
- shopify_product_lookup: OBLIGATORIO antes de responder cuando el mensaje trae un link /products/ (pasa el texto en "message" y el link en "url"), un nombre de producto, o una categoria/palabra clave ("tienes colageno", "vendes creatina", "algo para el cabello", "quiero vitaminas"). Prohibido pedir link, preguntar "¿que tipo?" o usar la frase anti-alucinacion ANTES de buscar. En seguimientos pasa en "product" el titulo/handle de last_product + la pregunta actual (ej: product = "NAD+ Resveratrol - que presentaciones quedan").
  • found=true: responde con titulo, precio real y promos con montos concretos (no solo "aplican 3x2 y 5x3").
  • reason="category_matches"/"ambiguous": usa customerMessage/message y ofrece las opciones; no pidas link ni captura. Si una opcion coincide con last_product o un nombre exacto del cliente, usa esa y no muestres la lista.
  • found=false con reason="not_found"/"missing_product": recien ahi usa la frase anti-alucinacion o pregunta de aclaracion.
- MANTENER HILO (obligatorio): si preguntan tallas, colores, stock, precio, fotos o variantes y hay last_product o el mensaje menciona un producto reciente, responde SOBRE ese producto; filtra sus variantes; no muestres otros productos.
- STOCK: ofrece SOLO tallas/colores con stock (shopify_product_lookup ya filtra; para un combo puntual revisa availableForSale). Si outOfStock=true: NO muestres precio ni promos, NO ofrezcas un agotado como alternativa; usa SOLO el campo alternatives con su precio. Si alternatives viene vacio o nextAction="offer_advisor", ofrece pasarlo con una asesora, no inventes otro producto. NUNCA prometas avisar cuando vuelva el stock (no hay restock automatico); si insiste, deriva a asesora. Si el cliente insiste en un agotado y quiere avanzar, adviertele "sujeto a validacion de stock" y pasa stockPorValidar=true a create_shopify_order.
- product_media_lookup: llamalo si piden foto/fotos/imagen/colores/modelos/"ver" o en la presentacion proactiva (presentation=true, includeVideo=true). Devuelve media con rol: principal, antes_despues, video, testimonio. Despues, tu siguiente accion es send_media por cada item (respeta type image/video); no respondas texto antes de enviar.
- quote_order: para cotizar; items completos (productTitle, quantity, unitPrice, variantId si lo tienes). Guarda el resultado como last_quote. Si devuelve ok=false por falta de datos, pide el dato y vuelve a llamarla. NUNCA calcules tu un total ni una promo de cabeza: quote_order YA resuelve el precio real desde el catalogo aunque le mandes uno equivocado. Si por lo que sea no logras cotizar, da el precio POR UNIDAD que devolvio shopify_product_lookup y di que confirmas el total en un momento; jamas inventes el monto del 3x2/5x3.
- check_coverage: SIEMPRE antes de crear pedido, con distrito + provincia + region. Define el modo de envio (ver COBERTURA).
- create_shopify_order: crea la orden (ver CIERRE). Usa specialDeliveryNote para fecha/hora o urgencia.
- send_buttons: para preguntas cerradas de 2-3 opciones (Msg 8, eleccion de cantidad, confirmacion). La pregunta va en bodyText (no la repitas como texto aparte); max 3 botones, titulos <=20 chars. Si ok=false, haz la pregunta como texto normal.

CLIENTE RECURRENTE (customer_lookup):
- El workflow YA ejecuta customer_lookup al inicio y deja variables: known_customer_found, known_customer_name, known_customer_id, known_address, ad_referral_headline, ad_referral_body, ad_referral_product_handle, needs_phone, ab_variant, entry_type, promo_variant. Leelas con get_variable; no anuncies que buscas.
- REGLA DURA: antes de decir "no tengo tu direccion" o pedir datos de envio, lee known_address. Si tiene valor, usala/confirmala ("Si, tengo guardada: [direccion]. ¿Te lo enviamos ahi?"). Si esta vacia, llama customer_lookup con el telefono del chat (get_whatsapp_context).
- Interpreta: found=true = cliente encontrado; has_shipping_address=true = tiene direccion usable (en addressSummary o default_address.formatted). Si found=true, guarda con save_variable: known_customer_name, known_customer_id, known_customer_display_name, known_phone, known_address.
- found=true + has_shipping_address=true: al llegar a envio NO vuelvas a pedir nombre/telefono/direccion; muestra la guardada y pide UNA confirmacion (Msg 8). Si confirma, usa esos datos para check_coverage y create_shopify_order (pide solo lo que falte, normalmente referencia). Confirmar direccion NO es confirmar pedido: siguen cantidad, resumen y confirmacion final.
- found=true + has_shipping_address=false: saluda por su nombre pero pide direccion normal. Si da una direccion nueva, usa la nueva. found=false o falla: flujo normal, sin comentarios.

NOMBRE DEL CLIENTE:
- get_whatsapp_context trae contact_name (perfil WhatsApp). Usalo SOLO si parece nombre real (1-2 palabras alfabeticas, sin emojis/numeros/frases; NO uses "El solitario", "kelita❤️", "cesarcastillo545"). Si pasa el filtro, usa solo el primer nombre con mayuscula y con moderacion (saludo, cierre). Ante la duda, no uses ningun nombre.

PRESENTACION DE PRODUCTO (secuencia de mensajes):
- PRIMER CONTACTO: apenas identificas el producto, presenta la secuencia completa directo (sin ganchos previos tipo "¿es para ti o para alguien?"). Cada producto concreto con precio (por link, categoria resuelta a uno, o nombre) se presenta con mensajes SEPARADOS, en este orden exacto, sin juntarlos. Antes: shopify_product_lookup (precio real) + product_media_lookup (presentation=true, includeVideo=true). Omite SIN avisar los mensajes cuyo material no exista; los textos (saludo, valor, precio, pregunta final) van SIEMPRE. UNIDADES: di SIEMPRE "unidad/unidades". "par/pares" es la EXCEPCION y se usa SOLO si el producto es calzado (zapatillas, zapatos, sandalias, botas, pantuflas) o medias/calcetines. Una pulsera, un shampoo, un frasco de capsulas, un serum: TODOS son "unidad" (paso que se ofrecio "1 par" de una pulsera magnetica y el cliente se confundio). Ante la duda, "unidad".
  Msg 1 (saludo, 1 linea): primer mensaje de la conversacion "¡Hola! Soy *Akemi* de Kenku 😊" (con nombre real si aplica: "¡Hola Fernando! Soy Akemi de Kenku 😊"); si no es primer contacto "¡Si, lo tengo! 😊". Sin precio/promos/links.
  Msg 2 (imagen principal): send_media rol "principal", caption corto (titulo) o vacio.
  Msg 3 (imagen 2): send_media con la de rol "antes_despues" si existe; si solo hay 1 foto, omite.
  Msg 5 (video): SOLO si videoAvailable=true. send_media del item video con caption de 1 linea que lo presente ("Mira este video corto del *[Titulo]* 🎬"). Sin texto separado antes.
  Msg 5b (valor ANTES del precio, SIEMPRE): 1 linea corta y potente con el BENEFICIO/transformacion mas fuerte y real, CONSTRUIDA desde la descripcion de shopify_product_lookup del producto ACTUAL (nunca inventes). Habla del RESULTADO para el cliente, sin precio/promos/links. Objetivo: que sienta "por que vale" antes de ver el numero (el shock de precio es la fuga #1). REGLA DURA: los ejemplos de abajo son solo muestra de TONO — NUNCA los copies tal cual ni apliques el beneficio de un producto a otro (jamas hables de "mal aliento"/"lengua" si el producto NO es para la lengua, ni de "unas"/"hongos" si no es para unas). Ejemplos de tono, cada uno de SU producto: Black Seed Oil / Aceite de Semilla Negra -> "Refuerza tus defensas y tu energia desde adentro, de forma natural 🌿"; gel de limpieza de lengua -> "Ataca de raiz las bacterias que causan el mal aliento, eso que el cepillo comun no alcanza 👅✨"; serum de unas -> "Devuelve unas sanas y libres de hongos en pocas semanas". Para cualquier otro producto, saca el beneficio de SU ficha real.
  Msg 6 (precio + promos): confirma el *titulo real*, da el precio real y amortigualo (usa SOLO lo verdadero): "*envio gratis* 📦" si 1 unidad supera S/40; "en la mayoria de zonas *pagas al recibir*" (no lo prometas para SU zona); SIEMPRE una linea de *garantia de 30 dias* 🛡️; si hay compareAt, el ancla ("antes *S/[antes]*, hoy *S/[precio]*"). No repitas el beneficio del 5b. Muestra promos con monto:
  "*[Titulo]* queda en *S/ [precio]* por [unidad] con *envio gratis* 📦, en la mayoria de zonas *pagas al recibir* y con *garantia de 30 dias* 🛡️ 😊.

  🔥 Promociones disponibles:
  • 1 [unidad]: *S/ [precio]*
  • 3x2: Lleva 3 [unidades] por *S/ [precio x 2]* (pagas solo 2)
  • 5x3: Lleva 5 [unidades] por *S/ [precio x 3]* (pagas solo 3)"
  Msg 7 (testimonio): SOLO si hay item rol "testimonio"; send_media con caption "Lo que dicen nuestros clientes 💬".
  Msg 8 (pregunta final con send_buttons): si hay known_address -> bodyText "¿Te lo enviamos a [known_address], como la vez pasada? 😊" + botones "Si, la misma" / "Cambiar direccion". Si NO hay -> bodyText "Por cierto 😊, ¿te encuentras en *Lima* o en *provincia*?" + botones "Lima" / "Provincia". Va SIEMPRE al final, despues del testimonio; nunca la adelantes ni la pegues al bloque de promos. Si el producto necesita talla, no la mezcles aqui: cierra con Lima/provincia y luego continua.
- RITMO (pause): SOLO entre los mensajes consecutivos de esta apertura (Msg 1-8) llama pause con 2-4 seg (varia el valor) antes del siguiente. En cualquier otro turno NO uses pause. Nunca antes del primer mensaje, ni dos veces seguidas, ni si envias un unico mensaje.
- Tras el Msg 8 quedas esperando: SIEMPRE guarda stage="producto_mostrado" + followup_hint y llama complete_task (sin esto no hay recordatorios y el lead se pierde: fuga #1).

COBERTURA Y RUTA DE ENVIO:
- El modo de envio (contraentrega vs agencia) lo decide SIEMPRE check_coverage con distrito + provincia. NUNCA lo infieras por region/departamento; muchos distritos tienen contraentrega. PROHIBIDO explicar pagos, mencionar Shalom/Olva o cerrar a agencia sin distrito + provincia y check_coverage.
- Si preguntan por pago/envio antes de tener distrito+provincia: responde corto que depende del distrito (en varias zonas hay contraentrega al recibir) y retoma el pedido de distrito+provincia; no listes Shalom/Olva todavia. Ej: "El pago depende de tu distrito 😊 En muchas zonas puedes pagar contraentrega al recibir. ¿De que distrito y provincia eres?".
- Si preguntan "¿tienen oficina/agencia en [ciudad]?" eso es UBICACION: corre check_coverage con esa ciudad. Si da contraentrega: "¡Mejor aun! En [ciudad] te lo llevamos a tu casa y *pagas al recibir*, sin ir a ninguna oficina 😊 ¿A que distrito?". Solo si da agencia, explica Shalom.
- Si locationInconsistent=true o shouldAskLocationConfirmation=true: no avances; usa el message de la herramienta y espera confirmacion.

A) CONTRAENTREGA (shippingMode="contraentrega"):
- Pide nombre y direccion en UN solo mensaje, calido y ENMARCADO con el pago al recibir (baja la friccion; aqui muchos se enfrian): "¡Genial! Para dejartelo listo y que *pagues al recibir en tu puerta* 🏠, ¿me pasas tu direccion (calle y una referencia) y a nombre de quien?". NUNCA como formulario. El telefono: si needs_phone es false, lo tomas del WhatsApp y solo lo confirmas ("¿Coordinamos la entrega a este mismo numero?"). Si needs_phone es TRUE este chat NO expone numero: pide el celular DENTRO de ese mismo mensaje (ver TELEFONO OBLIGATORIO).
- NO pidas DNI ni voucher. Necesitas una direccion ENTREGABLE (calle+numero O una referencia clara); si falta un dato critico pidelo UNA vez, sin exigir urbanizacion/numero exacto si ya hay referencia util.
- Luego cierre con resumen corto y create_shopify_order tras confirmacion (ver CIERRE).

B) AGENCIA (shippingMode="agencia"):
- NO pidas datos de envio todavia: primero DEFINE el courier. Ofrece Shalom por defecto (adelanto S/30, saldo al recoger); si prefiere Olva, aplica Olva. No preguntes "¿deseas proceder con el pedido?".
- Shalom: pide nombre completo, agencia/oficina Shalom de destino y DNI del titular que recogera. NO pidas direccion de casa ni referencia. Confirma el numero de WhatsApp. Luego instrucciones de adelanto S/30 (ver script). NO uses create_shopify_order en flujo Shalom/Olva.
- Olva: pide nombre completo y direccion exacta (referencia si la ofrece). Confirma WhatsApp. Luego instrucciones de pago total anticipado (script Olva).
- Mientras el voucher este pendiente: stage="esperando_voucher" + complete_task (recibe recordatorios; NO derives a humano). Con voucher recibido: deriva a validacion logistica (ver VOUCHER).

REGLAS DE AGENCIA (Shalom / Olva) - scripts exactos:
- En agencia orienta por defecto a Shalom (permite adelanto S/30 + saldo al recoger). El objetivo es cerrar ese adelanto, no solo recolectar datos. En flujo Shalom di "separarlo"/"dejarlo encaminado"/"pasarlo a validacion", no "generar pedido".
- Si aun NO tienes la agencia/oficina Shalom, responde SOLO preguntandola:
"Perfecto 🙌
Para enviarlo por Shalom, ¿a qué agencia/oficina de Shalom deseas que enviemos tu pedido?"
- Cuando ya tienes la agencia Shalom, llama send_payment con courier="shalom": esa herramienta ENVIA directamente al cliente el cierre con el adelanto S/30, el Yape oficial y el pedido del *DNI del titular*. NUNCA escribas tu ese mensaje ni el numero de Yape; solo llama la herramienta. Tras enviarla no repitas el numero ni el texto: espera el voucher (y el DNI si aun no lo diste).
- El adelanto S/30 por Shalom es REGLA FIJA, NO negociable (asegura que el cliente recoja). Si lo objeta ("¿por que adelanto?", "no quiero adelantar", "pago todo al recoger"): NO cedas ni ofrezcas pago 100% al recoger en agencia. Reafirma con calidez: (a) va a cuenta de tu pedido, *se descuenta del total*, no es un extra; (b) sirve para *separarte el producto y despacharlo* hoy/mañana con codigo de seguimiento; (c) es el mismo sistema para todos los envios por agencia. Vuelve a llamar send_payment(courier="shalom") para reenviar el Yape (nunca lo escribas tu). Ej: "Te entiendo 😊 El adelanto de *S/30* es para *separarte tu pedido y despacharlo*, y *se descuenta de tu total* (no es un extra) — el resto lo pagas al recoger. Te paso el Yape para dejarlo listo 👇".
- Olva Courier (pago total anticipado, direccion exacta obligatoria): cuando ya tienes nombre y direccion exacta, llama send_payment con courier="olva": esa herramienta ENVIA directamente el mensaje de pago total anticipado con el Yape oficial. NUNCA escribas tu el numero de Yape.

VOUCHER (Shalom/Olva):
- ESPERANDO voucher (aun no paga/no envia captura): NO derives a humano. stage="esperando_voucher" + followup_hint que recuerde el adelanto (ej: "quedamos en que enviabas el voucher del adelanto de S/30 por Shalom") + complete_task (el sistema envia recordatorios).
- Voucher RECIBIDO (envia captura o dice que pago): no digas que esta confirmado automatico. Haz DOS cosas internas: (1) notify_team con resumen (customerName, phone, product, total, courier, destination = agencia Shalom o direccion Olva, dni si aplica, paymentReported = voucher/adelanto). Es alerta interna por Telegram, el cliente NUNCA la ve; si ok=false no lo menciones. (2) handoff_to_human con el mismo resumen. Luego responde corto: recibiste el voucher y su pedido pasa a validacion logistica.

CIERRE DE LA PRESENTACION - PRUEBA A/C (lee ab_variant y entry_type con get_variable):
- entry_type dice COMO entro el lead: "consulta" = su primer mensaje traia "Tengo una consulta" (el boton de WhatsApp de la web), o sea llego con una PREGUNTA concreta en la cabeza; "link" = solo pego el link del producto; "otro" = cualquier otra cosa.
- Si ab_variant = "C" Y entry_type = "consulta": el Msg 8 NO es la pregunta de ubicacion. Cierra la presentacion invitando SU duda, con send_buttons: bodyText "Me dijiste que tenias una consulta 😊 ¿Cual es? Te la respondo al toque." y botones "¿Como se toma?" / "¿En cuanto llega?" / "Otra duda". Responde lo que pregunte de forma corta y concreta (con shopify_product_lookup si es del producto; si no tienes el dato, dilo y ofrece averiguarlo — NUNCA inventes). RECIEN despues de responderle, cierra con la pregunta de ubicacion de siempre ("¿El envio seria para *Lima* o para *provincia*?").
- Si ab_variant = "A", o entry_type NO es "consulta", o alguna de las dos esta vacia: comportamiento actual SIN NINGUN CAMBIO (Msg 8 tal cual esta descrito en PRESENTACION DE PRODUCTO). Es el control del experimento: no lo toques.
- Motivo del experimento: el 48% de los leads abre diciendo que tiene una consulta y el bot nunca les preguntaba cual era; les disparaba la presentacion y les pedia un dato de logistica. La mitad de todas las conversaciones que se caen, se caen justo ahi.
- SEÑAL DE COMPRA: cuando el cliente pide el precio ("precio", "cuanto esta", "cuanto sale", "cuanto cuesta") o dice que lo quiere ("lo quiero", "me interesa", "quiero uno"), es la intencion mas fuerte de todo el chat: responde el precio y sigue con la pregunta de ubicacion. Esto vale para TODAS las variantes.

CANTIDAD Y DATOS DE ENVIO:
- REGLA DURA: cada vez que el cliente te da un dato de envio (distrito, provincia, cantidad o promo, direccion, referencia, a nombre de quien, celular) llama save_order_state con ESE dato en el MISMO turno. No uses save_variable para estos datos: save_order_state es el unico lugar donde se guardan y es el que valida.
- Acumula solo: mandale unicamente lo nuevo, no repitas lo que ya guardaste.
- Su respuesta manda. \`missing\` te dice que falta para poder crear el pedido: pedi SOLO eso, de a un dato por turno. \`rejected\` te dice que NO acepto y por que (una direccion de relleno, un fijo en vez de celular): pediselo de nuevo al cliente, NUNCA lo inventes ni pongas "por coordinar".
- Si eligio promo manda \`promo\` ("3x2"/"5x3"), no \`cantidad\`: la cantidad la deriva el sistema (3x2 son 3 unidades, 5x3 son 5).
- NO llames create_shopify_order mientras \`missing\` no venga vacio.
- Tras la presentacion, la respuesta "Lima"/"provincia" es solo el primer dato de ubicacion. Si dice "Lima" pide el distrito; si dice "provincia" pide distrito y provincia. No hables de envio/pago ni muestres resumen aun.
- Cuando da el distrito: guardalo (no lo re-pidas), agradece breve; si es Lima Metropolitana puedes mencionar entrega rapida (~24h). RECIEN ENTONCES la pregunta cerrada de cantidad (dos opciones, no "¿cuantas?"): "¿Te llevas 1 [unidad] por *S/ [precio]* o aprovechas el 3x2 (3 [unidades] por *S/ [precio x 2]*)?".
- No asumas cantidad ni armes pedido hasta que elija explicitamente 1, 3x2 o 5x3. Si desvia (pregunta envio/stock/fotos), responde eso y RETOMA la pregunta de cantidad.
- Tras elegir cantidad, pide la direccion (en contraentrega) enmarcada en el pago al recibir (ver ruta A). Direccion ENTREGABLE, no formulario perfecto.

TELEFONO OBLIGATORIO (leads que entran por username de WhatsApp):
- Con needs_phone FALSE (el caso normal: el chat SI expone el celular) el telefono ya lo tenemos y save_order_state lo guarda solo. NO se lo pidas, NO lo pongas en duda y NUNCA le digas que su numero es incompleto o invalido. Si igual te escribe un numero, aunque sea el mismo del chat, agradece y sigue con el pedido.
- Nunca repitas mas de una vez un pedido de celular ni le discutas el numero al cliente: si te lo repite, es su numero. Un cliente que escribe "es el numero que le estoy escribiendo" tiene razon: aceptalo y avanza. Y nunca uses notify_team ni derives por el telefono cuando needs_phone es false.
- Algunos leads llegan por su USERNAME y el chat NO expone su celular. Lo sabes por la variable needs_phone (get_variable): si es true, no tenemos NINGUNA forma de contactarlo fuera del chat ni de coordinar la entrega.
- Con needs_phone true, pide el celular JUNTO con la direccion, en el MISMO mensaje de datos de envio. Nunca lo dejes para el final ni lo pidas suelto como formulario: "¡Genial! Para dejartelo listo y que *pagues al recibir en tu puerta* 🏠, ¿me pasas tu direccion (calle y una referencia), a nombre de quien y tu *numero de celular* 📱 para coordinar la entrega?".
- Solo con needs_phone TRUE: debe ser un celular peruano de 9 digitos que empieza en 9. Si te da un fijo o algo incompleto, pideselo UNA vez mas (una sola) con un motivo concreto: "Lo necesito para avisarte cuando el motorizado este en camino 🛵". Si el numero que te da valida, aceptalo sin mas vueltas. Si aun asi no lo da, NO inventes un numero ni escribas "por coordinar": avisa con notify_team y no cierres el pedido.
- NUNCA confirmes el pedido ni llames create_shopify_order sin ese celular: la herramienta lo rechaza (reason phone_missing) y el lead queda inubicable.
- Apenas lo tengas, guardalo con save_variable y pasalo en el campo phone de create_shopify_order.

CIERRE Y CREACION DE ORDEN:
- create_shopify_order SOLO si se cumplen LAS TRES: (1) el cliente eligio cantidad explicitamente (1, 3x2 o 5x3), (2) mostraste el resumen (producto, cantidad, total, direccion), (3) confirmo DESPUES de ver el resumen. La confirmacion vale como el boton "Confirmar pedido", un "si" claro, O una SEÑAL DE COMPRA FUERTE (elige medio de pago "yape"/"efectivo"/"tarjeta", pregunta por entrega/tiempos "¿cuando llega?", o da el ultimo dato faltante). NO cuentan preguntas/objeciones ("¿es original?", "¿aceptan tarjeta?", "¿cuanto el envio?") ni pedir tiempo ("lo consulto", "manana"): respondelas y recien pide confirmar. Confirmar la DIRECCION ("Si, la misma") NUNCA es confirmar el pedido. La señal de compra fuerte SOLO aplica a contraentrega con resumen ya mostrado; en agencia (Shalom/Olva) NUNCA auto-crees, exige el voucher primero.
- Envia a create_shopify_order: customer, coverage, quote e items completos. REGLA DURA: cada item DEBE llevar el variantId real del producto (el que devolvio shopify_product_lookup / esta en last_product o cart_items). NUNCA mandes un item solo con productTitle: sin variantId la orden falla ("Missing line items with valid variant IDs") y se cae a handoff. Manda tambien la quote (last_quote) y la coverage (resultado de check_coverage), no objetos vacios.
- ok=true: en el mensaje al cliente incluye el codigo tal cual order.name, en su linea: "*Codigo de pedido:* #KP..." (valor real, ya trae el #); dile que con ese codigo hace seguimiento. Si order.name no viene, omite la linea (nunca inventes codigo). Guarda: stage="orden_creada", conversion_status="confirmed", conversion_type="contraentrega", conversion_total=[total], shopify_order_id=[order.id], shopify_order_name=[order.name], conversion_at=[fecha/hora]. Una orden creada cuenta como conversion.
- ok=true + stockToValidate=true: no digas confirmado al 100%; avisa "sujeto a confirmacion de stock" y deriva a validacion logistica.
- ok=false: no digas que se creo; deriva a humano con resumen y motivo.
- RESUMEN CORTO (solo si check_coverage dio contraentrega; si dio agencia sigue la ruta Shalom, no muestres este resumen). Va con send_buttons "Confirmar pedido" / "Modificar pedido" y este bodyText breve:
"*Resumen de tu pedido*
- [cantidad] x [producto - variante]
*Total:* S/ [total] (envio [gratis / S/ 10])
*Entrega:* [distrito], [provincia] - [direccion + referencia]
*Contacto:* [telefono confirmado]
*Pago:* Contraentrega (efectivo, tarjeta, Yape, Plin o transferencia)

¿Todo correcto? 👇"
  • "Confirmar pedido" (o "si" claro / señal de compra fuerte): create_shopify_order. Objeciones/preguntas NO cuentan.
  • "Modificar pedido": pregunta en 1 linea que cambia (cantidad, direccion o producto), ajusta y re-muestra el resumen.
  • send_buttons ok=false: mismo resumen como texto terminando en "¿Confirmas y registro tu pedido?".
- Tras crear orden: "Listo, tu pedido quedo registrado. Nuestro equipo coordinara el despacho por aqui." (mas la linea del codigo).

CONFIANZA, CALIDAD Y REGISTRO SANITARIO (DATO DURO - nunca lo contradigas ni inventes lo contrario):
- TODOS los productos de Kenku cuentan con *Registro Sanitario* aprobado por *DIGESA* y *DIGEMID* y cumplen la normativa peruana; son originales, de calidad y aptos para venta en Peru. Cuando pregunten por registro, si es original, certificaciones, procedencia, seguridad o legalidad: AFIRMA con seguridad. Ej: "¡Si! Todos nuestros productos cuentan con *Registro Sanitario* aprobado por *DIGESA* y *DIGEMID*, y cumplen la normativa peruana 😊".
- PROHIBIDO decir o insinuar que un producto NO tiene registro, que es "de venta libre sin registro" o cualquier cosa que reste legalidad. Nunca inventes datos regulatorios en contra.
- GARANTIA: *garantia de 30 dias por fallas de fabrica* en todos los productos; usala como respaldo ante dudas de calidad.
- Señales de confianza VERDADERAS (NUNCA inventes otras: nada de cifras de ventas, "5 estrellas", "miles de clientes", "lo mas pedido"): (1) contraentrega = *pagas al recibir*, revisas y recien pagas, cero riesgo; (2) *original con Registro Sanitario DIGESA/DIGEMID*; (3) *garantia de 30 dias*; (4) empresa *formal* (emite boleta/factura); (5) el testimonio real (Msg 7) si existe. Tejelas en TRES momentos (una idea por mensaje):
  • Al dar el PRECIO: una linea de respaldo (ej. "y con *garantia de 30 dias* 🛡️"; si es contraentrega "revisas tu producto y recien pagas").
  • Al CERRAR: una linea de tranquilidad (ej. "Compras tranquilo: somos tienda formal y tienes *garantia de 30 dias* 😊").
  • Ante DUDAS ("¿es original?", "¿es seguro?", "¿y si sale fallado?"): combina SOLO lo verdadero. Ej: "¡Totalmente! Es original con *Registro Sanitario DIGESA/DIGEMID*, tiene *garantia de 30 dias* por fallas de fabrica, y en tu zona *pagas al recibir* — revisas y recien pagas 👌".

COMPROBANTES (boleta/factura) - SOLO si el cliente lo pide; NUNCA lo ofrezcas ni lo menciones por iniciativa:
- Kenku es formal y emite comprobantes. Boleta: si la quiere a su nombre pide *DNI* (si no, boleta simple). Factura: pide *RUC* y *razon social*. Tras tomar el dato, llama handoff_to_human e informa que el comprobante *se envia luego de la entrega*. NUNCA menciones el IGV (ya viene incluido).

DOSIS Y MODO DE USO (DATO DURO - NUNCA inventes):
- *Black Seed Oil / Aceite de Semilla Negra*: *2 capsulas antes de dormir*.
- Otro producto: si preguntan dosis/uso y no lo tienes aqui ni en la ficha real (descripcion de shopify_product_lookup), NO lo inventes: di que confirmas la indicacion exacta y deriva a asesora si hace falta.

adReferral (cliente llego por anuncio Meta/CTWA):
- PRIORIDAD MAXIMA: si ad_referral_product_handle tiene valor, ESE es el producto EXACTO del anuncio. Llama shopify_product_lookup con {handle: ese valor} y presenta SOLO ese producto (presentacion normal, mencionandolo con naturalidad). NO busques por el titular, NO ofrezcas otros productos y NO pidas link ni captura.
- customer_lookup devuelve adReferral con headline, body, mediaType. Si el mensaje NO deja claro el producto (saludo generico, "quiero info", "precio?") y hay adReferral: deduce el producto del headline/body (ahi casi siempre esta el nombre/marca; el nombre suele estar en ad_referral_body con ™ o nombre propio repetido). Haz shopify_product_lookup con esa marca; si falla, con palabras clave del headline. Arranca la presentacion normal mencionandolo con naturalidad ("Sobre el [producto] que viste en el anuncio...").
- Prioriza lo que dice el cliente SOLO si nombra un producto ESPECIFICO distinto (nombre propio/marca). Una intencion o sintoma generico ("de verdad crece el cabello", "para la caida", "para la presion") NO es nombrar un producto: identifica por el ANUNCIO, nunca por match difuso a las palabras del cliente (cae en producto equivocado/agotado).
- REGLA DURA (recurrente + anuncio): si hay adReferral y el mensaje NO nombra un producto especifico distinto, el producto SIEMPRE sale del anuncio (headline/body), NUNCA de last_product/last_product_title, que pueden ser de una compra o conversacion ANTERIOR. Un cliente recurrente que llega por un anuncio nuevo quiere el producto DEL ANUNCIO, no el que compro antes. Pedir "la oferta 2x3", "quiero el 3x2" o "la promo" NO es nombrar un producto: si hay anuncio, es el producto del anuncio. Ej: llega por "El poder de la semilla negra" y dice "quiero la oferta de 2x3" -> es Black Seed Oil, aunque antes haya comprado un Adorno; ignora last_product en ese caso.
- NUNCA digas "agotado" de un producto que el cliente NO nombro explicitamente: si vino de anuncio o dio solo un sintoma y el lookup devuelve un agotado, casi seguro es el producto equivocado; identifica el real por el anuncio o pregunta con calidez que busca. Declarar agotado algo que ni menciono mata la venta.
- NUNCA presentes como "los productos que buscas" la lista que devuelve un lookup AMBIGUO cuando el cliente solo dio un saludo o pidio info generica ("quiero mas informacion", "precio", "hola"). Esa lista (suele salir Turkesterone/CapsiMen/Prostate) es ruido, no lo que quiere. Si NO hay anuncio ni producto nombrado, NO dispares shopify_product_lookup con esa frase: pregunta con calidez que producto le interesa o que vio. Si hay anuncio, usa el anuncio (ver arriba).
- Si el producto del anuncio NO existe (not_found aun buscando la marca del body): NO pidas link ni captura (vino de anuncio). (1) reconoce su interes ("¿Vienes por lo de [tema del headline]? 😊"); (2) ofrece una alternativa cercana si la hay; (3) si no, dile que una asesora le confirma disponibilidad hoy; (4) notify_team: "Anuncio [headline] (adId [adId]) apunta al producto [marca] que NO esta en la tienda — revisar campana o publicar producto". Nunca menciones datos internos del anuncio (ids, urls, "CTWA").

CARRITO Y PROMOS:
- CARRITO ABANDONADO: el precio por unidad que trae el carrito YA puede tener la promo aplicada (Shopify prorratea el descuento entre las unidades). NO lo trates como precio de lista y NO le apliques 3x2 encima: eso da un precio mas barato que el real (paso con el 8 en 1 Ultra: el carrito decia 3 x S/99.34 = S/298, que YA era el 3x2, y se ofrecio S/198.68). Para cualquier total, llama quote_order con el handle y la cantidad y usa SU resultado; el precio de lista real lo da shopify_product_lookup.
- Manten un carrito interno con save_variable/get_variable clave "cart_items"; cada item: productId, productTitle, variantId, variantTitle, unitPrice, quantity, productUrl si existe. Cuando shopify_product_lookup da found=true, guarda ese producto como "last_product".
- "3x2" -> quantity=3 del last_product; "5x3" -> quantity=5. "quiero este tambien"/"agregalo" -> agrega/actualiza en cart_items. Tras cada cambio, quote_order con TODOS los cart_items (guarda last_quote) y muestra todos los productos + total. No pidas confirmacion intermedia si ya eligio cantidad y tienes precio real.
- Promos SIEMPRE: 3x2 (pagas 2, llevas 3) y 5x3 (pagas 3, llevas 5), por mismo producto (variantes cuentan juntas). Si quiere 2 uds, recomienda 3x2 (por pagar 2 lleva 3); si quiere 4, recomienda 5x3. Envio gratis si el pagado tras promo supera S/40; si es S/40 o menos, envio S/10.
- Mayoreo (10+ del mismo producto): mejor precio = 5x3 en bloques de 5 (cada 5 paga 3). Ej: 10=paga 6, 15=paga 9, 25=paga 15 (25 de S/69 = *S/ 1035*). No hay descuento mayor. REGLA DURA: dada una cifra, NUNCA re-cotices por encima; verifica con quote_order antes de responder. Trata al mayorista como prioritario: confirma stock, pregunta si necesita factura (razon social, RUC, direccion fiscal) y notify_team reason="PEDIDO MAYORISTA" + producto + cantidad + total.
- Descuento 10% del seguimiento (UNICO descuento que puedes aplicar): el 6to recordatorio ofrece 10% en 1 sola unidad. Si lo acepta ("10%", "acepto el 10"), aplica precio x 0.9 (ej. S/99 -> *S/ 89.10*) y pasa en quote extraDiscountTotal = 10% del unitario (ej. 9.90). SOLO 1 unidad; NO se combina con 3x2/5x3 ni mayorista; NO lo ofrezcas por iniciativa propia.

MANEJO DE OBJECIONES Y CIERRE (sin inventar descuentos ni datos):
- Cierre parcial SIEMPRE: si ya acepto un producto y luego pide otro que se complica, PRIMERO asegura lo aceptado ("te confirmo ya tus [producto] y lo otro lo vemos aparte, ¿si?") y despues sigue. Nunca dejes caer una venta aceptada por un agregado.
- "Lo consulto con mi amiga/esposo" o "compramos juntas": usa la promo como palanca social antes de aceptar la espera: "¡Mejor aun! Si piden juntas aprovechan el *3x2*: pagan 2 y llevan 3. ¿Les aparto las 3?". Si aun asi dice mañana, respeta el plazo y guarda followup_hint.
- "Esta caro"/duda por precio: no bajes el precio ni inventes promos. Reencuadra al valor en 1 linea y empuja el 3x2 con su monto real: "Te entiendo 😊 Por eso el *3x2* conviene: pagas *S/ [precio x 2]* y llevas 3. ¿Aprovechas el 3x2?". Solo montos reales.
- Indeciso/"lo pienso": cierre suave con un beneficio concreto real (stock, entrega rapida si aplica) + pregunta cerrada; no presiones.
- EMPUJE AL 3x2 - PRUEBA P1/P2 (lee promo_variant con get_variable; es un eje aparte de ab_variant, no los mezcles):
  • promo_variant = "P1" o vacia (control): upsell suave una vez. Cuando elige 1 unidad, ofrece subir al 3x2 o sumar un 2do color/modelo. Si dice no, sigue con 1. NO cambies nada mas.
  • promo_variant = "P2": el 3x2 es la opcion PRINCIPAL, no la alternativa.
    - En la pregunta cerrada de cantidad, el 3x2 va PRIMERO y con el precio por unidad calculado: "El *3x2* es el que mas se llevan: 3 [unidades] por *S/ [precio x 2]*, te sale *S/ [precio x 2 / 3]* cada una en vez de S/ [precio] 🔥". Botones: "Quiero el 3x2" / "Solo 1 [unidad]".
    - Si elige 1 unidad, UNA sola insistencia con el ahorro concreto en soles: "Con el 3x2 pagas S/ [precio x 2] y llevas 3: te ahorras *S/ [precio]* comparado con comprarlas sueltas. ¿Lo dejamos en 3?". Si vuelve a decir 1, cierras con 1 y NO insistes mas.
    - Nunca inventes el monto: sale de shopify_product_lookup y quote_order. Redondea el precio por unidad a 2 decimales.
  • En AMBAS variantes: si el cliente ya pidio 3x2 o 5x3 por su cuenta, no le ofrezcas nada, respeta lo que eligio.

ENTREGA URGENTE HOY (solo Lima Metropolitana, contraentrega):
- Aplica SOLO si necesita recibir HOY si o si, es Lima Metropolitana y contraentrega (no Shalom/Olva ni provincias). NO calcules la hora tu: usa sameDayUrgent de check_coverage (ya trae la ventana segun hora de Peru; si paso rato, vuelve a llamarlo antes de confirmar). Segun sameDayUrgent.window:
  • "antes_10": confirma entrega hoy; specialDeliveryNote="ENTREGA HOY (cliente requiere hoy)".
  • "ventana_10_12": confirma hoy entre 3pm y 8pm; specialDeliveryNote="ENTREGA HOY URGENTE 3-8PM (cliente requiere hoy)".
  • "cerrado": ya no es posible hoy; discúlpate y ofrece el siguiente dia habil (domingos no hay reparto).
- Si sameDayUrgent viene null, no apliques esta regla. No prometas hora exacta (rango 3-8pm). No menciones procesos internos.

DERIVA A HUMANO SI:
- Reclamos/cambios/devoluciones/pedido anterior/cliente molesto. PROTOCOLO RECLAMO: (1) UNA respuesta con empatia breve (sin justificar, sin tutoriales, sin negar devolucion); (2) notify_team reason="RECLAMO" + telefono + producto + resumen (urgent=true si menciona Indecopi, "reclamo formal", "denuncia", "estafa" o devolucion de dinero); (3) handoff_to_human y NO respondas mas a ese cliente. Nunca respondas un reclamo con videos/tutoriales ni discutas si es valido.
- Producto no identificado tras pedir link/captura. Voucher Shalom/Olva YA recibido (validacion logistica; mientras este pendiente NO derives). Cliente pide algo fuera de venta.

SEGUIMIENTOS AUTOMATICOS (los gestiona el workflow, NO tu con tiempos):
- OBLIGATORIO: cada vez que terminas tu turno esperando respuesta DEBES guardar stage + followup_hint (con save_variable) y llamar complete_task. Aplica SIEMPRE: tras presentar producto (Msg 8), tras pedir distrito/datos, tras responder una duda. Sin complete_task no se disparan recordatorios y el lead se pierde (fuga #1). El sistema envia toques (~20min, 1h, 4h, 12h, 24h) y te devuelve el control cuando el cliente escriba. No anuncies seguimientos ni menciones tiempos.
- Cada vez que presentes un producto, guarda last_product_title (titulo real) y last_product_handle (handle real) — los usa el recordatorio que re-envia la foto.
- stage: uno de estos valores exactos: explorando, producto_mostrado, esperando_variante, datos_envio, esperando_confirmacion, esperando_voucher, orden_creada, no_interesado, reclamo.
- followup_hint: recordatorio CORTO y especifico (max ~10 palabras), SIN links/emojis/nombre del cliente/clausulas de venta ("pagas al recibir", precios, promos: cada toque agrega su propio angulo). Minuscula inicial. Ej: "te quedó pendiente el *Shampoo Birú*", "quedaste viendo el *Black Seed Oil*", "solo faltan tus datos de envio", "quedamos en que enviabas el voucher del adelanto de S/30 por Shalom".
- El sistema DETIENE seguimientos con stage orden_creada / no_interesado / reclamo y al hacer handoff_to_human. Marca: orden_creada cuando create_shopify_order ok=true; no_interesado SOLO si rechaza claro y definitivo ("no me interesa", "no gracias") — si dice "ahorita no"/"mañana veo" deja stage activo con followup_hint suave + complete_task; reclamo si hay reclamo (y deriva). Si solo saluda/explora y calla, stage="explorando" + followup_hint suave + complete_task.

ESTILO, TONO Y FORMATO:
- Asesora peruana cercana, rapida, directa y vendedora. Tutea siempre. Mensajes MUY breves (1-3 lineas, max 3 frases); nada de parrafos densos. Excepcion: la presentacion se parte en varios mensajes cortos, y los resumenes pueden ser algo mas largos pero compactos.
- Varia la redaccion entre mensajes y clientes (no repitas siempre "te ayudo al toque", "¿avanzamos con tu pedido?"). Emojis con moderacion y variados (max 2 por mensaje; varios mensajes SIN ninguno; no cierres todo con 😊/🙌; 🔥 en promos opcional). Tildes y ortografia correctas.
- OBLIGATORIO negritas (*texto*) en producto, precio y promo como minimo; nunca un mensaje en texto plano sin nada resaltado. Separa ideas con saltos de linea.
- Empatia directa: valida en 1 linea corta ("Que lindo detalle para tu hija") y ve al grano. Una sola pregunta al final de cada mensaje cuando avanzas, SALVO en la captura de datos de envio (varios datos en un bloque claro).
- Formato WhatsApp: negrita con UN asterisco (*texto*), nunca doble (**texto**). No uses Markdown web (encabezados, listas numeradas largas, imagen).
- RESPONDE PRIMERO, guion despues: si el mensaje trae una pregunta concreta (precio, stock, "¿es original?", envio, pago), respondela PRIMERO en 1 linea con datos reales, y luego sigue con el paso que toca. Nunca la dejes para el final.
- REGLA DURA: max UNA pregunta al cliente por turno (nunca dos preguntas distintas juntas). Guarda stage/followup_hint, llama complete_task y espera.
- Actitud cerradora: PROHIBIDO pedir permiso para enviar fotos/opciones ("¿te gustaria ver fotos?", "¿quieres que te muestre?") — envialo directo con send_media. Evita cierres abiertos ("¿que prefieres?", "¿cual te llama?"): cierra SIEMPRE con un CTA transaccional. CTA por defecto si no sabes ubicacion: "¿El envio seria para *Lima* o para *provincia*?"; si falta distrito: "¿A qué distrito sería el envío?"; si ya hay distrito: la pregunta cerrada de cantidad. Unica excepcion: saludo en frio sin producto, una pregunta breve de enganche.
- PROHIBIDO preguntar por el precio ("¿quieres ver el precio?", "¿te paso el precio?"): si ya identificaste el producto, da precio + promos de una vez.
- No repitas precio/promo/tiempos/pago si ya los diste hace poco, salvo que el cliente lo pida. No menciones procesos internos, herramientas, bugs, calculos manuales ni "hubo un error"/"fallo la herramienta"/"no pude verificar cobertura" mientras puedas avanzar. Solo habla de problema tecnico si create_shopify_order falla tras la confirmacion final (ahi deriva a humano sin prometer que se creo).

MENU POR CATEGORIAS Y CATALOGO:
- Si el cliente NO sabe que quiere o pregunta "que venden"/"que tienen"/"que mas hay", ofrece un menu rapido (NUNCA preguntes en seco "¿sobre que producto?"). Categorias: *Belleza y Salud*, *Suplementos y Vitaminas*, *Hogar y Cocina*, *Regalos*. Ej:
"¿Que estas buscando? Te muestro al toque 👇

• *Belleza y Salud*
• *Suplementos y Vitaminas*
• *Hogar y Cocina*
• *Regalos*

¿Cual te muestro? (o dime *catalogo completo*)"
- Al elegir categoria: shopify_product_lookup con esa categoria y muestra opciones reales con precio/promo + CTA transaccional.
- Producto de arranque (solo saludo sin pedir nada): engancha con los estrella *Black Seed Oil* (lo mas vendido) y *NAD+ Resveratrol* (energia/antiedad) + ofrece el menu, corto y con gancho + pregunta. Ej: "¡Hola! Soy *Akemi* de Kenku 😊\\n\\nNuestro *Black Seed Oil* y el *NAD+ Resveratrol* son lo mas pedido ahora 🔥\\n\\n¿Buscas algo para tu salud y energia, o te muestro otras categorias?". Si ya menciono otro producto/categoria/link, atiende ESO.
- Catalogo completo: solo si pide ver TODO, comparte https://kenku.pe/collections/todos-los-productos (unica URL como texto). REGLA DE ORO: la venta se cierra POR WHATSAPP, no en la web. Si pregunta "¿como compro?"/"¿como entro a la pagina?", NO lo mandes a la web: dile que no necesita entrar a ninguna pagina, se lo dejas listo por aqui, y avanza. Si igual pide el link, compartelo pero di "cuando veas algo que te guste, mandame la captura o el nombre y te armo el pedido por aqui 😊" y guarda followup_hint = "quedaste viendo el catalogo — mandame captura o nombre de lo que te gusto" antes de complete_task.

NORMALIZACION Y GEOGRAFIA:
- Normaliza antes de guardar/resumir/check_coverage: Lma/Lim=Lima, Areq=Arequipa, Truj=Trujillo, Cuz/Cuzco=Cusco, Shalon/Shaloom=Shalom, Olva Curier=Olva Courier.
- CIUDAD capital de provincia = ya conoces su provincia y region: NO las repreguntes. Si nombra una ciudad (Trujillo, Arequipa, Cusco, Chiclayo, Piura, Huancayo, Ica, Tacna, Cajamarca, Iquitos, Pucallpa, Puno, Tumbes, etc.), INFIERE provincia y region y sigue (Trujillo -> La Libertad/Trujillo; Chiclayo -> Lambayeque/Chiclayo; Huancayo -> Junin/Huancayo; Iquitos -> Loreto/Maynas; Cusco -> Cusco/Cusco). Corre check_coverage usando esa ciudad como distrito si no dio uno mas fino; pide el distrito exacto solo si lo necesitas para la direccion. Si dijo "Trujillo" NO preguntes "¿la provincia tambien es Trujillo?".
- Solo si da un DEPARTAMENTO amplio SIN ciudad ("soy de La Libertad", "departamento de Junin"), pide la ciudad/distrito antes de decidir envio.
- Si detectas inconsistencia distrito/provincia/region, corrige con amabilidad y pregunta antes de registrar. Ej: "Solo para validar 😊\\nMe indicaste distrito Trujillo y provincia Lima, pero Trujillo corresponde a La Libertad.\\n¿Lo registramos como Trujillo, La Libertad?".

ANTI-LOOP Y DESPEDIDAS:
- NUNCA envies dos veces seguidas el mismo texto (ni casi identico). Si ya lo dijiste y no avanzo, reformula o no respondas.
- Si el mensaje entrante parece respuesta automatica de otro sistema ("mensajes informativos", "Fue un gusto atenderte", avisos de empresas), NO respondas: complete_task de inmediato.
- Si el cliente se despide o cierra ("gracias", "hasta pronto", "no me interesa"), despidete UNA vez en una linea amable y complete_task; NO relances catalogo ni venta en ese turno.

ANTI-ALUCINACION:
- NUNCA NIEGUES un uso o beneficio que el cliente pregunte ("¿sirve para X?"). Muchas fichas de la tienda estan vacias, asi que si shopify_product_lookup no trae descripcion NO SABES la respuesta: negar por tu cuenta mata la venta y contradice como se vende el producto (paso con el Black Seed Oil y los parasitos, con un cliente que YA habia elegido el 3x2).
- Los TAGS del producto (campo tags de shopify_product_lookup) son usos confirmados por el dueno: si el cliente pregunta por algo que coincide con un tag, CONFIRMALO con seguridad (ej. tag "eliminacion de parasitos" -> "Si, es uno de sus usos principales"). Los tags valen igual que la descripcion.
- Si la descripcion o los tags mencionan ese uso, confirmalo. Si NO hay descripcion ni tag que lo cubra: no afirmes ni niegues. Responde en positivo y deriva: "Es uno de los usos por los que la gente lo busca 🙌 Para darte el detalle exacto te confirmo con el equipo. ¿Te dejo listo el pedido mientras tanto?" y avisa con notify_team (reason="DUDA DE PRODUCTO") con la pregunta textual.
- Vale decir "no" solo si la ficha del producto lo contradice explicitamente, o si el cliente pide algo medico serio (diagnostico, dosis para una enfermedad, reemplazar un medicamento): ahi derivas a un asesor.
- Estos son suplementos naturales, no medicamentos: nunca prometas curar una enfermedad ni digas que reemplazan un tratamiento medico.
- Si no puedes identificar el producto con link, nombre o captura, responde exacto: "Para no darte un dato incorrecto, pasame el link o una captura del producto y lo reviso al toque." Si aun asi no se identifica, deriva a humano con resumen interno. Nunca uses esta frase si el ultimo mensaje trae un link /products/ antes de recibir el resultado de shopify_product_lookup.
`,
    "provider_model_id": "de8992a1-6f21-4a30-9d37-f8645f66e14e",
    "provider_model_name": "gpt-4.1",
    "temperature": "0.2",
    "max_iterations": 40,
    "max_tokens": 8192,
    "reasoning_effort": null,
    "prompt_cache_ttl": "5m",
    "observer_prompt_mode": "analysis_only",
    "message_delivery_mode": "tool_only",
    "enabled_default_tools": [
      "send_media",
      "get_execution_metadata",
      "get_whatsapp_context",
      "get_current_datetime",
      "save_variable",
      "get_variable",
      "enter_waiting",
      "complete_task",
      "handoff_to_human",
      "send_notification_to_user"
    ],
    "default_tool_configs": {},
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [
      {
        "name": "send_buttons",
        "description": "Envia un mensaje de WhatsApp con 1-3 botones de respuesta rapida. Usar para preguntas cerradas: la pregunta final de la presentacion (confirmar direccion guardada o Lima/provincia) y elegir promo (1 unidad / 3x2 / 5x3). El texto va en bodyText; titulos de boton de max 20 caracteres.",
        "function_name": "send-buttons",
        "input_schema": {
          "type": "object",
          "required": [
            "bodyText",
            "buttons"
          ],
          "properties": {
            "buttons": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "title"
                ],
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "title": {
                    "type": "string"
                  }
                }
              },
              "description": "1 a 3 botones; title de maximo 20 caracteres"
            },
            "bodyText": {
              "type": "string",
              "description": "Texto de la pregunta que acompana a los botones"
            }
          }
        },
        "function_slug": "send-buttons"
      },
      {
        "name": "pause",
        "description": "Espera N segundos (2-4) antes de continuar, para que los mensajes lleguen con ritmo humano y no como rafaga. Llamala entre dos mensajes consecutivos tuyos; no envia nada al cliente.",
        "function_name": "pause",
        "input_schema": {
          "type": "object",
          "required": [
            "seconds"
          ],
          "properties": {
            "seconds": {
              "type": "number",
              "description": "Segundos a esperar (2 a 4; varia el valor entre llamadas)"
            }
          }
        },
        "function_slug": "pause"
      },
      {
        "name": "customer_lookup",
        "description": "Busca al cliente en la base de Shopify por su telefono para reconocer clientes recurrentes. Devuelve nombre, cantidad de pedidos previos y la direccion guardada. Llamar UNA vez al inicio de cada conversacion con el telefono del chat.",
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
        "name": "shopify_product_lookup",
        "description": "Find an Kenku Shopify product by product URL, handle, title, or customer message. Use before giving price or product facts.",
        "function_name": "shopify-product-lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "Kenku/Shopify product URL when available."
            },
            "handle": {
              "type": "string",
              "description": "Shopify product handle when already extracted."
            },
            "message": {
              "type": "string",
              "description": "Full customer WhatsApp message, including any Kenku product link."
            },
            "product": {
              "type": "string",
              "description": "Product name or customer-provided product text."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "shopify-product-lookup"
      },
      {
        "name": "send_text",
        "description": "UNICA forma de escribirle texto al cliente. Envia el mensaje por WhatsApp. Manda SOLO contenido util para el cliente (producto, precio, promo, una pregunta, el cierre). Si el texto es narracion de tu proceso interno, la herramienta lo BLOQUEA y no se envia nada.",
        "function_name": "send-text",
        "input_schema": {
          "type": "object",
          "required": [
            "text"
          ],
          "properties": {
            "text": {
              "type": "string",
              "description": "El mensaje tal cual lo debe leer el cliente."
            }
          }
        },
        "function_slug": "send-text"
      },
      {
        "name": "product_media_lookup",
        "description": "Find real Shopify product media (photos, the product video, and testimonial/before-after images) by product URL, handle, title, variant, or color so they can be sent with send_media. Returns media items each with a type ('image' or 'video') and, in presentation mode, a role ('principal', 'antes_despues', 'video', 'testimonio'); send each with send_media using its type. Never paste returned URLs as chat text.",
        "function_name": "product-media-lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "Kenku/Shopify product URL when available."
            },
            "color": {
              "type": "string",
              "description": "Color requested by the customer."
            },
            "limit": {
              "type": "number",
              "description": "Maximum images to return, usually 6."
            },
            "handle": {
              "type": "string",
              "description": "Shopify product handle when already known."
            },
            "message": {
              "type": "string",
              "description": "Full customer WhatsApp message, especially when asking for photos, colors, models, images, or video."
            },
            "product": {
              "type": "string",
              "description": "Product name or last_product title."
            },
            "variant": {
              "type": "string",
              "description": "Variant, color, model, or option requested by the customer."
            },
            "includeVideo": {
              "type": "boolean",
              "description": "Set true when the customer asks for a video of the product, so the lookup also returns the product video item if it exists."
            },
            "presentation": {
              "type": "boolean",
              "description": "Set true when proactively presenting a product: returns the 2 main photos (before/after tagged as role 'antes_despues' when it exists), the product video, and a testimonial image (role 'testimonio'), each tagged with a role, plus videoAvailable/beforeAfterAvailable/testimonialAvailable flags."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "product-media-lookup"
      },
      {
        "name": "quote_order",
        "description": "Calculate Kenku 3x2/5x3 promotions, shipping fee, and total in PEN.",
        "function_name": "Quote Kenku Order",
        "input_schema": {
          "type": "object",
          "properties": {
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "quantity": {
                    "type": "number"
                  },
                  "productId": {
                    "type": "string"
                  },
                  "unitPrice": {
                    "type": "number"
                  },
                  "variantId": {
                    "type": "string"
                  },
                  "productTitle": {
                    "type": "string"
                  },
                  "variantTitle": {
                    "type": "string"
                  }
                },
                "additionalProperties": true
              }
            }
          },
          "additionalProperties": true
        },
        "function_slug": "quote-order"
      },
      {
        "name": "check_coverage",
        "description": "Call immediately when any city, district or locality appears. Normalizes district/province/region, reports only missingLocationFields, and determines cash on delivery or agency logistics.",
        "function_name": "check-coverage",
        "input_schema": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "Single city or locality mentioned by the customer; the function will normalize/infer province and region when safe."
            },
            "zone": {
              "type": "string"
            },
            "place": {
              "type": "string",
              "description": "Fallback for one location string when its administrative type is unknown."
            },
            "agency": {
              "type": "string"
            },
            "region": {
              "type": "string"
            },
            "address": {
              "type": "string"
            },
            "courier": {
              "type": "string"
            },
            "district": {
              "type": "string"
            },
            "distrito": {
              "type": "string"
            },
            "province": {
              "type": "string"
            },
            "direccion": {
              "type": "string"
            },
            "provincia": {
              "type": "string"
            },
            "department": {
              "type": "string"
            },
            "metodoEnvio": {
              "type": "string"
            },
            "departamento": {
              "type": "string"
            },
            "shalomAgency": {
              "type": "string"
            },
            "agenciaShalom": {
              "type": "string"
            },
            "shalom_agency": {
              "type": "string"
            },
            "shippingMethod": {
              "type": "string"
            }
          },
          "additionalProperties": true
        },
        "function_slug": "check-coverage"
      },
      {
        "name": "create_shopify_order",
        "description": "Create a pending Shopify order for confirmed cash-on-delivery orders only. Do not use for agency/voucher flows.",
        "function_name": "create-shopify-order",
        "input_schema": {
          "type": "object",
          "properties": {
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "handle": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "number"
                  },
                  "variantId": {
                    "type": "string"
                  },
                  "productUrl": {
                    "type": "string"
                  },
                  "productTitle": {
                    "type": "string"
                  },
                  "variantTitle": {
                    "type": "string"
                  }
                },
                "additionalProperties": true
              }
            },
            "quote": {
              "type": "object",
              "additionalProperties": true
            },
            "coverage": {
              "type": "object",
              "additionalProperties": true
            },
            "customer": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string"
                },
                "phone": {
                  "type": "string"
                },
                "region": {
                  "type": "string"
                },
                "address": {
                  "type": "string"
                },
                "district": {
                  "type": "string"
                },
                "province": {
                  "type": "string"
                },
                "reference": {
                  "type": "string"
                }
              },
              "additionalProperties": true
            },
            "phoneNumberId": {
              "type": "string",
              "description": "ID del numero de WhatsApp (phoneNumberId) de esta tienda, para analitica multi-tienda."
            },
            "conversationId": {
              "type": "string",
              "description": "ID de la conversacion de Kapso, para enlazar la orden con la conversacion en analitica. Pasalo si lo tienes disponible."
            },
            "stockPorValidar": {
              "type": "boolean",
              "description": "true si el cliente eligio una variante sin stock y se crea la orden sujeta a validacion logistica."
            },
            "specialDeliveryNote": {
              "type": "string"
            }
          },
          "additionalProperties": true
        },
        "function_slug": "create-shopify-order"
      },
      {
        "name": "notify_team",
        "description": "Alerta interna al equipo por Telegram cuando un cliente envia el voucher/adelanto en flujo Shalom/Olva. NUNCA es visible para el cliente: es solo una notificacion al dueno. Llamala junto con handoff_to_human al recibir el voucher.",
        "function_name": "Notify Team",
        "input_schema": {
          "type": "object",
          "properties": {
            "dni": {
              "type": "string",
              "description": "DNI del titular que recogera (si aplica, Shalom)."
            },
            "note": {
              "type": "string",
              "description": "Nota interna adicional para el equipo."
            },
            "phone": {
              "type": "string",
              "description": "Numero de WhatsApp del cliente."
            },
            "total": {
              "type": "string",
              "description": "Monto total a pagar (en soles)."
            },
            "courier": {
              "type": "string",
              "description": "Courier elegido: Shalom u Olva."
            },
            "product": {
              "type": "string",
              "description": "Producto(s) y cantidad del pedido."
            },
            "destination": {
              "type": "string",
              "description": "Agencia/oficina Shalom de destino, o direccion exacta si es Olva."
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
              "description": "Pago/adelanto reportado por el cliente (ej. adelanto S/30 Yape, nro de operacion)."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "notify-team"
      },
      {
        "name": "send_payment",
        "description": "Envia al cliente las instrucciones de pago/adelanto por Yape con el numero OFICIAL de la empresa (fijo, incrustado en la funcion). Usar en flujo de agencia una vez definido el courier: courier=\"shalom\" (adelanto S/30 + saldo al recoger, pide DNI del titular) o courier=\"olva\" (pago total anticipado). El agente NUNCA escribe el numero de Yape: esta herramienta lo hace. Si devuelve ok=false con `text`, envia ese texto exacto.",
        "function_name": "send-payment",
        "input_schema": {
          "type": "object",
          "required": [
            "courier"
          ],
          "properties": {
            "courier": {
              "enum": [
                "shalom",
                "olva"
              ],
              "type": "string",
              "description": "Courier de agencia: 'shalom' (adelanto S/30) u 'olva' (pago total anticipado)."
            }
          }
        },
        "function_slug": "send-payment"
      },
      {
        "name": "save_order_state",
        "description": "Guarda los datos del pedido con nombres fijos y validados. Llamala APENAS el cliente te da cualquiera de estos datos, de a uno o varios: distrito, provincia, cantidad o promo, direccion, referencia, a nombre de quien y celular. Acumula entre llamadas, asi que mandale solo lo nuevo. Te devuelve `missing` con lo que todavia falta y `rejected` con lo que no acepto.",
        "function_name": "save-order-state",
        "input_schema": {
          "type": "object",
          "properties": {
            "dni": {
              "type": "string",
              "description": "DNI, solo si la zona lo pide."
            },
            "promo": {
              "type": "string",
              "description": "1u, 3x2 o 5x3. Si el cliente eligio promo manda esto y NO la cantidad."
            },
            "nombre": {
              "type": "string",
              "description": "A nombre de quien se entrega."
            },
            "region": {
              "type": "string",
              "description": "Region/departamento."
            },
            "celular": {
              "type": "string",
              "description": "Celular peruano de 9 digitos que empieza en 9."
            },
            "cantidad": {
              "type": "number",
              "description": "Unidades, solo si no hay promo."
            },
            "distrito": {
              "type": "string",
              "description": "Distrito de entrega."
            },
            "direccion": {
              "type": "string",
              "description": "Direccion entregable (calle y numero). Nunca relleno como '-' o 'por coordinar'."
            },
            "provincia": {
              "type": "string",
              "description": "Provincia de entrega."
            },
            "referencia": {
              "type": "string",
              "description": "Referencia para ubicar la direccion."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "save-order-state"
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

workflow.addNode("fu-s2", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "Cuando gustes lo retomamos: {{vars.followup_hint}}. Si quieres, seguimos exactamente desde donde quedamos 😊",
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

workflow.addNode("fu-s3", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "Sigo por aquí 🙌 {{vars.followup_hint}}. ¿Quieres que lo dejemos listo?",
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

workflow.addNode("fu-s4", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "Te recuerdo que {{vars.followup_hint}}. Si quieres, te ayudo a elegir entre 1 unidad y la promo *3x2*.",
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

workflow.addEdge("loop-guard", "loop-end", {
  "label": "silencio"
});

workflow.addEdge("loop-guard", "sales-agent", {
  "label": "atender"
});

workflow.addEdge("fu-s5", "fu-p5");

workflow.addEdge("fu-p5", "fu-w6");

workflow.addEdge(START, "init-stage");

workflow.addEdge("init-stage", "init-hint");

workflow.addEdge("init-hint", "init-customer");

workflow.addEdge("fu-w1", "fu-wr1");

workflow.addEdge("fu-h1", "fu-wr1");

workflow.addEdge("fu-w2", "fu-wr2");

workflow.addEdge("fu-h2", "fu-wr2");

workflow.addEdge("fu-s1", "fu-w2");

workflow.addEdge("fu-s6", "fu-w7");

workflow.addEdge("fu-s7", "fu-lost");

workflow.addEdge("init-customer", "loop-guard");

workflow.addEdge("fu-w3", "fu-wr3");

workflow.addEdge("fu-h3", "fu-wr3");

workflow.addEdge("fu-w4", "fu-wr4");

workflow.addEdge("fu-h4", "fu-wr4");

workflow.addEdge("fu-w5", "fu-wr5");

workflow.addEdge("fu-h5", "fu-wr5");

workflow.addEdge("fu-w6", "fu-wr6");

workflow.addEdge("fu-h6", "fu-wr6");

workflow.addEdge("fu-w7", "fu-wr7");

workflow.addEdge("fu-h7", "fu-wr7");

workflow.addEdge("fu-wr3", "fu-g3", {
  "label": "timeout"
});

workflow.addEdge("fu-wr3", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g3", "fu-s3", {
  "label": "enviar"
});

workflow.addEdge("fu-g3", "fu-h3", {
  "label": "esperar"
});

workflow.addEdge("fu-wr4", "fu-g4", {
  "label": "timeout"
});

workflow.addEdge("fu-wr4", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g4", "fu-s4", {
  "label": "enviar"
});

workflow.addEdge("fu-g4", "fu-h4", {
  "label": "esperar"
});

workflow.addEdge("fu-wr5", "fu-g5", {
  "label": "timeout"
});

workflow.addEdge("fu-wr5", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g5", "fu-s5", {
  "label": "enviar"
});

workflow.addEdge("fu-g5", "fu-h5", {
  "label": "esperar"
});

workflow.addEdge("fu-wr6", "fu-g6", {
  "label": "timeout"
});

workflow.addEdge("fu-wr6", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g6", "fu-s6", {
  "label": "enviar"
});

workflow.addEdge("fu-g6", "fu-h6", {
  "label": "esperar"
});

workflow.addEdge("fu-wr7", "fu-g7", {
  "label": "timeout"
});

workflow.addEdge("fu-wr7", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g7", "fu-s7", {
  "label": "enviar"
});

workflow.addEdge("fu-g7", "fu-h7", {
  "label": "esperar"
});

workflow.addEdge("fu-terminal", "fu-end", {
  "label": "terminar"
});

workflow.addEdge("fu-terminal", "fu-w1", {
  "label": "seguir"
});

workflow.addEdge("fu-terminal", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-wr1", "fu-g1", {
  "label": "timeout"
});

workflow.addEdge("fu-wr1", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g1", "fu-s1", {
  "label": "enviar"
});

workflow.addEdge("fu-g1", "fu-h1", {
  "label": "esperar"
});

workflow.addEdge("fu-wr2", "fu-g2", {
  "label": "timeout"
});

workflow.addEdge("fu-wr2", "loop-guard", {
  "label": "respondio"
});

workflow.addEdge("fu-g2", "fu-s2", {
  "label": "enviar"
});

workflow.addEdge("fu-g2", "fu-h2", {
  "label": "esperar"
});

workflow.addEdge("sales-agent", "fu-terminal");

workflow.addEdge("fu-s2", "fu-w3");

workflow.addEdge("fu-s3", "fu-w4");

workflow.addEdge("fu-s4", "fu-w5");

export default workflow;
