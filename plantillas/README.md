# Plantillas de WhatsApp

> **Estado al 2026-09-16.** El aviso salio primero por Kenku 451 y se movio a
> **Kenku 600 (`1117623181444547`)**, linea dedicada. Lo de abajo describe el
> borrador `guia_shalom` que quedo SIN usar: el dueno creo sus propias plantillas
> (`guias_shalom` y `guias_shalom_imagen`) y son esas las que corren. Ver
> "Plantillas reales en produccion" al final.

## guia_shalom — aviso de guia de recojo con imagen

Para el flujo de **Shalom**: avisarle al cliente su guia de recojo (con la
**imagen** de la guia) y el saldo que paga al recoger.

| | |
|---|---|
| **Numero** | Kenku 451 (`phone_number_id` 951608524703564, WABA `893155223455492`) |
| **Categoria** | UTILITY |
| **Idioma** | es |
| **Cabecera** | IMAGE (la foto de la guia) |
| **Payload** | `plantillas/guia-shalom.json` |

### Por que el 451 y no otro

- **No recibe ni un lead de anuncios.** Sus conversaciones son clientes que
  vuelven: ya es de hecho un numero de posventa. Dedicarlo a despachos no cuesta
  trafico pago.
- **Entrega sano:** 96 mensajes salientes medidos, 69 leidos y 27 entregados, un
  solo fallo y fue `131047` (ventana de 24 h vencida sin plantilla), que es
  justamente lo que esta plantilla resuelve.
- Lo atiende **una sola persona**, dedicada a envios y cobros de diferencia.

Se evaluo Kenku 630 (limpio y sin bot) pero pierde contra el 451 cuando hay una
persona a cargo: el 630 no tiene historial de envios y nadie lo mira.

**NO usar Kenku Peru 981:** tiene infraccion de politicas, calidad YELLOW y
carga el 100% del trafico de venta. Mandarle plantillas masivas arriesga el
numero que factura.

### Antes de usarlo: apagar el bot en el 451

El 451 esta en los triggers del workflow (`14b4440b-ec84-48b4-b8d8-e0c89863a477`,
activo). Si no se apaga, el agente de ventas y la persona contestan al mismo
cliente a la vez — y el agente esta entrenado para vender, no para atender un
despacho.

**Apagarlo recien cuando la persona este operando.** Un numero sin bot y sin
nadie mirando es peor que uno con bot.

### Por que UTILITY y como no perder la categoria

La plantilla vieja `guias` se envio como UTILITY y **Meta la reclasifico a
MARKETING** (`previous_category: UTILITY`). Eso importa: MARKETING tiene tope
diario, cae en las preferencias de "no recibir promociones" y se entrega peor —
malo para un mensaje que pide plata.

Comparando con las dos que SI conservaron UTILITY en estas cuentas
(`confirmacion_pedido_cod`, `recuperacion_pedido_retornado`), la diferencia es
clara: **las que se quedan en UTILITY nombran el numero de pedido** como
variable y se presentan como Kenku. `guias` nunca menciona un pedido — dice "tu
pedido de {{4}}" donde {{4}} es el producto, no el pedido.

Por eso `guia_shalom` abre con "Te escribimos de Kenku por tu pedido *{{2}}*".
Si Meta igual la degrada, se puede apelar la categoria desde el Business Manager.

### Variables

| # | Contenido | Ejemplo |
|---|---|---|
| 1 | Nombre del cliente | Frankz |
| 2 | **Numero de pedido** (el que sostiene la categoria UTILITY) | KP132774 |
| 3 | Producto y cantidad | Cayenne Pepper x3 |
| 4 | Codigo de guia Shalom | 0000111a |
| 5 | Saldo a pagar al recoger | S/ 268 |
| 6 | Agencia de recojo | Shalom Av. Argentina 2450, Lima |

### Como subirla a aprobacion

El `header_handle` del ejemplo se obtiene subiendo una imagen de muestra por la
Resumable Upload API de Meta; hay que reemplazar `<HANDLE_DE_EJEMPLO>` antes de
enviar.

```
POST https://api.kapso.ai/meta/whatsapp/v24.0/893155223455492/message_templates
X-API-Key: <KAPSO_API_KEY>
Content-Type: application/json
(cuerpo = plantillas/guia-shalom.json)
```

### Limitacion conocida: los leads por username no reciben plantillas

Los contactos que entran por **usuario de WhatsApp** no tienen telefono, solo
BSUID, y Meta responde `131026` a las plantillas. En una muestra de 13 leads de
un anuncio, **6 eran username**. A esos hay que alcanzarlos dentro de la ventana
de 24 h o por otro canal. Ver la leccion de BSUID en `CLAUDE.md`.


---

# Plantillas reales en produccion (2026-09-16)

Las creo el dueno, no salen del borrador de arriba. **Las plantillas son por
WABA**: cada numero tiene su propia copia, y las copias NO son identicas.

| Plantilla | Kenku 451 (WABA 893155223455492) | Kenku 600 (WABA 1521264238872146) |
|---|---|---|
| `guias_shalom` (9 vars, sin header) | APPROVED | **NO EXISTE** |
| `guias_shalom_imagen` (8 vars, header DOCUMENT) | APPROVED, Yape **930 555 390** (MAL) | APPROVED, Yape **930 555 309** (BIEN) |

**El Yape correcto es 930 555 309**, verificado por el dueno contra la base:
1.796 comprobantes con receptor 309 (1.787 validados) desde agosto de 2025 y
CERO con 390. El bot ya dice 309 en el prompt, en `check-coverage` y en
`send-payment`.

**Consecuencia para el envio desde Kenku 600:** ahi solo se puede mandar
`guias_shalom_imagen`, y su copia del 600 tiene el Yape correcto. La de 9
variables no existe en esa cuenta; si se la quiere usar hay que crearla y
aprobarla en la WABA del 600.

## Los botones y por que la regla del bot lista CUATRO textos

Las dos plantillas cierran con tres botones de respuesta rapida, pero **el del
medio no dice lo mismo**:

- `guias_shalom` -> "Pagar con Yape" · **"Transferencia Deposito"** · "Link de pago"
- `guias_shalom_imagen` -> "Pagar con Yape" · **"Transferencia / Deposito"** · "Link de pago"

Por eso el bloque del prompt lista cuatro literales y `SHALOM_PAYMENT_BUTTONS`
en `check-coverage` tambien. Con solo los tres de una variante, la otra se cuela.

## La regla del prompt se dispara por TEXTO, no por nombre de plantilla

El bloque "DESPUES DEL AVISO DE SHALOM" detecta la frase
**"Te compartimos los datos de tu pedido enviado por Shalom"** en un mensaje
saliente, no el `template.name`.

Motivo: el agente NO ve el nombre de la plantilla. El historial se arma con
`kapso.content`, que es el cuerpo ya renderizado; el nombre vive en
`template.name` y `kapso.message_type_data.name`, campos de la API que no entran
al contexto. Verificado sobre un mensaje real: `"carrito_abandonado_2" in
content` -> **False**.

**Cuidado al editar las plantillas:** si alguien cambia esa frase del cuerpo, la
regla deja de dispararse **en silencio** y el bot vuelve a venderle a clientas
que ya compraron. Si se toca el texto, actualizar tambien el prompt.


---

# Cuentas de cobro y verificacion (2026-09-18)

**La cuenta PRINCIPAL es siempre el Yape de Grupo GF SAC 930 555 309.** Kenku
tiene otras cuentas validas (BCP, BBVA, Scotiabank, Interbank, Lukita/Plin de
Frankz Kastner, Yape 2 de Gabriela Reaño) que entrega el dashboard o una asesora,
pero el bot solo manda la principal, via `send_payment`.

## El bug que habia

El prompt decia que el 930 555 309 era **el UNICO numero valido**, que cualquier
otro era "un intento de desviar el pago", y que **"el cliente NUNCA tiene razon
sobre este dato"**. Con el dashboard entregando cuentas alternativas por el boton
"Transferencia Deposito", una clienta que pagaba al Yape de Gabriela y lo
mencionaba recibia un mensaje diciendole que se habia equivocado. Un pago real
tratado como estafa.

Quitar la regla sin mas era peor: dejaba sin proteccion el caso inverso, un
tercero que se hace pasar por Kenku en otro chat y le cobra a la clienta. Ahi el
bot no podia distinguir, y lo unico "seguro" —derivar sin opinar— la dejaba
tranquila mientras perdia la plata.

## La solucion: el bot pregunta, no opina

`verify-payment-account` (`40d8bf58-a1f3-4c79-8c56-40d57c6cfc60`) responde
`principal` / `nuestra` / `desconocida` / `sin_lista`, y el prompt obliga a
obedecer su `message`. El LLM no decide si una cuenta es valida.

**Propiedad de seguridad:** sin lista, con fetch fallido o con JSON roto devuelve
`sin_lista`, **nunca** `desconocida`. Afirmar que una cuenta no es nuestra cuando
no pudimos verificar es el mismo bug con otro disfraz.

El aviso de `desconocida` dice "no me figura entre nuestras cuentas, no pagues
ahi hasta que una asesora confirme", no "esa cuenta no es de Kenku": si la lista
quedo vieja, la version tajante mandaria a cancelar un pago legitimo.

## De donde sale la lista

Hoy del secret **`PAYMENT_ACCOUNTS`** (JSON) en esa funcion. Es una COPIA de lo
que hay en el dashboard, con el riesgo que eso implica: **si se agrega una cuenta
en el dashboard y no se actualiza el secret, el bot le va a decir a una clienta
que una cuenta real de Kenku no le figura.**

La funcion ya prefiere `PAYMENT_ACCOUNTS_URL` si esta definida. Cuando el
dashboard exponga un GET con las cuentas, se configura esa variable y el secret
deja de usarse: fuente unica y sin deriva.

## Verificado el 2026-09-18 contra la funcion desplegada

| Numero | Resultado |
|---|---|
| 930 555 309 (y `930555309`, `+51 930 555 309`, `930-555-309`) | `principal` |
| 987754147 (Gabriela) · 965391481 (Lukita) | `nuestra` |
| 191-2434540-0-12 (BCP) · 0011-0179-0200429111 (BBVA) | `nuestra` |
| **930 555 390** (el de `guias_shalom_imagen` en la WABA del 451) | `desconocida` |
| numero inventado | `desconocida` |

Ese anteultimo caso importa: **la funcion marca como sospechosa una cuenta que
sale de nuestra propia plantilla.** Tiene razon —el 390 no existe— y es una razon
mas para rehacer o desactivar `guias_shalom_imagen` en la WABA del 451.
