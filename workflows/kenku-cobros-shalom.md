# Kenku Cobros Shalom

Workflow del **Kenku 600** (`1117623181444547`), la linea dedicada al cobro del
saldo de los envios por Shalom.

| | |
|---|---|
| **id** | `4c2578dc-1a8e-4ae6-93bc-c6cd66678e2b` |
| **slug** | `kenku-cobros-shalom` |
| **triggers** | `589a4c83-c754-4142-b597-6d1e14051a7c` · inbound_message · Kenku 600 (`1117623181444547`) |
| | `09179aeb-38be-4b8b-8a26-b9d2b8290996` · inbound_message · Kenku Aurela +51 929 334 428 (`1403927069462854`), desde el 2026-09-28 |
| **router** | `shalom-router` (`ddc30944-fdbc-4eee-9ba3-b301135ac6b4`) |
| **avisos** | `notify-team` (`00dd67bd-df4b-4477-af5c-2530c44a5b60`) |

## Dos numeros, UN workflow (desde el 2026-09-28)

El 929 334 428 ("Kenku Aurela") atiende los cobros con **este mismo workflow**,
no con una copia: asi las reglas de los dos numeros no se separan con el
tiempo. En Kapso cada trigger tiene un solo numero, por eso son dos triggers
`inbound_message` sobre el mismo workflow.

Lo que hizo falta para que el 929 quede igual que el 600:
- trigger nuevo en este workflow (ningun otro workflow escucha el 929);
- el 929 en `WATCHDOG_PHONE_IDS` de check-coverage (cola "Atender ahora");
- nada en el router: toma el numero de la conversacion, no tiene numeros fijos;
- nada en la derivacion: el webhook de handoff a Kapta es de todo el proyecto;
- el webhook `whatsapp.message.received` del 929 a Kapta ya existia
  (`3e574d74`): es el que contesta los botones.

Al 2026-09-28 Meta tiene el 600 en estado **BANNED**.

## Por que existe

El 600 corria el **bot de ventas**, el mismo del 981. Una clienta que ya compro,
ya pago el adelanto y tiene el paquete en camino, si escribia "¿cuanto debo?",
entraba al flujo de venta y le ofrecian productos. Y el watchdog no lo detectaba,
porque solo salta cuando el bot NO contesta: ahi contestaba, mal.

Se decidio darle workflow propio en vez de seguir parchando el prompt de ventas.
Las dos reglas de Shalom que se le agregaron al `sales-agent` (los cuatro botones
y "no vender tras el aviso") **se dejan donde estan**: ya no se activan para el
600, y sacarlas seria riesgo sin beneficio.

## El silencio es deterministico; la respuesta, no

Ocho nodos. El ruteo no usa ningun LLM: `shalom-router` mira el ultimo entrante
y devuelve por que arista seguir. Lo que **no** hay que contestar —un boton, un
"gracias"— se corta ahi, con codigo. Una regla en codigo no se la salta el
modelo un mal dia, y no cuesta tokens: en el bot de ventas, **ignorar un boton
costaba 19.064 tokens de entrada** (US$0,0156), porque cargaba el prompt de
51.533 caracteres para decidir quedarse callado.

Lo que si hay que contestar va a un nodo `agent` (`gemini-3.7-flash`, 3.389
caracteres de prompt, `tool_only`, `send-text` + `notify-team`). Antes eso era
una linea fija que derivaba a una asesora; derivar lo que el bot sabe contestar
es justamente lo que habia que evitar.

## El recorrido

```
start -> router
  router --[boton]--->   esperar-6h -> compuerta
  router --[trivial]-->  fin
  router --[voucher]-->  avisar-pago -> agente -> fin
  router --[texto]---->  agente -> fin

  compuerta --[voucher]--> avisar-pago
  compuerta --[texto]----> agente
  compuerta --[recordar]-> recordatorio -> fin
  compuerta --[fin]------> fin
```

| Entra | Que hace |
|---|---|
| Uno de los 4 botones | **Silencio.** Los contesta el dashboard con las cuentas |
| Acuse trivial ("ok", "gracias", un emoji) | **Silencio.** Lo contesta Kapta con el saldo y el Yape |
| Voucher (imagen o PDF) | `notify-team` (Telegram + cola) y despues el agente agradece |
| Texto libre | El agente contesta, o deriva si corresponde |
| 6 h sin responder | **Un** recordatorio, sin montos |

## Las dos listas de acuses tienen que ser identicas

`TRIVIALES`, en `shalom-router`, y la lista de acuses de **Kapta** son la misma
regla partida en dos sistemas: donde el router calla, Kapta contesta con el
saldo y el Yape; donde el router habla, Kapta calla.

No alcanza con que una sea subconjunto de la otra:

- palabra en el router y no en Kapta → la clienta no recibe **ninguna**
  respuesta;
- palabra en Kapta y no en el router → recibe **dos**.

Por eso `acuerdo` esta en la lista: sin ella, "de acuerdo" no era trivial para
el router y contestaban los dos. **Si se toca una lista hay que tocar la otra.**

**`no` no es un acuse, y tampoco `nunca`, `cancelar`, `anular` ni `devolver`.**
Despues de pedirle un saldo, un "no" o un "no gracias" no cierra la
conversacion: rechaza el pago, y eso abre el flujo de devolucion. Mandarlo a
`fin` en silencio pierde la senal justo cuando mas vale. Van al agente, que
deriva.

## Decisiones que conviene no deshacer

**La compuerta reclasifica, no asume.** Si la clienta mando el voucher o escribio
DURANTE las 6 horas de espera, va por esa rama. Sin eso, recibiria un
recordatorio de pago despues de haber pagado.

**Un solo recordatorio, a las 6 horas.** La ventana de WhatsApp son 24 h desde el
ultimo mensaje del cliente: a las 72 h el texto libre no fallaria "a veces",
fallaria siempre (`131047`, ya visto en el 451). La compuerta corta sola pasadas
~23 h.

**Los `send_text` van sin `phone_number_id`**, asi salen por el numero de la
conversacion. Cuando se borro "Kenku Peru Arqui Nexo", su eliminacion se llevo
los nodos que lo referenciaban; no repetirlo.

**Los botones se listan con las DOS redacciones** del boton del medio:
`guias_shalom` dice "Transferencia Deposito" y `guias_shalom_imagen`
"Transferencia / Deposito".

**El agente no valida pagos y no puede insinuar que lo hizo.** El voucher lo
revisa una persona en la cola de Kapta. Si el bot dice o sugiere "ya esta
validado", la clienta va a la agencia sin la clave liberada y hace el viaje en
vano. El prompt se lo prohibe explicitamente; si se reescribe esa seccion, la
prohibicion se conserva.

## Los dos limites conocidos

**El seguimiento solo alcanza a quien respondio algo.** El workflow arranca con un
mensaje entrante: si la clienta recibe el aviso y nunca toca nada, no hay
ejecucion y no hay recordatorio — y probablemente sean la mayoria. El dashboard
puede arrancarla con `POST /platform/v1/workflows/{id}/executions` (verificado
que el endpoint existe, espera un parametro `workflow_execution`).

**El recordatorio no dice el monto**, porque el workflow no lo sabe: ese dato esta
en el dashboard. Si hace falta que lo diga, el dashboard tendria que pasarlo al
arrancar la ejecucion.

**`notify_team` sin `reason` sale titulado "Voucher recibido".** Es el default
correcto para el nodo `avisar-pago`, que no pasa argumentos, y el equivocado
para un handoff: el equipo buscaria un comprobante que no existe. Por eso el
prompt y el schema le exigen al agente una etiqueta en `reason`
(`cobro_shalom_devolucion`, `_reclamo`, `_ya_pago`, `_pide_humano`, `_otro`).
Esas etiquetas son ademas lo que hace medible el conteo de handoffs por motivo.

**No hay asignacion automatica por numero.** Buscado en la Platform API: el
recurso del numero no tiene campo de asignado, la conversacion tampoco, y no
existen `assignment_rules`, `assignments` ni `inboxes`. Si la asignacion fija de
una linea a una persona existe, es del dashboard de Kapso, no de la API.

## Pendiente ajeno a Kapso

El `verified_name` del 600 en Meta es **"Kenku Aurela"**, no "Kenku". Es el
nombre que ve la clienta cuando le llega el aviso de cobro. Viene de la
migracion desde Aurela y se corrige en Meta.
