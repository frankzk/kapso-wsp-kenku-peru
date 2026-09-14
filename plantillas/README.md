# Plantillas de WhatsApp

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
