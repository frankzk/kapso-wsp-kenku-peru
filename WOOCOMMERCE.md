# Paso del bot de Shopify a WooCommerce (kenku.pe, apertura el lunes 26-10-2026)

> **Base (25-10-2026):** este modo WooCommerce se armó sobre `claude/kapso-kenku-migration-8rh6g9`, que sale del
> código del 2-jul. En `claude/bot-kenku-woocommerce-completo` está sobre la línea más nueva
> (`claude/kenku-product-presentation-eyalnx`); la nota interna es la corta de esa línea (sin el total). Desplegar
> desde ahí, nunca desde la rama de migración.

Shopify cierra la tienda de Kenku el 28-10-2026 a las 00:00 UTC (martes 27 a las 19:00 de Lima). kenku.pe pasa a la
tienda WooCommerce el día de la apertura (lunes 26-10, con el martes de colchón). Este documento dice qué cambia en el
bot y cómo se pasa. Es el mismo cambio que se hizo en el bot de Aurela (`kapso-wsp-aurela-peru`, rama
`claude/woocommerce-aurela`), con lo de Kenku.

## Qué cambia

| Función | Cambio |
|---|---|
| `shopify-product-lookup` | **Listo (25-10-2026):** con `STORE_BACKEND=woocommerce` lee el catálogo de `<WOO_STORE_URL>/products.json` y `/products/<handle>.js` (la tienda nueva los responde con el formato y los IDs de Shopify, plugin `cod-core`) y **deja de usar la API de administración de Shopify**: ni los respaldos por handle y por búsqueda (ofrecerían productos que quizá no están en la tienda nueva, y el pedido fallaría con `products_not_found`) ni la «segunda opinión» del stock (el inventario de Shopify ya no es el real). Los links al cliente siguen en `kenku.pe`. Sin la variable, como hoy |
| `product-media-lookup` | **Nada** para las fotos (mismo catálogo público de `kenku.pe`). Los **videos** (metacampo `custom.video`, solo en la API de administración de Shopify) dejan de salir cuando Shopify cierre; queda el respaldo de `product.media` del `.js` público, si la tienda nueva lo trae. Pendiente, no bloquea la venta |
| `create-shopify-order` | **Listo (24-10 y 25-10-2026):** con `STORE_BACKEND=woocommerce` crea el pedido en WooCommerce por su API REST (ver abajo), después de pasar por **las mismas protecciones que en Shopify**, en el mismo orden y con los mismos `reason` y mensajes (ver «Protecciones del pedido»). Sin esa variable sigue en Shopify, como hoy |
| `campaign-report` | **Listo (25-10-2026):** con `STORE_BACKEND=woocommerce` lee los pedidos de WooCommerce (`GET /wp-json/wc/v3/orders`, los del bot con `source=whatsapp-bot` y `ctwa_ad_id` en los metadatos) para el tablero, `only=ads`, `only=conversion`, `only=orders` y el cruce de pedidos de asesora de la prueba A/D, y suma los de Shopify de antes de su cierre (ver «Periodo mixto»). Sin la variable, como hoy |
| `customer-lookup` | **Listo (25-10-2026):** con `STORE_BACKEND=woocommerce` busca al cliente en los pedidos de WooCommerce por el celular (`billing.phone`, con o sin `+51`) y, mientras tenga token, en Shopify en paralelo. La dirección guardada es la del último pedido (dirección, referencia, distrito y departamento). Sin la variable, como hoy |
| `quote-order`, `check-coverage`, `notify-team` y el resto | Nada (no usan Shopify) |

## Periodo mixto (lunes 26 y martes 27)

Los pedidos y clientes de Shopify **no se migran** a WooCommerce: cada pedido vive en una sola tienda, así que sumar las
dos no duplica nada.

- **`campaign-report`:** WooCommerce para todo el rango; Shopify, si la función sigue teniendo
  `SHOPIFY_ADMIN_ACCESS_TOKEN`, **solo para la parte del rango anterior al cierre** (`SHOPIFY_CLOSED_AT`, por defecto
  `2026-10-28T00:00:00Z` = martes 27 a las 19:00 de Lima). Así cuentan también los pedidos que todavía entren a Shopify
  el lunes y el martes, y un rango que empieza después del cierre ni siquiera llama a Shopify. Si Shopify ya no
  responde, el reporte sale igual con un aviso («No se pudieron leer los pedidos de Shopify de antes del cierre»). Los
  días son de Lima (la consulta va en UTC con `dates_are_gmt`). No cuentan los pedidos fallidos, los borradores del
  checkout ni los pagos en línea (Flow) que nunca se pagaron (en Shopify serían checkouts abandonados); los anulados y
  reembolsados cuentan con S/ 0, como el total actual de Shopify. El JSON agrega `storeBackend` y `orderSources`
  (pedidos de cada tienda; `shopify: null` = no se consultó).
- **`customer-lookup`:** primero WooCommerce (lo más reciente); si no está ahí, Shopify mientras tenga token y responda.
  Si WooCommerce lo encuentra, no espera a Shopify. Si Shopify falla (cerrado o colgado) se intenta **una sola vez** por
  búsqueda y el cliente queda como nuevo; el tiempo total sigue dentro del presupuesto de 15 s del nodo
  `init-customer`. Si **las dos** fallan responde `lookup_failed`, pero (solo en este modo) con las `vars` del flujo,
  para no perder el producto del anuncio ni la variante. Cuando Shopify cierre, solo se reconoce a quien haya comprado en
  la tienda nueva (salvo que se importen los clientes). La respuesta agrega `store` (`woocommerce`, `shopify` o `null`).
- **`shopify-product-lookup`:** nada de Shopify desde que el interruptor está en `woocommerce`.

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
  `kapso_phone_number_id`, `kapta_tags`, `ctwa_*` y, si llegó por un anuncio, `utm_id` (el anuncio), `utm_source` y
  `utm_medium`.
- `kapta_tags` (separadas por coma) son las mismas etiquetas que lleva el pedido en Shopify: `kapso`, `whatsapp`,
  `kenku`, `contraentrega`, `promo-whatsapp`, `stock-por-validar`, `ctwa-ad`, `ab-<variante>`… Es el metadato que lee
  Kapta (`WOO_META.tags`, MOM §38.5): de ahí saca `promo_applied` y `shipping_mode`. Hasta el 25-10 iba en
  `kapso_tags`, que nadie lee, y Kapta solo veía el canal.
- La fecha u hora de entrega pedida va en la nota del cliente; el resumen interno del bot, como nota privada.
- Respuesta igual que antes: `order.name` = `#KP2…` (el número del pedido), `order.id` el de WooCommerce.
- Lo que hace la tienda con el pedido (probado el 24-10 en local con un pedido creado por la API): **no** manda
  Purchase a Meta ni a TikTok (no hay datos del navegador; queda la nota «Tracking: no se envía el Purchase») y
  **no** manda el aviso de venta (ntfy/correo), que es solo para pedidos de la web. Sí lo lee Kapta como cualquier
  otro pedido, y sale al webhook del CRM si hay uno configurado.
- En la nota interna, la provincia y la región salen de la cobertura (`coverage.normalized`) si el agente no las manda.

## Protecciones del pedido (las mismas en Shopify y en WooCommerce)

`handleRequest` (Shopify) y `handleWooOrder` (WooCommerce) llaman a las mismas funciones, en este orden; solo cambia el
paso final de crear el pedido. Los `reason` y los mensajes para el agente son idénticos (la prueba los compara).

| # | Protección | En modo WooCommerce |
|---|---|---|
| 0 | Agencia declarada por el agente → `logistics_validation_required` | Igual (va antes de elegir la tienda) |
| 1 | Anuncio de origen: el que manda el agente, si no el de la conversación (Kapso), si no el de las vars del flujo (`ad_referral_*`, `resolveCtwaReferral`) | Igual. Va en los metadatos `ctwa_*`, `utm_id`/`utm_source`/`utm_medium` y la etiqueta `ctwa-ad`. Antes el camino de WooCommerce solo miraba la conversación y pisaba el del agente |
| 2 | Productos y variantes: Shopify valida el `variantId` del agente y, si no existe, lo re-resuelve por handle o título | Con el catálogo de la tienda nueva (`/products.json`): por ID de variante de Shopify o de WooCommerce, handle o título. Si falta alguno → `products_not_found` (no crea un pedido incompleto) |
| 3 | Precios, 3x2/5x3, descuento extra con tope del 15 % y envío | Mismas reglas (`computeWooPricing`), con los precios del catálogo; la promo va como cupón |
| 4 | Dirección entregable → `address_incomplete` | Igual, sobre la misma dirección (`buildAddress`) |
| 5 | Celular peruano real → `phone_missing` | Igual |
| 6 | Modo de entrega re-verificado con `check-coverage` → `coverage_mismatch` | Igual (llama a la función de Kapso, no a la tienda) |
| 7 | Stock (Shopify: `availableForSale`) | `available` del catálogo; marca `stock-por-validar` igual |
| 8 | Pedido repetido (mismas variantes y cantidades, mismo celular, 6 h) → `duplicate_prevented` | Igual: el candado vive en el KV de Kapso (`order_lock:<9 dígitos>`) con la misma firma (IDs de variante de Shopify que conserva el catálogo), así que también frena un pedido idéntico hecho en Shopify antes del cambio |
| 9 | Crear el pedido; guardar el candado; registrar el pedido en la prueba A/D (`abx_order:…`, con la variante del lead) | Pedido en WooCommerce (`#KP2…`); candado y registro A/D iguales |
| — | Buscar, crear y asociar el cliente de Shopify | **No aplica:** el pedido contra entrega de WooCommerce es de invitado; Kapta y el CRM reconocen al cliente por el celular. La respuesta trae `customerLookup: {status: "skipped", reason: "woocommerce_guest"}` |

`dryRun` en modo WooCommerce: corren todas las comprobaciones (también la dirección y el celular, que en Shopify se
saltan en `dryRun`, y la consulta del candado, que devuelve `duplicate_prevented` con `dryRun: true`), sin crear el
pedido ni escribir candados ni registros; si todo pasa, devuelve el `orderPreview` como antes.

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

## Secretos de las otras funciones (en Kapso, cada función tiene los suyos)

Mismo `STORE_BACKEND` en las cuatro funciones: `shopify` hasta la apertura, `woocommerce` desde la apertura. La clave de
WooCommerce puede ser la misma del usuario `kapso` (Lectura/Escritura); `campaign-report` y `customer-lookup` solo leen,
así que también sirve una segunda clave de **Lectura** del mismo usuario. Los valores los pega el dueño, nunca en git ni
en el chat.

| Función (ID) | Secretos nuevos | Lo que ya tiene |
|---|---|---|
| `campaign-report` (`e7c39748-c57c-4322-b532-a31d9ac5949b`) | `STORE_BACKEND`, `WOO_STORE_URL`, `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET`. Opcional: `SHOPIFY_CLOSED_AT` (ISO en UTC; solo si Shopify cierra en otra fecha) | Dejar `SHOPIFY_ADMIN_ACCESS_TOKEN` mientras Shopify responda (suma lo de antes del cierre); se puede quitar cuando ya no interese |
| `customer-lookup` (`1708bd8d-0a55-4a1e-9ed7-fe2e543c4305`) | `STORE_BACKEND`, `WOO_STORE_URL`, `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET` | `SHOPIFY_ADMIN_ACCESS_TOKEN`: dejarlo mientras Shopify responda; cuando cierre se puede quitar (si queda, falla rápido y se ignora). `KAPSO_API_KEY` igual |
| `shopify-product-lookup` (`21cd24f1-ed57-4303-988c-043bf4bc8069`) | `STORE_BACKEND`, `WOO_STORE_URL` (solo la dirección: el catálogo es público, no necesita la clave) | El token de Shopify deja de usarse en modo `woocommerce`; se puede quitar después del cierre |
| `product-media-lookup` | Ninguno | Igual que hoy |

`WOO_STORE_URL`: hasta la apertura, para probar, `https://64-176-27-178.sslip.io`; desde la apertura, `https://kenku.pe`
(en las cuatro funciones).

## Pasos

1. 👤 **Usuario y clave en WooCommerce (producción):** en wp-admin, Usuarios → Añadir nuevo: usuario `kapso`, rol
   **Gestor de tienda**. Después WooCommerce → Ajustes → Avanzado → REST API → Añadir clave: descripción "Bot Kapso",
   usuario `kapso`, permisos **Lectura/Escritura**. La clave (`ck_…`) y el secreto (`cs_…`) se pegan directo en los
   secretos de las funciones en Kapso (tablas de arriba).
2. **Desplegar las funciones** de esta rama en Kapso: `create-shopify-order`, `campaign-report`, `customer-lookup` y
   `shopify-product-lookup` (`git pull && kapso pull`, comparar, `kapso push`; o por la Platform API). Cargar los
   secretos con `STORE_BACKEND=shopify`: el bot no cambia.
3. **Prueba sin tocar el bot real** (pestaña Test de cada función, con `WOO_STORE_URL` de prueba):
   - `create-shopify-order`: input con `"storeBackend": "woocommerce"` y `"dryRun": true` (no crea nada: devuelve el
     pedido que mandaría, después de pasar por todas las protecciones). **Solo `dryRun`:** desde el 25-10 Kapta está
     conectada a producción y cualquier pedido nuevo entra como real; no hay pedido de prueba sin `dryRun`.
   - `customer-lookup`: `{"phone": "<celular de uno de los pedidos de prueba que ya hay en producción>", "storeBackend": "woocommerce"}` → `found: true`,
     `store: "woocommerce"` y la dirección del pedido en `addressSummary`.
   - `shopify-product-lookup`: `{"message": "black seed oil", "storeBackend": "woocommerce"}` → el producto con el precio
     de la tienda nueva y el link en `kenku.pe`.
   - `campaign-report`: invocar con `{"key": "<DASHBOARD_ACCESS_KEY>", "format": "json", "days": 1, "storeBackend":
     "woocommerce"}` (o `&storeBackend=woocommerce` en la dirección del tablero) → `storeBackend: "woocommerce"` y
     `orderSources.woocommerce` (los pedidos de prueba del 24-10 se ven con `"days": 3`).
4. **Día de la apertura**, con kenku.pe ya en WooCommerce y Kapta conectado: `WOO_STORE_URL=https://kenku.pe` y
   `STORE_BACKEND=woocommerce` en las **cuatro** funciones. Probar `create-shopify-order` solo con `dryRun` (con Kapta
   conectado, un pedido real de prueba le llegaría).
5. **Después del cierre de Shopify** (martes 27, 19:00 de Lima): nada obligatorio. Opcional: quitar
   `SHOPIFY_ADMIN_ACCESS_TOKEN` de `customer-lookup` y `shopify-product-lookup`; en `campaign-report`, dejarlo mientras
   se quiera ver lo de antes del 28-10 y Shopify responda.
6. Volver atrás (si se vuelve a Shopify): `STORE_BACKEND=shopify` en las cuatro.

## Pruebas

Con fetch simulado (sin red), una por función:

- `node functions/create-shopify-order/test/woocommerce.test.cjs`: crea el pedido con `cod-pending`, `LMA`, distrito,
  cupón de la promo, envío y metadatos (`kapta_tags` con `contraentrega` y `promo-whatsapp`), y la respuesta con `#KP2…`.
- `node functions/create-shopify-order/test/woocommerce-protecciones.test.cjs`: un caso por protección en modo
  WooCommerce (repetido en la ventana, candado de un pedido de Shopify, otra cantidad sí pasa, dirección de relleno,
  sin celular, cobertura distinta, anuncio desde las vars, el del agente gana, `dryRun`, agencia), con el mismo
  `reason` y mensaje que el camino de Shopify, y el caso feliz con candado, registro A/D y `kapta_tags`. El modo
  Shopify se comparó contra la versión anterior (a6257e8) con las mismas respuestas simuladas en 9 escenarios:
  respuestas, llamadas y escrituras en el KV idénticas.
- `node functions/campaign-report/test/woocommerce.test.cjs`: dos páginas de la API, Basic Auth, ventana de días de Lima
  en UTC, `status=any`; fallidos y Flow sin pagar fuera; anulado y reembolsado con S/ 0; suma con Shopify recortado al
  cierre; rango después del cierre sin Shopify; Shopify caído con aviso; sin clave, error claro; `storeBackend` por
  parámetro; `only=orders` (auditoría 3x2) y `only=ab` (pedido de asesora cruzado por celular); una sola lectura por
  reporte. Sin la variable, sin llamar a WooCommerce.
- `node functions/customer-lookup/test/woocommerce.test.cjs`: celular con y sin `+51`, descarta fallidos, Flow sin pagar
  y coincidencias de otra persona; dirección del último pedido; Shopify como respaldo; no espera a Shopify colgado;
  Shopify cerrado con un solo intento; las dos caídas con `vars`; `storeBackend` por input. Sin la variable, solo
  Shopify.
- `node functions/shopify-product-lookup/test/woocommerce.test.cjs`: catálogo y `.js` de `WOO_STORE_URL`, link en
  `kenku.pe`, sin API de administración (ni respaldo de búsqueda ni rescate de stock), caché por tienda. Sin la
  variable, el Admin sigue igual.

Probado también el 25-10 contra el WooCommerce local de Kenku (11.2.1, HPOS, America/Lima), solo lectura: la búsqueda
de pedidos (`?search=` con los 9 dígitos, con 11 o con `+51`) encuentra el pedido por `billing.phone`, `status=any`
incluye `cod-pending`, `dates_are_gmt` respeta la ventana, y `shopify-product-lookup` resolvió link, «black seed oil»,
«nattokinase para la presion» y «creatina» del catálogo real sin llamar a Shopify.

Las demás pruebas del repo siguen como estaban: pasan todas menos `check-coverage` `coverage.test` y `watchdog.test`,
que ya fallan en `claude/kenku-product-presentation-eyalnx` (no son de este cambio).
