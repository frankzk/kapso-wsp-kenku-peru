# Workflow de cobros Shalom — paquete para replicarlo en otro proyecto de Kapso

Exportado el 2026-09-28 del proyecto Kapso **Kenku Perú**, workflow
**"Kenku Cobros Shalom"** (`4c2578dc-1a8e-4ae6-93bc-c6cd66678e2b`, lock 598).
En Kenku atiende dos números, el 931 432 600 y el 929 334 428.

Este archivo está escrito para **la sesión de Claude que trabaja el proyecto
destino** (por ejemplo, Aurela). Leelo entero antes de tocar nada.

> **Regla de alcance:** todo lo que sigue se hace en el proyecto DESTINO, con
> SU API key. Nada de esto modifica Kenku, y Kenku no se toca desde allá.

---

## 1. Qué hace

Es la línea de cobro del **saldo pendiente de los pedidos enviados por
Shalom**. Quien escribe ya compró, pagó un adelanto y tiene el paquete en
camino o en la agencia: no es un lead y no se le vende nada.

El silencio se decide con código; la respuesta, con un agente:

```
start -> router (decide, funcion shalom-router)
  router --[boton]---> esperar-6h (wait_for_response, 21600 s) -> compuerta
  router --[trivial]-> fin
  router --[voucher]-> avisar-pago (notify-team) -> agente -> fin
  router --[texto]---> agente -> fin

  compuerta (decide, shalom-router) --[voucher]--> avisar-pago
                                    --[texto]----> agente
                                    --[recordar]-> recordatorio (send_text) -> fin
                                    --[fin]------> fin
```

8 nodos, 13 aristas. `fin` es un `set_variable` (`cobro_shalom_cerrado = true`).

### Las reglas que tienen que seguir valiendo (las aplica `shalom-router`, no el modelo)

| Entra | Arista | Qué pasa |
|---|---|---|
| Uno de los botones de la plantilla: «Pagar con Yape», «Transferencia Depósito», «Transferencia / Depósito», «Link de pago» | `boton` | **Silencio.** Los contesta el dashboard por webhook |
| Acuse trivial: «ok», «gracias», «listo», «de acuerdo», un emoji | `trivial` | **Silencio.** Lo contesta el dashboard |
| Mensaje con cualquier dígito (DNI, celular, número de operación de Yape, una cantidad) | `texto` | **Nunca es trivial**: va al agente |
| «no», «nunca», «cancelar», «anular», «devolver» (y «no gracias») | `texto` | **Nunca son triviales**: van al agente, que deriva a una persona |
| Imagen o PDF | `voucher` | Aviso al equipo y el agente agradece |
| Cualquier otro texto | `texto` | Contesta el agente o deriva |
| 6 h sin respuesta después de un botón | `recordar` | **Un** recordatorio, solo si la ventana de 24 h sigue abierta y nadie le escribió en el medio |

**La lista `TRIVIALES` del router tiene que ser IDÉNTICA a la lista de acuses
del dashboard.** Donde el router calla, el dashboard contesta; donde el router
habla, el dashboard calla. Una palabra que esté solo en el router deja a la
clienta sin respuesta; una que esté solo en el dashboard le manda dos. Si el
proyecto destino usa otro dashboard u otra lista, hay que alinearlas.

---

## 2. Qué trae el paquete

| Archivo | Qué es |
|---|---|
| `definicion.json` | La definición completa del workflow, con los datos de Kenku reemplazados por marcadores `<<...>>` |
| `prompt-agente.txt` | El system prompt del nodo `agente` (ya incluido en la definición; va aparte para leerlo) |
| `shalom-router/index.js` | El código del router. No tiene números ni IDs de Kenku: lee el número de cada conversación |
| `shalom-router/test/router.test.cjs` | 30 tests de las reglas. Correr: `node shalom-router/test/router.test.cjs` → `30/30` |
| `referencia/send-text.js` | La versión de Kenku de `send-text`, solo como referencia (ver 3.3) |

**No viene `notify-team` a propósito:** la versión de Kenku tiene escrito en el
código el chat de Telegram de un miembro del equipo de Kenku
(`EXTRA_TEAM_CHAT_IDS`). Copiarla mandaría las alertas del otro proyecto a esa
persona. Hay que usar el `notify-team` del proyecto destino (ver 3.3).

### Los marcadores de `definicion.json`

| Marcador | Veces | Con qué se reemplaza |
|---|---|---|
| `<<FUNCTION_ID_SHALOM_ROUTER>>` | 2 | El id de la función `shalom-router` que se crea en el paso 4.1 |
| `<<FUNCTION_ID_NOTIFY_TEAM>>` | 2 | El id del `notify-team` del proyecto destino |
| `<<FUNCTION_ID_SEND_TEXT>>` | 1 | El id del `send-text` del proyecto destino |
| `<<PROVIDER_MODEL_ID_GEMINI_3_7_FLASH>>` | 1 | El id de `google/gemini-3.7-flash` en `GET /platform/v1/provider_models` |
| `<<NOMBRE_DE_LA_LINEA_DE_COBROS>>` | 1 | Cómo se llama la línea, dentro del prompt ("Atiendes el número …") |

Después de reemplazar no puede quedar ningún `<<` en el archivo.

---

## 3. Antes de empezar: verificar en el proyecto destino

### 3.1 El número de cobros

- `GET /platform/v1/whatsapp/phone_numbers`: tiene que figurar,
  `status: CONNECTED` y `inbound_processing_enabled: true`.
- El `whatsapp_config_id` **no es el phone_number_id**: se saca del campo
  `whatsapp_config_id` de cualquier conversación de ese número
  (`GET /platform/v1/whatsapp/conversations?phone_number_id=...`).

### 3.2 Que ningún otro workflow escuche ese número

Para cada workflow: `GET /platform/v1/workflows/{id}/triggers` y mirar
`triggerable.phone_number_id`. **Dos workflows en el mismo número le responden
dos veces a la clienta.** Si hay otro, avisarle al usuario antes de tocarlo.

### 3.3 Las funciones que el workflow usa y no trae el paquete

**`notify-team`** (nodo `avisar-pago` + herramienta `notify_team` del agente).
El agente lo llama con `reason` (etiqueta corta: `cobro_shalom_devolucion`,
`cobro_shalom_reclamo`, `cobro_shalom_ya_pago`, `cobro_shalom_pide_humano`,
`cobro_shalom_otro`) y `note` (el motivo en una línea). El nodo `avisar-pago`
lo llama **sin argumentos**. En Kenku, sin `reason` el aviso sale titulado
«Voucher recibido — validar y enviar» (correcto para `avisar-pago`) y con
`reason` sale titulado con la etiqueta. **Verificar que el `notify-team` del
destino se comporte igual**; si no distingue por `reason`, un handoff se va a
ver en Telegram como si fuera un voucher.

**`send-text`** (herramienta `send_text` del agente). Tiene que manejar los
contactos que entran por **username** (sin teléfono, solo BSUID
`PE.948592654941065`): esos van en **`recipient`**, NO en `to`. Con `to`, Meta
responde 200 con messageId y el mensaje muere después con `131026`. Comparar
con `referencia/send-text.js` (líneas del `recipient`).

### 3.4 El dashboard: plantilla y webhooks

- **La plantilla** de aviso de Shalom que manda el dashboard tiene que tener los
  botones con estos textos (el router compara sin tildes ni mayúsculas):
  «Pagar con Yape», «Transferencia Depósito» o «Transferencia / Depósito»,
  «Link de pago». **Si los botones del destino dicen otra cosa, hay que
  cambiar el set `BOTONES` de `shalom-router/index.js`** y sus tests.
- **Webhook de mensajes:** `GET /platform/v1/whatsapp/webhooks` tiene que tener
  una suscripción `whatsapp.message.received` del número de cobros apuntando al
  dashboard. **Sin ella nadie contesta los botones**: el router calla y el
  dashboard nunca se entera. El `phone_number_id` de un webhook **no se puede
  editar** (el PATCH devuelve 200 y lo ignora): si hace falta, se crea uno nuevo.
  No crear suscripciones sin permiso del usuario.
- **Webhook de handoff:** una suscripción de proyecto (sin número) con
  `workflow.execution.handoff` al dashboard, para que las derivaciones lleguen.

---

## 4. Paso a paso

Base: `https://api.kapso.ai/platform/v1`, header `X-API-Key: <key del proyecto destino>`.

### 4.1 Crear y desplegar `shalom-router`

```
POST /functions
{"function": {"name": "shalom-router", "slug": "shalom-router",
              "code": <contenido de shalom-router/index.js>,
              "function_type": "cloudflare_worker",
              "invoke_response_mode": "passthrough"}}
POST /functions/{id}/deploy
```

**Recién después del primer deploy** se puede cargar el secret (antes da 422
"Function must be deployed before managing secrets"):

```
POST /functions/{id}/secrets
{"secret": {"name": "KAPSO_API_KEY", "value": "<key del proyecto destino>"}}
```

Los secrets van por esta vía; el `runtime_config` NO se inyecta al runtime.

### 4.2 Reemplazar los marcadores

En `definicion.json` (ver la tabla de la sección 2). Verificar que no quede
ningún `<<`.

### 4.3 Crear el workflow y cargarle la definición

```
POST /workflows
{"workflow": {"name": "<nombre>", "slug": "<slug>", "status": "active",
              "message_debounce_seconds": 1, "inbound_message_read_mode": "read_with_typing"}}

GET  /workflows/{id}/definition          -> leer data.lock_version
PATCH /workflows/{id}
{"workflow": {"definition": <definicion.json>, "lock_version": <el recien leido>}}
```

### 4.4 El disparador

```
POST /workflows/{id}/triggers
{"trigger": {"trigger_type": "inbound_message", "triggerable_type": "whatsapp_phone_number",
             "phone_number_id": "<pnid>", "whatsapp_config_id": "<config uuid>"}}
```

**Un disparador = un número.** Para más números, un disparador más en el MISMO
workflow (no una copia del workflow).

### 4.5 El watchdog (si el proyecto lo tiene)

En Kenku, `check-coverage` tiene una lista `WATCHDOG_PHONE_IDS`: las
conversaciones de esos números que quedan más de 3 min sin respuesta van a la
cola "Atender ahora" y avisan por Telegram. Si el destino tiene algo
equivalente, agregar el número de cobros.

---

## 5. Trampas de la API de Kapso que ya se pisaron

- **`function_id`, no `function_slug`.** Por API, Kapso NO resuelve el slug al
  id (eso lo hace el CLI en `kapso push`). Todo decide de tipo función, todo
  nodo `function` y todo item de `flow_agent_function_tools` tiene que llevar
  su `function_id`. **Verificar con un GET después del PATCH que ninguno quede
  en `null`.**
- **`lock_version` envejece** entre el GET y el PATCH: el workflow se
  actualiza en cada ejecución. Leer y aplicar en el mismo paso; un 409 "Flow
  was updated by another request" significa que hay que releer y reintentar.
- **`set_variable` exige `variable_name`** (400 "variable_name can't be blank").
- **Borrar un disparador:** `DELETE /platform/v1/triggers/{id}` (204).
  `DELETE /workflows/{id}/triggers/{id}` da **404**.
- **`/invoke` puede correr código viejo** durante minutos después de un deploy.
  Para saber si ya está el nuevo, usar una respuesta que distinga versiones.
- **El invoke corta a los 30 s** y devuelve 500 aunque la función siga
  corriendo.
- **Los mensajes que el cliente manda mientras el agente trabaja se inyectan
  en esa misma corrida** (`agent_messages_injected`): no arrancan otra.
- **Para depurar:** `GET /workflow_executions/{id}/events?per_page=100&page=N`
  trae cada llamada al modelo (`agent_token_usage`), cada herramienta y el
  prompt armado. Viene del más nuevo al más viejo: en ejecuciones largas hay
  que paginar hasta el final para ver el principio.
- **Los `send_text` del workflow van con `phone_number_id: null`** a propósito:
  así salen por el número de la conversación. En Kenku, borrar un número se
  llevó los nodos que lo referenciaban.

---

## 6. Verificación final

1. `node shalom-router/test/router.test.cjs` → `30/30`.
2. `GET /workflows/{id}/definition`: 8 nodos, 13 aristas, **0 `function_id` en
   null**, ninguna arista apunta a un nodo inexistente, y cada arista con label
   distinto de `next` tiene un `flow_condition_id` que existe en su nodo decide.
3. Mapa de disparadores de TODOS los workflows: el número de cobros aparece en
   uno solo.
4. Router contra una conversación real del número (solo lee, no envía nada):
   ```
   POST /functions/{router}/invoke
   {"whatsapp_context": {"conversation": {"id": "<conv>", "phone_number_id": "<pnid>"}},
    "available_edges": ["boton", "trivial", "voucher", "texto"]}
   ```
   Tiene que devolver `{"next_edge": ...}` coherente con el último mensaje.
5. De punta a punta, desde un celular de prueba al número de cobros:
   - «hola, ¿cuánto me falta pagar?» → contesta el agente, sin vender;
   - «ok» → no contesta nada;
   - un botón de la plantilla → no contesta el bot (contesta el dashboard).
6. Revisar la ejecución en los eventos (punto 5 de la sección 5).

---

## 7. Lo que es de Kenku y hay que decidir en el destino

- **El prompt del agente** (`prompt-agente.txt`) habla de Shalom, de la agencia
  y de «2 a 5 días hábiles». Si en el destino el courier, los plazos o las
  reglas de cobro son otras, hay que ajustarlo **antes** de aplicar.
- **El recordatorio** de las 6 h dice: «Hola 👋 ¿Pudiste hacer el pago del saldo
  pendiente? Apenas lo recibamos, tu pedido queda listo para que lo recojas en
  la agencia 😊 …». Revisar que aplique.
- **La lista `TRIVIALES`** y el set **`BOTONES`** del router (secciones 1 y 3.4).
