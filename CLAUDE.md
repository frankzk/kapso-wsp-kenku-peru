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
  referencia quede en null. IDs de funciones del proyecto Kenku (16,
  verificadas 2026-08-31):
  campaign-report=e7c39748-c57c-4322-b532-a31d9ac5949b,
  check-coverage=05a6107d-6488-4bb3-8088-9f2fce140b5e,
  create-shopify-order=f513d5ea-7d45-4623-af58-3b1b810abed0,
  customer-lookup=1708bd8d-0a55-4a1e-9ed7-fe2e543c4305,
  followup-terminal-router=2b925dc1-56e1-4968-97a2-5a224c068db1,
  lookupshopifycustomer=f5b260ab-b35c-41dd-b143-a221e79dfa07,
  loop-guard=b2aebd00-2661-46e4-8946-419e4b8df13b,
  notify-team=00dd67bd-df4b-4477-af5c-2530c44a5b60,
  pause=738279fc-0263-4eef-8afa-1e084e17521e,
  product-media-lookup=d4e6365e-4736-4e92-872a-259adb6634f2,
  quote-order=ae2db7b7-918c-4b73-b36e-979668920347,
  save-order-state=f181c01f-ec3e-4669-af09-54a15a749701,
  send-buttons=2620cfb9-b8c9-48b0-bed8-b8f2f9ac16a1,
  send-payment=65f355d6-8b81-475d-84d9-9a37197cb8cd,
  send-text=4bfc667c-39f1-4c69-8c45-cffa24cf5f38,
  shopify-product-lookup=21cd24f1-ed57-4303-988c-043bf4bc8069.
  Hay DOS workflows: `kenku-sales-bot` (`5d45d805-b52f-4d82-8c77-b8dd680718fc`)
  y `kenku-recovery-bot` (recuperacion de pedidos retornados).
- **NO usar el MCP de Kapso para mutaciones**: el conector MCP de Kapso de las
  sesiones está autenticado contra el proyecto de AURELA. Solo sirve
  `search_docs` (documentación, es neutral). Nada de escribir por MCP.
- **Shopify (Kenku)**: las funciones se conectan por Admin API con el token de
  la app interna (`SHOPIFY_ADMIN_ACCESS_TOKEN` en la config de cada función).
  No usar el MCP de Shopify para operar la tienda desde las sesiones.

## Flujo de cambios

0. **Antes de tocar nada**: `kapso pull --diff` para ver si producción se
   adelantó al repo (pasó: hasta el 2026-08-31 llevaba meses desfasado). Si hay
   diferencias, `kapso pull --overwrite` primero. Ojo: `pull` PRESERVA un
   `workflow.js` local desfasado; hay que borrarlo y volver a pullear ese
   workflow para que lo regenere desde producción.
1. Editar el código en este repo, commit y push a GitHub.
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

- Números conectados (2026-08-31): el `kenku-sales-bot` dispara con Kenku Peru
  981 (`1239315459260256`, el de más tráfico), Kenku 600 (`1117623181444547`),
  Kenku 451 (`951608524703564`) y el Sandbox (`597907523413541`); el
  `kenku-recovery-bot` con Kenku 630 (`1241670942359671`). Los defaults
  `597907523413541` que quedan en el código son solo respaldo para cuando el
  payload no trae el phoneNumberId.
- Los `functions/**/function.yaml` están gitignorados (contienen secretos);
  la config vive en Kapso y en la copia local del usuario.
- Productos estrella para enganche: *Black Seed Oil* y *NAD+ Resveratrol*.
- Ver `MIGRACION.md` para el historial de la migración desde Aurela y los
  pendientes de negocio (promos 3x2/5x3, Yape/razón social, prefijo de pedidos).
