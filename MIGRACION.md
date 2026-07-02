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
| Dominio admin de Shopify | `aurela-peru.myshopify.com` | **Sin cambio** — es la misma tienda Shopify (el dominio `.myshopify.com` no cambia con el rebrand) |
| Código de descuento | `AURELA-WHATSAPP-PROMO` | `KENKU-WHATSAPP-PROMO` (⚠️ hay que crearlo en Shopify) |
| Tags de pedidos/clientes | `kapso, whatsapp, aurela` | `kapso, whatsapp, kenku` |
| Triggers / phoneNumberId | Números de Aurela (2) | Placeholder `KENKU_PHONE_NUMBER_ID_PENDIENTE` |
| `.kapso/remote-map.json` | IDs de recursos de Aurela | **No se copió** — se regenera con el primer `kapso push` |

Las listas de stopwords de `shopify-product-lookup` y `product-media-lookup`
conservan `aurela` además de `kenku`, para tolerar links viejos de `aurela.pe`
y menciones de la marca anterior.

## Conexión a Shopify: por API de app interna (no MCP)

Las funciones se conectan a Shopify **directamente por la Admin API usando el
token de una app interna** (custom app / "desarrollo de aplicaciones" en el
admin de Shopify). No se usa ningún MCP en runtime.

1. En el admin de Shopify (kenku.pe) → **Configuración → Apps y canales de venta
   → Desarrollo de aplicaciones** → crear (o reutilizar) la app interna.
2. Scopes de Admin API necesarios: `read_products`, `read_inventory`,
   `read_orders`, `write_orders`, `read_customers`, `write_customers`,
   `read_discounts`.
3. Copiar el **Admin API access token** y configurarlo como
   `SHOPIFY_ADMIN_ACCESS_TOKEN` en cada función (ver siguiente sección).

## Configuración de funciones (function.yaml — NO está en git)

Los `functions/**/function.yaml` están en `.gitignore` porque contienen
secretos. Hay que configurar las variables en el dashboard de Kapso del
proyecto Kenku (o vía `kapso pull` + editar + `kapso push`):

- `SHOPIFY_SHOP_DOMAIN` = `aurela-peru.myshopify.com` (misma tienda)
- `SHOPIFY_PUBLIC_SHOP_DOMAIN` = `kenku.pe`
- `SHOPIFY_API_VERSION` = `2026-04`
- `SHOPIFY_ADMIN_ACCESS_TOKEN` = token de la app interna (paso anterior)
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
5. Reemplazar el placeholder `KENKU_PHONE_NUMBER_ID_PENDIENTE` por el
   phoneNumberId real en:
   - `workflows/kenku-sales-bot/workflow.js` (trigger + const `PHONE_NUMBER_ID`)
   - `workflows/kenku-sales-bot/workflow.yaml` y `definition.json`
   - `functions/campaign-report/index.js` (`DEFAULT_PHONE_NUMBER_IDS`)
   - `functions/check-coverage/index.js` (`WATCHDOG_PHONE_IDS`)
   - `functions/create-shopify-order/index.js` (`DEFAULT_PHONE_NUMBER_ID`)
6. Cambiar el workflow a `status: active` (workflow.js y workflow.yaml) y `kapso push`.
7. Crear en Shopify el código de descuento `KENKU-WHATSAPP-PROMO` (equivalente
   al `AURELA-WHATSAPP-PROMO` anterior).
8. GitHub Action del reporte diario (`.github/workflows/daily-campaign-report.yml`):
   - Reemplazar `KENKU_FUNCTION_ID_PENDIENTE` con el id real de la función
     `campaign-report` (dashboard de Kapso o `.kapso/remote-map.json` tras el push).
   - Crear el secret de repo `CAMPAIGN_DASHBOARD_KEY`.
   - El archivo debe estar en la rama por defecto para que corra el cron.

## Para revisar (decisiones de negocio heredadas de Aurela)

- **Yape / razón social** en `functions/check-coverage/index.js` (envíos Shalom):
  quedó "Yape: Grupo GF SAC (razón social de Kenku) · 930 555 309". Verificar
  que la razón social y el número de Yape apliquen también a Kenku.
- **Promos 3x2 / 5x3** y envío gratis desde S/40: los prompts y `quote-order`
  las asumen. Confirmar que Kenku mantiene las mismas promociones.
- **Prefijo de pedidos `#AUR`**: los ejemplos del prompt usan `#AUR...`. Al ser
  la misma tienda Shopify, el prefijo sigue igual; si se cambia en Shopify,
  actualizar el ejemplo del prompt.
- **Persona del bot**: sigue siendo "Akemi, la asesora de ventas" — cambiar el
  nombre si Kenku quiere otra identidad.
