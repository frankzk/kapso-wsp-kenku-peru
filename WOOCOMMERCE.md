# Paso del bot de Shopify a WooCommerce (kenku.pe, apertura el lunes 26-10-2026)

Shopify cierra la tienda de Kenku el 28-10-2026 a las 00:00 UTC (martes 27 a las 19:00 de Lima). kenku.pe pasa a la
tienda WooCommerce el día de la apertura (lunes 26-10, con el martes de colchón). Este documento dice qué cambia en el
bot y cómo se pasa. Es el mismo cambio que se hizo en el bot de Aurela (`kapso-wsp-aurela-peru`, rama
`claude/woocommerce-aurela`), con lo de Kenku.

## Qué cambia

| Función | Cambio |
|---|---|
| `shopify-product-lookup` | **Nada.** Lee `https://kenku.pe/products.json` y `/products/<handle>.js`, y la tienda nueva responde esas direcciones con el mismo formato y los mismos IDs de Shopify (plugin `cod-core`). La búsqueda en la API de administración de Shopify es solo un respaldo |
| `product-media-lookup` | **Nada** para las fotos (mismo catálogo público). Los videos (metacampo `custom.video` de Shopify) dejan de salir |
| `create-shopify-order` | **Listo (24-10-2026):** con `STORE_BACKEND=woocommerce` crea el pedido en WooCommerce por su API REST (ver abajo). Sin esa variable sigue en Shopify, como hoy |
| `campaign-report` | **Pendiente:** hoy cuenta los pedidos de Shopify. Se puede portar el cambio de Aurela (lee los pedidos de WooCommerce con la misma variable) |
| `customer-lookup` | **Pendiente:** busca clientes recurrentes en Shopify; cuando Shopify cierre, deja de encontrarlos. Pasarlo a WooCommerce (pedidos por celular) solo reconoce a quienes compren desde la apertura, salvo que se importen los clientes |
| `quote-order`, `check-coverage`, `notify-team` | Nada |

## El pedido en WooCommerce

Sigue las reglas de Kapta (el sistema de operaciones lee los pedidos de la tienda):

- Método `cod` («Pago contra entrega»), estado `cod-pending` («Por confirmar»).
- `billing`: nombre, celular `+51…`, departamento con el **código de WooCommerce** (`LMA` Lima Metropolitana, `CAL`
  Callao, `LIM` resto de Lima, `ARE` Arequipa…; sale de `coverage.normalized` o de los datos del cliente), distrito
  en `city`, dirección y referencia. Sin dirección de envío.
- Líneas con el producto y la variación de WooCommerce (los ID salen del catálogo público: `woo_id`), con `subtotal`
  y `total`: las promos 3x2 y 5x3 se reparten entre las líneas y quedan como **cupón** `kenku-whatsapp-promo`
  (cod-core lo arma con el metadato `cod_core_cupon`).
- Envío como línea de envío, con la misma regla que hoy cotiza el bot (`quote-order`): gratis con más de S/ 40, si no
  S/ 10. (La web de Kenku da el envío gratis siempre; si el bot también, se cambia en `quote-order`.)
- Metadatos: `kapta_channel` (`whatsapp_bot`, a confirmar con Kapta), `source=whatsapp-bot`, `kapso_conversation_id`,
  `kapso_phone_number_id`, `kapso_tags`, `ctwa_*` y, si llegó por un anuncio, `utm_id` (el anuncio), `utm_source` y
  `utm_medium`.
- La fecha u hora de entrega pedida va en la nota del cliente; el resumen interno del bot, como nota privada.
- Respuesta igual que antes: `order.name` = `#KP2…` (el número del pedido), `order.id` el de WooCommerce.
- Lo que hace la tienda con el pedido (probado el 24-10 en local con un pedido creado por la API): **no** manda
  Purchase a Meta ni a TikTok (no hay datos del navegador; queda la nota «Tracking: no se envía el Purchase») y
  **no** manda el aviso de venta (ntfy/correo), que es solo para pedidos de la web. Sí lo lee Kapta como cualquier
  otro pedido, y sale al webhook del CRM si hay uno configurado.
- En la nota interna, la provincia y la región salen de la cobertura (`coverage.normalized`) si el agente no las manda.

## Configuración de `create-shopify-order` (secretos de la función en Kapso, nunca en git ni en el chat)

Función `create-shopify-order` = `f513d5ea-7d45-4623-af58-3b1b810abed0`. Los secretos se cargan en Kapso (panel de la
función o `POST /platform/v1/functions/{id}/secrets`, ver `CLAUDE.md`) y aplican sin volver a desplegar.

| Secreto | Valor |
|---|---|
| `STORE_BACKEND` | `shopify` hasta la apertura (el bot sigue igual); `woocommerce` desde la apertura |
| `WOO_STORE_URL` | Hasta la apertura, para probar: `https://64-176-27-178.sslip.io` (producción con dirección temporal). Desde la apertura: `https://kenku.pe` |
| `WOO_CONSUMER_KEY` / `WOO_CONSUMER_SECRET` | La clave de la API del usuario `kapso` de WooCommerce (abajo). Las pega el dueño |
| `KAPTA_CHANNEL` | Opcional: el valor que diga Kapta (por defecto `whatsapp_bot`) |
| `WOO_COUPON_CODE` | Opcional (por defecto `kenku-whatsapp-promo`) |

La API de WooCommerce y `/products.json` responden sin la contraseña del sitio (excepciones de Caddy en producción),
así que se puede probar antes de abrir.

## Pasos

1. 👤 **Usuario y clave en WooCommerce (producción):** en wp-admin, Usuarios → Añadir nuevo: usuario `kapso`, rol
   **Gestor de tienda**. Después WooCommerce → Ajustes → Avanzado → REST API → Añadir clave: descripción "Bot Kapso",
   usuario `kapso`, permisos **Lectura/Escritura**. La clave (`ck_…`) y el secreto (`cs_…`) se pegan directo en los
   secretos de la función en Kapso.
2. **Desplegar la función** de este repo en Kapso, como siempre: `git pull && kapso pull && kapso push` (o por la
   Platform API). Con `STORE_BACKEND=shopify` el bot no cambia.
3. **Prueba sin tocar el bot real** (pestaña Test de la función): input con `"storeBackend": "woocommerce"` y
   `"dryRun": true` (no crea nada: devuelve el pedido que mandaría); después, sin `dryRun`, un pedido de prueba real.
   Revisar en WooCommerce → Pedidos: «Por confirmar», número `KP2…` y el cuadro «Datos para Kapta» (canal,
   departamento, distrito, SKU y total). Los pedidos de prueba se borran antes de fijar el contador en `KP200001`.
4. **Día de la apertura**, con kenku.pe ya en WooCommerce y Kapta conectado: `WOO_STORE_URL=https://kenku.pe` y
   `STORE_BACKEND=woocommerce`. Probar solo con `dryRun` (con Kapta conectado, un pedido real de prueba le llegaría).
5. Volver atrás (si se vuelve a Shopify): `STORE_BACKEND=shopify`.

## Pruebas

`node functions/create-shopify-order/test/woocommerce.test.cjs` (fetch simulado): crea el pedido con `cod-pending`,
`LMA`, distrito, cupón de la promo, envío y metadatos, y la respuesta con `#KP2…`. Las pruebas del resto del repo
(`campaign-report`, `check-coverage`) siguen pasando.
