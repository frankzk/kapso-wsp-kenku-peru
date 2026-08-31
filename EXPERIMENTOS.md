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

---

## 1. Modelo del sales-agent — gpt-4.1 por una semana

| | |
|---|---|
| **Arranco** | 2026-08-31 ~13:55 (hora Lima) |
| **Termina** | 2026-09-07 |
| **Que cambio** | `sales-agent`: gpt-4.1-mini -> gpt-4.1 (nodo `sales-agent`, `provider_model_id` `de8992a1-6f21-4a30-9d37-f8645f66e14e`) |
| **Como se mide** | `only=conversion`, antes/contra-despues. NO es A/B: el modelo se configura por nodo, no por conversacion. |
| **Revertir** | `provider_model_name: "gpt-4.1-mini"`, `provider_model_id: "6172658f-422b-4224-8df3-d7795fbc5cc3"` |

**Linea base (gpt-4.1-mini, 10-31 ago): 12.203 conversaciones, 260 pedidos, 2,13%.**

| Semana | Convs | Pedidos | Tasa | AOV |
|---|---|---|---|---|
| 10-16 ago | 3.608 | 72 | 2,00% | S/125,43 |
| 17-23 ago | 4.231 | 93 | 2,20% | S/129,87 |
| 24-31 ago | 4.364 | 95 | 2,18% | S/152,62 |

**Umbral de lectura.** Con ~3.780 conversaciones en la semana, el error estandar
es 0,235 puntos:

- **> 2,84%** (3 sigmas): efecto real y grande. El modelo era la palanca.
- **2,60% - 2,84%** (2 sigmas): señal, pero no concluyente. Extender otra semana.
- **< 2,60%**: sin efecto detectable. Volver a mini.

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
no a caballo de los dos.

## Lo que falta y ordena todo lo demas

**La tasa de entrega real en contraentrega.** Shopify registra el pedido creado,
no si el motorizado cobro. Todo el analisis economico usa un supuesto (60%
pesimista) y la contribucion por pedido va de S/38,39 a S/96,87 segun ese numero.
Si la entrega real esta sobre ~70%, gpt-4.1 pasa a convenir comodo y la
conclusion del experimento 1 cambia de signo.
