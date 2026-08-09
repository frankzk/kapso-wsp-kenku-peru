# Kenku Recovery Bot — recuperación de pedidos retornados

Bot de WhatsApp dedicado a **recuperar pedidos contraentrega que fueron
devueltos al almacén**: el courier intentó entregar, no se logró (el cliente no
contestó, no estaba, dirección incompleta, se arrepintió) y el paquete volvió a
Lima.

El objetivo es uno solo: **cobrar el adelanto de S/30 por Yape y reprogramar el
envío por Shalom**.

| | |
|---|---|
| Slug | `kenku-recovery-bot` |
| Workflow id | `533dcf64-91d9-411a-a12d-16ca3fd375de` (desplegado y `active` el 2026-08-09) |
| Trigger id | `b2a34b61-06e2-4ebb-a6f3-272d044212e1` |
| Número | Kenku 630 · +51 935 903 630 · `phoneNumberId` `1241670942359671` |
| Config de WhatsApp | `9f077d88-6cf0-4e7f-9461-78ed292e2041` |
| Trigger | `inbound_message` (arranca cuando el cliente **responde**) |
| Plantilla que lo alimenta | `recuperacion_pedido_retornado` (UTILITY, es, aprobada) |
| Disparo de la plantilla | Externo, desde **Kapta** |

Es un workflow **separado** de `kenku-sales-bot` a propósito: distinto objetivo,
distintas herramientas, distinta escalera de seguimiento y cero riesgo de
regresión sobre el bot que vende.

---

## 1. Cómo arranca

```
Kapta ──► envía plantilla recuperacion_pedido_retornado (saliente, NO dispara el workflow)
             │
             ▼
        cliente responde (botón o texto)
             │
             ▼
        trigger inbound_message ──► init-stage ──► init-hint ──► recovery-agent
```

La plantilla es un mensaje **saliente**, así que no abre el workflow. El
workflow arranca con la **respuesta** del cliente. Eso es deliberado: si el
cliente nunca responde, no se consume ejecución ni se le escribe de más.

### Contrato con Kapta

Kapta debe enviar la plantilla **desde el número 630** con estos parámetros:

| Param | Contenido | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre de pila del cliente | `Rosa` |
| `{{2}}` | Código de pedido real de Shopify (`order.name`, ya trae el `#`) | `#KP120347` |
| `{{3}}` | Detalle del pedido: cantidad × producto, una línea por ítem | `2 x Black Seed Oil 60 caps` |

**Por qué importa el formato:** el bot no recibe metadata de Kapta. Al arrancar
lee el historial de la conversación con `get_whatsapp_context`, encuentra el
mensaje saliente de la plantilla (lo reconoce por la frase *"tu paquete fue
retornado a nuestros almacenes en Lima"*) y de ahí extrae nombre, código y
productos. Si `{{2}}` va vacío o con un placeholder, el bot **no inventa** el
código: habla de "tu pedido" en general.

Reglas operativas para Kapta:

- **No enviar la plantilla dos veces** a un cliente con conversación activa: el
  bot ya está en medio de la recuperación y una plantilla nueva lo descoloca.
- **No enviarla desde otro número.** Si sale de otro `phoneNumberId`, el
  workflow no se entera y el cliente escribe al vacío.
- La plantilla abre una **ventana de servicio de 24 h**. Toda la cadencia del
  bot está diseñada para caber dentro de esa ventana (ver §4).

---

## 2. El primer mensaje: cualquier respuesta = dar el Yape

La plantilla termina con *"Toca el botón de abajo y te enviaremos los datos para
continuar"*. Así que **cualquier** respuesta —el botón, un `sí`, un `?`, un
`hola`, un audio o incluso un reclamo— se trata como "quiero continuar", y la
primera respuesta del bot ya entrega los datos de pago. No vuelve a preguntar
"¿deseas continuar?": eso pierde clientes que ya dijeron que sí al tocar el
botón.

Salen dos mensajes seguidos:

```
¡Hola Rosa! 😊 Soy *Akemi* de Kenku.

Tu pedido *#KP120347* está guardado en nuestro almacén de Lima,
listo para volver a salir 📦
```

```
Para reprogramarlo por *Shalom* solo necesito el *adelanto de S/30*:

*Yape:* 930 555 309
*Nombre:* Grupo GF SAC

Ese monto *se descuenta de tu total*, el saldo lo pagas al recoger 😊

Envíame la captura y te confirmo el despacho. ¿A qué agencia *Shalom*
te lo enviamos?
```

Después solo pide, y solo si faltan: **agencia Shalom** y **DNI** del titular
que recoge. No pide dirección de casa ni referencia (en Shalom se recoge en
agencia).

---

## 3. Playbook de objeciones

El eje argumental es siempre el mismo: **el S/30 no es un cobro extra, se
descuenta del total**. Es lo que convierte una objeción de precio en un cambio
de momento de pago.

| Objeción | Respuesta |
|---|---|
| "¿Por qué adelanto? antes era contraentrega" | El primer envío salió contraentrega y volvió; el reenvío tiene costo. El S/30 se descuenta del total. |
| "Yo sí estaba / nadie me llamó" | Empatía sin discutir + por eso ahora va a la agencia Shalom que elija, la recoge cuando pueda. |
| "¿Y si pago todo al recoger?" | El saldo sí se paga al recoger; el S/30 es lo que libera el despacho desde almacén. |
| "No confío / ¿es seguro?" | El Yape sale a nombre de *Grupo GF SAC*, razón social de Kenku, y con la captura se manda el código de seguimiento Shalom. |
| "Ya no lo quiero" | **Un** intento: el producto sigue apartado y el adelanto no se pierde. Si repite el no → cierre cálido y `no_interesado`. |
| "No tengo Yape" | No inventa cuentas: `handoff_to_human` para que una persona ofrezca alternativa. |
| "Dame descuento" | No baja el adelanto. Reencuadra una vez; si insiste → `handoff_to_human`. |
| "Mándalo contraentrega otra vez" | Explica una vez que tras un retorno no se puede. A la segunda insistencia → `handoff_to_human`. |
| "Después te aviso" | **No** lo marca como perdido: `esperando_voucher` + recordatorios. |
| Reclamo / Indecopi / "estafa" | Una respuesta empática, `notify_team` con `RECLAMO`, `handoff_to_human`, y deja de responder. |

### Límites de insistencia (deliberados)

El bot insiste, pero acotado: **máximo dos argumentos por objeción**, y a la
tercera negativa cierra o deriva. Nunca manda dos mensajes de cobro seguidos sin
que el cliente escriba en medio, y tiene prohibido usar culpa, urgencia falsa o
frases tipo *"es tu última oportunidad"*.

Esto no es timidez comercial: el 630 está en `GREEN` con `TIER_250`. Una tanda
de bloqueos o reportes por insistir de más tumba la calidad del número y con
ella toda la campaña de recuperación, no solo ese chat.

---

## 4. Escalera de recordatorios (4 toques)

Se dispara solo si el cliente deja de responder. Si responde en cualquier punto,
vuelve al agente y la cadencia se reinicia.

| Toque | Desde el último mensaje del cliente | Ángulo |
|---|---|---|
| 1 | 45 min | Recordatorio directo del Yape |
| 2 | 4 h | Reencuadre: el S/30 se descuenta, no se suma |
| 3 | 12 h | El paquete sigue guardado a su nombre en almacén |
| 4 | 22 h | Cierre + salida humana ("dime *asesora*") |

**No hay toque 5**: a las 24 h se cierra la ventana de servicio que abrió la
plantilla y ya no se puede escribir sin gastar otra plantilla. El toque 4 entra
a las 22 h justamente para caber dentro.

Antes de cada envío se valida el horario de Perú: entre 00:00 y 06:59 el bot
espera (re-chequeo cada 30 min) en vez de escribir de madrugada.

Los textos de los recordatorios son **fijos**, sin interpolar `{{vars.*}}`. Es a
propósito: en el sales-bot hubo un bug real donde a una clienta le llegó
`{{vars.followup_hint}}` sin renderizar cuatro veces, en plena fase de pago.

---

## 5. Cuando llega el voucher

1. `notify_team` → alerta interna por Telegram con `note = "RECUPERACION..."`
   para distinguirla de una venta nueva. El cliente nunca la ve.
2. `handoff_to_human` con el resumen: código de pedido, ítems, agencia Shalom,
   DNI, adelanto reportado, teléfono.
3. Al cliente, corto: recibí tu voucher, pasa a despacho, te llega tu código de
   seguimiento Shalom por aquí.
4. `stage = "derivado_logistica"` → estado terminal, se cortan los recordatorios.

El bot **no confirma el pedido por su cuenta ni toca Shopify**. La orden ya
existe; quien valida el voucher y reprograma el envío es una persona.

---

## 6. Estados

| `stage` | Significado | ¿Sigue la escalera? |
|---|---|---|
| `recuperacion_contactado` | Le dio el Yape, espera reacción | Sí |
| `esperando_voucher` | Quedó en pagar y mandar captura | Sí |
| `esperando_datos` | Falta agencia Shalom o DNI | Sí |
| `derivado_logistica` | Voucher recibido y derivado | **No** |
| `no_interesado` | Rechazo claro y repetido | **No** |
| `reclamo` | Reclamo o cliente molesto | **No** |
| `lead_perdido` | Sin respuesta tras el toque 4 | **No** |

El corte lo hace `check-coverage` en el nodo `rc-terminal`, comparando `stage`
contra su lista de marcadores terminales (`derivad`, `no_interes`, `reclamo`,
`lead_perdido`, `handoff`…). Los nombres de estado de arriba están elegidos para
calzar con esa lista, **por eso `check-coverage` no necesita ningún cambio**.

---

## 7. Lo que este bot NO hace

- No ofrece contraentrega (ya falló: es la razón del retorno).
- No vende otros productos, no cotiza, no aplica 3x2/5x3, no manda el catálogo.
- No crea ni modifica órdenes en Shopify.
- No inventa códigos de pedido, montos, medios de pago ni códigos de
  seguimiento.
- Si alguien escribe al 630 **sin** que exista la plantilla en el historial, no
  habla de retornos: saluda, aclara que el número es de seguimiento de pedidos y
  deriva a una persona.

---

## 8. Despliegue

Ruta CLI (recomendada):

```bash
git pull && kapso pull && kapso push
```

Ruta Platform API (cuando no hay CLI a mano):

```bash
# inyecta function_id: la API no resuelve function_slug por sí sola
node scripts/build-api-definition.mjs workflows/kenku-recovery-bot > /tmp/def.json
```

y con eso hacer el POST/PATCH del workflow. Después del PATCH, verificar con un
GET que **ningún** `function_id` haya quedado en `null`, tanto en los nodos
`decide` como en `flow_agent_function_tools`.

Si se aplicó por API, avisar antes del siguiente `kapso push` para hacer
`git pull && kapso pull` y realinear el baseline.

### Estado del despliegue

- [x] Workflow creado, definición cargada (27 nodos / 34 aristas, ningún
      `function_id` en null) y `status: active`.
- [x] Trigger `inbound_message` en el 630, activo y único.
- [x] `check-coverage` redesplegada con el 630 en `WATCHDOG_PHONE_IDS`
      (detecta conversaciones donde el cliente escribió y el bot no respondió).
- [x] Secrets ya presentes en `check-coverage` (`KAPSO_API_KEY`, Telegram) y en
      `notify-team` (Telegram) — no hicieron falta secrets nuevos.
- [ ] **Kapta**: configurar el disparo de la plantilla desde el 630 con los 3
      parámetros del contrato (§1).
- [ ] **Prueba en vivo**: enviarse la plantilla a un número propio, responder con
      el botón y verificar que llegan los dos mensajes con el Yape.

> Ojo con `kapso pull`/`kapso push` después de este despliegue: se aplicó por
> Platform API, así que hay que hacer `git pull && kapso pull` antes del
> siguiente push para realinear el baseline.
