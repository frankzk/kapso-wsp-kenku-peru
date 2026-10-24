# Diagnostico de abandono (2026-10-14)

Base: 3.204 conversaciones del sales bot del 22 al 28-sep (14,7% compro,
pedido = confirmacion #KP del bot o de asesora), texto completo de cada
mensaje. El origen por anuncio usa 1-13 oct (5.610 conversaciones, pedido =
orden creada por el bot).

## 1. Cuello de botella

- **Ultimo mensaje antes del abandono**: el 30% de los 2.733 abandonos termina
  en el MISMO mensaje: "Por cierto 😊, ¿te encuentras en *Lima* o en
  *provincia*?" [Lima][Provincia] (cierre de la presentacion). Le siguen: la
  clienta escribio ultima y nadie respondio (14%), otras respuestas (14%),
  despedidas (10%, normal), lo tenia una asesora (7%), pregunta de distrito (5%).
- **Nadie respondio (393)**: 198 derivadas a asesora sin respuesta posterior
  (~28/dia), 82 cierres triviales (correcto), 68 textos sin respuesta (incluye
  auto-respuestas de otras empresas).
- **Objeciones con mas caida tras la respuesta del bot**: precio/descuento 37%
  (374/sem), uso/dosis 30% (40), forma de pago 21% (66).

## 2. Friccion

- Pedir 2-3 datos a la vez NO sube la caida (1 dato 14,7%, 2 datos 13,8%,
  3+ 11,4%): para entonces la clienta ya esta comprometida.
- Largo: respuestas de 500+ caracteres -> 29,7% no vuelve a escribir, contra
  17-18% entre 150 y 500. Las que compraron recibieron en promedio 237
  caracteres por respuesta; las que no, 262.
- Botones vs texto: "¿Lima o provincia?" siempre va con botones (no hay
  comparacion). Cantidad: botones 17,6% de caida vs texto 13,1% (n=122): flojo.

## 3. Origen

- Peor fuente con volumen: "Cansado de la caspa" (Biru, campaña de mayor
  presupuesto): 892 conversaciones, 0,9% pedidos del bot (promedio 4,6%).
  Tambien bajas: Vital Moo 1,4%, Magnesio Spray 1,6%, Aceite Magic 0,8%.
  Mejores: "Elimina hongos en pies" 18,9%, sin anuncio 6,2%.
- De los abandonos: 40% nunca escribio mas alla del primer mensaje (prellenado:
  sin intencion demostrada), 35% escribio algo sin dar datos, 25% dio datos de
  compra (zona, distrito, direccion o DNI) y se trabo.

## 4. Señales tempranas

- "Quiero más información" (prellenado) y nada mas: 0,6% compra (469/sem).
- 2do mensaje "lo quiero / quiero 1 / 3x2": 46%; duda de confianza: 35%;
  elige zona: 27%; pregunta precio: 11%.
- Latencia de respuesta a la presentacion: <1 min 27% compra, 1-30 min 18%,
  30 min-3 h 12%, 3-24 h 6,5%, nunca 0,6%.

## 5. Condicion de victoria

- Compran despues de: tocar "Confirmar pedido" 90%, dar direccion 78%, dar
  DNI 76%, elegir cantidad 57%, mandar foto/voucher 50%, dar distrito 41%,
  elegir Lima/Provincia 26%. El punto de no retorno es dar la direccion.
- Preguntas de las que mas compran: envio/demora (47%), forma de pago (33%),
  para que sirve (28%). Las de precio, 14%.

## Ya probado (no repetir)

Preguntar antes de presentar (variante B, ago) e invitar la duda (variante C,
sep) no movieron la venta: la menor caida de quien "conversa antes" es del
tipo de clienta, no del orden de los mensajes.

# Por que se caen los pedidos — 2da parte (2026-10-14)

Base: 8.845 conversaciones nuevas del 1 al 13-oct (numeros 981 y 451), texto
completo. Compra = confirmacion #KP o "pedido generado/confirmado" (bot o
asesora): 968 = 10,9% (IC95 10,3-11,6). Derivaciones: solo desde el 8-oct
(ejecuciones disponibles). Script: `caidas.py` / `caidas2.py` (scratchpad).

## A. Derivaciones a asesora (673 en 6 dias, ~112/dia)
| Primera respuesta humana | Conv. | % | Compra |
|---|---|---|---|
| < 15 min | 314 | 47% | 61,1% |
| 15-60 min | 42 | 6% | 42,9% |
| 1-6 h | 65 | 10% | 38,5% |
| > 6 h | 85 | 13% | 21,2% |
| nunca | 167 | 25% | 4,2% |
<15 min vs >6h/nunca: z=12,5. Respondidas en <1 h segun la hora de la
derivacion: 00-08 h 8%, 08-13 h 64%, 13-19 h 65%, 19-24 h 28%.
Derivadas con voucher/imagen: respondidas <1 h 78% compra vs >1 h 41%.

## B. Despues del mensaje de pago (675: Shalom 643, Olva 32)
- 56% nunca manda voucher: 115 desaparecen en seco; de las que escriben,
  20% desconfia del adelanto, 16% "lo hago despues", 9% no tiene Yape.
- Con voucher (296) -> pedido 84,5%. Segun demora en responderle: <15 min
  91,5%, 15-60 min 88,9%, 1-6 h 80%, >6 h o nunca 62,3% (n=53).
- Etapa de datos: contraentrega 51,5% (n=839) vs Shalom 41,5% (n=643), z=3,8.
- Huancayo/Cajamarca/San Martin/Pucallpa: 31,6% antes del 7-oct vs 25,0%
  despues (p=0,26, aun no significativo).

## C. Hora y dia
- Solo leads de anuncio: 00-07 h 5,6%, 07-13 h 10,3%, 13-19 h 9,6%,
  19-24 h 7,7% (madrugada vs mañana z=4,5).
- Sabado 8,8% y domingo 9,5% vs jueves 14,1%.

## D. Producto (familia, 1-13 oct)
Biru 2,0% (n=1.095), Vital Moo 2,1%, Magnesio spray 2,5%, Aceite Magic 3,0%:
1.714 conversaciones (19% del total, ~100% anuncio) y 38 pedidos. Mejores:
Pulsera 21%, Nattokinase 17%, Black Seed 16,6%, Magnesio 12 en 1 16%,
Cayenne 14,8%. NAD+ solo se presento 5 veces. "Agotado": 62 conv., 9,7%.

## E. Tipo de contacto
- Sin telefono (usuario de WhatsApp) de anuncio 3,0% vs con telefono 8,9%
  (z=3,9); si el bot llego a pedirle el celular, 31,9% (n=69).
- Recurrente (direccion guardada) 25,7% vs 9,2%.

## F. Por que se deriva a una asesora (720 derivaciones, 8-14 oct)
Fuente: el evento de cambio a "handoff" de cada ejecucion (motivo y resumen
que escribe el bot). Script `handoff_cat.py` (scratchpad).

| Motivo | n | % | de noche (19-08 h) | sin respuesta en 1 h | compra |
|---|---|---|---|---|---|
| Asesora toma el chat a mano (no lo deriva el bot) | 261 | 36% | 4% | - | 60% |
| Voucher / ya pago, validar | 120 | 17% | 51% | 45% | 76% |
| Pedido anterior: estado, entrega, clave Shalom | 108 | 15% | 23% | 76% | (postventa) |
| Reclamo / postventa | 62 | 9% | 39% | 76% | (postventa) |
| Consulta de salud | 57 | 8% | 39% | 78% | 7% |
| Otro (producto que no vendemos, etc.) | 48 | 7% | 33% | 81% | 10% |
| Foto sin nombre, agotado, dato tecnico | 26 | 4% | 35% | 69% | 8% |
| Pide llamada / persona | 22 | 3% | 32% | 71% | 10% |
| Otra forma de pago / sin Yape | 10 | 1% | 60% | 50% | 40% |

CORRECCION a la tabla A: incluia las 261 tomas manuales, que son casi todas
respuestas inmediatas. Solo derivaciones del bot: voucher respondido <15 min
88% compra, >6 h 58%; sin voucher <15 min 29%, nunca 1%.
