# Migración desde Aurela Peru Kapso → Kenku Perú

Este repo contiene el bot de ventas por WhatsApp y las funciones desarrolladas
originalmente en el proyecto Kapso **Aurela Peru Kapso**, adaptadas para el
proyecto nuevo **Kenku Perú** (`cf65efcf-38ab-475c-85b3-c2b89f304652`).

## Qué se migró y qué cambió

| Elemento | Antes (Aurela) | Ahora (Kenku) |
|---|---|---|
| Workflow | `aurela-sales-bot` (Aurela Sales Bot) | `kenku-sales-bot` (Kenku Sales Bot), en **draft** |
| Marca en prompts y mensajes | Aurela / Aurela Peru | Kenku / Kenku Peru |
| Dominio público (links, catálogo) | `aurela.pe` | `kenku.pe` |
| Catálogo completo | `aurela.pe/collections/todos-los-productos` | `kenku.pe/collections/todos-los-productos` (verificado: existe, 357 productos) |
| Dominio admin de Shopify | `aurela-peru.myshopify.com` | `kenkuperu.myshopify.com` — Aurela y Kenku son **tiendas distintas** de la organización Grupo GF SAC, cada una con su dominio admin |
| Código de descuento | `AURELA-WHATSAPP-PROMO` | `KENKU-WHATSAPP-PROMO` (⚠️ hay que crearlo en Shopify) |
| Tags de pedidos/clientes | `kapso, whatsapp, aurela` | `kapso, whatsapp, kenku` |
| Triggers / phoneNumberId | Números de Aurela (2) | `597907523413541` (Sandbox WhatsApp de Kapso, para pruebas) |
| `.kapso/remote-map.json` | IDs de recursos de Aurela | **No se copió** — se regenera con el primer `kapso push` |

Las listas de stopwords de `shopify-product-lookup` y `product-media-lookup`
conservan `aurela` además de `kenku`, para tolerar links viejos de `aurela.pe`
y menciones de la marca anterior.

## Conexión a Shopify: por API de app interna (no MCP)

Las funciones se conectan a Shopify **directamente por la Admin API usando el
token de una app interna** (custom app de la organización). No se usa ningún
MCP en runtime.

Aurela y Kenku son **dos tiendas de la misma organización (Grupo GF SAC)** y
la app interna `kapso-wsp-aurela-peru` ya está instalada en ambas. Puntos
clave:

1. **Cada instalación tiene su propio token**: el `SHOPIFY_ADMIN_ACCESS_TOKEN`
   de Aurela NO funciona en Kenku. Hay que copiar el Admin API access token de
   la **instalación en la tienda Kenku** (admin de Kenku → Configuración →
   Apps → kapso-wsp-aurela-peru → credenciales de API; si no está visible,
   regenerarlo desde el panel de la organización/Dev Dashboard).
2. **Cada tienda tiene su propio dominio admin**: el de Kenku es
   `kenkuperu.myshopify.com` (ya aplicado como default en las funciones).
3. Los permisos ya instalados (Clientes, Pedidos, Productos: ver y editar)
   cubren lo que usan las funciones.

## Configuración de funciones (function.yaml — NO está en git)

Los `functions/**/function.yaml` están en `.gitignore` porque contienen
secretos. Hay que configurar las variables en el dashboard de Kapso del
proyecto Kenku (o vía `kapso pull` + editar + `kapso push`):

- `SHOPIFY_SHOP_DOMAIN` = `kenkuperu.myshopify.com`
- `SHOPIFY_PUBLIC_SHOP_DOMAIN` = `kenku.pe`
- `SHOPIFY_API_VERSION` = `2026-04`
- `SHOPIFY_ADMIN_ACCESS_TOKEN` = token de la instalación de la app en Kenku (paso anterior)
- `KAPSO_API_KEY` (API key del proyecto **Kenku**) y `KAPSO_API_BASE` si aplica
- `WHATSAPP_PHONE_NUMBER_IDS` (campaign-report) = phoneNumberId(s) de Kenku
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (notify-team, campaign-report)
- `DASHBOARD_ACCESS_KEY` (campaign-report) — clave del dashboard de campañas
- KV: `check-coverage` usa un binding KV (watchdog) — habilitarlo igual que en Aurela

Referencia: los valores actuales están en el proyecto Aurela
(`kapso pull` desde el repo de Aurela los descarga).

## Pasos de despliegue

1. `kapso setup` en este repo, autenticando contra el proyecto **Kenku Perú**.
2. `kapso push` para crear las 7 funciones y el workflow (queda en draft).
3. Configurar las variables/secretos de cada función (sección anterior).
4. Configurar el número de WhatsApp de Kenku en Kapso (Phone numbers → Set up).
5. El phoneNumberId actual es el del Sandbox (`597907523413541`). Al pasar al
   numero definitivo, reemplazarlo en:
   - `workflows/kenku-sales-bot/workflow.js` (trigger + const `PHONE_NUMBER_ID`)
   - `workflows/kenku-sales-bot/workflow.yaml` y `definition.json`
   - `functions/campaign-report/index.js` (`DEFAULT_PHONE_NUMBER_IDS`)
   - `functions/check-coverage/index.js` (`WATCHDOG_PHONE_IDS`)
   - `functions/create-shopify-order/index.js` (`DEFAULT_PHONE_NUMBER_ID`)
   (El dominio admin `kenkuperu.myshopify.com` ya está aplicado como default
   en las 4 funciones que llaman a la Admin API.)
6. Cambiar el workflow a `status: active` (workflow.js y workflow.yaml) y `kapso push`.
7. Crear en Shopify el código de descuento `KENKU-WHATSAPP-PROMO` (equivalente
   al `AURELA-WHATSAPP-PROMO` anterior).
8. GitHub Action del reporte diario (`.github/workflows/daily-campaign-report.yml`):
   - Reemplazar `KENKU_FUNCTION_ID_PENDIENTE` con el id real de la función
     `campaign-report` (dashboard de Kapso o `.kapso/remote-map.json` tras el push).
   - Crear el secret de repo `CAMPAIGN_DASHBOARD_KEY`.
   - El archivo debe estar en la rama por defecto para que corra el cron.

## Estado de sincronización con producción

Reconciliado con `kapso pull` el 2026-08-31 (CLI 0.18.0, auth por `KAPSO_API_KEY`).
Antes de eso el repo llevaba meses desfasado: faltaban 8 funciones y un workflow
entero, y `kapso push` habría pisado producción. Ahora `kapso push --dry-run`
reporta *18 unchanged*.

Lo que bajó y no estaba en el repo:

- **Funciones nuevas**: `save-order-state`, `send-text`, `send-buttons`,
  `send-payment`, `loop-guard`, `followup-terminal-router`,
  `lookupshopifycustomer`, `pause` (16 funciones en total).
- **Workflow nuevo**: `kenku-recovery-bot` (campaña de recuperación de pedidos
  retornados, número Kenku 630).
- **`kenku-sales-bot`**: 46 nodos / 60 edges (incluye `loop-guard` y el
  experimento A/B `ab_variant`) contra los 43 que tenía el repo, prompt con ~600
  líneas de diferencia, y los 4 triggers reales.
- `functions/**/function.yaml` bajó con los secretos reales: **sigue
  gitignoreado**, no se commitea.
- `.kapso/remote-map.json` es estado local del CLI (ids, hashes y lock
  versions por clon): se agregó al `.gitignore`.

Tres detalles a tener presentes:

- **`kapso pull` justo antes de cada `kapso push`.** El `kenku-sales-bot` está
  vivo (16.000+ ejecuciones) y su `lock_version` avanza solo con el tráfico: a
  los pocos minutos de un pull, el push corta con *"Remote workflow changed
  since the last pull"* aunque el contenido sea idéntico. Un `kapso pull` lo
  destraba y no cambia ningún archivo.
- El `definition.json` del repo es la forma **portable**: el CLI reemplaza cada
  `function_id` (uuid del servidor) por `function_slug` y quita los ids de
  edges/condiciones. Por eso difiere del GET de la Platform API sin estar
  desactualizado — y por eso un PATCH por API sí tiene que llevar los
  `function_id` resueltos (ver `CLAUDE.md`).

- `workflows/kenku-sales-bot/workflow.js` estaba desfasado y `kapso pull` lo
  **preserva** en vez de regenerarlo ("Preserved authored workflow source"), así
  que un `kapso build` habría reconstruido `definition.json` con el grafo viejo.
  Se borró y se volvió a pullear para que lo regenere desde producción.
- Los tests de `check-coverage` asumían contratos que producción ya cambió y se
  actualizaron a lo que hoy corre: sin distrito la cobertura devuelve
  `needs_location` (antes se resolvía con la provincia sola) y el watchdog alerta
  con >3 min de silencio (antes 15) difundiendo a varios chats de Telegram.

## Incidentes corregidos

- **2026-08-31 — el bot rechazó tres veces un celular válido** (Javier Zanabria,
  Huancan/Huancayo, *Nails Repairing*, conversación `33d9f4f1`): el cliente
  escribió `940823875` — un celular peruano válido, y además el número de su
  propio chat — y el bot respondió "El número que me diste parece incompleto o no
  es un celular válido" tres veces seguidas ("Estoy que le repito", contestó él).
  Terminó en alerta al equipo ("no valid phone"), la conversación cortada por
  `loop-guard` (`stage=loop_detectado`) y el pedido cerrado a mano.

  Causa raíz: `phone` está en los campos requeridos de `save-order-state`, pero
  **nadie sembraba el número del chat**. El estado salía con `missing=["phone"]`
  aunque `needs_phone` fuera `false` y el `wa_id` estuviera a la vista, así que el
  agente lo pedía y leía cada respuesta como dato faltante. Arreglado en dos
  capas (aplicado a Kapso por Platform API):
  1. **`save-order-state`**: siembra `phone` con el número del chat
     (`execution_context.context.phone_number` / `contact.wa_id` /
     `whatsapp_context`) cuando es un celular peruano; si el agente manda otro
     número que no valida, se conserva el del chat y la respuesta le dice
     explícitamente que NO le diga al cliente que su número es inválido. Además
     acepta el teléfono bajo cualquier alias razonable (`customer_phone`,
     `phone_number`, `numero_celular`, …), que antes se descartaba en silencio.
     Regresión: `functions/save-order-state/test/phone.test.cjs`.
  2. **`create-shopify-order`**: `applyContactPhoneFallback` usa el número del
     chat cuando el `phone` que llega no es celular peruano (un fijo, dígitos
     sueltos, "por coordinar") y anota el que dio el cliente en la nota de la
     orden. La puerta `phone_missing` **sigue igual** para los leads que entran
     por username de WhatsApp: si el chat no expone número, el celular sigue
     siendo obligatorio. Regresión:
     `functions/create-shopify-order/test/phone.test.cjs`.
  3. **Prompt del workflow en producción**: si el chat expone el número
     (`needs_phone=false`), no se pide ni se pone en duda; si el cliente repite el
     mismo número, se acepta.

## Para revisar (decisiones de negocio heredadas de Aurela)

- **Yape / razón social** en `functions/check-coverage/index.js` (envíos Shalom):
  quedó "Yape: Grupo GF SAC (razón social de Kenku) · 930 555 309". Verificar
  que la razón social y el número de Yape apliquen también a Kenku.
- **Promos 3x2 / 5x3** y envío gratis desde S/40: los prompts y `quote-order`
  las asumen. Confirmar que Kenku mantiene las mismas promociones.
- **Prefijo de pedidos `#AUR`**: los ejemplos del prompt usan `#AUR...`. Kenku
  es otra tienda, así que su prefijo puede ser distinto (Configuración →
  General → ID de pedido). El bot siempre usa el `order.name` real que devuelve
  Shopify, pero conviene actualizar el ejemplo del prompt al prefijo de Kenku.
- **Persona del bot**: sigue siendo "Akemi, la asesora de ventas" — cambiar el
  nombre si Kenku quiere otra identidad.
