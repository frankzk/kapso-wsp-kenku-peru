# Evaluación de modelos — bot de ventas Kenku

Compara modelos candidatos sobre **conversaciones reales** del bot, con reglas
deterministas. Sirve para descartar candidatos malos sin exponer clientes y para
no reintroducir fallas que ya arreglamos.

## Cómo se corre

Desde **tu máquina**, no desde una sesión de Claude Code: el proxy de las
sesiones bloquea `openrouter.ai`, `api.openai.com` y `api.x.ai`.

```bash
export OPENROUTER_API_KEY=sk-or-...

node evals/runner.js                          # los 6 candidatos por defecto, los 8 casos
node evals/runner.js --caso pulsera-unidad --verbose
node evals/runner.js --modelos openai/gpt-4.1,google/gemini-3.7-flash
```

Cada corrida imprime un ranking y deja el detalle en `evals/resultados/`.

Node 18 o superior (usa `fetch` nativo). No instala nada.

## Qué hace exactamente

1. Toma el **prompt real** del agente y sus **12 herramientas**, capturados del
   workflow vivo en `fixtures/agente.json`.
2. Reproduce los turnos del cliente de cada caso contra el modelo candidato.
3. Cuando el modelo llama una herramienta, le devuelve el **resultado grabado**
   del caso — no llama a las funciones de verdad.
4. Junta todo lo que el modelo le habría mandado al cliente (texto suelto +
   argumentos de `send_text`, `send_buttons`, `send_media`) y le aplica las
   reglas.

El punto 3 es lo que hace la corrida **determinista y sin efectos**: no toca
Shopify, no manda mensajes, no crea pedidos, y aísla la decisión del modelo de la
variabilidad de las funciones.

## Por qué no hay un LLM juez

Un juez-LLM mete su propio criterio y su propia varianza, y después no se puede
discutir por qué un modelo salió mejor que otro. Acá cada punto se rastrea a una
línea concreta: *dijo `S/80` cuando los precios válidos son 149, 298 y 447*.

Las reglas disponibles están en `scoring.js`: `precio_valido`, `sin_precio`,
`prohibido_texto`, `prohibido_regex`, `requerido_texto`, `requerido_regex`,
`sin_narracion`, `herramienta_esperada`.

## Los casos

Cada uno viene de una falla real que ya nos costó plata o confianza. Están en
`casos/casos.json` con su campo `origen`.

| Caso | De dónde salió |
|---|---|
| `pulsera-unidad` | El bot ofreció "1 par" de una pulsera y el cliente se confundió |
| `black-seed-parasitos` | Negó un uso que el producto sí tiene (está en sus tags) |
| `iced-coffee-precio` | Cotizó S/80 (precio de un molinillo) por un producto de S/149 |
| `carrito-doble-descuento` | Aplicó 3x2 sobre un precio que ya lo tenía: ofreció S/198,68 en vez de S/298 |
| `direccion-ya-conocida` | Debe confirmar la dirección guardada, no volver a pedirla |
| `producto-ambiguo` | Con búsqueda ambigua tiene que desambiguar, nunca cotizar |
| `producto-agotado` | No se vende ni se cotiza lo que no hay |
| `presentacion-completa` | El caso normal, que es el 87% del tráfico |

**Agregar un caso nuevo cada vez que aparezca una falla en producción.** Ese es
el valor que se acumula: la próxima vez que cambiemos de modelo o toquemos el
prompt, la corrida avisa si volvimos a romper algo viejo.

## Los candidatos por defecto

`openai/gpt-4.1` (el de producción, es la línea base), `openai/gpt-4.1-mini`
(el anterior, marca el piso), `anthropic/claude-haiku-4.5`,
`anthropic/claude-sonnet-4.5`, `google/gemini-3.7-flash`, `x-ai/grok-4.3`.

**Verificar el id contra openrouter.ai/models antes de correr.** Un id malo
devuelve 404 en todos los casos y no cuesta nada, pero desperdicia la corrida.
Ya pasó dos veces: `x-ai/grok-4.1-fast` figura como `active` en el catalogo de
Kapso pero xAI lo deprecó (OpenRouter pide `grok-4.3`), y `qwen/qwen-turbo`
directamente no existe ahi. Si un modelo da 404 en toda la corrida, el problema
es el id, no el modelo.

**Ids verificados** (respondieron al menos una vez): `openai/gpt-4.1`,
`openai/gpt-4.1-mini`, `anthropic/claude-haiku-4.5`, `google/gemini-3.7-flash`,
`google/gemini-2.5-flash`, `moonshotai/kimi-k2`, `z-ai/glm-4.6`,
`minimax/minimax-m2`, `deepseek/deepseek-chat`.

Los dos de Anthropic entran por un motivo concreto además de la calidad: son los
únicos del catálogo de Kapso que exponen **caché de prompt de 1 hora**. Con
17.700 tokens de contexto fijo reenviados ~6 veces por conversación, eso puede
pesar más en el costo que la diferencia de precio por token.

Cuidados al agregar otros:

- `gpt-5.4` y `gpt-5.5` usan `api_surface: responses`, otra superficie de API.
  No está verificado que el nodo de Kapso la maneje igual.
- `claude-sonnet-4-6` tiene `supports_custom_sampling: false` y es razonador:
  habría que sacarle la `temperature: 0.2` y puede agregar latencia.

## Primera corrida (2026-09-06, 8 casos)

| Modelo | Reglas | Casos | Tokens |
|---|---|---|---|
| google/gemini-3.7-flash | 23/23 (100%) | 8/8 | 899.779 |
| openai/gpt-4.1 | 22/23 (95,7%) | 7/8 | 1.367.986 |
| openai/gpt-4.1-mini | 20/23 (87,0%) | 5/8 | 1.303.246 |
| anthropic/claude-haiku-4.5 | 17/23 (73,9%) | 3/8 | 1.100.747 |
| x-ai/grok-4.1-fast | — | — | 404, id deprecado |

Gemini Flash gano en calidad y en tokens a la vez (34% menos que gpt-4.1).

## Segunda corrida (2026-09-06, sonda de 1 caso: `iced-coffee-precio`)

Seis candidatos baratos, un solo caso, para descartar sin gastar.

| Modelo | Reglas | Tokens |
|---|---|---|
| moonshotai/kimi-k2 | 3/3 | 262.358 |
| minimax/minimax-m2 | 3/3 | 207.585 |
| z-ai/glm-4.6 | 3/3 | 164.049 |
| google/gemini-2.5-flash | 2/3 | 91.957 |
| deepseek/deepseek-chat | 2/3 | 75.710 |
| qwen/qwen-turbo | — | 404, id inexistente |

**Los tokens explican la falla.** Los dos que reprobaron gastaron la mitad que
los que pasaron. No cotizaron mal: **nunca llegaron a cotizar**. Contestaron con
texto suelto, agotaron los dos empujones y salieron del loop.

## "No llego a cotizar" es una falla real, no ruido del arnes

Es el mismo modo de falla que se le vio a `claude-haiku-4.5` en la primera
corrida, y conviene tenerlo claro porque se presta a dos lecturas opuestas:

- **No es un artefacto.** El nodo corre en `message_delivery_mode: tool_only`.
  Un modelo que contesta con texto suelto y no llama la herramienta de envio no
  le manda **nada** al cliente. En produccion eso es una conversacion muerta, que
  es peor que un precio equivocado.
- **Pero el puntaje solo no alcanza para verlo.** `precio_valido` lo reporta
  como "no llego a cotizar ningun precio", que se lee como un problema de
  precios. Por eso el runner ahora imprime el **motivo de corte** (`empujones`,
  `max_iter`, `complete_task`) y lo guarda en el JSON. Si dice `empujones`, la
  falla es de obediencia a las herramientas, no de criterio comercial.

**Lo que si era artefacto, y ya esta corregido:** el mensaje de empujon nombraba
`send_text` textualmente. Como `sin_narracion` marca como falla que el texto al
cliente contenga el nombre de una herramienta, un modelo que repetia el empujon
quedaba castigado por una palabra que le habiamos puesto nosotros en la boca. El
empujon ya no nombra ninguna herramienta; el nombre sigue estando en la lista de
`tools`, que es de donde el modelo lo tiene que sacar.

Por eso **el 17/23 de haiku de la primera corrida no es comparable** con los
puntajes de aca en adelante: se midio con el empujon viejo.

## La limitación honesta

**Esto mide calidad de respuesta, no ventas.** Un modelo puede ganar acá y no
mover la conversión, porque comprar depende de cosas que el laboratorio no
captura. Sirve para **descartar** candidatos malos barato y para detectar
regresiones; la prueba en producción sigue siendo la única que decide.

**Lo que cuesta.** Medido en la primera corrida real: **~132.000 tokens por caso
y por modelo**, porque el prompt de 48.000 caracteres se reenvia en cada
iteracion.

| | 4 casos | 5 casos | 8 casos |
|---|---|---|---|
| openai/gpt-4.1 | $0,76 | $0,95 | $1,51 |
| openai/gpt-4.1-mini | $0,18 | $0,22 | $0,35 |
| anthropic/claude-haiku-4.5 | $0,53 | $0,67 | $1,06 |
| anthropic/claude-sonnet-4.5 | $1,17 | $1,46 | $2,33 |
| google/gemini-3.7-flash | $0,17 | $0,22 | $0,35 |
| x-ai/grok-4.1-fast | $0,17 | $0,22 | $0,35 |
| **los 6 juntos** | **$2,98** | **$3,72** | **$5,95** |

Sonnet 4.5 solo se lleva el 39% del total: sacarlo baja la corrida completa a
$3,62. Los precios de haiku, gemini y grok son estimados; los de la familia GPT
son los efectivos publicados por OpenRouter.

El runner imprime el acumulado de tokens entre modelo y modelo, para poder cortar
si el credito esta ajustado.

Para gastar menos mientras iteras, usa `--caso` y `--modelos` para acotar.

## Mantenimiento

`fixtures/agente.json` es una **foto** del prompt y las herramientas. Si el
prompt cambia mucho, hay que recapturarlo para que la comparación siga siendo
contra el bot actual — si no, se estarían midiendo modelos contra instrucciones
viejas.
