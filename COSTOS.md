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

## Hallazgo 1 — la presentacion gasta 6 llamadas en ejecutar un guion fijo

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

Lo unico que cambia es el producto. **Se le esta pagando a un LLM ~6 veces por
conversacion para que ejecute una plantilla parametrizada.**

**Arreglo:** una funcion `send-presentation(handle)` que haga los 6 envios de
corrido. El agente pasa de ~7 iteraciones a 2 (la llamada y el cierre).
Ahorro estimado: **~1.800 llamadas/dia ≈ US$250/mes**.

La unica pieza que no es mecanica es la linea de beneficio
("Fortalece tus defensas y cuida tu salud digestiva..."). Sale del producto:
conviene precomputarla por producto (metafield de Shopify) y no generarla en
cada conversacion.

## Hallazgo 2 — el debounce de 1 s parte las rafagas del cliente

**El 22% de los turnos no produce ninguna respuesta** (629 de 2.925). No es que
el bot se quede mudo: es que el cliente escribe en tandas y cada mensaje
dispara su propio turno del agente. Conversacion real:

```
  >> Donde queda su tienda
  >> Para ir a visitarlo
     Somos tienda 100% online con envios a todo el Peru 📦 ...
  >> Pachacamac
  >> Manchay
     ¡Excelente! Para Pachacamac (Manchay) tenemos entrega a domicilio...
```

El primer mensaje de cada tanda corre el agente, gasta sus llamadas y no manda
nada. Distribucion de los huecos entre entrante y entrante (n=530):

| hueco | acumulado |
|---|---|
| <= 5 s | 151 |
| <= 8 s | 264 |
| <= 15 s | 410 |
| <= 30 s | 463 |

`message_debounce_seconds` esta en **1**. Subirlo a **15 s** junta el 77% de las
tandas: **~295 turnos menos por dia**. Ahorro estimado **~US$100/mes**, y ademas
el bot deja de contestar a medias con la mitad del mensaje.

Costo: hasta 15 s mas de latencia. La mediana de respuesta del cliente son 37 s
y el bot ya tarda 12 s entre mensaje y mensaje, asi que no cambia la sensacion.

## Hallazgo 3 — el prompt de 52.393 caracteres se paga en cada iteracion

Es el 80% del input de cada llamada. Con cache se paga barato
(US$0,082/M), sin cache se paga 9x mas — y el **14,4% de los turnos llega
con el cache frio**, medido sobre el hueco real entre el ultimo saliente y el
siguiente entrante:

| hueco saliente -> entrante | |
|---|---|
| <= 5 min | 85,6% |
| <= 30 min | 95,0% |
| <= 1 h | 96,9% |

**Subir el TTL no es una opcion**: en el catalogo de Kapso
`google/gemini-3.7-flash` tiene `supported_prompt_cache_ttls: []`. El
`prompt_cache_ttl: "5m"` del nodo no hace nada; lo que se ve en el panel es el
cache implicito de Google. Los unicos con `['5m','1h']` son los de Anthropic.

Queda entonces **achicar el prompt**. Bajarlo de 52k a ~35k caracteres
(-5.800 tokens por llamada) vale **~US$230/mes**. Es el ahorro mas grande por
token pero tambien el de mayor riesgo: ese prompt acumula reglas que costaron
plata aprender. Hacerlo con los evals de `evals/` como red.

## Hallazgo 4 — `max_iterations: 40`

Una presentacion usa ~7. El tope de 40 no limita nada util y deja que un turno
descarrilado cueste hasta US$0,18. Bajarlo a 15 no toca el flujo normal.

## Resumen

| # | Cambio | Ahorro/mes | Riesgo |
|---|---|---|---|
| 1 | `send-presentation` como funcion | ~US$250 | bajo, es codigo deterministico |
| 2 | `message_debounce_seconds` 1 -> 15 | ~US$100 | bajo, un campo |
| 3 | Achicar el prompt a ~35k | ~US$230 | alto, correr los evals antes |
| 4 | `max_iterations` 40 -> 15 | cola | bajo |

Los tres primeros juntos son **~US$580 de US$1.800, un tercio de la factura**,
sin tocar lo que ve el cliente.

## Como reproducirlo

Los mensajes se bajan del proxy de Meta de Kapso, con cursor:

```
GET https://api.kapso.ai/meta/whatsapp/v24.0/{pnid}/messages?limit=100[&after={paging.next}]
```

`limit` maximo 100, `page`/`offset` no sirven. No hay endpoint de uso de tokens
en la Platform API: los precios de arriba salen de leer el panel.
