<!-- Analisis generado el 2026-11-06 a partir del informe "Comportamiento del agente de ventas IA · Mireva Costa Rica" (iComfly), el prompt y flujo vigentes de kenku-sales-bot, 19.701 ejecuciones (19-oct a 5-nov) y 110 chats leidos uno por uno. Las cifras 41%/17% de conocidos vs nuevos son dentro de una muestra enriquecida con compradores: vale la relacion (~2,5x), no el valor absoluto. -->

# Kenku vs Mireva: qué hace su bot que no hacemos, y cómo subir la conversión

## 1. Las tasas no son comparables

**El 12.7% de Mireva no es 12.7%.**
- Dashboard: 7 pedidos ÷ 55 "leads sin compra" el 6-nov = 12.7%. Con denominador correcto: 7 ÷ 62 = 11.3%.
- El numerador cuenta *pedidos registrados*, no ventas. De 72 pedidos revisados: 56% firmes, 30% "comprar después" registrados como pedido, 17% producto/cantidad equivocados.
- Conversión firme ≈ 11.3% × 0.55 ≈ **6%**. Venta limpia ≈ 3.5%.
- Denominador: solo chats del agente de ventas (~120/día), 85% entran con el mensaje prellenado del anuncio. Postventa y logística van a otros agentes y no cuentan.

**El 2.6% de Kenku es más estricto por los dos lados.**
- Numerador: pedido creado por el bot. Exige cantidad explícita + resumen + confirmación después del resumen (prompt l.198), dirección entregable y celular validados (save-order-state), y no registra aplazos ("mañana veo" deja stage activo, l.280). Es casi "firme" por construcción.
- Pero subcuenta: en zona de agencia el bot nunca crea la orden (l.153), y las ventas que cierra la vendedora tras handoff no entran (b7bf6ae7 #KP201234, 7869b14c #KP201525, 4d013793 #KP202134, fb85f3e3 #KP201580).
- Denominador: toda persona que escribió, incluidos postventa, "gracias", reclamos, loops y recurrentes (~650-730/día).

**Estimación comparable (supuestos explícitos):**
- S1: 20% de las personas no son leads → leads ≈ 552/día. 18 pedidos/día ÷ 552 = 3.3%.
- S2: +15% de cierres por agencia que no se crean en Shopify → 3.8%.
- S3: 80-85% de los pedidos del bot serían firmes a 48 h → **Kenku firme ≈ 2.7-3.2%** (definición Mireva) vs Mireva ≈ 6%. Brecha ≈ 2x, no 5x.
- Lo que más pesa y la pregunta no menciona: en Mireva el bot cierra el 100% de las ventas; en Kenku una parte la cierra la asesora. Conversión por teléfono a 7 días, bot + asesora: 10.9-13% (EXPERIMENTOS.md §4, CONVERSION.md). Comparar "bot solo" de Kenku con "bot total" de Mireva es el error de denominador que hay que dejar de cometer.
- Mezcla de leads distinta: Mireva 85% anuncio; Kenku 66% anuncio y 15% clientes conocidos entre los perdidos. Los conocidos convierten 41% (91/222) vs 17% los nuevos (156/925).

## 2. Qué hace Mireva que Kenku no hace

| Mecanismo | Mireva | Kenku hoy (cita) | Brecha |
|---|---|---|---|
| Precio en el primer mensaje | 63/71 chats: una imagen con precio + escalera 2+1/3+2 + una línea de beneficio + pregunta | Precio es el 4º-6º mensaje, a los 26 s (mediana, 953 presentaciones); orden fijo saludo → fotos → video → beneficio → precio (l.115-129, l.120 "el shock de precio es la fuga #1"). Chat 72f85076: precio a +28 s en el 6º mensaje, sin respuesta | Real en orden y velocidad. Efecto no demostrado: con video 40% responde, sin video 40%; A/D (mismo contenido, más rápido) no movió ventas |
| Pregunta de cierre | "¿Te animas a llevar una o el combo?" (cantidad) | "¿Te encuentras en Lima o en provincia?" (l.129), 887/953 presentaciones. El prompt lo admite: "la mitad de las caídas se caen justo ahí" (l.174) | Real, pero **ya probada y perdió**: variante B (ago-2026) 3.14% vs 4.05%, -22%, 5.406 leads |
| Datos de envío | Todos en un mensaje tras el sí; completa solo lo que falta | Lima/prov → distrito → cantidad → dirección+nombre → resumen → confirmar (l.183-186, l.146). 42694846: 6 respuestas; d9b3aae0 pidió el nombre dos veces | Dos turnos de ubicación que no aportan nada operativo (check_coverage necesita distrito+provincia, l.83) |
| Plazo de entrega | Dato fijo de configuración "4-5 días hábiles" repetido como garantía | No existe dato duro; el bot inventa: "24 a 48 h" (e67d9561), Juliaca "2-3 días" (f3895631) vs "24-48 h" (a47f1204), "antes de las 5 pm" (707452fb), "9 am a 7 pm" (3d41b4cb). Corpus: "2 a 3 días" 84 convs, "~24h" 59, rangos horarios 39 | Real. Es el error 7.4/7.5 de Mireva reproducido |
| Aplazo con fecha | Registra el pedido (error #1 de Mireva); su recomendación: prospecto con fecha, sin pedido | No crea pedido (bien), pero quema 7 toques en 23 h y marca lead_perdido antes de la fecha (71436f0d, 0168c78e); promete "te escribo cuando se acerque" sin mecanismo (a63d9558, 255e72eb, viola l.99) | Parcial: falta la mitad buena |
| Seguimientos | 1-3 toques "sin regla conocida"; "reactivaron la mayoría" solo entre chats que compraron | 7 toques deterministas, horario nocturno, frase por zona, 10% real (fu-w1..w7, send-followup-envio). Pero textos iguales para todo stage: 5acefd4b (esperando_voucher) recibió "pagas al recibir", "¿te armo el pedido?" y "10%" | **Kenku mejor** en mecánica; brecha en conciencia de estado |
| Combos | Escalera solo en imagen vende 12%; de palabra 26% | Escalera con montos en texto (l.121-127), botones con precio, 27% de pedidos 3x2 (lote 5) vs 21% Mireva. P2 (empujar 3x2) perdió -29% ingreso/lead | **Kenku mejor**. P1/P2 es texto muerto (1.147/1.147 = P1) |
| Umbral de registro | "Registra en cuanto tiene lo mínimo": 48% sin dirección/celular válido, 17% producto equivocado | Resumen + botones Confirmar/Modificar (l.203-211), REQUIRED district/province/quantity/address/receiver_name/phone, duplicados 48 h | **Kenku mejor**. No tocar |
| Cliente conocido | Sin memoria; arrastra pedidos viejos (80378) | Dirección guardada + "¿como la vez pasada?": 68% responde, 26% compra en la misma conversación (vs 41%/4% del Msg 8 normal) | **Kenku mejor**. Falla de formato: 9/76 direcciones basura ("-, 980187619, -" en 4b0c8b7e) |
| Agencia / adelanto | No existe: contraentrega en todo el país | Guion fijo S/30 (l.162), pero: pago sin cantidad ni total (5acefd4b, f00f6596), send_payment dos veces (bdef0ca0), Olva con pago 100% ante desconfianza (9a3b05b0) | Fricción propia de Kenku, sin equivalente en Mireva |
| Fichas de producto | Débil: sin FAQ cargadas (objeción "uso" 32%, calidad floja) | description='' en 16/16 productos del lote 3; el bot inventa dosis (73ddbd42), edad (72c3afab), mg (29a582c7) | Igual de débil; Kenku lo puede resolver antes |
| Medición | Cuenta registros; sin A/B | Cuenta pedidos creados sin cancelados (campaign-report l.392-399); con A/B por teléfono | Ambos sin "firme"; Kenku con mejor infraestructura |

## 3. Dónde se caen los leads de Kenku

Sobre 900 no compradores y 7 lotes de chats leídos uno por uno:

1. **Tras la presentación, sin decir nada: la fuga principal.** 74% termina en lead_perdido en su primera ejecución con ~5 iteraciones. Por lote: 9/16, 12/16, 11/16, 9/16, 10/16 callaron exactamente después de "¿Lima o provincia?". Leen y no contestan: 9/10 del lote 4 con status read; e8fb98c2 12 salientes leídos, 0 respuestas. 80% vio producto, 29% dio distrito. En 620 leads nuevos perdidos: 58.7% callan tras la presentación.
2. **Segundo punto: la pregunta de cantidad/promo (10.8%)**, por encima del distrito (4.4% + 3.5%). Incluso tras dar distrito, 32-34% no responde "¿1 o 3x2?" (8047beed). Esto contradice la idea de que preguntar cantidad antes "engancha".
3. **Distrito:** e29321f5 respondió "Lima" y calló al pedir distrito; fc6ad5a1 y 737bb1d2 pulsaron "Provincia" y callaron. Pausas largas de compradores caen ahí: 42694846 28 min, 482d96ee 6.3 h.
4. **Adelanto Shalom:** 2/2 leads de agencia del lote 0 (b99855ec, 927bae67) y 3/4 del lote 3 (456933b6, 73ddbd42, d4ff23b8) callaron al oír el adelanto o la agencia. 73ddbd42 tuvo cantidad, total, nombre y DNI y no pagó. 56% nunca manda el voucher (CONVERSION.md).
5. **Seguimientos:** 83/2, 91/3, 103/4, 99/4, 98/4 toques/respuestas en no compradores (~3%), 0 ventas; s6 (10%) 0 aceptaciones en 12. Pero entre compradores 4/15 y 5/6 llegaron tras un toque (5b2d4947 s1, 1b861bd3 s2, fc921a4b p5). La cadena funciona en quien compra; no mueve al 74%.
6. **Re-piden el precio tras recibirlo:** 942bb1a5 "Cuánto está" 12 s después del bloque, b99855ec audio 1 min después, e3d7c8c9 28 min después. El precio va en un bloque de 62 palabras (mediana) en medio de una ráfaga de 5-8 mensajes.
7. **Datos que llegan y se ignoran:** 0a0f5676 "Lima, Perú." a los 14 s y el bot preguntó Lima/provincia; 782e24c4 "precio de Chimbote" entró 9 s después de armar el prompt y nunca se procesó (4 seguimientos con "¿Lima o provincia?").
8. **Fichas vacías:** 456933b6 preguntó 3 veces "para qué sirve" y se fue; 72c3afab negó Vital Moo a una niña por una edad inventada.
9. **Conocidos con dirección ilegible:** 9/76 Msg 8 con "-, Callao", "Por el mercado, Por el mercado, Chumbivilcas" (d1d45fc3), "CARHUAZ / Carhuaz / Carhuaz" (0799ade2).
10. **Técnico (menor de lo que parecía):** 531 ejecuciones fallidas el 23-oct (incidente del 981); fuera de ese día y del 18-oct, ~3/día (0.4%) y 0.29% de conversaciones sin respuesta. fc921a4b quedó sin Msg 8 por un 429 del proxy; compró al día siguiente tras p5.
11. **Handoff humano en plena captura NO es pérdida:** 58/111 handoffs del dashboard caen en datos_envio/esperando_confirmacion y 41 (71%) terminan con pedido en WooCommerce. Es un problema de atribución (ver §7). Lo que sí falla: 17/58 quedan con el último mensaje del cliente sin responder (f00f6596 "quiero comprar el tuyo").
12. **Objeciones explícitas son raras:** 12/16 del lote 2 y 10/16 del lote 4 no plantearon ninguna. Cuando las hay, igual que Mireva: entrega #1 (7/15 compradores del lote 5), uso/dosis, pago. Precio: 0/15 entre compradores.

## 4. Plan para subir la conversión

Orden por impacto/esfuerzo. "Esta semana" = prompt o código chico, sin A/B. Todo conserva el candado de cierre (l.198): ninguna propuesta crea pedidos por historial, por aplazo o sin dirección.

### 4.1 Medir lo que decide (prerrequisito) — esta semana la parte offline
- **Qué cambia:** KPI de cabecera = ventas firmes por persona a 7 días, bot + asesora, cruzando teléfono/BSUID con pedidos reales; subcolumnas: creadas por bot, cerradas por asesora tras handoff, voucher de agencia (nunca cuenta como venta hasta que exista el pedido). Firme 48 h = no cancelado, no cod-pending sin confirmar, sin stock por validar. Denominador "leads" sin postventa, reclamos, loops, ejecuciones fallidas. Celdas anuncio/orgánico × nuevo/conocido.
- **Dónde:** campaign-report en la rama `claude/bot-kenku-woocommerce-completo` (el bot crea pedidos en WooCommerce desde el 27-oct; la rama actual consulta Shopify). fu-lost deja de pisar `stage` y guarda `followups_exhausted=true`. Prompt VOUCHER (l.168): guardar `conversion_status="voucher_reportado"` + tipo/total/fecha.
- **Evidencia:** l.200 "una orden creada cuenta como conversión"; campaign-report l.392-399 sin cancelados; fu-lost sobreescribe stage (flujo l.31-32); 11/15 compradores del lote 5 figuran como lead_perdido en la muestra por medir stage de otra ejecución.
- **Riesgo:** "firme" depende de que las vendedoras cancelen los rechazos en puerta; hasta hacer el censo de estados Woo/Kapta, solo "entregada/cobrada" es confiable.
- **Ajuste del verificador:** no usar FULFILLED+PAID de Shopify (los pedidos del bot ya no están ahí); la prueba A/D está cerrada desde el 25-oct (D al 100%), no hay brazo A que leer; el paso de caída ya está en el evento `variables_set` de fu-lost (old_value), no hace falta `{{vars.stage}}`; no pedir `last_step` al prompt (ya falla guardando stage).

### 4.2 Seguimientos conscientes del estado y aplazo sin pedido — prompt esta semana, flujo después
- **Qué cambia:** (a) fu-s1, fu-s3, fu-s6 pasan a función que lee `stage`/`order_*`: en producto_mostrado, s1 con botones de la pregunta pendiente (Lima/Provincia o 1/3x2 con precio de last_quote); en datos_envio, "¿Seguimos con tu pedido de X a [distrito]? Solo me falta [lo que falta]"; en esperando_voucher, recordar el adelanto S/30, nunca "pagas al recibir" ni 10%; s6 sin 10% si eligió 3x2/5x3. (b) Prompt: fecha o hito de pago a ≥2 días → `stage="comprar_despues"` + notify_team "COMPRAR_DESPUES: fecha-producto-zona" para que una asesora retome ese día; nunca "te escribo el [día]" ni "lo dejamos programado". Despedida "yo te aviso" → `stage="cliente_avisa"`, solo el cierre de s7. (c) Brazo S corto (s1 botones, s2, s3, s7; sin s4, p5, s6) **después** de la lectura F/R del 15-nov.
- **Dónde:** flujo + check-coverage (FOLLOWUP_TERMINAL_MARKERS) + prompt l.253/l.280 + send-followup-envio.
- **Evidencia:** 5acefd4b, c1a68ad9 ("Yo les llamo ya les dije" tras s1 y s2), dc3742ac, 71436f0d, 0168c78e; s4-s6 rinden 0.50-0.68 compras/100 vs 2.27 del s1 (EXPERIMENTOS §5); 54dbda11 compró tocando el botón "Lima" 23 h después de ignorar 7 textos.
- **Riesgo:** "¿o lo dejamos?" puede subir no_interesado; un LLM puede leer "mañana veo" como fecha (exigir hito explícito).
- **Ajuste del verificador:** sin plantilla de retoma desde el 981 (calidad YELLOW, README de plantillas) ni relanzo por API (reatiende el último entrante, no manda recordatorio): el recordatorio lo hace la asesora desde Telegram. No cortar seguimientos del todo tras "yo te aviso" (fu_trivial_visto se escribió a propósito en oct). send-buttons/send_payment no sirven como nodos sin `input`: hace falta función nueva. Realinear `definition.json` con Kapso antes de tocar aristas (hoy desalineado; un `kapso push` borraría `saltar` y las funciones).

### 4.3 Agencia Shalom: total antes del adelanto, un solo send_payment, no Olva ante desconfianza — esta semana (prompt)
- **Qué cambia:** tras check_coverage=agencia, UN mensaje: reencuadre ("en [ciudad] va por Shalom, S/30 que se descuentan, saldo al recoger, ticket con código") + botones de cantidad con total. Luego agencia en una pregunta, aceptando "la principal de [ciudad]". send_payment una sola vez, con cantidad y total. Desconfianza de Shalom como courier → handoff, nunca Olva con pago total. Reconocer en una línea si antes dijo "pagas al recibir".
- **Dónde:** prompt B) AGENCIA (l.151-168), CONFIANZA (l.225), ANTI-LOOP (l.318); opcional send-payment acepta total/quantity.
- **Evidencia:** 5acefd4b (Yape+BCP+CCI sin cantidad; pregunta repetida idéntica a 16 s), f00f6596 (send_payment a 40 s de "Uchiza"), bdef0ca0 (dos bloques de pago), 9a3b05b0 (Olva S/149 anticipado; un humano cerró a domicilio #KP200696).
- **Riesgo:** no sube vouchers por sí solo (73ddbd42 tuvo todo y no pagó); más handoffs por desconfianza.
- **Ajuste del verificador:** verificar primero la tabla de cobertura de Cusco (Wanchaq, San Jerónimo): check_coverage dijo agencia y el equipo entregó a domicilio; parte del "muro" puede ser dato. 23adb894 y 2b4ee317 son chats de vendedoras, no del bot: retirar como evidencia. Medir por vouchers recibidos / leads en agencia, el KPI actual no lo ve.

### 4.4 Brazo F: precio y escalera en el primer mensaje visible — A/B 2 semanas, código mediano
- **Qué cambia:** `ab_variant="F"` 50/50 frente a D, solo leads de anuncio con teléfono. Secuencia F = 2 mensajes: foto principal con caption saludo + beneficio + lineaPrecio (escalera 1/3x2/5x3), y los botones (mismo cierre que D), con testimonio como headerImage. Sin video ni antes/después. Fuera del A/B: si el cliente re-toca el CTA del anuncio, loop-guard marca `ad_cta_repeat` y el bot responde UN mensaje título+precio+3x2+botones en vez de repetir la ráfaga (e29321f5, d4ff23b8).
- **Dónde:** send-presentation (VARIANTES_TRATAMIENTO {D,F}, armarSecuencia, caption ≤1024), customer-lookup y su copia en create-shopify-order (VARIANTES_AB, sal nueva "ficha:"), prompt l.106-113, loop-guard.
- **Evidencia:** Mireva hallazgo 1; Kenku mediana 26 s y 3 mensajes antes del precio; re-preguntas de precio tras recibirlo (942bb1a5, b99855ec, e3d7c8c9).
- **Riesgo:** perder el "valor antes del precio" en productos de S/149-195; caption colapsado con "Leer más" (probar en sandbox 597907523413541 primero).
- **Ajuste del verificador:** expectativa honesta: el 74% que no responde a nada no es un problema de 9 s; A/D (mismo contenido, más rápido) movió 0.7 pt y no significativo. El "10/14 respondieron" no se reproduce (no hay casos con 1 mensaje antes del precio en variante D; el 71% es de leads sin anuncio, otra población). Los 4 chats que ya recibieron un mensaje único con precio+botones: 0 compras. Nada de media después de los botones. Métrica primaria = pedidos firmes a 48 h; ~3.000 leads por brazo detectan ≈2 pt; regla de parada antes de arrancar.

### 4.5 Menos turnos de captura, sin reordenar cantidad — prompt + save-order-state, parcial esta semana
- **Qué cambia:** (a) pedir distrito y provincia en UNA pregunta ("¿A qué distrito y provincia te lo enviamos? Si es Lima, solo el distrito") en lugar de Lima/provincia → distrito, en l.183, l.292 y l.225; (b) si dio dirección sin nombre, titular provisional desde known_customer_name/contact_name (filtro l.102) en el resumen, "Modificar pedido" lo corrige; (c) save-order-state: dirección sin número/mz-lt y sin referencia → guardar y devolver `missing=["reference"]` (no rechazar); "casa"/"aquí" rechazadas; pin de ubicación se guarda pero no vale como dirección sola (pedir una seña en palabras; si el pin es un negocio o lugar, preguntar si es su casa); (d) antes de preguntar zona/cantidad, releer entrantes que llegaron a mitad de turno; (e) `missing` se pide todo en un turno (l.179-180).
- **Dónde:** prompt l.146, l.179-186, l.225, l.292; save-order-state l.92/137/162/180; create-shopify-order buildNote (pin).
- **Evidencia:** 42694846 (6 respuestas), d9b3aae0 (nombre dos veces), 0a0f5676 y 2eb77016 (zona dada e ignorada), 5c19bf72 (#KP200248 "Jr. Mamá Ocllo, Juliaca" sin número ni referencia, y quería recoger), b7bf6ae7 (`save_order_state({direccion:"casa"})` → ok), 54dbda11 (pin de un campo deportivo registrado como domicilio).
- **Riesgo:** texto libre vs botón puede bajar la respuesta a la pregunta de zona (medir); mensaje que suene a formulario (l.146).
- **Ajuste del verificador:** efecto acotado a datos_envio (4%) y parte de producto_mostrado (7%): +5-10% relativo, no un salto. Dirección+nombre en un bloque ya existe (l.146): el ahorro real es el paso Lima/provincia. 7869b14c no es evidencia (el bot sí guardó los datos; los repreguntados fueron de la vendedora). **Los dos verificadores discreparon sobre mover cantidad antes de zona**: uno lo deja como brazo Q, el otro muestra que la variante B (ago-2026) perdió 22% con esa mecánica. Aquí va sin reordenar; si quieren probarlo, brazo aparte con regla de parada y métrica de entregados.

### 4.6 Clientes conocidos: dirección válida, producto comprado, A/B del cierre en un paso — fix de código esta semana
- **Qué cambia:** (a) buildAddressSummary: deduplicar, descartar "-", vacíos, solo dígitos y celulares; si no queda una seña real, `known_address=null` y `has_shipping_address=false`; dirección del primer pedido no cancelado; `known_address=null` si ordersCount=0 (checkout abandonado). Si la zona guardada es agencia, no ofrecer "como la vez pasada". (b) Exponer `last_order_items` (line_items de WooCommerce; GraphQL Shopify solo fallback) y, en "Producto de arranque" (l.308), botón "¿Te preparo otra vez tu [producto] o buscas algo distinto?" (solo conocido, sin anuncio, sin producto nombrado, sin compra <72 h). (c) A/B del Msg 8: control actual vs "¿Te lo enviamos a [dirección] como la vez pasada? Elige tu promo" con botones 1/3x2/Cambiar dirección. (d) Memoria <72 h por KV `lead_ctx:<9 dígitos>` escrito por send-reminder/send-followup-envio: solo producto y hint, nunca stage ni datos de envío, siempre con "¿Retomamos X o buscas otra cosa?".
- **Dónde:** customer-lookup (l.416/453, wooCustomerFromOrders, buildFlowVars), send-presentation l.287-291, prompt l.89-92, l.129, l.308.
- **Evidencia:** 4b0c8b7e, d1d45fc3, 0799ade2, 9865b0bd, 54dbda11 ("-, Puente Piedra"); 1b861bd3 compró en 2 min con botones improvisados; 54dbda11 "¿qué producto viste?" a quien 4 min antes recibió el s7 del Black Seed Oil.
- **Riesgo:** medio en (d): es el mecanismo del error 7.2 de Mireva; por eso solo producto, nunca stage.
- **Ajuste del verificador:** no recortar a 90 caracteres (23/76 superan 90; a0933a36 compró con ~200); el problema está acotado al 12% de direcciones basura, el Msg 8 actual ya rinde 68%/26%; "recent_order desde WooCommerce" ya está en producción desde el 5-nov 14:29 (verificado: 0 seguimientos de venta a compradores recientes en 18 ejecuciones); el A/B del Msg 8 tiene n=1 a favor y la variante B en contra: probar, no desplegar.

### 4.7 Plazo de entrega único por modo y zona — código chico, higiene de ventas firmes
- **Qué cambia:** check-coverage devuelve `deliveryEstimate` (rango en días hábiles, nunca hora ni día) por modo con override por zona, y `deliveryEstimates` completo también en needs_location. send-presentation/send-followup-envio lo incluyen cuando hay zona. Prompt: sección DATO DURO "PLAZOS": solo desde la función; prohibido horas, "hoy/mañana" como entrega, "el motorizado te llamará"; excepciones: sameDayUrgent y `calendario.proximoDiaReparto`. Mensaje de registro con texto fijo.
- **Dónde:** check-coverage, send-presentation l.399-406, send-followup-envio l.95-107, prompt l.184, l.204-215.
- **Evidencia:** 707452fb "antes de las 5 pm" cuatro veces y en el registro #KP143347; 3d41b4cb "9 am a 7 pm"; Juliaca con dos plazos distintos; 39 convs con rangos horarios en el corpus.
- **Riesgo:** si operaciones fija un plazo que no cumple, se repite el 7.4 de Mireva; un plazo único para "provincia" sería falso en Catacaos o en Juliaca (por eso override por zona).
- **Ajuste del verificador:** no es palanca de conversión (Mireva tampoco pone el plazo en la ficha y entrega sigue siendo su objeción #1); se mide por rechazos en puerta y reclamos. La fecha pactada ya se maneja (tag fecha-hora-especial, nota); solo agregar un atributo medible y, si está a >3 días hábiles, agendar con asesora en vez de crear hoy. La misma tabla va a las vendedoras y a la plantilla guias_shalom.

### 4.8 Fichas reales en Shopify + validación en la función — operación, empieza esta semana
- **Qué cambia:** para los ~20 productos con anuncio, bloque fijo en la descripción (no metacampo: el lookup no los lee): para qué se usa, cómo se toma, contenido/mg, rinde, edad, quién debe consultar, en lenguaje de suplemento. Tags = usos específicos. Subir antes/después, video y testimonio para Black Seed Oil y NAD+. shopify-product-lookup normaliza `<p></p>` a vacío y devuelve `fichaVacia` con instrucción explícita. Prompt: quitar el ejemplo de Black Seed Oil de Msg 5b (el modelo lo copia); ANTI-ALUCINACIÓN cubre edad, mg, rendimiento y "no niegues el producto por restricciones inventadas". Cada DUDA DE PRODUCTO la responde una asesora el mismo día.
- **Evidencia:** description='<p></p>' y 2 tags en Black Seed Oil (ejecución 7264c6f5); 456933b6, 72c3afab, 73ddbd42, 29a582c7.
- **Riesgo:** claims de salud (DIGESA); más "lo confirmo con el equipo" mientras no esté la ficha.
- **Ajuste del verificador:** no prometer conversión (el 74% nunca pregunta nada); no usar el titular del anuncio como beneficio (hay anuncios con titular de otro producto). Es higiene de ventas firmes y de reclamos.

### 4.9 Combos: retirar P1/P2 y dejar el 3x2 como respuesta a señal — esta semana (prompt)
- **Qué cambia:** reemplazar l.256-262 por: si elige 1, respétalo y pasa a la dirección; el 3x2/5x3 de palabra solo ante señal (pide 2 o 4, compra con alguien, "está caro", pregunta cuánto rinde o si hay descuento), con precio por unidad real y botones "Solo 1"/"Quiero el 3x2". Quitar `promo_variant` del prompt si no se corre un A/B. Mantener intactos Msg 6, la pregunta de cantidad (l.184) y fu-s3/fu-s6.
- **Evidencia:** promoVariant devuelve "P1" fijo desde el 14-sep (P2: -29% ingreso/lead, 1.76 vs 1.93 uds/pedido); el "upsell suave" de P1 no ocurre en 32/33 casos.
- **Riesgo:** bajo.
- **Ajuste del verificador:** los dos verificadores discrepan sobre un upsell con texto fijo ante "probar con uno": uno lo rechaza (promete "pagas al recibir" sin zona, vende garantía de fábrica como garantía de satisfacción, el segmento ya explicó por qué quiere 1, P2 perdió), el otro lo acepta solo como A/B U1/U2 con frase de pago condicionada por zona y métrica de ingreso por lead. Recomendación: primero la limpieza; el upsell, si se hace, solo en contraentrega, una vez, medido por pedidos entregados.

### 4.10 Robustez técnica acotada — prompt y código chico, esta semana
- **Qué cambia:** (a) fu-terminal compara el wamid del último inbound con `vars.followup_generation` y devuelve "respondio" si llegó un mensaje durante el turno; (b) reintento ante 429 del proxy en send-text/send-buttons/send-presentation; (c) una línea en HERRAMIENTAS con la convención de argumentos (`input` para custom, planos para save_variable/send_media); (d) regla: una reacción no es respuesta, no cambia stage; (e) regla: atender mensajes inyectados durante el turno antes de la pregunta final; (f) agregar 1145171692021464 (Kenku 348) a WATCHDOG_PHONE_IDS.
- **Evidencia:** 782e24c4, fc921a4b (429 a las 17:45:53-56), 72c3afab (un 👍 puso no_interesado y cortó la escalera), errores "missing keyword :input" en 7/16 y 11/16 ejecuciones.
- **Ajuste del verificador:** efecto pequeño (≤5 pedidos/mes); no existe campo de modelo de respaldo ni reintento en el nodo agente; no relanzar automáticamente (reproduce el límite de 300 rpm y abre conversaciones sin historial); no debounce en loop-guard (el 2º mensaje se inyecta al agente en curso, loop-guard no corre); no Msg 8 automático (recibiría el mismo 429). D al 100% ya está desde el 25-oct y no es mejora de conversión (A 1.10% vs D 1.19%).

**Qué se puede aplicar esta semana sin A/B:** 4.3 (agencia), 4.2b (aplazo/despedida en prompt + override de fu-s2), 4.5b-c (titular provisional, referencia obligatoria), 4.6a (limpiar known_address), 4.9 (limpieza P1/P2), 4.10 (reglas de prompt, 429, watchdog), 4.1 parcial (fu-lost, variable de voucher, script offline), y arrancar las fichas (4.8).

## 5. Lo que NO hay que copiar de Mireva

- Registrar "comprar después" como pedido (30% de sus pedidos). Kenku ya no lo hace; mantenerlo.
- Registrar "con lo mínimo": 48% sin dirección/distrito/celular válido. El resumen + Confirmar y save-order-state son la ventaja de Kenku.
- Leer un "Sí" o "1 mejor" como combo (17% producto/cantidad equivocado). No poner cantidad por defecto nunca.
- Pin de ubicación como dirección completa (84009, 90425).
- Arrastrar el producto de la compra anterior sin preguntar (80378).
- Empujar el combo con argumento de ahorro como oferta principal: Kenku ya lo probó (P2) y perdió 29% de ingreso por lead.
- Límite de 25 palabras (mensajes truncados); Kenku ya tiene mediana 21 palabras y tope de 350 caracteres.
- Descuentos y promesas inventadas (10-50%, "por ahí del 9 te llega", transportista, resultados).
- Mandar a humano a todo cliente con historial: Kenku convierte 41% a los conocidos justamente por no hacerlo.
- La escalera solo dentro de la imagen (12% vs 26% de palabra): en Kenku va en texto con montos.

## 6. Refutadas

- **Brazo Q (cerrar la presentación con cantidad/promo en vez de Lima/provincia):** ya se probó como variante B en agosto y perdió 22% (3.14% vs 4.05%, 5.406 leads); en noviembre, 1.322 leads del 451 con zona y cierre de promo respondieron 47% vs 68% de los 22 con Lima/provincia, mismo % de pedido; la pregunta de cantidad es el 2º punto de caída (10.8%); 4 de los 8 chats citados como "callaron en Msg 8" en realidad respondieron y cayeron después (e29321f5, fc6ad5a1, 737bb1d2, 8047beed). Un verificador la mantuvo como A/B; el otro la refutó con datos. Prevalece la evidencia propia.
- **Protocolo de intervención humana (no tomar el chat en captura, resumen antes de ceder, alerta nueva):** 71% de los handoffs en captura terminan en pedido en Woo (mediana 37-42 s de respuesta humana); la ejecución queda parqueada, así que un nodo "resumen antes de ceder" no corre y duplicaría voces; el watchdog de 3 min ya existe desde julio (solo falta cubrir `status=handoff` y el 348). Lo que queda es una guía de calidad para la vendedora, no un cambio de flujo.
- **Bucle de objeciones (escalado de CTA, prueba ante "tienda física", palanca social, "caro" reordenado):** los dos chats citados por repetir la pregunta de cantidad compraron (707452fb #KP143347, f1af3785 #KP143332); "cantidad por defecto a la tercera" es el error 7.2 de Mireva; 8/16 que oyeron "no tenemos tienda" siguieron y 1 compró; c1a68ad9 se despidió ("yo los llamo"), no pidió palanca social; el guion "caro" ya cierra con "Solo 1", y con ~2 objeciones/día no hay potencia para un A/B.
- **Anuncios mal mapeados ("Energía Sin Estimulantes" → NAD+, regla de mismatch, retomar la promesa del anuncio):** el handle nails-repairing lo fijó el dueño a mano (AD_PRODUCT_MAP, "confirmado por el dueño"); el body del anuncio es íntegramente de hongos; 7/71 compraron el sérum "equivocado"; la regla de mismatch rompería los 35/71 que se resuelven por el body; "2 Unidades GRATIS" es el anuncio que mejor convierte (35.8%) y el bot ya mostró el 5x3. Lo único vigente: corregir el titular en Ads Manager (el titular correcto "Elimina Hongos en Pies" convierte 47% vs 9.9%, n=19).
- **Dentro de las que sobreviven, partes retiradas:** modelo de respaldo/relanzador automático (no configurable; ~3 fallos/día fuera de incidentes); debounce en loop-guard (no recibe el 2º mensaje); Msg 8 automático en fu-terminal (mismo 429); plantilla de retoma desde el 981 (calidad YELLOW, leads por username no la reciben); recortar known_address a 90 caracteres (las largas compran); `recent_order_*` desde WooCommerce (ya en producción desde el 5-nov); entregada 7 d por FULFILLED+PAID en Shopify (los pedidos están en Woo); `lost_from_stage` por set_variable (el evento ya lo guarda); pin como dirección válida (error de Mireva); "ubicar agencia" como notify_team previo al voucher (ruido); fu-s2 con zona "Lima" a secas (no hay cobertura sin distrito).

## 7. Cómo medir si funcionó

**Definiciones**
- **Lead:** conversación nueva sin `recent_order_name`, sin stage reclamo/loop_detectado, sin ejecución failed; `ad_referral_headline='api.whatsapp.com'` cuenta como orgánico.
- **Venta bot+asesora a 7 d:** teléfono/BSUID del lead con pedido real en WooCommerce (bot o vendedora) dentro de 7 días. Es la cifra comparable con el ~6% firme de Mireva.
- **Firme 48 h:** pedido creado hace ≥48 h, no cancelado ni reembolsado, no cod-pending sin confirmar, sin stock por validar. Requiere el censo de estados Woo/Kapta y que las vendedoras cancelen los rechazos en puerta.
- **Entregada/cobrada:** estado "entregado" o `date_paid_gmt` a 7-10 días, según el censo.
- **Voucher reportado:** columna aparte; nunca suma como venta.
- **Respuesta a la presentación:** primer inbound después del Msg 8 dentro de 24 h, excluyendo re-clics del CTA del anuncio y reactivaciones por seguimiento.
- **Paso de caída:** `old_value` del evento `variables_set` de fu-lost + KV `orderstate:<conversationId>` (distrito → cantidad → dirección → resumen).
- **Por toque s1..s7/p5:** respuesta en 24 h sobre leads sin respuesta previa; leídos sin respuesta; ventas firmes a 7 d; costo por `pricing.category` (referral_conversion gratis; service/marketing cobrado).

**Tabla semanal por brazo y por celda (anuncio/orgánico × nuevo/conocido), con n:** leads → respondió presentación → dio distrito → eligió cantidad → vio resumen → orden creada → firme 48 h → entregada; más columnas asesora y voucher.

**Regla de decisión**
- Criterio primario: ventas firmes por persona (bot + asesora) a 7 d. Guardarraíl: cancelados a 48 h no suben.
- z corregida por sobredispersión (÷1.5). "Sin daño" si z > -1 tras ≥3 semanas; "ganador" solo con z ≥ 2.
- Potencia honesta: con ~9.000 leads de anuncio/semana en 2 brazos, en 1-2 semanas solo se detectan caídas ≥30% (bot solo) o ≥15% (bot+asesora). Nada realista (+10-20%) se declara ganador en una semana.
- Una variante que sube respuestas o pedidos creados pero no ventas entregadas se revierte: es lo que infla el 12.7% de Mireva.
- La lectura F/R del 15-nov se decide con la regla ya pre-registrada (conversión a 7 d por teléfono, z > -1), no con criterios nuevos a mitad de prueba.

**Metas específicas a 14 días (sin A/B):** 0 salientes del bot con hora o día exacto de entrega (hoy 39 convs con rangos horarios); 0 promesas de "te escribo"/"lo dejamos programado"; 0 leads con 7 toques tras una despedida; 0 send_payment sin cantidad y total; 0 Msg 8 con dirección basura; DUDA DE PRODUCTO respondidas por humano el mismo día.