# Kenku Cobros Shalom

Workflow del **Kenku 600** (`1117623181444547`), la linea dedicada al cobro del
saldo de los envios por Shalom.

| | |
|---|---|
| **id** | `4c2578dc-1a8e-4ae6-93bc-c6cd66678e2b` |
| **slug** | `kenku-cobros-shalom` |
| **trigger** | `589a4c83-c754-4142-b597-6d1e14051a7c` · inbound_message · Kenku 600 |
| **router** | `shalom-router` (`ddc30944-fdbc-4eee-9ba3-b301135ac6b4`) |
| **avisos** | `notify-team` (`00dd67bd-df4b-4477-af5c-2530c44a5b60`) |

## Por que existe

El 600 corria el **bot de ventas**, el mismo del 981. Una clienta que ya compro,
ya pago el adelanto y tiene el paquete en camino, si escribia "¿cuanto debo?",
entraba al flujo de venta y le ofrecian productos. Y el watchdog no lo detectaba,
porque solo salta cuando el bot NO contesta: ahi contestaba, mal.

Se decidio darle workflow propio en vez de seguir parchando el prompt de ventas.
Las dos reglas de Shalom que se le agregaron al `sales-agent` (los cuatro botones
y "no vender tras el aviso") **se dejan donde estan**: ya no se activan para el
600, y sacarlas seria riesgo sin beneficio.

## Sin ningun LLM

Nueve nodos: `decide` de funcion, `send_text` de texto fijo y `notify-team`. No
hay agente. En un flujo donde se habla de plata eso vale mas que la
flexibilidad: no hay nada que alucinar, no cuesta tokens y el mismo mensaje toma
siempre el mismo camino.

Para comparar: en el bot de ventas, **ignorar un boton costaba 19.064 tokens de
entrada** (US$0,0156) porque cargaba el prompt de 51.533 caracteres para decidir
quedarse callado.

## El recorrido

```
start -> router
  router --[boton]--->   esperar-6h -> compuerta
  router --[voucher]-->  avisar-pago -> fin
  router --[texto]---->  avisar-consulta -> responder -> fin

  compuerta --[voucher]--> avisar-pago
  compuerta --[texto]----> avisar-consulta
  compuerta --[recordar]-> recordatorio -> fin
  compuerta --[fin]------> fin
```

| Entra | Que hace |
|---|---|
| Uno de los 4 botones | **Silencio.** Los contesta el dashboard con las cuentas |
| Voucher (imagen o PDF) | `notify-team`: Telegram + cola "Atender ahora" |
| Texto libre | `notify-team` + una linea fija derivando a una asesora |
| 6 h sin responder | **Un** recordatorio, sin montos |

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

## Los dos limites conocidos

**El seguimiento solo alcanza a quien respondio algo.** El workflow arranca con un
mensaje entrante: si la clienta recibe el aviso y nunca toca nada, no hay
ejecucion y no hay recordatorio — y probablemente sean la mayoria. El dashboard
puede arrancarla con `POST /platform/v1/workflows/{id}/executions` (verificado
que el endpoint existe, espera un parametro `workflow_execution`).

**El recordatorio no dice el monto**, porque el workflow no lo sabe: ese dato esta
en el dashboard. Si hace falta que lo diga, el dashboard tendria que pasarlo al
arrancar la ejecucion.

## Pendiente ajeno a Kapso

El `verified_name` del 600 en Meta es **"Kenku Aurela"**, no "Kenku". Es el
nombre que ve la clienta cuando le llega el aviso de cobro. Viene de la
migracion desde Aurela y se corrige en Meta.
