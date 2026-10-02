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

**No se arregla desde nuestro prompt**: el armado es de Kapso. Resolverlo de
raiz valdria del orden de **US$0,010 por turno, ~US$500/mes**, pero dependeria
de que Kapso cambie como arma el prompt. **Descartado (2026-09-27):** no se va a
pedir, no hay expectativa de respuesta.

Lo que SI esta en nuestras manos es achicar lo que esa primera llamada paga sin
cache: el prompt entero. Por eso el recorte del prompt es la palanca principal
que queda.

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
| 3a | ~~Cache de la primera llamada de cada turno~~ | ~US$500 | **descartado**: depende de Kapso |
| 3b | Achicar el prompt a ~35k | ~US$250 | alto riesgo, con evals y despues del A/D |
| 4 | `max_iterations` 40 -> 20 | cola | solo despues de D al 100% |

Medido en los eventos: una presentacion manual son **18 llamadas (mediana) y
US$0,103**. Eso confirma la cuenta del hallazgo 1.

## Medicion 2026-09-29: gasto real por dia y por conversacion

Sacado de `raw_usage_json.cost` de cada `agent_token_usage` (el costo que cobra
OpenRouter), agrupado por dia de Lima. Coincide con el panel de Kapso (US$27,19
contra US$27,46 del panel a las 13:23 del 29-sep).

| dia | gasto | conversaciones nuevas | US$/conversacion |
|---|---|---|---|
| 20 a 24-sep (promedio) | US$64/dia | 438/dia | 0,160 |
| 25-sep | US$83 | 526 | 0,162 |
| 26-sep | US$93 | 565 | 0,164 |
| 27-sep | US$99 | 579 | 0,169 |
| 28-sep | US$63 | 434 | 0,138 |

**El gasto diario subio por volumen, no por costo unitario**: las
conversaciones nuevas pasaron de ~440 a ~580 por dia el fin de semana. El dato
que mide la optimizacion es el costo por conversacion.

**D contra A, mismas horas** (costo total de la conversacion, por dia de inicio):

| inicio | A | D | D vs A |
|---|---|---|---|
| 26-sep tarde | 0,170 | 0,146 | -14% |
| 27-sep | 0,190 | 0,149 | -22% |
| 28-sep | 0,150 | 0,120 | -20% |

D ahorra ~US$0,035 por conversacion (~7 llamadas menos). Con D al 50% son
~US$10/dia; al 100%, ~US$20/dia (~US$600/mes), en linea con la estimacion del
hallazgo 1. Las del 28 y 29 siguen abiertas: sus costos todavia suben un poco.

`/workflow_executions/{id}/events?event_type=agent_token_usage` filtra por tipo
y evita paginar todos los eventos. No hay endpoint de uso en la Platform API
(`/usage`, `/llm_usage`, `/token_usage` dan 404).

## Meta cobra los mensajes de servicio desde el 2026-10-01 (US$0,03 c/u)

Medido en los mensajes del 22 al 28-sep (3.221 conversaciones del bot de
ventas), con la tarifa que Meta deja en `kapso.statuses[].pricing` de cada
mensaje:

| | conversaciones/dia | mensajes del bot por conversacion | que marca Meta |
|---|---|---|---|
| vino de un anuncio | ~230 | 14,4 | `free_entry_point` (72 h gratis) |
| no vino de un anuncio | ~230 | 11,5 | `free_customer_service` -> **se cobra** |

Las que pagan son ~2.650 mensajes/dia, **~US$80/dia**. A y D mandan lo mismo
(13,1 contra 12,8 por conversacion): la prueba A/D no cambia esta factura.

**Los seguimientos pagan lo que cuestan.** Pedido tras responder a cada toque,
siguiendo a la clienta por telefono entre conversaciones (la respuesta al s7
llega ~23 h despues y abre una conversacion nueva; contarla solo dentro de la
misma daba 0 y era un error):

| toque | enviados | respondieron | pedidos |
|---|---|---|---|
| s1 | 2.673 | 12,8% | 65 |
| s2 | 2.321 | 7,5% | 30 |
| s3 | 2.132 | 4,9% | 21 |
| s4 | 2.020 | 5,6% | 19 |
| s5 | 1.897 | 3,6% | 8 |
| s6 | 1.824 | 4,3% | 10 |
| s7 | 1.733 | 5,0% | 9 |

Es un techo (parte habria comprado igual), pero incluso a 1/5 cada toque deja
mas que US$0,03. **No se corta ninguno.**

Lo que si se hace: el mismo contenido en menos mensajes.

- **s5, aplicado el 2026-09-30** (workflow lock 28627 -> 28628): el texto "Aqui
  sigo..." ya no va suelto; `fu-p5` manda la foto con ese texto al pie, o el
  texto solo si no hay foto (tiene `send_text` para eso). Se borro `fu-s5` y
  `fu-g5 --enviar--> fu-p5`. Ahorra ~0,4 mensajes por conversacion. Control:
  la respuesta al s5 no deberia bajar de 3,6%.
- **Tanda 2, aplicada el 2026-10-01 ~23:20 hora Lima** (funciones `send-buttons` y
  `send-presentation` desplegadas; workflow lock 29075 -> 29076; sin evals, con
  el respaldo del analisis de abajo) (`evals/fixtures/prompt-tanda2.diff`):
  presentacion compacta solo en conversaciones sin anuncio (saludo+beneficio al
  pie de la foto, testimonio como cabecera de los botones: 8 -> 5 mensajes,
  `send-presentation` lo hace solo para D) y un solo `send_text` por turno.
  ~US$13/dia.

## Analisis 2026-10-02: donde se pueden acotar mensajes sin perder ventas

**Cobro real.** Meta empezo a cobrar el 2026-10-01 a las ~15:05 hora Lima:
desde ahi todo `service` sale `regular`/`billable:true`; los de anuncio siguen
`free_entry_point`. En las primeras 5,7 h: 481 mensajes cobrados (~US$60-80/dia
proyectado; la tarde es la hora pico). Reparto de lo cobrado: respuestas del
bot 26%, presentacion 24%, seguimientos 41%, asesoras 6%, resto 3%.

**Conversaciones que pagan, 22-28 sep** (1.603, 17,5% compro; mensajes
seguidos por telefono entre conversaciones):

| de donde salen | mensajes/dia |
|---|---|
| respuestas del bot | 714 |
| presentacion | 660 |
| seguimientos s1-s7 (+ foto del s5) | 1.016 |
| asesoras (despues del handoff) | 206 |
| plantillas y confirmaciones | 62 |

Hallazgos, contra conversion:

1. **Varios mensajes seguidos no venden mas; lo que importa es terminar con
   pregunta.** Respuesta en <1 h al turno del bot: 1 mensaje con pregunta
   77,9%, 2+ con pregunta 80,3%, 1 sin pregunta 62,4%. Juntar en un mensaje
   que termine en pregunta no pierde nada.
2. **El largo de la presentacion no mueve la respuesta.** Presentaciones sin
   interrupcion: 5 mensajes 31,3% responde en 24 h, 7 mensajes 33,0%, 8
   mensajes 27,2%. El largo lo fija el producto (que media tiene), asi que no
   hay comparacion limpia dentro de producto; pero no hay ninguna senal de que
   los mensajes extra sumen. Compactar (mismo contenido) es seguro.
3. **Asesoras parten mensajes:** de 206/dia, 83 son el 2do, 3ro... de una
   rafaga sin respuesta en medio ("Estas solo 2" / "Modelos" / "Hay").
4. **Seguimientos, US$ de Meta por pedido atribuido (techo):** s1 0,94, s2
   1,68, s3 1,87, s4 4,10, s5 3,85 (ya en 1 mensaje), s6 3,72, s7 3,57. El
   segundo ciclo (tras una respuesta) rinde igual que el primero (2,98).
   s4-s7 cuestan ~US$13/dia por ~3,4 pedidos/dia atribuidos; que convenga
   depende del margen por pedido y de cuantos habrian comprado igual.
5. **El s5 compactado funciona:** desde el 30-sep, 258 envios, todos en un
   solo mensaje (196 foto con texto al pie, 62 texto solo).

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
