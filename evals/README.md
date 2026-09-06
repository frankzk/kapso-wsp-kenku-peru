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
`anthropic/claude-sonnet-4.5`, `google/gemini-3.7-flash`, `x-ai/grok-4.1-fast`.

Los dos de Anthropic entran por un motivo concreto además de la calidad: son los
únicos del catálogo de Kapso que exponen **caché de prompt de 1 hora**. Con
17.700 tokens de contexto fijo reenviados ~6 veces por conversación, eso puede
pesar más en el costo que la diferencia de precio por token.

Cuidados al agregar otros:

- `gpt-5.4` y `gpt-5.5` usan `api_surface: responses`, otra superficie de API.
  No está verificado que el nodo de Kapso la maneje igual.
- `claude-sonnet-4-6` tiene `supports_custom_sampling: false` y es razonador:
  habría que sacarle la `temperature: 0.2` y puede agregar latencia.

## La limitación honesta

**Esto mide calidad de respuesta, no ventas.** Un modelo puede ganar acá y no
mover la conversión, porque comprar depende de cosas que el laboratorio no
captura. Sirve para **descartar** candidatos malos barato y para detectar
regresiones; la prueba en producción sigue siendo la única que decide.

Referencia de lo que cuesta cada opción: una corrida completa son unos pocos
dólares de tokens, contra ~S/1.900 por semana de una prueba en producción.

## Mantenimiento

`fixtures/agente.json` es una **foto** del prompt y las herramientas. Si el
prompt cambia mucho, hay que recapturarlo para que la comparación siga siendo
contra el bot actual — si no, se estarían midiendo modelos contra instrucciones
viejas.
