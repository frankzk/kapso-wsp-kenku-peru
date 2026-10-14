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
