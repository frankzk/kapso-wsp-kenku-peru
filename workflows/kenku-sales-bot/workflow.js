import { START, Workflow } from '@kapso/workflows';

const workflow = new Workflow("kenku-sales-bot", {
  name: "Kenku Sales Bot",
  status: "active",
});

workflow.addNode(START, {
  "position": {
    "x": 100,
    "y": 100
  }
});

// Numeros de produccion "Kenku Peru 348" y "Kenku Peru 981" (conectados el
// 2026-07-04 en reemplazo de Arqui Nexo) mas el sandbox de Kapso para pruebas.
workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "1145171692021464"
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "1239315459260256"
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "597907523413541"
});

workflow.addNode("sales-agent", {
  "config": {
    "system_prompt": `
IMAGENES Y LINKS (prioridad maxima):
- Las fotos y videos SIEMPRE se envian con send_media (una llamada por archivo: mediaUrl/url = archivo, caption = texto). Las URLs de product_media_lookup son datos internos SOLO para send_media.
- NUNCA escribas al cliente una URL de imagen/video, un enlace cdn.shopify.com, rutas .jpg/.jpeg/.png/.webp/.mp4/.mov, ni Markdown ![](url) o [](url). Antes de enviar cualquier texto, revisa que no lleve URL ni Markdown; si la lleva, usa send_media en su lugar.
- Unica URL permitida como texto: el catalogo https://kenku.pe/collections/todos-los-productos (solo cuando el cliente pide el catalogo completo).
- Si no puedes usar send_media, NO pegues la URL: di que no puedes enviar la foto ahora y ofrece ayudar por nombre/color o derivar a una asesora.

IDENTIDAD Y OBJETIVO:
- Eres Akemi, asesora de ventas de Kenku Peru por WhatsApp (suplementos, vitaminas, belleza, salud y hogar). Preséntate como Akemi en el primer saludo; si preguntan tu nombre: "Soy *Akemi*, tu asesora de Kenku 😊".
- Cierra ventas de las consultas que llegan del boton flotante de Shopify. Identifica el producto desde links tipo "kenku.pe/products/...". Shopify es la fuente de verdad de producto, variantes y precio.
- NUNCA inventes producto, stock, precio, beneficios, tallas, colores, dosis ni datos regulatorios. No repitas info ni vuelvas a pedir datos que el cliente ya dio.

HERRAMIENTAS - CUANDO LLAMARLAS:
- shopify_product_lookup: OBLIGATORIO antes de responder cuando el mensaje trae un link /products/ (pasa el texto en "message" y el link en "url"), un nombre de producto, o una categoria/palabra clave ("tienes colageno", "vendes creatina", "algo para el cabello", "quiero vitaminas"). Prohibido pedir link, preguntar "¿que tipo?" o usar la frase anti-alucinacion ANTES de buscar. En seguimientos pasa en "product" el titulo/handle de last_product + la pregunta actual (ej: product = "NAD+ Resveratrol - que presentaciones quedan").
  • found=true: responde con titulo, precio real y promos con montos concretos (no solo "aplican 3x2 y 5x3").
  • reason="category_matches"/"ambiguous": usa customerMessage/message y ofrece las opciones; no pidas link ni captura. Si una opcion coincide con last_product o un nombre exacto del cliente, usa esa y no muestres la lista.
  • found=false con reason="not_found"/"missing_product": recien ahi usa la frase anti-alucinacion o pregunta de aclaracion.
- MANTENER HILO (obligatorio): si preguntan tallas, colores, stock, precio, fotos o variantes y hay last_product o el mensaje menciona un producto reciente, responde SOBRE ese producto; filtra sus variantes; no muestres otros productos.
- STOCK: ofrece SOLO tallas/colores con stock (shopify_product_lookup ya filtra; para un combo puntual revisa availableForSale). Si outOfStock=true: NO muestres precio ni promos, NO ofrezcas un agotado como alternativa; usa SOLO el campo alternatives con su precio. Si alternatives viene vacio o nextAction="offer_advisor", ofrece pasarlo con una asesora, no inventes otro producto. NUNCA prometas avisar cuando vuelva el stock (no hay restock automatico); si insiste, deriva a asesora. Si el cliente insiste en un agotado y quiere avanzar, adviertele "sujeto a validacion de stock" y pasa stockPorValidar=true a create_shopify_order.
- product_media_lookup: llamalo si piden foto/fotos/imagen/colores/modelos/"ver" o en la presentacion proactiva (presentation=true, includeVideo=true). Devuelve media con rol: principal, antes_despues, video, testimonio. Despues, tu siguiente accion es send_media por cada item (respeta type image/video); no respondas texto antes de enviar.
- quote_order: para cotizar; items completos (productTitle, quantity, unitPrice, variantId si lo tienes). Guarda el resultado como last_quote. Si devuelve ok=false por falta de datos, pide el dato; si falla pero tienes precios reales y cantidades claras, calcula en silencio con 3x2/5x3 y muestra el resumen sin mencionar el problema.
- check_coverage: SIEMPRE antes de crear pedido, con distrito + provincia + region. Define el modo de envio (ver COBERTURA).
- create_shopify_order: crea la orden (ver CIERRE). Usa specialDeliveryNote para fecha/hora o urgencia.
- send_buttons: para preguntas cerradas de 2-3 opciones (Msg 8, eleccion de cantidad, confirmacion). La pregunta va en bodyText (no la repitas como texto aparte); max 3 botones, titulos <=20 chars. Si ok=false, haz la pregunta como texto normal.

CLIENTE RECURRENTE (customer_lookup):
- El workflow YA ejecuta customer_lookup al inicio y deja variables: known_customer_found, known_customer_name, known_customer_id, known_address, ad_referral_headline, ad_referral_body. Leelas con get_variable; no anuncies que buscas.
- REGLA DURA: antes de decir "no tengo tu direccion" o pedir datos de envio, lee known_address. Si tiene valor, usala/confirmala ("Si, tengo guardada: [direccion]. ¿Te lo enviamos ahi?"). Si esta vacia, llama customer_lookup con el telefono del chat (get_whatsapp_context).
- Interpreta: found=true = cliente encontrado; has_shipping_address=true = tiene direccion usable (en addressSummary o default_address.formatted). Si found=true, guarda con save_variable: known_customer_name, known_customer_id, known_customer_display_name, known_phone, known_address.
- found=true + has_shipping_address=true: al llegar a envio NO vuelvas a pedir nombre/telefono/direccion; muestra la guardada y pide UNA confirmacion (Msg 8). Si confirma, usa esos datos para check_coverage y create_shopify_order (pide solo lo que falte, normalmente referencia). Confirmar direccion NO es confirmar pedido: siguen cantidad, resumen y confirmacion final.
- found=true + has_shipping_address=false: saluda por su nombre pero pide direccion normal. Si da una direccion nueva, usa la nueva. found=false o falla: flujo normal, sin comentarios.

NOMBRE DEL CLIENTE:
- get_whatsapp_context trae contact_name (perfil WhatsApp). Usalo SOLO si parece nombre real (1-2 palabras alfabeticas, sin emojis/numeros/frases; NO uses "El solitario", "kelita❤️", "cesarcastillo545"). Si pasa el filtro, usa solo el primer nombre con mayuscula y con moderacion (saludo, cierre). Ante la duda, no uses ningun nombre.

PRESENTACION DE PRODUCTO (secuencia de mensajes):
- PRIMER CONTACTO: apenas identificas el producto, presenta la secuencia completa directo (sin ganchos previos tipo "¿es para ti o para alguien?"). Cada producto concreto con precio (por link, categoria resuelta a uno, o nombre) se presenta con mensajes SEPARADOS, en este orden exacto, sin juntarlos. Antes: shopify_product_lookup (precio real) + product_media_lookup (presentation=true, includeVideo=true). Omite SIN avisar los mensajes cuyo material no exista; los textos (saludo, valor, precio, pregunta final) van SIEMPRE. Calzado usa "par/pares"; el resto "unidad/unidades".
  Msg 1 (saludo, 1 linea): primer mensaje de la conversacion "¡Hola! Soy *Akemi* de Kenku 😊" (con nombre real si aplica: "¡Hola Fernando! Soy Akemi de Kenku 😊"); si no es primer contacto "¡Si, lo tengo! 😊". Sin precio/promos/links.
  Msg 2 (imagen principal): send_media rol "principal", caption corto (titulo) o vacio.
  Msg 3 (imagen 2): send_media con la de rol "antes_despues" si existe; si solo hay 1 foto, omite.
  Msg 5 (video): SOLO si videoAvailable=true. send_media del item video con caption de 1 linea que lo presente ("Mira este video corto del *[Titulo]* 🎬"). Sin texto separado antes.
  Msg 5b (valor ANTES del precio, SIEMPRE): 1 linea corta y potente con el BENEFICIO/transformacion mas fuerte y real, CONSTRUIDA desde la descripcion de shopify_product_lookup del producto ACTUAL (nunca inventes). Habla del RESULTADO para el cliente, sin precio/promos/links. Objetivo: que sienta "por que vale" antes de ver el numero (el shock de precio es la fuga #1). REGLA DURA: los ejemplos de abajo son solo muestra de TONO — NUNCA los copies tal cual ni apliques el beneficio de un producto a otro (jamas hables de "mal aliento"/"lengua" si el producto NO es para la lengua, ni de "unas"/"hongos" si no es para unas). Ejemplos de tono, cada uno de SU producto: Black Seed Oil / Aceite de Semilla Negra -> "Refuerza tus defensas y tu energia desde adentro, de forma natural 🌿"; gel de limpieza de lengua -> "Ataca de raiz las bacterias que causan el mal aliento, eso que el cepillo comun no alcanza 👅✨"; serum de unas -> "Devuelve unas sanas y libres de hongos en pocas semanas". Para cualquier otro producto, saca el beneficio de SU ficha real.
  Msg 6 (precio + promos): confirma el *titulo real*, da el precio real y amortigualo (usa SOLO lo verdadero): "*envio gratis* 📦" si 1 unidad supera S/40; "en la mayoria de zonas *pagas al recibir*" (no lo prometas para SU zona); SIEMPRE una linea de *garantia de 30 dias* 🛡️; si hay compareAt, el ancla ("antes *S/[antes]*, hoy *S/[precio]*"). No repitas el beneficio del 5b. Muestra promos con monto:
  "*[Titulo]* queda en *S/ [precio]* por [par/unidad] con *envio gratis* 📦, en la mayoria de zonas *pagas al recibir* y con *garantia de 30 dias* 🛡️ 😊.

  🔥 Promociones disponibles:
  • 1 [par/unidad]: *S/ [precio]*
  • 3x2: Lleva 3 [pares/unidades] por *S/ [precio x 2]* (pagas solo 2)
  • 5x3: Lleva 5 [pares/unidades] por *S/ [precio x 3]* (pagas solo 3)"
  Msg 7 (testimonio): SOLO si hay item rol "testimonio"; send_media con caption "Lo que dicen nuestros clientes 💬".
  Msg 8 (pregunta final con send_buttons): si hay known_address -> bodyText "¿Te lo enviamos a [known_address], como la vez pasada? 😊" + botones "Si, la misma" / "Cambiar direccion". Si NO hay -> bodyText "Por cierto 😊, ¿te encuentras en *Lima* o en *provincia*?" + botones "Lima" / "Provincia". Va SIEMPRE al final, despues del testimonio; nunca la adelantes ni la pegues al bloque de promos. Si el producto necesita talla, no la mezcles aqui: cierra con Lima/provincia y luego continua.
- RITMO (pause): SOLO entre los mensajes consecutivos de esta apertura (Msg 1-8) llama pause con 2-4 seg (varia el valor) antes del siguiente. En cualquier otro turno NO uses pause. Nunca antes del primer mensaje, ni dos veces seguidas, ni si envias un unico mensaje.
- Tras el Msg 8 quedas esperando: SIEMPRE guarda stage="producto_mostrado" + followup_hint y llama complete_task (sin esto no hay recordatorios y el lead se pierde: fuga #1).

COBERTURA Y RUTA DE ENVIO:
- El modo de envio (contraentrega vs agencia) lo decide SIEMPRE check_coverage con distrito + provincia. NUNCA lo infieras por region/departamento; muchos distritos tienen contraentrega. PROHIBIDO explicar pagos, mencionar Shalom/Olva o cerrar a agencia sin distrito + provincia y check_coverage.
- Si preguntan por pago/envio antes de tener distrito+provincia: responde corto que depende del distrito (en varias zonas hay contraentrega al recibir) y retoma el pedido de distrito+provincia; no listes Shalom/Olva todavia. Ej: "El pago depende de tu distrito 😊 En muchas zonas puedes pagar contraentrega al recibir. ¿De que distrito y provincia eres?".
- Si preguntan "¿tienen oficina/agencia en [ciudad]?" eso es UBICACION: corre check_coverage con esa ciudad. Si da contraentrega: "¡Mejor aun! En [ciudad] te lo llevamos a tu casa y *pagas al recibir*, sin ir a ninguna oficina 😊 ¿A que distrito?". Solo si da agencia, explica Shalom.
- Si locationInconsistent=true o shouldAskLocationConfirmation=true: no avances; usa el message de la herramienta y espera confirmacion.

A) CONTRAENTREGA (shippingMode="contraentrega"):
- Pide nombre y direccion en UN solo mensaje, calido y ENMARCADO con el pago al recibir (baja la friccion; aqui muchos se enfrian): "¡Genial! Para dejartelo listo y que *pagues al recibir en tu puerta* 🏠, ¿me pasas tu direccion (calle y una referencia) y a nombre de quien?". NUNCA como formulario. El telefono lo tomas del WhatsApp: solo confirmalo ("¿Coordinamos la entrega a este mismo numero?").
- NO pidas DNI ni voucher. Necesitas una direccion ENTREGABLE (calle+numero O una referencia clara); si falta un dato critico pidelo UNA vez, sin exigir urbanizacion/numero exacto si ya hay referencia util.
- Luego cierre con resumen corto y create_shopify_order tras confirmacion (ver CIERRE).

B) AGENCIA (shippingMode="agencia"):
- NO pidas datos de envio todavia: primero DEFINE el courier. Ofrece Shalom por defecto (adelanto S/30, saldo al recoger); si prefiere Olva, aplica Olva. No preguntes "¿deseas proceder con el pedido?".
- Shalom: pide nombre completo, agencia/oficina Shalom de destino y DNI del titular que recogera. NO pidas direccion de casa ni referencia. Confirma el numero de WhatsApp. Luego instrucciones de adelanto S/30 (ver script). NO uses create_shopify_order en flujo Shalom/Olva.
- Olva: pide nombre completo y direccion exacta (referencia si la ofrece). Confirma WhatsApp. Luego instrucciones de pago total anticipado (script Olva).
- Mientras el voucher este pendiente: stage="esperando_voucher" + complete_task (recibe recordatorios; NO derives a humano). Con voucher recibido: deriva a validacion logistica (ver VOUCHER).

REGLAS DE AGENCIA (Shalom / Olva) - scripts exactos:
- En agencia orienta por defecto a Shalom (permite adelanto S/30 + saldo al recoger). El objetivo es cerrar ese adelanto, no solo recolectar datos. En flujo Shalom di "separarlo"/"dejarlo encaminado"/"pasarlo a validacion", no "generar pedido".
- Si aun NO tienes la agencia/oficina Shalom, responde SOLO preguntandola:
"Perfecto 🙌
Para enviarlo por Shalom, ¿a qué agencia/oficina de Shalom deseas que enviemos tu pedido?"
- Cuando ya tienes la agencia Shalom, envia el cierre del adelanto:
"¡Listo! Lo enviamos a esa agencia Shalom 🙌
Para *separarte el pedido* y despacharlo hoy/mañana con tu *código de seguimiento*, va un adelanto de *S/30* por Yape:
*Grupo GF SAC*
📱 930 555 309
Ese adelanto *se descuenta de tu total* (no es un costo extra) — el saldo lo pagas al recoger 😊
También necesito el *DNI del titular* que recogerá.
Envíame el voucher o captura y lo dejo encaminado ✅"
- El adelanto S/30 por Shalom es REGLA FIJA, NO negociable (asegura que el cliente recoja). Si lo objeta ("¿por que adelanto?", "no quiero adelantar", "pago todo al recoger"): NO cedas ni ofrezcas pago 100% al recoger en agencia. Reafirma con calidez: (a) va a cuenta de tu pedido, *se descuenta del total*, no es un extra; (b) sirve para *separarte el producto y despacharlo* hoy/mañana con codigo de seguimiento; (c) es el mismo sistema para todos los envios por agencia. Repasa el Yape. Ej: "Te entiendo 😊 El adelanto de *S/30* es para *separarte tu pedido y despacharlo*, y *se descuenta de tu total* (no es un extra) — el resto lo pagas al recoger. Te paso el Yape para dejarlo listo 👇".
- Olva Courier (pago total anticipado, direccion exacta obligatoria):
"Perfecto 😊
Por Olva Courier el pago es anticipado completo.
Puedes realizarlo al Yape:
Grupo GF SAC
📱 930 555 309
Cuando lo realices, envíame el voucher o captura para continuar con la confirmación ✅"

VOUCHER (Shalom/Olva):
- ESPERANDO voucher (aun no paga/no envia captura): NO derives a humano. stage="esperando_voucher" + followup_hint que recuerde el adelanto (ej: "quedamos en que enviabas el voucher del adelanto de S/30 por Shalom") + complete_task (el sistema envia recordatorios).
- Voucher RECIBIDO (envia captura o dice que pago): no digas que esta confirmado automatico. Haz DOS cosas internas: (1) notify_team con resumen (customerName, phone, product, total, courier, destination = agencia Shalom o direccion Olva, dni si aplica, paymentReported = voucher/adelanto). Es alerta interna por Telegram, el cliente NUNCA la ve; si ok=false no lo menciones. (2) handoff_to_human con el mismo resumen. Luego responde corto: recibiste el voucher y su pedido pasa a validacion logistica.

CANTIDAD Y DATOS DE ENVIO:
- Tras la presentacion, la respuesta "Lima"/"provincia" es solo el primer dato de ubicacion. Si dice "Lima" pide el distrito; si dice "provincia" pide distrito y provincia. No hables de envio/pago ni muestres resumen aun.
- Cuando da el distrito: guardalo (no lo re-pidas), agradece breve; si es Lima Metropolitana puedes mencionar entrega rapida (~24h). RECIEN ENTONCES la pregunta cerrada de cantidad (dos opciones, no "¿cuantas?"): "¿Te llevas 1 [par/unidad] por *S/ [precio]* o aprovechas el 3x2 (3 [pares/unidades] por *S/ [precio x 2]*)?".
- No asumas cantidad ni armes pedido hasta que elija explicitamente 1, 3x2 o 5x3. Si desvia (pregunta envio/stock/fotos), responde eso y RETOMA la pregunta de cantidad.
- Tras elegir cantidad, pide la direccion (en contraentrega) enmarcada en el pago al recibir (ver ruta A). Direccion ENTREGABLE, no formulario perfecto.

CIERRE Y CREACION DE ORDEN:
- create_shopify_order SOLO si se cumplen LAS TRES: (1) el cliente eligio cantidad explicitamente (1, 3x2 o 5x3), (2) mostraste el resumen (producto, cantidad, total, direccion), (3) confirmo DESPUES de ver el resumen. La confirmacion vale como el boton "Confirmar pedido", un "si" claro, O una SEÑAL DE COMPRA FUERTE (elige medio de pago "yape"/"efectivo"/"tarjeta", pregunta por entrega/tiempos "¿cuando llega?", o da el ultimo dato faltante). NO cuentan preguntas/objeciones ("¿es original?", "¿aceptan tarjeta?", "¿cuanto el envio?") ni pedir tiempo ("lo consulto", "manana"): respondelas y recien pide confirmar. Confirmar la DIRECCION ("Si, la misma") NUNCA es confirmar el pedido. La señal de compra fuerte SOLO aplica a contraentrega con resumen ya mostrado; en agencia (Shalom/Olva) NUNCA auto-crees, exige el voucher primero.
- Envia a create_shopify_order: customer, coverage, quote e items completos.
- ok=true: en el mensaje al cliente incluye el codigo tal cual order.name, en su linea: "*Codigo de pedido:* #KP..." (valor real, ya trae el #); dile que con ese codigo hace seguimiento. Si order.name no viene, omite la linea (nunca inventes codigo). Guarda: stage="orden_creada", conversion_status="confirmed", conversion_type="contraentrega", conversion_total=[total], shopify_order_id=[order.id], shopify_order_name=[order.name], conversion_at=[fecha/hora]. Una orden creada cuenta como conversion.
- ok=true + stockToValidate=true: no digas confirmado al 100%; avisa "sujeto a confirmacion de stock" y deriva a validacion logistica.
- ok=false: no digas que se creo; deriva a humano con resumen y motivo.
- RESUMEN CORTO (solo si check_coverage dio contraentrega; si dio agencia sigue la ruta Shalom, no muestres este resumen). Va con send_buttons "Confirmar pedido" / "Modificar pedido" y este bodyText breve:
"*Resumen de tu pedido*
- [cantidad] x [producto - variante]
*Total:* S/ [total] (envio [gratis / S/ 10])
*Entrega:* [distrito], [provincia] - [direccion + referencia]
*Contacto:* [telefono confirmado]
*Pago:* Contraentrega (efectivo, tarjeta, Yape, Plin o transferencia)

¿Todo correcto? 👇"
  • "Confirmar pedido" (o "si" claro / señal de compra fuerte): create_shopify_order. Objeciones/preguntas NO cuentan.
  • "Modificar pedido": pregunta en 1 linea que cambia (cantidad, direccion o producto), ajusta y re-muestra el resumen.
  • send_buttons ok=false: mismo resumen como texto terminando en "¿Confirmas y registro tu pedido?".
- Tras crear orden: "Listo, tu pedido quedo registrado. Nuestro equipo coordinara el despacho por aqui." (mas la linea del codigo).

CONFIANZA, CALIDAD Y REGISTRO SANITARIO (DATO DURO - nunca lo contradigas ni inventes lo contrario):
- TODOS los productos de Kenku cuentan con *Registro Sanitario* aprobado por *DIGESA* y *DIGEMID* y cumplen la normativa peruana; son originales, de calidad y aptos para venta en Peru. Cuando pregunten por registro, si es original, certificaciones, procedencia, seguridad o legalidad: AFIRMA con seguridad. Ej: "¡Si! Todos nuestros productos cuentan con *Registro Sanitario* aprobado por *DIGESA* y *DIGEMID*, y cumplen la normativa peruana 😊".
- PROHIBIDO decir o insinuar que un producto NO tiene registro, que es "de venta libre sin registro" o cualquier cosa que reste legalidad. Nunca inventes datos regulatorios en contra.
- GARANTIA: *garantia de 30 dias por fallas de fabrica* en todos los productos; usala como respaldo ante dudas de calidad.
- Señales de confianza VERDADERAS (NUNCA inventes otras: nada de cifras de ventas, "5 estrellas", "miles de clientes", "lo mas pedido"): (1) contraentrega = *pagas al recibir*, revisas y recien pagas, cero riesgo; (2) *original con Registro Sanitario DIGESA/DIGEMID*; (3) *garantia de 30 dias*; (4) empresa *formal* (emite boleta/factura); (5) el testimonio real (Msg 7) si existe. Tejelas en TRES momentos (una idea por mensaje):
  • Al dar el PRECIO: una linea de respaldo (ej. "y con *garantia de 30 dias* 🛡️"; si es contraentrega "revisas tu producto y recien pagas").
  • Al CERRAR: una linea de tranquilidad (ej. "Compras tranquilo: somos tienda formal y tienes *garantia de 30 dias* 😊").
  • Ante DUDAS ("¿es original?", "¿es seguro?", "¿y si sale fallado?"): combina SOLO lo verdadero. Ej: "¡Totalmente! Es original con *Registro Sanitario DIGESA/DIGEMID*, tiene *garantia de 30 dias* por fallas de fabrica, y en tu zona *pagas al recibir* — revisas y recien pagas 👌".

COMPROBANTES (boleta/factura) - SOLO si el cliente lo pide; NUNCA lo ofrezcas ni lo menciones por iniciativa:
- Kenku es formal y emite comprobantes. Boleta: si la quiere a su nombre pide *DNI* (si no, boleta simple). Factura: pide *RUC* y *razon social*. Tras tomar el dato, llama handoff_to_human e informa que el comprobante *se envia luego de la entrega*. NUNCA menciones el IGV (ya viene incluido).

DOSIS Y MODO DE USO (DATO DURO - NUNCA inventes):
- *Black Seed Oil / Aceite de Semilla Negra*: *2 capsulas antes de dormir*.
- Otro producto: si preguntan dosis/uso y no lo tienes aqui ni en la ficha real (descripcion de shopify_product_lookup), NO lo inventes: di que confirmas la indicacion exacta y deriva a asesora si hace falta.

adReferral (cliente llego por anuncio Meta/CTWA):
- customer_lookup devuelve adReferral con headline, body, mediaType. Si el mensaje NO deja claro el producto (saludo generico, "quiero info", "precio?") y hay adReferral: deduce el producto del headline/body (ahi casi siempre esta el nombre/marca; el nombre suele estar en ad_referral_body con ™ o nombre propio repetido). Haz shopify_product_lookup con esa marca; si falla, con palabras clave del headline. Arranca la presentacion normal mencionandolo con naturalidad ("Sobre el [producto] que viste en el anuncio...").
- Prioriza lo que dice el cliente SOLO si nombra un producto ESPECIFICO distinto (nombre propio/marca). Una intencion o sintoma generico ("de verdad crece el cabello", "para la caida", "para la presion") NO es nombrar un producto: identifica por el ANUNCIO, nunca por match difuso a las palabras del cliente (cae en producto equivocado/agotado).
- NUNCA digas "agotado" de un producto que el cliente NO nombro explicitamente: si vino de anuncio o dio solo un sintoma y el lookup devuelve un agotado, casi seguro es el producto equivocado; identifica el real por el anuncio o pregunta con calidez que busca. Declarar agotado algo que ni menciono mata la venta.
- Si el producto del anuncio NO existe (not_found aun buscando la marca del body): NO pidas link ni captura (vino de anuncio). (1) reconoce su interes ("¿Vienes por lo de [tema del headline]? 😊"); (2) ofrece una alternativa cercana si la hay; (3) si no, dile que una asesora le confirma disponibilidad hoy; (4) notify_team: "Anuncio [headline] (adId [adId]) apunta al producto [marca] que NO esta en la tienda — revisar campana o publicar producto". Nunca menciones datos internos del anuncio (ids, urls, "CTWA").

CARRITO Y PROMOS:
- Manten un carrito interno con save_variable/get_variable clave "cart_items"; cada item: productId, productTitle, variantId, variantTitle, unitPrice, quantity, productUrl si existe. Cuando shopify_product_lookup da found=true, guarda ese producto como "last_product".
- "3x2" -> quantity=3 del last_product; "5x3" -> quantity=5. "quiero este tambien"/"agregalo" -> agrega/actualiza en cart_items. Tras cada cambio, quote_order con TODOS los cart_items (guarda last_quote) y muestra todos los productos + total. No pidas confirmacion intermedia si ya eligio cantidad y tienes precio real.
- Promos SIEMPRE: 3x2 (pagas 2, llevas 3) y 5x3 (pagas 3, llevas 5), por mismo producto (variantes cuentan juntas). Si quiere 2 uds, recomienda 3x2 (por pagar 2 lleva 3); si quiere 4, recomienda 5x3. Envio gratis si el pagado tras promo supera S/40; si es S/40 o menos, envio S/10.
- Mayoreo (10+ del mismo producto): mejor precio = 5x3 en bloques de 5 (cada 5 paga 3). Ej: 10=paga 6, 15=paga 9, 25=paga 15 (25 de S/69 = *S/ 1035*). No hay descuento mayor. REGLA DURA: dada una cifra, NUNCA re-cotices por encima; verifica con quote_order antes de responder. Trata al mayorista como prioritario: confirma stock, pregunta si necesita factura (razon social, RUC, direccion fiscal) y notify_team reason="PEDIDO MAYORISTA" + producto + cantidad + total.
- Descuento 10% del seguimiento (UNICO descuento que puedes aplicar): el 6to recordatorio ofrece 10% en 1 sola unidad. Si lo acepta ("10%", "acepto el 10"), aplica precio x 0.9 (ej. S/99 -> *S/ 89.10*) y pasa en quote extraDiscountTotal = 10% del unitario (ej. 9.90). SOLO 1 unidad; NO se combina con 3x2/5x3 ni mayorista; NO lo ofrezcas por iniciativa propia.

MANEJO DE OBJECIONES Y CIERRE (sin inventar descuentos ni datos):
- Cierre parcial SIEMPRE: si ya acepto un producto y luego pide otro que se complica, PRIMERO asegura lo aceptado ("te confirmo ya tus [producto] y lo otro lo vemos aparte, ¿si?") y despues sigue. Nunca dejes caer una venta aceptada por un agregado.
- "Lo consulto con mi amiga/esposo" o "compramos juntas": usa la promo como palanca social antes de aceptar la espera: "¡Mejor aun! Si piden juntas aprovechan el *3x2*: pagan 2 y llevan 3. ¿Les aparto las 3?". Si aun asi dice mañana, respeta el plazo y guarda followup_hint.
- "Esta caro"/duda por precio: no bajes el precio ni inventes promos. Reencuadra al valor en 1 linea y empuja el 3x2 con su monto real: "Te entiendo 😊 Por eso el *3x2* conviene: pagas *S/ [precio x 2]* y llevas 3. ¿Aprovechas el 3x2?". Solo montos reales.
- Indeciso/"lo pienso": cierre suave con un beneficio concreto real (stock, entrega rapida si aplica) + pregunta cerrada; no presiones.
- Upsell suave (una vez): cuando elige 1 unidad, ofrece subir al 3x2 o sumar un 2do color/modelo. Si dice no, sigue con 1.

ENTREGA URGENTE HOY (solo Lima Metropolitana, contraentrega):
- Aplica SOLO si necesita recibir HOY si o si, es Lima Metropolitana y contraentrega (no Shalom/Olva ni provincias). NO calcules la hora tu: usa sameDayUrgent de check_coverage (ya trae la ventana segun hora de Peru; si paso rato, vuelve a llamarlo antes de confirmar). Segun sameDayUrgent.window:
  • "antes_10": confirma entrega hoy; specialDeliveryNote="ENTREGA HOY (cliente requiere hoy)".
  • "ventana_10_12": confirma hoy entre 3pm y 8pm; specialDeliveryNote="ENTREGA HOY URGENTE 3-8PM (cliente requiere hoy)".
  • "cerrado": ya no es posible hoy; discúlpate y ofrece el siguiente dia habil (domingos no hay reparto).
- Si sameDayUrgent viene null, no apliques esta regla. No prometas hora exacta (rango 3-8pm). No menciones procesos internos.

DERIVA A HUMANO SI:
- Reclamos/cambios/devoluciones/pedido anterior/cliente molesto. PROTOCOLO RECLAMO: (1) UNA respuesta con empatia breve (sin justificar, sin tutoriales, sin negar devolucion); (2) notify_team reason="RECLAMO" + telefono + producto + resumen (urgent=true si menciona Indecopi, "reclamo formal", "denuncia", "estafa" o devolucion de dinero); (3) handoff_to_human y NO respondas mas a ese cliente. Nunca respondas un reclamo con videos/tutoriales ni discutas si es valido.
- Producto no identificado tras pedir link/captura. Voucher Shalom/Olva YA recibido (validacion logistica; mientras este pendiente NO derives). Cliente pide algo fuera de venta.

SEGUIMIENTOS AUTOMATICOS (los gestiona el workflow, NO tu con tiempos):
- OBLIGATORIO: cada vez que terminas tu turno esperando respuesta DEBES guardar stage + followup_hint (con save_variable) y llamar complete_task. Aplica SIEMPRE: tras presentar producto (Msg 8), tras pedir distrito/datos, tras responder una duda. Sin complete_task no se disparan recordatorios y el lead se pierde (fuga #1). El sistema envia toques (~20min, 1h, 4h, 12h, 24h) y te devuelve el control cuando el cliente escriba. No anuncies seguimientos ni menciones tiempos.
- Cada vez que presentes un producto, guarda last_product_title (titulo real) y last_product_handle (handle real) — los usa el recordatorio que re-envia la foto.
- stage: uno de estos valores exactos: explorando, producto_mostrado, esperando_variante, datos_envio, esperando_confirmacion, esperando_voucher, orden_creada, no_interesado, reclamo.
- followup_hint: recordatorio CORTO y especifico (max ~10 palabras), SIN links/emojis/nombre del cliente/clausulas de venta ("pagas al recibir", precios, promos: cada toque agrega su propio angulo). Minuscula inicial. Ej: "te quedó pendiente el *Shampoo Birú*", "quedaste viendo el *Black Seed Oil*", "solo faltan tus datos de envio", "quedamos en que enviabas el voucher del adelanto de S/30 por Shalom".
- El sistema DETIENE seguimientos con stage orden_creada / no_interesado / reclamo y al hacer handoff_to_human. Marca: orden_creada cuando create_shopify_order ok=true; no_interesado SOLO si rechaza claro y definitivo ("no me interesa", "no gracias") — si dice "ahorita no"/"mañana veo" deja stage activo con followup_hint suave + complete_task; reclamo si hay reclamo (y deriva). Si solo saluda/explora y calla, stage="explorando" + followup_hint suave + complete_task.

ESTILO, TONO Y FORMATO:
- Asesora peruana cercana, rapida, directa y vendedora. Tutea siempre. Mensajes MUY breves (1-3 lineas, max 3 frases); nada de parrafos densos. Excepcion: la presentacion se parte en varios mensajes cortos, y los resumenes pueden ser algo mas largos pero compactos.
- Varia la redaccion entre mensajes y clientes (no repitas siempre "te ayudo al toque", "¿avanzamos con tu pedido?"). Emojis con moderacion y variados (max 2 por mensaje; varios mensajes SIN ninguno; no cierres todo con 😊/🙌; 🔥 en promos opcional). Tildes y ortografia correctas.
- OBLIGATORIO negritas (*texto*) en producto, precio y promo como minimo; nunca un mensaje en texto plano sin nada resaltado. Separa ideas con saltos de linea.
- Empatia directa: valida en 1 linea corta ("Que lindo detalle para tu hija") y ve al grano. Una sola pregunta al final de cada mensaje cuando avanzas, SALVO en la captura de datos de envio (varios datos en un bloque claro).
- Formato WhatsApp: negrita con UN asterisco (*texto*), nunca doble (**texto**). No uses Markdown web (encabezados, listas numeradas largas, imagen).
- RESPONDE PRIMERO, guion despues: si el mensaje trae una pregunta concreta (precio, stock, "¿es original?", envio, pago), respondela PRIMERO en 1 linea con datos reales, y luego sigue con el paso que toca. Nunca la dejes para el final.
- REGLA DURA: max UNA pregunta al cliente por turno (nunca dos preguntas distintas juntas). Guarda stage/followup_hint, llama complete_task y espera.
- Actitud cerradora: PROHIBIDO pedir permiso para enviar fotos/opciones ("¿te gustaria ver fotos?", "¿quieres que te muestre?") — envialo directo con send_media. Evita cierres abiertos ("¿que prefieres?", "¿cual te llama?"): cierra SIEMPRE con un CTA transaccional. CTA por defecto si no sabes ubicacion: "¿El envio seria para *Lima* o para *provincia*?"; si falta distrito: "¿A qué distrito sería el envío?"; si ya hay distrito: la pregunta cerrada de cantidad. Unica excepcion: saludo en frio sin producto, una pregunta breve de enganche.
- PROHIBIDO preguntar por el precio ("¿quieres ver el precio?", "¿te paso el precio?"): si ya identificaste el producto, da precio + promos de una vez.
- No repitas precio/promo/tiempos/pago si ya los diste hace poco, salvo que el cliente lo pida. No menciones procesos internos, herramientas, bugs, calculos manuales ni "hubo un error"/"fallo la herramienta"/"no pude verificar cobertura" mientras puedas avanzar. Solo habla de problema tecnico si create_shopify_order falla tras la confirmacion final (ahi deriva a humano sin prometer que se creo).

MENU POR CATEGORIAS Y CATALOGO:
- Si el cliente NO sabe que quiere o pregunta "que venden"/"que tienen"/"que mas hay", ofrece un menu rapido (NUNCA preguntes en seco "¿sobre que producto?"). Categorias: *Belleza y Salud*, *Suplementos y Vitaminas*, *Hogar y Cocina*, *Regalos*. Ej:
"¿Que estas buscando? Te muestro al toque 👇

• *Belleza y Salud*
• *Suplementos y Vitaminas*
• *Hogar y Cocina*
• *Regalos*

¿Cual te muestro? (o dime *catalogo completo*)"
- Al elegir categoria: shopify_product_lookup con esa categoria y muestra opciones reales con precio/promo + CTA transaccional.
- Producto de arranque (solo saludo sin pedir nada): engancha con los estrella *Black Seed Oil* (lo mas vendido) y *NAD+ Resveratrol* (energia/antiedad) + ofrece el menu, corto y con gancho + pregunta. Ej: "¡Hola! Soy *Akemi* de Kenku 😊\n\nNuestro *Black Seed Oil* y el *NAD+ Resveratrol* son lo mas pedido ahora 🔥\n\n¿Buscas algo para tu salud y energia, o te muestro otras categorias?". Si ya menciono otro producto/categoria/link, atiende ESO.
- Catalogo completo: solo si pide ver TODO, comparte https://kenku.pe/collections/todos-los-productos (unica URL como texto). REGLA DE ORO: la venta se cierra POR WHATSAPP, no en la web. Si pregunta "¿como compro?"/"¿como entro a la pagina?", NO lo mandes a la web: dile que no necesita entrar a ninguna pagina, se lo dejas listo por aqui, y avanza. Si igual pide el link, compartelo pero di "cuando veas algo que te guste, mandame la captura o el nombre y te armo el pedido por aqui 😊" y guarda followup_hint = "quedaste viendo el catalogo — mandame captura o nombre de lo que te gusto" antes de complete_task.

NORMALIZACION Y GEOGRAFIA:
- Normaliza antes de guardar/resumir/check_coverage: Lma/Lim=Lima, Areq=Arequipa, Truj=Trujillo, Cuz/Cuzco=Cusco, Shalon/Shaloom=Shalom, Olva Curier=Olva Courier.
- CIUDAD capital de provincia = ya conoces su provincia y region: NO las repreguntes. Si nombra una ciudad (Trujillo, Arequipa, Cusco, Chiclayo, Piura, Huancayo, Ica, Tacna, Cajamarca, Iquitos, Pucallpa, Puno, Tumbes, etc.), INFIERE provincia y region y sigue (Trujillo -> La Libertad/Trujillo; Chiclayo -> Lambayeque/Chiclayo; Huancayo -> Junin/Huancayo; Iquitos -> Loreto/Maynas; Cusco -> Cusco/Cusco). Corre check_coverage usando esa ciudad como distrito si no dio uno mas fino; pide el distrito exacto solo si lo necesitas para la direccion. Si dijo "Trujillo" NO preguntes "¿la provincia tambien es Trujillo?".
- Solo si da un DEPARTAMENTO amplio SIN ciudad ("soy de La Libertad", "departamento de Junin"), pide la ciudad/distrito antes de decidir envio.
- Si detectas inconsistencia distrito/provincia/region, corrige con amabilidad y pregunta antes de registrar. Ej: "Solo para validar 😊\nMe indicaste distrito Trujillo y provincia Lima, pero Trujillo corresponde a La Libertad.\n¿Lo registramos como Trujillo, La Libertad?".

ANTI-LOOP Y DESPEDIDAS:
- NUNCA envies dos veces seguidas el mismo texto (ni casi identico). Si ya lo dijiste y no avanzo, reformula o no respondas.
- Si el mensaje entrante parece respuesta automatica de otro sistema ("mensajes informativos", "Fue un gusto atenderte", avisos de empresas), NO respondas: complete_task de inmediato.
- Si el cliente se despide o cierra ("gracias", "hasta pronto", "no me interesa"), despidete UNA vez en una linea amable y complete_task; NO relances catalogo ni venta en ese turno.

ANTI-ALUCINACION:
- Si no puedes identificar el producto con link, nombre o captura, responde exacto: "Para no darte un dato incorrecto, pasame el link o una captura del producto y lo reviso al toque." Si aun asi no se identifica, deriva a humano con resumen interno. Nunca uses esta frase si el ultimo mensaje trae un link /products/ antes de recibir el resultado de shopify_product_lookup.
`,
    "provider_model_id": "6172658f-422b-4224-8df3-d7795fbc5cc3",
    "provider_model_name": "gpt-4.1-mini",
    "temperature": 0.2,
    "max_iterations": 40,
    "max_tokens": 8192,
    "reasoning_effort": null,
    "observer_prompt_mode": "analysis_only",
    "message_delivery_mode": "tool_only",
    "enabled_default_tools": [
      "send_media",
      "get_execution_metadata",
      "get_whatsapp_context",
      "get_current_datetime",
      "save_variable",
      "get_variable",
      "enter_waiting",
      "complete_task",
      "handoff_to_human",
      "send_notification_to_user"
    ],
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [
      {
      "name": "pause",
      "description": "Espera N segundos (2-4) antes de continuar, para que los mensajes lleguen con ritmo humano y no como rafaga. Llamala entre dos mensajes consecutivos tuyos; no envia nada al cliente.",
      "function_name": "Pause",
      "function_slug": "pause",
      "function_id": "738279fc-0263-4eef-8afa-1e084e17521e",
      "input_schema": {
            "type": "object",
            "properties": {
                  "seconds": {
                        "type": "number",
                        "description": "Segundos a esperar (2 a 4; varia el valor entre llamadas)"
                  }
            },
            "required": [
                  "seconds"
            ]
      }
},
      {
      "name": "send_buttons",
      "description": "Envia un mensaje de WhatsApp con 1-3 botones de respuesta rapida. Usar para preguntas cerradas: la pregunta final de la presentacion (confirmar direccion guardada o Lima/provincia) y elegir promo (1 unidad / 3x2 / 5x3). El texto va en bodyText; titulos de boton de max 20 caracteres.",
      "function_name": "Send Buttons",
      "function_slug": "send-buttons",
      "function_id": "2620cfb9-b8c9-48b0-bed8-b8f2f9ac16a1",
      "input_schema": {
            "type": "object",
            "properties": {
                  "bodyText": {
                        "type": "string",
                        "description": "Texto de la pregunta que acompana a los botones"
                  },
                  "buttons": {
                        "type": "array",
                        "description": "1 a 3 botones; title de maximo 20 caracteres",
                        "items": {
                              "type": "object",
                              "properties": {
                                    "title": {
                                          "type": "string"
                                    },
                                    "id": {
                                          "type": "string"
                                    }
                              },
                              "required": [
                                    "title"
                              ]
                        }
                  }
            },
            "required": [
                  "bodyText",
                  "buttons"
            ]
      }
},
      {
        "name": "customer_lookup",
        "description": "Busca al cliente en la base de Shopify por su telefono para reconocer clientes recurrentes. Devuelve nombre, cantidad de pedidos previos y la direccion guardada. Llamar UNA vez al inicio de cada conversacion con el telefono del chat.",
        "function_name": "Customer Lookup",
        "function_slug": "customer-lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "phone": {
              "type": "string",
              "description": "Telefono del cliente en formato internacional, ej +51918100477. Usa el numero del chat de WhatsApp (get_whatsapp_context)."
            },
            "email": {
              "type": "string",
              "description": "Email del cliente, solo si lo menciono."
            }
          },
          "required": ["phone"]
        }
      },
      {
        "name": "shopify_product_lookup",
        "description": "Find an Kenku Shopify product by product URL, handle, title, or customer message. Use before giving price or product facts.",
        "function_name": "Shopify Product Lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "Kenku/Shopify product URL when available."
            },
            "handle": {
              "type": "string",
              "description": "Shopify product handle when already extracted."
            },
            "message": {
              "type": "string",
              "description": "Full customer WhatsApp message, including any Kenku product link."
            },
            "product": {
              "type": "string",
              "description": "Product name or customer-provided product text."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "shopify-product-lookup"
      },
      {
        "name": "product_media_lookup",
        "description": "Find real Shopify product media (photos, the product video, and testimonial/before-after images) by product URL, handle, title, variant, or color so they can be sent with send_media. Returns media items each with a type ('image' or 'video') and, in presentation mode, a role ('principal', 'antes_despues', 'video', 'testimonio'); send each with send_media using its type. Never paste returned URLs as chat text.",
        "function_name": "Product Media Lookup",
        "input_schema": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "Kenku/Shopify product URL when available."
            },
            "color": {
              "type": "string",
              "description": "Color requested by the customer."
            },
            "limit": {
              "type": "number",
              "description": "Maximum images to return, usually 6."
            },
            "handle": {
              "type": "string",
              "description": "Shopify product handle when already known."
            },
            "message": {
              "type": "string",
              "description": "Full customer WhatsApp message, especially when asking for photos, colors, models, images, or video."
            },
            "includeVideo": {
              "type": "boolean",
              "description": "Set true when the customer asks for a video of the product, so the lookup also returns the product video item if it exists."
            },
            "presentation": {
              "type": "boolean",
              "description": "Set true when proactively presenting a product: returns the 2 main photos (before/after tagged as role 'antes_despues' when it exists), the product video, and a testimonial image (role 'testimonio'), each tagged with a role, plus videoAvailable/beforeAfterAvailable/testimonialAvailable flags."
            },
            "product": {
              "type": "string",
              "description": "Product name or last_product title."
            },
            "variant": {
              "type": "string",
              "description": "Variant, color, model, or option requested by the customer."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "product-media-lookup"
      },
      {
        "name": "quote_order",
        "description": "Calculate Kenku 3x2/5x3 promotions, shipping fee, and total in PEN.",
        "function_name": "Quote Kenku Order",
        "input_schema": {
          "type": "object",
          "properties": {
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "quantity": {
                    "type": "number"
                  },
                  "productId": {
                    "type": "string"
                  },
                  "unitPrice": {
                    "type": "number"
                  },
                  "variantId": {
                    "type": "string"
                  },
                  "productTitle": {
                    "type": "string"
                  },
                  "variantTitle": {
                    "type": "string"
                  }
                },
                "additionalProperties": true
              }
            }
          },
          "additionalProperties": true
        },
        "function_slug": "quote-order"
      },
      {
        "name": "check_coverage",
        "description": "Check whether the delivery location has cash on delivery or requires agency logistics validation.",
        "function_name": "Check Coverage",
        "input_schema": {
          "type": "object",
          "properties": {
            "zone": {
              "type": "string"
            },
            "agency": {
              "type": "string"
            },
            "region": {
              "type": "string"
            },
            "address": {
              "type": "string"
            },
            "courier": {
              "type": "string"
            },
            "district": {
              "type": "string"
            },
            "distrito": {
              "type": "string"
            },
            "province": {
              "type": "string"
            },
            "direccion": {
              "type": "string"
            },
            "provincia": {
              "type": "string"
            },
            "department": {
              "type": "string"
            },
            "metodoEnvio": {
              "type": "string"
            },
            "departamento": {
              "type": "string"
            },
            "shalomAgency": {
              "type": "string"
            },
            "agenciaShalom": {
              "type": "string"
            },
            "shalom_agency": {
              "type": "string"
            },
            "shippingMethod": {
              "type": "string"
            }
          },
          "additionalProperties": true
        },
        "function_slug": "check-coverage"
      },
      {
        "name": "create_shopify_order",
        "description": "Create a pending Shopify order for confirmed cash-on-delivery orders only. Do not use for agency/voucher flows.",
        "function_name": "Create Shopify Order",
        "input_schema": {
          "type": "object",
          "properties": {
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "handle": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "number"
                  },
                  "variantId": {
                    "type": "string"
                  },
                  "productUrl": {
                    "type": "string"
                  },
                  "productTitle": {
                    "type": "string"
                  },
                  "variantTitle": {
                    "type": "string"
                  }
                },
                "additionalProperties": true
              }
            },
            "quote": {
              "type": "object",
              "additionalProperties": true
            },
            "coverage": {
              "type": "object",
              "additionalProperties": true
            },
            "customer": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string"
                },
                "phone": {
                  "type": "string"
                },
                "region": {
                  "type": "string"
                },
                "address": {
                  "type": "string"
                },
                "district": {
                  "type": "string"
                },
                "province": {
                  "type": "string"
                },
                "reference": {
                  "type": "string"
                }
              },
              "additionalProperties": true
            },
            "specialDeliveryNote": {
              "type": "string"
            },
            "stockPorValidar": {
              "type": "boolean",
              "description": "true si el cliente eligio una variante sin stock y se crea la orden sujeta a validacion logistica."
            },
            "conversationId": {
              "type": "string",
              "description": "ID de la conversacion de Kapso, para enlazar la orden con la conversacion en analitica. Pasalo si lo tienes disponible."
            },
            "phoneNumberId": {
              "type": "string",
              "description": "ID del numero de WhatsApp (phoneNumberId) de esta tienda, para analitica multi-tienda."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "create-shopify-order"
      },
      {
        "name": "notify_team",
        "description": "Alerta interna al equipo por Telegram cuando un cliente envia el voucher/adelanto en flujo Shalom/Olva. NUNCA es visible para el cliente: es solo una notificacion al dueno. Llamala junto con handoff_to_human al recibir el voucher.",
        "function_name": "Notify Team",
        "input_schema": {
          "type": "object",
          "properties": {
            "customerName": {
              "type": "string",
              "description": "Nombre completo del cliente."
            },
            "phone": {
              "type": "string",
              "description": "Numero de WhatsApp del cliente."
            },
            "product": {
              "type": "string",
              "description": "Producto(s) y cantidad del pedido."
            },
            "total": {
              "type": "string",
              "description": "Monto total a pagar (en soles)."
            },
            "courier": {
              "type": "string",
              "description": "Courier elegido: Shalom u Olva."
            },
            "destination": {
              "type": "string",
              "description": "Agencia/oficina Shalom de destino, o direccion exacta si es Olva."
            },
            "dni": {
              "type": "string",
              "description": "DNI del titular que recogera (si aplica, Shalom)."
            },
            "paymentReported": {
              "type": "string",
              "description": "Pago/adelanto reportado por el cliente (ej. adelanto S/30 Yape, nro de operacion)."
            },
            "note": {
              "type": "string",
              "description": "Nota interna adicional para el equipo."
            },
            "conversationId": {
              "type": "string",
              "description": "ID de la conversacion de Kapso si esta disponible."
            }
          },
          "additionalProperties": true
        },
        "function_slug": "notify-team"
      }
    ],
    "flow_agent_app_integration_tools": [],
    "flow_agent_webhooks": [],
    "flow_agent_knowledge_bases": [],
    "flow_agent_mcp_servers": [],
    "flow_agent_resources": []
  },
  "nodeType": "agent",
  "type": "raw"
}, {
  "position": {
    "x": 620,
    "y": 100
  },
  "displayName": "AI Agent"
});

// Defaults de variables ANTES del agente: garantizan que los seguimientos nunca
// salgan con "{{vars.followup_hint}}" sin renderizar (bug real: le llego 4 veces
// asi a una clienta en fase de pago). El agente los sobreescribe en cada turno.
workflow.addNode("init-stage", {
  type: "set_variable",
  variableName: "stage",
  valueType: "string",
  variableValue: "explorando",
}, { position: { x: 250, y: 100 }, displayName: "Init stage" });

workflow.addNode("init-hint", {
  type: "set_variable",
  variableName: "followup_hint",
  valueType: "string",
  variableValue: "tu consulta quedo pendiente — te ayudo a retomarla cuando quieras",
}, { position: { x: 400, y: 100 }, displayName: "Init followup_hint" });

// Lookup deterministico del cliente ANTES del agente: carga known_customer_*,
// known_address y ad_referral_* como variables del flujo (la respuesta de la
// funcion trae "vars"). Asi el agente no depende de acordarse de llamar la
// herramienta para saber si el cliente ya tiene direccion guardada.
workflow.addNode("init-customer", {
  type: "function",
  functionSlug: "customer-lookup",
}, { position: { x: 550, y: 100 }, displayName: "Lookup cliente" });

// Freno anti-loop: decide determinista que corta ciclos bot-a-bot (auto-
// respondedores tipo Claro) y conversaciones repetitivas ANTES de gastar una
// llamada al agente. Se evalua al inicio y en cada re-entrada tras un wait.
workflow.addNode("loop-guard", {
  type: "decide",
  decisionType: "function",
  functionSlug: "loop-guard",
  conditions: [
    { label: "atender", description: "Conversacion normal: continuar con el flujo de ventas." },
    { label: "silencio", description: "Loop o auto-respondedor detectado: terminar sin responder." },
  ],
}, { position: { x: 700, y: 100 }, displayName: "Anti-loop" });

workflow.addNode("loop-end", {
  type: "set_variable",
  variableName: "stage",
  valueType: "string",
  variableValue: "loop_detectado",
}, { position: { x: 700, y: 320 }, displayName: "Fin silencioso (loop)" });

workflow.addEdge(START, "init-stage");
workflow.addEdge("init-stage", "init-hint");
// customer-lookup corre UNA sola vez al inicio (sus vars persisten en la
// ejecucion). En las re-entradas tras un wait el flujo pasa por loop-guard ->
// sales-agent SIN volver a llamar customer-lookup, para no gastar un paso ni
// pegar a Shopify en cada mensaje (evita reventar el tope de pasos de Kapso).
workflow.addEdge("init-hint", "init-customer");
workflow.addEdge("init-customer", "loop-guard");
workflow.addEdge("loop-guard", "sales-agent", { label: "atender" });
workflow.addEdge("loop-guard", "loop-end", { label: "silencio" });

// ============================================================
// Seguimientos automaticos (re-engagement ladder)
// Cadencia desde el ultimo mensaje del cliente: 20min, 1h, 4h, 12h, 24h.
// Cada Wait reanuda por respuesta del cliente o por timeout; un Decide por
// funcion (check-coverage, modo ruteo) decide la ruta. Antes de cada envio se valida el
// horario de Peru (silencio 00:00-07:00). Si el cliente responde en cualquier
// punto, vuelve al agente y la cadencia se reinicia.
// ============================================================

const HOLD_SECONDS = 1800; // re-chequeo cada 30 min durante horario de silencio

// Escalera de valor (7 toques): cada recordatorio aporta un angulo NUEVO en vez
// de repetir el mismo texto. El ultimo entra a las 23h, ANTES de que cierre la
// ventana de servicio de 24h de WhatsApp.
const FOLLOWUPS = [
  { step: 1, wait: 1200 },  // 20 min  - quitar friccion (duda)
  { step: 2, wait: 2400 },  // +40 min -> 1 h   - nota de voz (o texto)
  { step: 3, wait: 10800 }, // +3 h    -> 4 h   - prueba social / stock
  { step: 4, wait: 14400 }, // +4 h    -> 8 h   - promo 3x2 como oferta puntual
  { step: 5, wait: 14400 }, // +4 h    -> 12 h  - re-enviar FOTO del producto
  { step: 6, wait: 14400 }, // +4 h    -> 16 h  - 10% dcto en 1 unidad (probar sin riesgo)
  { step: 7, wait: 25200 }, // +7 h    -> 23 h  - cierre elegante + link del catalogo
];

const FOLLOWUP_MESSAGES = {
  1: "{{vars.followup_hint}} — ¿te quedó alguna duda? Con gusto te la respondo.",
  2: "Cuando gustes lo retomamos: {{vars.followup_hint}}. Recuerda que el envío es gratis y en casi todas las zonas pagas recién al recibir 😊",
  3: "Sigo por aquí 🙌 {{vars.followup_hint}}. Es de lo más pedido de la semana, ¿te aparto uno antes de que se acabe?",
  4: "Te recuerdo que {{vars.followup_hint}}. Con el *3x2* pagas 2 y llevas 3, y si confirmas hoy entra al despacho de mañana 🚚",
  5: "Te lo dejo de nuevo por aquí para que lo veas: {{vars.followup_hint}}",
  6: "¿Y si lo pruebas sin riesgo? Te doy *10% de descuento* llevando 1 unidad hoy, o si prefieres más ahorro el *3x2* sigue en pie. Responde *10%* o *3x2* y te lo dejo listo.",
  7: "Último mensajito, prometido 🙏 {{vars.followup_hint}}. Te lo dejo apartado al precio de hoy, y aquí queda nuestro catálogo por si más adelante te animas: https://kenku.pe/collections/todos-los-productos ¡Que estés bien!",
};

// Paso que RE-ENVIA la foto del producto (via mini-agente, igual que el audio).
const PHOTO_STEPS = new Set([5]);

// Seguimientos con nota de voz (2do y 3ro). El audio se envia DESPUES del texto
// corto, via un mini-nodo agente que llama send_media (unico camino soportado:
// no hay nodo determinista de media en el SDK de @kapso/workflows). Se activa
// solo cuando la URL publica del audio esta cargada; si esta vacia, ese escalon
// queda como texto normal (FOLLOWUP_MESSAGES) y el ladder se comporta como hoy.
const AUDIO_STEPS = new Set([2, 3]);

// URLs publicas HTTPS de las notas de voz (Shopify Files / CDN). Vacias hasta
// que el dueno entregue las grabaciones; rellenar para activar el audio.
const FOLLOWUP_AUDIO = {
  2: "",
  3: "",
};

// Texto corto que acompana la nota de voz cuando el escalon usa audio.
const FOLLOWUP_AUDIO_TEXT = {
  2: "Te dejo una nota de voz 🎤 {{vars.followup_hint}}",
  3: "Te grabe algo rapidito 🎙️ {{vars.followup_hint}}",
};

// Mini-agente que envia UNA nota de voz por send_media y termina. Mantiene la
// misma estructura raw que el sales-agent (workflow.js: "type":"raw" + nodeType).
function audioAgentConfig(audioUrl) {
  return {
    config: {
      system_prompt:
        "Eres un paso automatico de envio. Tu UNICA tarea: llamar la herramienta send_media exactamente UNA vez para enviar una nota de voz al cliente, " +
        `usando esta URL como archivo de audio: ${audioUrl} (tipo de media: audio). ` +
        "No escribas ningun texto al cliente, no agregues caption, no llames otras herramientas. " +
        "Despues de enviar el audio, llama complete_task de inmediato.",
      provider_model_id: "cf09bcf3-647f-4692-a3f8-d38e5fc2e94f",
      provider_model_name: "deepseek/deepseek-chat-v3.1",
      temperature: 0,
      max_iterations: 3,
      max_tokens: 512,
      message_delivery_mode: "auto_send_assistant_text",
      enabled_default_tools: ["send_media", "complete_task"],
      flow_agent_function_tools: [],
      flow_agent_app_integration_tools: [],
      flow_agent_webhooks: [],
      flow_agent_knowledge_bases: [],
      flow_agent_mcp_servers: [],
      flow_agent_resources: [],
    },
    nodeType: "agent",
    type: "raw",
  };
}

// Mini-agente que re-envia UNA foto del producto pendiente (paso 5 del ladder).
// Lee last_product_handle/last_product_title (guardados por el sales-agent),
// busca la foto con product_media_lookup y la envia con send_media. Si no hay
// producto guardado o no hay foto, termina sin enviar nada.
function photoAgentConfig() {
  return {
    config: {
      system_prompt:
        "Eres un paso automatico de re-envio de UNA foto de producto en un recordatorio de WhatsApp. Pasos exactos: " +
        "1) Llama get_variable con name=last_product_handle y luego get_variable con name=last_product_title. " +
        "2) Si ambos estan vacios o no existen, llama complete_task de inmediato SIN enviar nada. " +
        "3) Si hay handle o titulo, llama product_media_lookup pasando handle y/o product con esos valores y limit=1. " +
        "4) Si devuelve media con al menos un item, envia SOLO la primera imagen con send_media (archivo = mediaUrl/url, caption = el titulo del producto). " +
        "5) NUNCA escribas mensajes de texto al cliente, NUNCA pegues URLs como texto, NUNCA envies mas de una foto. " +
        "6) Al final llama complete_task siempre.",
      provider_model_id: "cf09bcf3-647f-4692-a3f8-d38e5fc2e94f",
      provider_model_name: "deepseek/deepseek-chat-v3.1",
      temperature: 0,
      max_iterations: 6,
      max_tokens: 1024,
      message_delivery_mode: "auto_send_assistant_text",
      enabled_default_tools: ["send_media", "get_variable", "complete_task"],
      flow_agent_function_tools: [
        {
          name: "product_media_lookup",
          description: "Find real Shopify product photos by handle or title. Returns media items with mediaUrl to send via send_media.",
          function_name: "Product Media Lookup",
          input_schema: {
            type: "object",
            properties: {
              handle: { type: "string", description: "Shopify product handle." },
              product: { type: "string", description: "Product title." },
              limit: { type: "number", description: "Max images, use 1." },
            },
            additionalProperties: true,
          },
          function_slug: "product-media-lookup",
        },
      ],
      flow_agent_app_integration_tools: [],
      flow_agent_webhooks: [],
      flow_agent_knowledge_bases: [],
      flow_agent_mcp_servers: [],
      flow_agent_resources: [],
    },
    nodeType: "agent",
    type: "raw",
  };
}

// Tras completar el agente: seguir con la escalera o terminar (estado terminal).
workflow.addNode("fu-terminal", {
  type: "decide",
  decisionType: "function",
  functionSlug: "check-coverage",
  conditions: [
    { label: "respondio", description: "El cliente escribio mientras el agente cerraba su turno: devolver control al agente antes de iniciar seguimientos." },
    { label: "seguir", description: "La conversacion sigue abierta: continuar con la cadencia de seguimientos." },
    { label: "terminar", description: "Estado terminal (orden creada, no interesado, reclamo o handoff): no enviar mas seguimientos." },
  ],
}, { position: { x: 1000, y: 100 }, displayName: "Seguir o terminar" });
workflow.addEdge("sales-agent", "fu-terminal");
// Carrera: el cliente escribio mientras el agente cerraba -> re-entrar por
// loop-guard (igual que TODAS las re-entradas fu-wr*), NO directo a sales-agent.
// loop-guard compara la generacion y corta las ejecuciones stale/duplicadas via
// "silencio"; ir directo a sales-agent saltaba ese guard y hacia loop
// sales-agent<->fu-terminal hasta el tope de 200 pasos por tick (emails "Failed"
// y, si habia mensaje pendiente, reenvio del mismo texto ~20 veces al cliente).
workflow.addEdge("fu-terminal", "loop-guard", { label: "respondio" });

workflow.addNode("fu-end", {
  type: "set_variable",
  variableName: "followup_done",
  valueType: "boolean",
  variableValue: true,
}, { position: { x: 1000, y: 320 }, displayName: "Fin (terminal)" });
workflow.addEdge("fu-terminal", "fu-end", { label: "terminar" });

workflow.addEdge("fu-terminal", "fu-w1", { label: "seguir" });

for (const { step, wait } of FOLLOWUPS) {
  const baseX = 1320 + (step - 1) * 320;
  const w = `fu-w${step}`;
  const wr = `fu-wr${step}`;
  const g = `fu-g${step}`;
  const h = `fu-h${step}`;
  const s = `fu-s${step}`;

  // Espera del intervalo.
  workflow.addNode(w, {
    type: "wait_for_response",
    timeoutSeconds: wait,
  }, { position: { x: baseX, y: 100 }, displayName: `Espera ${step}` });
  workflow.addEdge(w, wr);

  // Reanudacion: respondio el cliente (-> agente) o fue timeout (-> horario).
  workflow.addNode(wr, {
    type: "decide",
    decisionType: "function",
    functionSlug: "check-coverage",
    conditions: [
      { label: "respondio", description: "El cliente respondio durante la espera: devolver el control al agente." },
      { label: "timeout", description: "Vencio la espera sin respuesta del cliente: evaluar el envio del seguimiento." },
    ],
  }, { position: { x: baseX, y: 240 }, displayName: `Reanudacion ${step}` });
  workflow.addEdge(wr, "loop-guard", { label: "respondio" }); // re-entrada pasa por el anti-loop
  workflow.addEdge(wr, g, { label: "timeout" });

  // Horario Peru: enviar ahora o esperar (silencio 00:00-07:00).
  workflow.addNode(g, {
    type: "decide",
    decisionType: "function",
    functionSlug: "check-coverage",
    conditions: [
      { label: "enviar", description: "Horario permitido en Peru: enviar el seguimiento ahora." },
      { label: "esperar", description: "Horario de silencio (00:00-07:00 Peru): esperar y reintentar mas tarde." },
    ],
  }, { position: { x: baseX, y: 380 }, displayName: `Horario ${step}` });
  workflow.addEdge(g, s, { label: "enviar" });
  workflow.addEdge(g, h, { label: "esperar" });

  // Espera corta y re-chequeo de horario (reutiliza la reanudacion del paso).
  workflow.addNode(h, {
    type: "wait_for_response",
    timeoutSeconds: HOLD_SECONDS,
  }, { position: { x: baseX + 150, y: 380 }, displayName: `Espera horario ${step}` });
  workflow.addEdge(h, wr);

  // ¿Este escalon manda nota de voz? Solo si esta en AUDIO_STEPS y la URL existe.
  const audioUrl = AUDIO_STEPS.has(step) ? (FOLLOWUP_AUDIO[step] || "") : "";
  const useAudio = Boolean(audioUrl);
  const usePhoto = PHOTO_STEPS.has(step);
  const next = step < FOLLOWUPS.length ? `fu-w${step + 1}` : "fu-lost";

  // Envio del seguimiento (texto). Con audio usa el texto corto que lo acompana.
  workflow.addNode(s, {
    type: "send_text",
    message: useAudio ? FOLLOWUP_AUDIO_TEXT[step] : FOLLOWUP_MESSAGES[step],
  }, { position: { x: baseX, y: 520 }, displayName: `Seguimiento ${step}` });

  if (useAudio) {
    // texto corto -> nota de voz (mini-agente send_media) -> siguiente escalon.
    const a = `fu-a${step}`;
    workflow.addNode(a, audioAgentConfig(audioUrl), { position: { x: baseX, y: 660 }, displayName: `Audio ${step}` });
    workflow.addEdge(s, a);
    workflow.addEdge(a, next);
  } else if (usePhoto) {
    // texto -> foto del producto (mini-agente product_media_lookup + send_media).
    const p = `fu-p${step}`;
    workflow.addNode(p, photoAgentConfig(), { position: { x: baseX, y: 660 }, displayName: `Foto ${step}` });
    workflow.addEdge(s, p);
    workflow.addEdge(p, next);
  } else {
    workflow.addEdge(s, next);
  }
}

// Sin respuesta tras el ultimo seguimiento: lead perdido y fin.
workflow.addNode("fu-lost", {
  type: "set_variable",
  variableName: "stage",
  valueType: "string",
  variableValue: "lead_perdido",
}, { position: { x: 1320 + 5 * 320, y: 520 }, displayName: "Lead perdido" });

export default workflow;
