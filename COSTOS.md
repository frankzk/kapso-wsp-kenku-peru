# Costo de tokens del bot — donde se va la plata

Medido el 2026-09-26 sobre 12.000 mensajes reales del **Kenku 981**
(`1239315459260256`), una ventana de **1,39 dias**, contra la factura del panel
de Kapso: **US$1.800,25 en 30 dias**.

## Lo que cuesta una llamada

Del panel (`Usage > Tokens`), gemini-3.7-flash por OpenRouter:

| | input | cache read | costo |
|---|---|---|---|
| con cache | 22.496 | 18.933 | **US$0,00422** |
| sin cache | 20.839 | — | **US$0,01587** |

De ahi salen los precios efectivos: **~US$0,75 por millon** de input fresco y
**~US$0,082 por millon** de cache read. **Un fallo de cache cuesta 3,8x.**

La linea de base es el prompt del `sales-agent`: **52.393 caracteres**
(~17.500 tokens), reenviado **en cada iteracion**, mas los esquemas de sus 23
herramientas. Por eso el input es ~22.000 tokens aunque el cliente haya escrito
"hola" y la respuesta sean 14 tokens.

## El volumen real

| | medido |
|---|---|
| mensajes entrantes | 2.925 en 1,39 d = **2.104/dia** |
| mensajes salientes | 9.075 (**3,1 por cada entrante**) |
| de esos, del ladder de follow-up (`fu-s1..s7`, sin LLM) | 2.884 |
| plantillas | 476 |
| **envios hechos por el agente** | **5.715 = 4.097/dia** |
| conversaciones | 775 (media 2 entrantes, p90 9, max 31) |

Cruzando con la factura: US$60/dia ÷ ~US$0,0045 por llamada ≈ **13.000
llamadas al modelo por dia** para **2.104 mensajes de cliente**. Son **~6
llamadas de LLM por cada mensaje que escribe el cliente**, de las cuales ~2 son
"mandar un mensaje".

**Cada envio es una iteracion completa.** Dentro de una presentacion los
mensajes salen con **12 segundos de mediana** entre uno y otro: no es un lote,
es un viaje de ida y vuelta al modelo por mensaje.

## Hallazgo 1 — la presentacion gasta ~17 llamadas en ejecutar un guion fijo

**376 presentaciones por dia, de 5,9 envios cada una: 2.212 envios diarios, el
54% de todo lo que manda el agente.**

Cortando las rafagas de salientes a 120 s de hueco, las firmas mas comunes
(476 rafagas de >=6) son la misma secuencia con o sin video:

```
text · image [· image] [· video] · text · text · image · interactive
saludo   fotos del producto        beneficio precio testimonios botones Lima/provincia
```

Dos conversaciones reales, productos distintos, misma forma exacta:

```
  ¡Hola Sixto! Soy *Akemi* de Kenku 😊            ¡Hola Federico! Soy *Akemi* de Kenku 😊
  [img] Vital Moo™ Calostro Bovino                [img] Magnesio 12 en 1 Complex
  [img] ChatGPT_Image_3_jul...                    [img] ChatGPT_Image_30_jul...
  [video] Mira este video corto del...            [video] Mira este video corto del...
  Fortalece tus defensas y cuida tu salud...      Recupera tu energia, relaja tus musculos...
  *Vital Moo™* queda en *S/ 99*...                *Magnesio 12 en 1* queda en *S/ 149*...
  [img] Lo que dicen nuestros clientes 💬          [img] Lo que dicen nuestros clientes 💬
  ¿te encuentras en *Lima* o en *provincia*?      ¿te encuentras en *Lima* o en *provincia*?
```

Lo unico que cambia es el producto. **Se le esta pagando a un LLM para que
ejecute una plantilla parametrizada.**

**Y son mas llamadas de las que se ven en el chat.** El prompt pide, entre cada
mensaje de la presentacion, llamar `pause` con 2-4 s ("RITMO (pause)"). `pause`
solo duerme, pero es una herramienta: cada pausa es otra vuelta del modelo con
el prompt entero. La cuenta real por presentacion es: `shopify_product_lookup` +
`product_media_lookup` + 8 envios + 7 pausas + 2 `save_variable` +
`complete_task` ≈ **17 llamadas**. Cuadra con los 12 s de mediana entre mensaje y
mensaje: son dos vueltas del modelo por mensaje, no una.

**Arreglo:** una funcion `send-presentation` que haga los envios y las pausas en
codigo. El agente queda en ~5 llamadas (lookup, la funcion, 2 `save_variable`,
`complete_task`): **~12 llamadas menos por presentacion**. Con 376 por dia:
**~US$610/mes al 100%**, ~US$305/mes durante la prueba al 50%. (La primera
estimacion de este archivo decia US$250: contaba solo los envios y no las
pausas.)

Se lanza como A/B y no directo: ver `EXPERIMENTOS.md`, seccion 4.

La unica pieza que no es mecanica es la linea de beneficio
("Fortalece tus defensas y cuida tu salud digestiva..."). Sale del producto:
conviene precomputarla por producto (metafield de Shopify) y no generarla en
cada conversacion.

## Hallazgo 2 — ~~el debounce de 1 s parte las rafagas~~ RETRACTADO

**Lo que se dijo:** que el 22% de los mensajes del cliente sin respuesta propia
eran turnos del agente desperdiciados, y que subir `message_debounce_seconds` de
1 a 15 s ahorraba ~US$100/mes.

**Lo que muestran los eventos de ejecucion** (`/workflow_executions/{id}/events`,
150 ejecuciones del 26-sep): cuando el cliente escribe mientras el agente esta
trabajando, Kapso **inyecta** el mensaje en la corrida en curso
(`agent_messages_injected`, `injection_method: agent_loop`); no arranca otra. En
la muestra fueron **109 mensajes absorbidos asi, sin corrida propia**. Por eso
"Pachacamac" / "Manchay" reciben una sola respuesta: la ráfaga ya se junta sola.

Los turnos que de verdad no mandan nada son el **11,7%** y gastan el **3,1%** de
las llamadas, y casi todos terminan en `handoff_to_human` o `complete_task`:
son turnos donde callarse es lo correcto, no rafagas partidas.

**El debounce no ahorra casi nada. No cambiarlo.** El error fue leer "entrante
seguido de entrante" en el log de mensajes como "dos corridas del agente" sin
verificarlo contra las corridas reales.

## Hallazgo 3 — la primera llamada de cada turno paga el prompt entero

**Medido en los eventos:** la primera llamada al modelo de cada turno va **sin
cache el 98,3% de las veces**; el resto de las llamadas, el 8,1%. Las primeras
llamadas son el 10,9% de las llamadas y el **26,2% del gasto**: US$0,0157 contra
US$0,0054 de una llamada con cache.

No depende del tiempo: pasa aunque el turno anterior haya terminado 7 segundos
antes. (Lo que decia antes este archivo —que el cache se enfriaba en el 14,4% de
los turnos por el TTL de 5 minutos— estaba mal.)

**La causa probable:** Kapso vuelve a armar el system prompt en cada turno
(`agent_prompt_built`) y le **agrega al final** la conversacion
(`<previous_messages>`) y las variables del flujo. El 92% inicial es identico
entre turnos, pero el bloque de instrucciones de sistema ya no es el mismo, y el
cache implicito de Google parece compararlo entero. Dentro de un turno el bloque
no cambia y por eso ahi si pega.

**No se arregla desde nuestro prompt**: el armado es de Kapso. Si se pudiera
(que Kapso mande la conversacion como mensajes y no dentro del system prompt, o
un modelo con cache explicito como los de Anthropic, que Kapso expone con TTL de
1 h), vale del orden de **US$0,010 por turno, ~US$500/mes**. Es una pregunta para
el soporte de Kapso, no un cambio que podamos hacer nosotros.

**Achicar el prompt** sigue valiendo: cada 5.800 tokens menos son ~US$250/mes
(pesa mas en las primeras llamadas, que lo pagan sin cache). Es el cambio de
mayor riesgo: ese prompt acumula reglas que costaron plata aprender. Hacerlo con
los evals de `evals/` como red, y despues del A/D.

**Subir el TTL no es una opcion**: en el catalogo de Kapso
`google/gemini-3.7-flash` tiene `supported_prompt_cache_ttls: []`. El
`prompt_cache_ttl: "5m"` del nodo no hace nada.

## Hallazgo 4 — `max_iterations: 40`: NO bajarlo por ahora

Medido: llamadas por turno p50 6, **p90 20**, p99 23, max 25. Las presentaciones
manuales usan 18 (mediana). Bajarlo a 15 —como decia antes este archivo— las
cortaria a la mitad. Recien cuando D pase al 100% (presentacion en ~5 llamadas)
se puede bajar a ~20 como tope contra un turno descarrilado.

## Resumen

| # | Cambio | Ahorro/mes | Estado |
|---|---|---|---|
| 1 | `send-presentation` como funcion | ~US$610 al 100% | en A/D desde el 26-sep |
| 2 | ~~`message_debounce_seconds` 1 -> 15~~ | ~0 | **retractado**: Kapso ya junta las rafagas |
| 3a | Cache de la primera llamada de cada turno | ~US$500 | depende de Kapso, preguntar |
| 3b | Achicar el prompt a ~35k | ~US$250 | alto riesgo, con evals y despues del A/D |
| 4 | `max_iterations` 40 -> 20 | cola | solo despues de D al 100% |

Medido en los eventos: una presentacion manual son **18 llamadas (mediana) y
US$0,103**. Eso confirma la cuenta del hallazgo 1.

## Como reproducirlo

Los mensajes se bajan del proxy de Meta de Kapso, con cursor:

```
GET https://api.kapso.ai/meta/whatsapp/v24.0/{pnid}/messages?limit=100[&after={paging.next}]
```

`limit` maximo 100, `page`/`offset` no sirven.

**Los eventos de ejecucion son la fuente buena** y hay que ir a ellos antes de
deducir nada del log de mensajes:

```
GET https://api.kapso.ai/platform/v1/workflow_executions/{id}/events?per_page=100&page=N
```

Traen `agent_token_usage` por cada llamada al modelo (input, cache, output),
`agent_tool_called`, `agent_messages_injected` y `agent_prompt_built` (el prompt
armado de verdad). Los precios por token salen del panel `Usage > Tokens`.
