# Experimentos vivos — kenku-sales-bot

Tres cosas se estan midiendo a la vez. Los tres son independientes entre si,
pero se leen distinto y en fechas distintas. Este archivo existe para no
confundirlos.

Como leer cualquiera de los tres:

```
POST /platform/v1/functions/e7c39748-c57c-4322-b532-a31d9ac5949b/invoke
{"input": {"only": "ab",         "key": "<INTERNAL_REPORT_KEY>", "since": "...", "until": "..."}}
{"input": {"only": "conversion", "key": "<INTERNAL_REPORT_KEY>", "since": "...", "until": "..."}}
```

El `/invoke` de Kapso a veces corre codigo viejo y devuelve `{"error":"Internal
server error"}` o ceros: hay que reintentar hasta que responda `ok: true`.

**La trampa del borde (corregida el 2026-09-06).** El reporte PEDIA los datos en
UTC (`${until}T23:59:59Z`) pero los agrupa por dia de LIMA. Como el dia de Lima X
va de X 05:00Z a X+1 04:59Z, al ultimo dia del rango se le perdian las ultimas 5
horas (19:00 a 23:59 de Lima) y al principio se colaban 5 horas del dia anterior
como un dia parcial fantasma.

Lo grave no era el faltante sino su sesgo: sobre el 4 de septiembre daba 499
conversaciones y 8 pedidos contra 607 y 13 reales — **18% menos conversaciones
pero 38% menos pedidos**, porque la noche convierte mejor que el promedio. El dia
del borde no salia incompleto, salia con la tasa hundida. Eso hizo parecer al
lunes el peor dia de la semana (1,93%) cuando en realidad es 2,38%: los cuatro
lunes de agosto caian justo en el borde de los tramos consultados.

Ya esta corregido en `resolveRange` (funcion `limaWindowIso`), asi que cualquier
rango devuelve los mismos numeros por dia. Si en el futuro un dia da distinto
segun el rango que lo pida, ese es el sintoma de que la ventana volvio a estar
mal.

**MIRAR SIEMPRE `notes.convTruncated`.** `fetchConversationStats` corta en
MAX_CONV_PAGES (50 paginas x 100 por numero), asi que un rango de ~14 dias con
este volumen trunca el conteo de CONVERSACIONES pero no el de PEDIDOS: los dias
del principio quedan con el denominador chico y la tasa sale inflada. Pasó de
verdad el 2026-08-31: un rango de 18-31 ago daba 22 ago = 140 conversaciones y
9,29%, cuando el dia real fue 658 conversaciones y 1,98%. Sobre ese numero falso
se construyo toda una hipotesis de "la calidad del trafico varia muchisimo entre
dias" que era pura ilusion.

Regla practica: **pedir la conversion en rangos de 7 dias o menos**, y si
`convTruncated` viene `true`, partir el rango y volver a preguntar. Los tres
tramos de la linea base de abajo estan verificados con `convTruncated: false`.

---

## 1. Modelo del sales-agent

**Estado: corriendo `google/gemini-3.7-flash` desde el 2026-09-05 ~22:55 (Lima).**

| | |
|---|---|
| **Modelo actual** | `google/gemini-3.7-flash`, `provider_model_id` `a88e0501-2f81-4e01-831f-0fed220cc0bc` (OpenRouter) |
| **Puesto** | 2026-09-05 ~22:55 hora Lima, por PATCH del definition (lock_version 18784 -> 18785) |
| **Primer dia completo** | 2026-09-06 |
| **Leer** | 2026-09-13 (una semana), con el mismo criterio que se leyo gpt-4.1 |
| **Revertir** | gpt-4.1-mini: `6172658f-422b-4224-8df3-d7795fbc5cc3` / gpt-4.1: `de8992a1-6f21-4a30-9d37-f8645f66e14e` |

**Por que este y no mini.** El laboratorio de `evals/` lo midio sobre ocho
conversaciones reales: 23/23 reglas y 8/8 casos, repetido en **dos corridas
independientes** y con 41% menos tokens que gpt-4.1. Ningun otro candidato de
los nueve probados le empato; mini saco 20/23. Detalle en `evals/README.md`.

**Lo que eso NO dice.** El laboratorio mide calidad de respuesta, no ventas. Que
gemini gane ahi no garantiza que mueva la conversion: hay que medirlo en
produccion con la misma vara con la que se midio gpt-4.1, contra la misma linea
base de 2,13%.

**El cambio se hizo a las 22:55 de Lima**, asi que la ultima hora del 5 de
septiembre queda mezclada entre los dos modelos. Es despreciable, pero por eso el
primer dia limpio de gemini es el 6 y el cierre de gpt-4.1 se lee sobre 1-5 sep.

---

### 1.b Lo que dejo el experimento de gpt-4.1 (cerrado el 2026-09-05)

| | |
|---|---|
| **Corrio** | 2026-08-31 ~13:55 a 2026-09-05 ~22:55 (hora Lima) |
| **Que cambio** | `sales-agent`: gpt-4.1-mini -> gpt-4.1 (`de8992a1-6f21-4a30-9d37-f8645f66e14e`) |
| **Como se midio** | `only=conversion`, antes/contra-despues. NO es A/B: el modelo se configura por nodo, no por conversacion. |

**Linea base (gpt-4.1-mini, 10-31 ago): 12.203 conversaciones, 260 pedidos, 2,13%.**

**Marcha del experimento** (dias completos, ya con la ventana corregida):

| Dia | Convs | Pedidos | Tasa |
|---|---|---|---|
| 1 sep | 579 | 20 | 3,45% |
| 2 sep | 539 | 18 | 3,34% |
| 3 sep | 648 | 6 | 0,93% |
| 4 sep | 607 | 13 | 2,14% |
| 5 sep | 572 | 10 | 1,75% |

**Ojo con la fila del 5 de septiembre: se leyo a las ~22:55 de Lima, con el dia
todavia sin terminar.** Le falta la ultima hora, que ademas es de las que mejor
convierten. Al releerla para el cierre va a dar un poco mas alta.

Acumulado al 5 de septiembre: **2.945 conversaciones, 67 pedidos, 2,28%** contra
2,13% de base. z = 0,58: sin señal. Para pagarse necesitaba ~3,4% (el sobrecosto
era S/7.555/mes contra S/38-97 de contribucion por pedido). El cierre definitivo
sobre 1-5 sep queda para el 7 de septiembre, con el dia 5 ya completo.

El 0,93% del 3 de septiembre asusta pero no es anomalo: es el segundo dia mas
bajo de 32, y el peor fue el 14 de agosto con 0,79%, con mini. Dias cerca del 1%
pasaron cuatro veces en agosto. Verificado que el bot no fallo ese dia: 70,5% de
las conversaciones vio precio (rango normal 63-78%), cero mensajes de ambiguedad
al cliente y una sola ejecucion fallida.

**Conversion por dia de la semana** (agosto-septiembre, ventana corregida), util
para leer cualquier dia suelto antes de alarmarse:

| | dom | mar | lun | mie | jue | vie | sab |
|---|---|---|---|---|---|---|---|
| tasa | 2,91% | 2,46% | 2,38% | 2,17% | 2,02% | 1,97% | 1,76% |

Los domingos convierten 65% mejor que los sabados.

| Semana | Convs | Pedidos | Tasa | AOV |
|---|---|---|---|---|
| 10-16 ago | 3.608 | 72 | 2,00% | S/125,43 |
| 17-23 ago | 4.231 | 93 | 2,20% | S/129,87 |
| 24-31 ago | 4.364 | 95 | 2,18% | S/152,62 |

**Umbral de lectura.** Con ~3.780 conversaciones en la semana, el error estandar
es 0,235 puntos:

- **> 2,84%** (3 sigmas): efecto real y grande. El modelo era la palanca.
- **2,60% - 2,84%** (2 sigmas): señal, pero no concluyente. Extender otra semana.
- **< 2,60%**: sin efecto detectable. Sacar gpt-4.1.

Estos mismos tres umbrales sirven para leer a gemini el 13 de septiembre: la
linea base y el volumen semanal no cambiaron.

**Por que solo una semana.** Cuesta ~S/1.900 y alcanza para responder la pregunta
que importa. Un efecto chico (2,2% -> 2,6%) no se paga solo de todas formas: el
sobrecosto de gpt-4.1 es S/7.555/mes y en el peor escenario de costos (envio
S/20, 60% de entrega, contribucion S/38,39 por pedido) recien se paga a 3,41%.

**Que NO prueba.** La caida de julio esta confundida con el crecimiento del
trafico: de 7,61% a 3,65% paso *antes* del cambio de modelo, con gpt-4.1 puesto,
mientras el trafico se triplicaba. Este test mide el efecto del modelo HOY, no
reconstruye que paso en julio.

---

## 2. Variante C — invitar la duda del cliente

| | |
|---|---|
| **Arranco** | 2026-08-28 |
| **Leer** | 2026-09-15 (~3 semanas) |
| **Eje** | `ab_variant` (A control / C tratamiento), hash FNV-1a del telefono mod 2 |

**Que cambia:** a los leads cuyo primer mensaje trae "Tengo una consulta" (el
boton de WhatsApp de la web, ~48% del trafico), la presentacion cierra invitando
su duda en vez de pedirles "¿Lima o provincia?". Al resto los trata igual que A.

**Que mirar: `liftCvsA_soloConsulta`, NO el global.** C solo cambia el
comportamiento de un tercio de los leads, asi que el numero global viene diluido
por los que reciben exactamente lo mismo que el control.

**Por que:** de 28 conversaciones a las que se les pregunto la ubicacion solo 5
contestaron, y ahi se concentra el 50% de toda la ruptura del embudo. En el
control, los leads "consulta" convierten al 1,52% contra 5,77% del resto.

---

## 3. Prueba P1/P2 — empuje al 3x2

| | |
|---|---|
| **Arranco** | 2026-08-31 |
| **Leer** | 2026-09-10 (~10 dias; mueve el ticket, que tiene menos varianza que la conversion) |
| **Eje** | `promo_variant` (P1 control / P2 tratamiento), **ortogonal** al de la variante C |

**Que cambia:** en P2 el 3x2 es la opcion principal y no la alternativa, con el
precio por unidad calculado, y una sola insistencia si el cliente elige 1 unidad.

**Que mirar: `revenuePerLead`, NO `rate`.** P2 puede convertir menos y aun asi
ganar, porque cada pedido deja mas. En el peor escenario de costos un 3x2 deja
S/117,40 de contribucion contra S/55,60 de una unidad (2,1x): el envio y el
riesgo de rechazo se pagan una sola vez por pedido.

**Ortogonalidad.** Las cuatro celdas (A/P1, A/P2, C/P1, C/P2) reciben ~25% del
trafico cada una, asi que los experimentos 2 y 3 no se contaminan. Verificado
sobre 40.000 telefonos: 24,68 / 25,15 / 25,36 / 24,82%, con P2 al ~50% dentro de
A y dentro de C.

**Cuidado con el hash.** El bit bajo de FNV-1a es solo la paridad de los XOR:
`fnv1a(x + sal) % 2` queda PERFECTAMENTE correlacionado con `fnv1a(x) % 2` — el
primer intento dejaba dos celdas vacias sin dar ningun error. Por eso el eje de
promo pasa el hash por un mezclador de avalancha antes de tomar el bit.

---

## Interaccion entre los tres

El cambio de modelo (1) afecta por igual a todos los brazos de (2) y (3), asi que
sus comparaciones internas siguen siendo validas. Lo que si se mueve es su linea
base a mitad de camino: **leer (2) y (3) sobre el periodo con un solo modelo**,
no a caballo de dos.

Ya van **dos** cortes de modelo: mini -> gpt-4.1 el 31 de agosto ~13:55, y
gpt-4.1 -> gemini-3.7-flash el 5 de septiembre ~22:55 (ambos hora Lima). El 3x2
(P1/P2) arranco el 31 de agosto y se lee el 10 de septiembre, asi que su ventana
cae a caballo de los dos cortes; la variante C arranco el 28 de agosto y cruza
los tres modelos. En los dos casos la comparacion **entre brazos** sigue siendo
limpia —los brazos comparten modelo en todo momento—, pero la tasa absoluta de
cualquiera de los brazos no se puede comparar contra la de agosto.

## Lo que falta y ordena todo lo demas

**La tasa de entrega real en contraentrega.** Shopify registra el pedido creado,
no si el motorizado cobro. Todo el analisis economico usa un supuesto (60%
pesimista) y la contribucion por pedido va de S/38,39 a S/96,87 segun ese numero.
Si la entrega real esta sobre ~70%, gpt-4.1 pasa a convenir comodo y la
conclusion del experimento 1 cambia de signo.
