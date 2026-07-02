# Reglas de trabajo — kapso-wsp-kenku-peru

## Alcance: SOLO el proyecto Kenku

- Todo el trabajo de este repo apunta al proyecto Kapso **Kenku Perú**
  (`cf65efcf-38ab-475c-85b3-c2b89f304652`) y a la tienda Shopify
  **kenkuperu.myshopify.com** (dominio público `kenku.pe`).
- **NUNCA modificar el proyecto de Aurela**: ni su proyecto Kapso
  ("Aurela Peru Kapso", `387343ab-aa79-4641-b56b-fe9cf93e274e`), ni su tienda
  (`aurela-peru.myshopify.com` / `aurela.pe`), ni su repo
  (`frankzk/kapso-wsp-aurela-peru`). El repo de Aurela se usa solo como
  referencia de LECTURA.

## Cómo conectarse a cada servicio

- **Kapso (Kenku)**: vía Platform API (`https://api.kapso.ai/platform/v1/...`)
  con la API key del proyecto Kenku (header `X-API-Key`). El workflow
  `kenku-sales-bot` es id `5d45d805-b52f-4d82-8c77-b8dd680718fc`; usar siempre
  el `lock_version` vigente al hacer PATCH.
- **CRITICO al hacer PATCH del definition por API**: la API NO resuelve
  `function_slug` → `function_id` (eso lo hace el CLI en `kapso push`). Antes
  de enviar, rellenar `function_id` en los decide de tipo function y en cada
  item de `flow_agent_function_tools`, y verificar después con GET que ninguna
  referencia quede en null. IDs de funciones del proyecto Kenku:
  shopify-product-lookup=21cd24f1-ed57-4303-988c-043bf4bc8069,
  product-media-lookup=d4e6365e-4736-4e92-872a-259adb6634f2,
  quote-order=ae2db7b7-918c-4b73-b36e-979668920347,
  check-coverage=05a6107d-6488-4bb3-8088-9f2fce140b5e,
  create-shopify-order=f513d5ea-7d45-4623-af58-3b1b810abed0,
  notify-team=00dd67bd-df4b-4477-af5c-2530c44a5b60,
  campaign-report=e7c39748-c57c-4322-b532-a31d9ac5949b.
- **NO usar el MCP de Kapso para mutaciones**: el conector MCP de Kapso de las
  sesiones está autenticado contra el proyecto de AURELA. Solo sirve
  `search_docs` (documentación, es neutral). Nada de escribir por MCP.
- **Shopify (Kenku)**: las funciones se conectan por Admin API con el token de
  la app interna (`SHOPIFY_ADMIN_ACCESS_TOKEN` en la config de cada función).
  No usar el MCP de Shopify para operar la tienda desde las sesiones.

## Flujo de cambios

1. Editar el código en este repo (rama de trabajo actual:
   `claude/kapso-kenku-migration-8rh6g9`), commit y push a GitHub — el repo es
   la fuente de verdad.
2. Aplicar a Kapso: por Platform API (PATCH del workflow / update+deploy de
   funciones), o indicar al usuario `git pull && kapso pull && kapso push`.
3. Si se aplicó por API, avisar al usuario que antes de su próximo
   `kapso push` haga `git pull && kapso pull` para realinear el baseline.

## Secrets de funciones (LECCION IMPORTANTE)

- Las variables de entorno de las funciones se configuran como **Secrets** vía
  `POST /platform/v1/functions/{id}/secrets` con `{"secret":{"name":"X","value":"y"}}`
  (nombres `MAYUSCULAS_CON_GUION_BAJO`). Aplican sin redeploy.
- El `runtime_config` del `function.yaml` **NO se inyecta al runtime** y además
  el round-trip del CLI deforma los nombres de las claves
  (`SHOPIFY_...` → `sHOPIFY...` → `s_h_o_p_...`). No usarlo para configurar.
- Secrets ya configurados (2026-07-02): Shopify (domain/version/token) en
  shopify-product-lookup, product-media-lookup, create-shopify-order y
  campaign-report; KAPSO_API_KEY en create-shopify-order, check-coverage y
  campaign-report; Telegram en notify-team, check-coverage y campaign-report;
  DASHBOARD_ACCESS_KEY y WHATSAPP_PHONE_NUMBER_IDS en campaign-report.

## Datos del proyecto Kenku

- phoneNumberId actual: `597907523413541` (Sandbox WhatsApp de Kapso, para
  pruebas). Al conectar el número definitivo, reemplazarlo en todo el repo y
  en `wHATSAPPPHONENUMBERIDS` del yaml de campaign-report.
- Los `functions/**/function.yaml` están gitignorados (contienen secretos);
  la config vive en Kapso y en la copia local del usuario.
- Productos estrella para enganche: *Black Seed Oil* y *NAD+ Resveratrol*.
- Ver `MIGRACION.md` para el historial de la migración desde Aurela y los
  pendientes de negocio (promos 3x2/5x3, Yape/razón social, prefijo de pedidos).
