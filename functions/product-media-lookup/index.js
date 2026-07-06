const DEFAULT_PUBLIC_SHOP_DOMAIN = "kenku.pe";
// Dominio admin de la tienda Kenku (SHOPIFY_SHOP_DOMAIN en la config tiene prioridad).
const DEFAULT_ADMIN_SHOP_DOMAIN = "kenkuperu.myshopify.com";
const DEFAULT_ADMIN_API_VERSION = "2026-04";
const VIDEO_METAFIELD_NAMESPACE = "custom";
const VIDEO_METAFIELD_KEY = "video";
const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CATALOG_PAGES = 20;

const STOPWORDS = new Set([
  "kenku",
  "aurela",
  "color",
  "colores",
  "consulta",
  "foto",
  "fotos",
  "imagen",
  "imagenes",
  "modelo",
  "modelos",
  "opcion",
  "opciones",
  "pasame",
  "producto",
  "quiero",
  "resena",
  "resenas",
  "testimonio",
  "testimonios",
  "tienes",
  "ver",
  "video",
  "videos",
]);

// Synonyms so customer terms match catalog wording (e.g. "medias" == "calcetines" in Peru).
const SYNONYM_GROUPS = [
  ["medias", "media", "calcetines", "calcetin", "calceta", "calcetas", "soquetes", "soquete"],
  ["nattokinase", "natokinase", "nattokinasa", "natokinasa", "nattoquinasa", "natoquinasa", "natto"],
  ["shampoo", "shampu", "champu", "champoo", "sampoo", "shanpu"],
  ["shilajit", "silajit", "chilajit", "shilayit", "shilagit"],
  // El anuncio "Elimina Hongos en Pies" vende la marca Terbifin; en la tienda
  // el producto equivalente es el serum Nails Repairing. Mapear hasta que el
  // producto tenga el tag "terbifin" en Shopify (los tags son buscables).
  ["terbifin", "terbinafina", "nails repairing"],
];

const SYNONYM_MAP = buildSynonymMap(SYNONYM_GROUPS);

function buildSynonymMap(groups) {
  const map = new Map();
  for (const group of groups) {
    const normalized = [...new Set(group.map((word) => normalizeSearchText(word)).filter(Boolean))];
    for (const word of normalized) {
      const set = map.get(word) || new Set();
      normalized.forEach((other) => set.add(other));
      map.set(word, set);
    }
  }
  return map;
}

function tokenVariants(token) {
  const set = SYNONYM_MAP.get(token);
  return set ? [...set] : [token];
}

function searchableHasToken(searchable, token) {
  const variants = tokenVariants(token);
  if (variants.some((variant) => variant && searchable.includes(variant))) return true;
  // Fallback fonetico para errores tipicos de escritura (solo tokens largos).
  if (token.length >= 5) return fuzzyIncludes(searchable, variants);
  return false;
}

// Empareja tolerando errores tipicos de escritura, en tres niveles de
// fallback (solo tokens de 5+ letras, cuando no hubo match exacto):
// 1) fold fonetico en ambos lados (b/v, s/z, k/qu->c, sh->s, ch->c, ph->f,
//    w->u, y->i, h muda, letras dobles, -a por -e final);
// 2) fold sin espacios (ej. "vitalmoo" vs "vital moo");
// 3) distancia de edicion sobre palabras (typos de teclado: 1 letra en
//    palabras de 6+, 2 letras en palabras de 9+).
function fuzzyIncludes(text, variants) {
  const folded = phoneticFold(text);
  const foldedNoSpace = folded.replace(/ /g, "");
  let words = null;
  return variants.some((variant) => {
    if (!variant || variant.length < 5) return false;
    const foldedVariant = phoneticFold(variant);
    if (folded.includes(foldedVariant)) return true;
    const trimmed = foldedVariant.replace(/[aeiou]$/, "");
    if (trimmed.length >= 5 && trimmed !== foldedVariant && folded.includes(trimmed)) return true;
    if (foldedVariant.length >= 5 && foldedNoSpace.includes(foldedVariant.replace(/ /g, ""))) return true;
    if (variant.length >= 6) {
      const maxDistance = variant.length >= 9 ? 2 : 1;
      if (words === null) words = String(text || "").split(" ").filter((w) => w.length >= 4);
      return words.some((word) =>
        Math.abs(word.length - variant.length) <= maxDistance && editDistance(variant, word, maxDistance) <= maxDistance);
    }
    return false;
  });
}

// Levenshtein acotado con salida temprana: devuelve maxDistance+1 apenas la
// distancia minima posible supera el limite.
function editDistance(a, b, maxDistance) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(prev[j] + 1, current[j - 1] + 1, prev[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    prev = current;
  }
  return prev[b.length];
}

function phoneticFold(text) {
  return String(text || "")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/ph/g, "f")
    .replace(/qu|k/g, "c")
    .replace(/w/g, "u")
    .replace(/v/g, "b")
    .replace(/z/g, "s")
    .replace(/y/g, "i")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1");
}


// Registra en KV las busquedas que no encontraron producto, para revisarlas
// en campaign-report ("busquedas no encontradas") y alimentar sinonimos con
// datos reales. Best effort: si no hay KV o falla, no afecta la respuesta.
async function logSearchMiss(env, queryText, reason) {
  try {
    const kv = env.KV || globalThis.KV;
    const query = String(queryText || "").trim();
    if (!kv || !query) return;
    const key = `search_miss:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await kv.put(key, JSON.stringify({ q: query.slice(0, 120), reason, at: new Date().toISOString() }), { expirationTtl: 45 * 24 * 3600 });
  } catch {
    // best effort
  }
}

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

async function handleRequest(request, env = globalThis) {
  try {
    const input = await readJson(request);
    const config = getConfig(env);
    const root = isPlainObject(input.input) ? input.input : input;
    const queryText = collectInputText(input);
    const handles = extractHandleCandidates(queryText);
    const requestedVariant = collectVariantText(root);
    const limit = clamp(Number(root.limit || input.limit || 6) || 6, 1, 10);

    let product = null;

    for (const handle of handles) {
      product = await getPublicProductByHandle(config, handle);
      if (product) break;
    }

    if (!product && queryText) {
      const catalog = await loadPublicCatalog(config);
      const catalogMatch = searchCatalogProducts(catalog, queryText, handles);
      if (catalogMatch?.handle) product = await getPublicProductByHandle(config, catalogMatch.handle);
    }

    if (!product) {
      await logSearchMiss(env, queryText, "media_not_found");
      return json({
        ok: false,
        found: false,
        reason: "product_not_found",
        message: "No encontre fotos reales para ese producto. Pide link, nombre exacto o captura antes de responder.",
      });
    }

    const wantVideoDebug = /videodebug/i.test(queryText);
    const presentationRequested = detectPresentationRequest(root) && !wantVideoDebug;
    if (presentationRequested) {
      const knownAddress = input.execution_context?.vars?.known_address || null;
      return json(await buildPresentationResponse(config, product, knownAddress));
    }

    const photos = buildMediaItems(product, { limit, requestedVariant });

    // El cliente pidio video: intentamos resolver el metacampo custom.video
    // (referencia a archivo). Si no hay token admin o el producto no tiene video,
    // seguimos con las fotos sin romper el flujo.
    const videoRequested = detectVideoRequest(queryText, root) || wantVideoDebug;
    let videoItem = null;
    let videoDebug = null;
    if (videoRequested) {
      const vres = await fetchProductVideo(config, product);
      videoItem = vres.item;
      videoDebug = vres.debug;
    }

    // Modo diagnostico oculto (mensaje contiene "videodebug"): no envia media,
    // hace que el bot responda con el detalle tecnico para depurar el video.
    if (wantVideoDebug) {
      return json({
        ok: true,
        debug: true,
        videoRequested,
        videoAvailable: Boolean(videoItem),
        product: productSummary(product, config.publicShopDomain),
        videoDebug,
        media: [],
        followUpText: "MODO DIAGNOSTICO: responde al cliente UNICAMENTE con este texto exacto, sin agregar nada mas: VIDEODEBUG " + JSON.stringify(videoDebug),
      });
    }

    // El cliente pidio testimonio/reseña: lo resolvemos desde el metacampo
    // custom.testimonio (o una foto clasificada como testimonio) y respondemos
    // solo con eso, sin repetir las fotos que ya vio.
    if (detectTestimonialRequest(queryText, root)) {
      const mfImages = await fetchPresentationMetafieldImages(config, product);
      const testimonialItem = mfImages.testimonial
        ? { ...mediaItem(product, "Testimonio", mfImages.testimonial), role: "testimonio" }
        : classifyPresentationImages(product).testimonial;
      const testimonialMedia = [];
      if (videoItem) testimonialMedia.push(videoItem);
      if (testimonialItem) testimonialMedia.push(testimonialItem);
      return json({
        ok: true,
        found: true,
        videoRequested,
        videoAvailable: Boolean(videoItem),
        testimonialRequested: true,
        testimonialAvailable: Boolean(testimonialItem),
        product: productSummary(product, config.publicShopDomain),
        media: testimonialMedia,
        count: testimonialMedia.length,
        sendMediaInstructions: [
          "Usa la herramienta send_media para enviar cada item como media real de WhatsApp (los de type video como video, los de type image como imagen).",
          "No escribas ni pegues estas URLs en texto al cliente.",
          "No uses Markdown de imagen ni de enlace.",
        ].join(" "),
        followUpText: testimonialItem
          ? "Envia el testimonio como imagen con send_media y luego retoma el cierre de la venta con la pregunta pendiente (Lima o provincia, o la promo)."
          : "No hay testimonio visual para este producto: dilo en una linea, refuerza con un beneficio concreto y retoma el cierre con la pregunta pendiente.",
      });
    }

    const media = videoItem ? [videoItem, ...photos] : photos;

    if (media.length === 0) {
      return json({
        ok: false,
        found: true,
        videoRequested,
        videoAvailable: false,
        reason: "media_not_found",
        product: productSummary(product, config.publicShopDomain),
        message: "El producto existe, pero no encontre fotos ni video publicos para enviar como media.",
      });
    }

    const videoAvailable = Boolean(videoItem);
    return json({
      ok: true,
      found: true,
      videoRequested,
      videoAvailable,
      product: productSummary(product, config.publicShopDomain),
      media,
      count: media.length,
      sendMediaInstructions: [
        "Usa la herramienta send_media para enviar cada item como media real de WhatsApp (los de type video como video, los de type image como imagen).",
        "No escribas ni pegues estas URLs en texto al cliente.",
        "No uses Markdown de imagen ni de enlace.",
      ].join(" "),
      followUpText: videoRequested && !videoAvailable
        ? "No hay video para este producto: avisa breve que por ahora no tienes video y envia las fotos reales. Luego ofrece precio y promo y cierra con la pregunta cerrada (1 vs 3x2)."
        : "Te muestro la media real. Despues de enviarla, ofrece precio y promo y cierra con la pregunta cerrada de dos opciones (1 unidad/par vs 3x2). No preguntes si quiere saber el precio.",
    });
  } catch (error) {
    return json({
      ok: false,
      found: false,
      reason: "media_lookup_error",
      message: "No pude obtener fotos reales ahora. Deriva a humano sin pegar links.",
      error: safeError(error),
    }, 200);
  }
}

async function readJson(request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams.entries());
  }

  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getConfig(env = globalThis) {
  const publicShopDomain =
    env.SHOPIFY_PUBLIC_SHOP_DOMAIN ||
    env.sHOPIFYPUBLICSHOPDOMAIN ||
    globalThis.SHOPIFY_PUBLIC_SHOP_DOMAIN ||
    globalThis.sHOPIFYPUBLICSHOPDOMAIN ||
    DEFAULT_PUBLIC_SHOP_DOMAIN;

  // Credenciales Admin (mismas que create-shopify-order) para leer el metacampo
  // custom.video, que NO viene en el products.json publico. Opcionales: si no
  // estan configuradas, la funcion sigue devolviendo solo fotos.
  const adminShopDomain =
    env.SHOPIFY_SHOP_DOMAIN || env.sHOPIFYSHOPDOMAIN ||
    globalThis.SHOPIFY_SHOP_DOMAIN || globalThis.sHOPIFYSHOPDOMAIN ||
    DEFAULT_ADMIN_SHOP_DOMAIN;
  const adminApiVersion =
    env.SHOPIFY_API_VERSION || env.sHOPIFYAPIVERSION ||
    globalThis.SHOPIFY_API_VERSION || globalThis.sHOPIFYAPIVERSION ||
    DEFAULT_ADMIN_API_VERSION;
  const adminToken =
    env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.sHOPIFYADMINACCESSTOKEN ||
    globalThis.SHOPIFY_ADMIN_ACCESS_TOKEN || globalThis.sHOPIFYADMINACCESSTOKEN || "";

  return { publicShopDomain, adminShopDomain, adminApiVersion, adminToken };
}

function collectInputText(input) {
  const root = isPlainObject(input.input) ? input.input : input;
  const sources = [root, input].filter(Boolean);
  const keys = [
    "url",
    "link",
    "productUrl",
    "product_url",
    "handle",
    "productHandle",
    "product_handle",
    "product",
    "productName",
    "product_name",
    "title",
    "message",
    "customerMessage",
    "customer_message",
    "text",
    "body",
    "content",
  ];

  const direct = [];
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) direct.push(value.trim());
    }
  }

  if (direct.length > 0) return uniquePreserveCase(direct).join(" ");
  return collectStrings(input).join(" ").trim();
}

function collectVariantText(root) {
  return [
    root.variant,
    root.variantTitle,
    root.variant_title,
    root.color,
    root.colour,
    root.modelo,
    root.option,
  ].filter((value) => typeof value === "string" && value.trim()).join(" ");
}

function collectStrings(value, output = []) {
  if (typeof value === "string" && value.trim()) {
    output.push(value.trim());
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function extractHandleCandidates(value) {
  if (!value) return [];

  const text = String(value).trim();
  const directHandle = text.match(/^[^\s/]{3,}$/);
  if (directHandle) {
    const decoded = safeDecode(directHandle[0]);
    return uniqueCandidates([directHandle[0], decoded, encodeURIComponent(decoded), slugifyHandle(decoded)]);
  }

  const urls = text.match(/https?:\/\/[^\s]+/gi) || [];
  const candidates = [];

  for (const rawUrl of urls) {
    try {
      const cleanedUrl = rawUrl.replace(/[)\].,!?]+$/g, "");
      const url = new URL(cleanedUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      const productIndex = parts.indexOf("products");
      if (productIndex === -1 || !parts[productIndex + 1]) continue;

      const rawHandle = parts[productIndex + 1].replace(/\.js$/i, "");
      const decodedHandle = safeDecode(rawHandle);
      candidates.push(rawHandle, decodedHandle, encodeURIComponent(decodedHandle), slugifyHandle(decodedHandle));
    } catch {
      // Malformed URLs are ignored; name search can still resolve the product.
    }
  }

  return uniqueCandidates(candidates);
}

async function getPublicProductByHandle(config, handle) {
  for (const key of handleKeys(handle)) {
    try {
      const response = await fetch(`https://${config.publicShopDomain}/products/${key}.js`, {
        headers: publicHeaders(),
      });
      if (!response.ok) continue;

      const product = await response.json();
      if (!product?.id || !product?.handle) continue;
      return product;
    } catch {
      // Try the next handle.
    }
  }

  return null;
}

async function loadPublicCatalog(config) {
  const now = Date.now();
  const cached = globalThis.__KENKU_MEDIA_CATALOG_CACHE;

  if (cached?.expiresAt > now && Array.isArray(cached.products)) {
    return cached.products;
  }

  const products = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
    try {
      const response = await fetch(`https://${config.publicShopDomain}/products.json?limit=250&page=${page}`, {
        headers: publicHeaders(),
      });
      if (!response.ok) break;

      const payload = await response.json();
      const pageProducts = Array.isArray(payload.products) ? payload.products : [];
      if (pageProducts.length === 0) break;

      for (const product of pageProducts) {
        const key = String(product.id || product.handle || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        products.push(product);
      }

      if (pageProducts.length < 250) break;
    } catch {
      break;
    }
  }

  globalThis.__KENKU_MEDIA_CATALOG_CACHE = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    products,
  };

  return products;
}

function publicHeaders() {
  return {
    "Accept": "application/json",
    "User-Agent": "Kenku-Kapso-Media-Lookup/1.0",
  };
}

function searchCatalogProducts(catalog, text, handles = []) {
  if (!text || !Array.isArray(catalog) || catalog.length === 0) return null;

  for (const handle of handles) {
    const keys = handleKeys(handle);
    const exact = catalog.find((product) => handleKeys(product.handle).some((key) => keys.includes(key)));
    if (exact) return exact;
  }

  const query = cleanProductQuery(text, handles);
  if (!query.normalized || query.tokens.length === 0) return null;

  return catalog
    .map((product) => ({ ...product, __score: scoreProduct(product, query) }))
    .filter((product) => product.__score >= 12)
    .sort((a, b) => b.__score - a.__score)[0] || null;
}

function cleanProductQuery(text, handles) {
  const handleText = handles.map((handle) => handle.replace(/-/g, " ")).join(" ");
  const cleaned = [handleText, text]
    .filter(Boolean)
    .join(" ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[|]/g, " ");
  const normalized = normalizeSearchText(cleaned);
  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .slice(0, 12);

  return { normalized: tokens.join(" "), tokens };
}

function scoreProduct(product, query) {
  const title = normalizeSearchText(product.title || "");
  const handle = normalizeSearchText((product.handle || "").replace(/-/g, " "));
  const searchable = normalizeSearchText([
    product.title,
    (product.handle || "").replace(/-/g, " "),
    product.product_type,
    product.type,
    product.vendor,
    normalizeTags(product.tags).join(" "),
    (product.variants || []).map((variant) => variant.title).join(" "),
  ].filter(Boolean).join(" "));

  let score = 0;
  if (query.normalized && title.includes(query.normalized)) score += 35;
  if (query.normalized && handle.includes(query.normalized)) score += 30;
  if (query.normalized && searchable.includes(query.normalized)) score += 20;

  for (const token of query.tokens) {
    const variants = tokenVariants(token);
    if (variants.some((variant) => handle === variant)) score += 25;
    else if (variants.some((variant) => handle.includes(variant))) score += 12;
    if (variants.some((variant) => title === variant || title.startsWith(`${variant} `))) score += 22;
    else if (variants.some((variant) => title.includes(variant))) score += 14;
    else if (variants.some((variant) => searchable.includes(variant))) score += 3;
    else if (token.length >= 5 && fuzzyIncludes(title, variants)) score += 14;
    else if (token.length >= 5 && fuzzyIncludes(searchable, variants)) score += 3;
  }

  const matchedTokens = query.tokens.filter((token) => searchableHasToken(searchable, token)).length;
  if (matchedTokens === query.tokens.length && query.tokens.length >= 2) score += 10;
  // Una palabra distintiva (6+ letras) con match fuerte en titulo/handle basta
  // aunque el resto de la consulta sean calificadores que no estan en el
  // catalogo (ej. "Nattokinase Liposomal": "liposomal" es marketing del anuncio).
  const strongTokenMatch = query.tokens.some((token) => {
    if (token.length < 6) return false;
    const variants = tokenVariants(token);
    return variants.some((variant) => title.includes(variant) || handle.includes(variant))
      || fuzzyIncludes(title, variants) || fuzzyIncludes(handle, variants);
  });
  if (matchedTokens < Math.min(2, query.tokens.length) && !(matchedTokens >= 1 && strongTokenMatch)) score = 0;
  return score;
}

function buildMediaItems(product, options) {
  const limit = options.limit || 6;
  const requestedTokens = normalizeSearchText(options.requestedVariant || "")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  const optionDefinitions = normalizePublicOptions(product);
  const visualPositions = findVisualOptionPositions(optionDefinitions);
  const items = [];
  const seenUrls = new Set();

  for (const variant of product.variants || []) {
    const url = normalizeImageUrl(
      variant.featured_image?.src ||
      variant.featured_image ||
      variant.image ||
      variant.image?.src,
    );
    if (!url || seenUrls.has(url)) continue;

    const label = labelFromVariant(variant, optionDefinitions, visualPositions);
    const searchable = normalizeSearchText([label, variant.title, product.title].filter(Boolean).join(" "));
    if (requestedTokens.length > 0 && !requestedTokens.every((token) => searchable.includes(token))) continue;

    seenUrls.add(url);
    items.push(mediaItem(product, label, url));
    if (items.length >= limit) return items;
  }

  if (items.length === 0 && requestedTokens.length > 0) {
    return buildMediaItems(product, { ...options, requestedVariant: "" });
  }

  for (const image of product.images || []) {
    const url = normalizeImageUrl(image?.src || image);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    items.push(mediaItem(product, `Foto ${items.length + 1}`, url));
    if (items.length >= limit) return items;
  }

  const featured = normalizeImageUrl(product.featured_image || product.image?.src);
  if (featured && !seenUrls.has(featured) && items.length < limit) {
    items.push(mediaItem(product, "Principal", featured));
  }

  return items.slice(0, limit);
}

function mediaItem(product, label, url) {
  const safeLabel = label && normalizeSearchText(label) !== "default title" ? label : "Foto";
  return {
    mediaType: "image",
    type: "image",
    label: safeLabel,
    caption: `${safeLabel} - ${product.title}`,
    url,
    mediaUrl: url,
  };
}

function normalizePublicOptions(product) {
  const variants = product.variants || [];
  const rawOptions = Array.isArray(product.options) ? product.options : [];
  return rawOptions.map((option, index) => {
    const optionObject = typeof option === "string" ? { name: option, position: index + 1 } : option || {};
    const position = Number(optionObject.position || index + 1);
    const values = Array.isArray(optionObject.values)
      ? optionObject.values
      : variants.map((variant) => variant[`option${position}`]).filter(Boolean);

    return { name: optionObject.name || `Option ${position}`, position, values: uniquePreserveCase(values) };
  });
}

function findVisualOptionPositions(optionDefinitions) {
  const positions = optionDefinitions
    .filter((option) => /color|colour|tono|modelo|estilo|diseno|diseño/i.test(option.name || ""))
    .map((option) => option.position);

  if (positions.length > 0) return positions;
  return optionDefinitions.length ? [optionDefinitions[0].position] : [];
}

function labelFromVariant(variant, optionDefinitions, visualPositions) {
  const values = [];
  for (const option of optionDefinitions) {
    if (!visualPositions.includes(option.position)) continue;
    const value = variant[`option${option.position}`];
    if (value) values.push(value);
  }

  if (values.length > 0) return values.join(" / ");
  return variant.title || "Foto";
}

function productSummary(product, publicShopDomain) {
  return {
    handle: product.handle,
    title: product.title || product.handle,
    url: `https://${publicShopDomain}${product.url || `/products/${product.handle}`}`,
  };
}

function handleKeys(handle) {
  const decoded = safeDecode(handle);
  return uniqueCandidates([handle, decoded, encodeURIComponent(decoded), slugifyHandle(decoded)]);
}

function slugifyHandle(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (typeof tags === "string") return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function normalizeImageUrl(value) {
  if (!value) return "";
  const text = String(value);
  if (text.startsWith("//")) return `https:${text}`;
  return text;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function uniqueCandidates(values) {
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

function uniquePreserveCase(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function detectPresentationRequest(root) {
  if (!root) return false;
  if (root.presentation === true || root.presentation === "true") return true;
  return String(root.purpose || "").toLowerCase() === "presentation";
}

const BEFORE_AFTER_PATTERN = /(antes|despues|before|after)/;
const TESTIMONIAL_PATTERN = /(testimoni|resena|review|opinion|comentario)/;

// Lista las imagenes del producto con un "haystack" normalizado (alt + nombre
// de archivo) para clasificar antes/despues y testimonios sin depender solo
// del alt (muchas tiendas solo describen la foto en el nombre del archivo).
function listProductImages(product) {
  const items = [];
  const seen = new Set();
  const push = (rawUrl, alt) => {
    const url = normalizeImageUrl(rawUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({
      url,
      haystack: normalizeSearchText([alt, fileNameFromUrl(url)].filter(Boolean).join(" ")),
    });
  };

  for (const media of Array.isArray(product.media) ? product.media : []) {
    if (!media || (media.media_type && media.media_type !== "image")) continue;
    push(media.src || media.preview_image?.src, media.alt);
  }
  for (const image of product.images || []) {
    push(image?.src || image, image?.alt);
  }
  return items;
}

function fileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
}

// Separa las fotos del producto en: principal, segunda (antes/despues si
// existe) y testimonio, para la secuencia de presentacion.
function classifyPresentationImages(product) {
  const images = listProductImages(product);
  const testimonialImg = images.find((img) => TESTIMONIAL_PATTERN.test(img.haystack)) || null;
  const regular = images.filter((img) => img !== testimonialImg);
  const beforeAfterImg = regular.find((img) => BEFORE_AFTER_PATTERN.test(img.haystack)) || null;
  const plain = regular.filter((img) => img !== beforeAfterImg);

  const photos = [];
  const principal = plain[0] || beforeAfterImg;
  if (principal) {
    photos.push({ ...mediaItem(product, "Principal", principal.url), role: "principal" });
  }
  if (beforeAfterImg && beforeAfterImg !== principal) {
    photos.push({ ...mediaItem(product, "Antes y despues", beforeAfterImg.url), role: "antes_despues" });
  } else if (plain[1]) {
    photos.push({ ...mediaItem(product, "Foto 2", plain[1].url), role: "foto_2" });
  }

  return {
    photos,
    beforeAfterAvailable: Boolean(beforeAfterImg),
    testimonial: testimonialImg
      ? { ...mediaItem(product, "Testimonio", testimonialImg.url), role: "testimonio" }
      : null,
  };
}

// Fallback de video: media de tipo video subida al producto en Shopify
// (product.media del endpoint publico .js), cuando no hay metacampo custom.video.
function findInlineProductVideo(product) {
  for (const media of Array.isArray(product.media) ? product.media : []) {
    if (!media || media.media_type !== "video") continue;
    const sources = (Array.isArray(media.sources) ? media.sources : []).map((source) => ({
      url: source?.url,
      mimeType: source?.mime_type || source?.mimeType || "",
      format: source?.format || "",
      height: source?.height,
    }));
    const src = pickVideoSource(sources);
    if (src?.url) return videoItem(product, normalizeImageUrl(src.url), src.mimeType || "video/mp4");
  }
  return null;
}

// Respuesta del modo presentacion: media ordenada y con rol (principal,
// antes_despues/foto_2, video, testimonio) para la secuencia de mensajes.
// knownAddress (vars.known_address del flujo) decide el cierre: confirmar la
// direccion guardada del cliente recurrente o preguntar Lima/provincia.
async function buildPresentationResponse(config, product, knownAddress = null) {
  const classified = classifyPresentationImages(product);
  let photos = classified.photos;
  if (photos.length === 0) {
    photos = buildMediaItems(product, { limit: 2, requestedVariant: "" })
      .map((item, index) => ({ ...item, role: index === 0 ? "principal" : "foto_2" }));
  }

  // Los metacampos de imagen (custom.testimonio / custom.antes_y_despues)
  // tienen prioridad sobre la clasificacion por alt/nombre de archivo.
  const mfImages = await fetchPresentationMetafieldImages(config, product);
  if (mfImages.beforeAfter && !photos.some((p) => p.url === mfImages.beforeAfter)) {
    const item = { ...mediaItem(product, "Antes y despues", mfImages.beforeAfter), role: "antes_despues" };
    const secondIndex = photos.findIndex((p) => p.role !== "principal");
    if (secondIndex >= 0) photos.splice(secondIndex, 1, item);
    else photos.push(item);
  }
  const testimonial = mfImages.testimonial
    ? { ...mediaItem(product, "Testimonio", mfImages.testimonial), role: "testimonio" }
    : classified.testimonial;

  const vres = await fetchProductVideo(config, product);
  let video = vres.item || findInlineProductVideo(product);
  if (video) video = { ...video, role: "video" };

  const media = [...photos];
  if (video) media.push(video);
  if (testimonial) media.push(testimonial);

  if (media.length === 0) {
    return {
      ok: false,
      found: true,
      presentation: true,
      videoAvailable: false,
      beforeAfterAvailable: false,
      testimonialAvailable: false,
      reason: "media_not_found",
      product: productSummary(product, config.publicShopDomain),
      message: "El producto existe, pero no encontre fotos ni video publicos: omite los mensajes de media y sigue la secuencia solo con los textos.",
    };
  }

  return {
    ok: true,
    found: true,
    presentation: true,
    videoAvailable: Boolean(video),
    beforeAfterAvailable: Boolean(mfImages.beforeAfter) || classified.beforeAfterAvailable,
    testimonialAvailable: Boolean(testimonial),
    product: productSummary(product, config.publicShopDomain),
    media,
    count: media.length,
    sendMediaInstructions: [
      "Usa la herramienta send_media para enviar cada item como media real de WhatsApp (los de type video como video, los de type image como imagen), un mensaje por item y en el orden del array, llamando la herramienta pause (2-4 segundos, variando) entre item e item.",
      "No escribas ni pegues estas URLs en texto al cliente.",
      "No uses Markdown de imagen ni de enlace.",
    ].join(" "),
    followUpText: [
      "Secuencia de presentacion:",
      "1) saludo corto de 1 linea;",
      "2) send_media de la imagen rol principal;",
      "3) send_media de la segunda imagen (rol antes_despues si existe);",
      "4) si hay item rol video: send_media del video con un caption corto de UNA linea que lo presente (ej \"Mira este video corto del [producto] 🎬\"), SIN mensaje de texto separado antes;",
      "5) mensaje de texto con precio y promociones;",
      "6) si hay item rol testimonio: send_media de esa imagen;",
      knownAddress
        ? `7) cierra con send_buttons: bodyText "¿Te lo enviamos a ${knownAddress}, como la vez pasada? 😊" y botones "Si, la misma" y "Cambiar direccion".`
        : '7) cierra con send_buttons: bodyText "¿El envio seria para *Lima* o para *provincia*? 😊" y botones "Lima" y "Provincia".',
      "Omite sin avisar los pasos cuyo item no exista. Nunca pegues URLs en el texto.",
    ].join(" "),
  };
}

function detectTestimonialRequest(queryText, root) {
  if (root && (root.includeTestimonial === true || root.wantsTestimonial === true || root.testimonial === true)) return true;
  return TESTIMONIAL_PATTERN.test(normalizeSearchText(queryText));
}

function detectVideoRequest(queryText, root) {
  if (root && (root.includeVideo === true || root.wantsVideo === true || root.video === true)) return true;
  const flag = String((root && (root.mediaType || root.media_type)) || "").toLowerCase();
  if (flag === "video") return true;
  return /\bvideos?\b/i.test(String(queryText || ""));
}

// Lee el metacampo custom.video (referencia a archivo Video) del producto via
// Admin API. Devuelve { item, debug }: item es el media listo para send_media (o
// null), y debug explica por que no se resolvio (para el modo diagnostico).
async function fetchProductVideo(config, product) {
  const debug = {
    tokenPresent: Boolean(config.adminToken),
    productId: product?.id || null,
    metafieldPresent: false,
    metafieldType: null,
    referenceType: null,
    fileStatus: null,
    sourcesCount: 0,
    urlPicked: false,
    error: null,
  };
  if (!config.adminToken || !product?.id) return { item: null, debug };

  try {
    const query = `#graphql
      query ProductVideo($id: ID!, $ns: String!, $key: String!) {
        product(id: $id) {
          metafield(namespace: $ns, key: $key) {
            type
            reference {
              __typename
              ... on Video { fileStatus sources { url mimeType format height width } }
              ... on GenericFile { url mimeType }
              ... on MediaImage { image { url } }
            }
          }
        }
      }`;
    const data = await shopifyAdminGraphql(config, query, {
      id: `gid://shopify/Product/${product.id}`,
      ns: VIDEO_METAFIELD_NAMESPACE,
      key: VIDEO_METAFIELD_KEY,
    });
    const mf = data?.product?.metafield;
    debug.metafieldPresent = Boolean(mf);
    debug.metafieldType = mf?.type || null;
    const ref = mf?.reference;
    if (!ref) return { item: null, debug };
    debug.referenceType = ref.__typename || null;

    let url = "";
    let mimeType = "video/mp4";
    if (ref.__typename === "Video") {
      debug.fileStatus = ref.fileStatus || null;
      const sources = Array.isArray(ref.sources) ? ref.sources : [];
      debug.sourcesCount = sources.length;
      const src = pickVideoSource(sources);
      if (src) { url = src.url; mimeType = src.mimeType || mimeType; }
    } else if (ref.__typename === "GenericFile" && ref.url) {
      url = ref.url;
      mimeType = ref.mimeType || mimeType;
    }

    url = normalizeImageUrl(url);
    debug.urlPicked = Boolean(url);
    if (!url) return { item: null, debug };
    return { item: videoItem(product, url, mimeType), debug };
  } catch (error) {
    debug.error = error instanceof Error ? error.message : String(error);
    return { item: null, debug };
  }
}

// Lee los metacampos de imagen del namespace custom (testimonio y antes y
// despues) via Admin API: son referencias a archivo y NO vienen en el
// products.json publico. Las keys se detectan por patron (testimoni... /
// antes|despues|before|after) para tolerar variantes como antes_y_despues.
async function fetchPresentationMetafieldImages(config, product) {
  const result = { testimonial: null, beforeAfter: null };
  if (!config.adminToken || !product?.id) return result;

  try {
    const query = `#graphql
      query ProductPresentationImages($id: ID!, $ns: String!) {
        product(id: $id) {
          metafields(first: 30, namespace: $ns) {
            nodes {
              key
              reference {
                __typename
                ... on MediaImage { image { url } }
                ... on GenericFile { url mimeType }
              }
            }
          }
        }
      }`;
    const data = await shopifyAdminGraphql(config, query, {
      id: `gid://shopify/Product/${product.id}`,
      ns: VIDEO_METAFIELD_NAMESPACE,
    });
    for (const node of data?.product?.metafields?.nodes || []) {
      const key = normalizeSearchText(node?.key);
      const ref = node?.reference;
      let url = "";
      if (ref?.__typename === "MediaImage") url = ref.image?.url || "";
      else if (ref?.__typename === "GenericFile" && /^image\//i.test(ref.mimeType || "")) url = ref.url || "";
      url = normalizeImageUrl(url);
      if (!url) continue;
      if (!result.testimonial && TESTIMONIAL_PATTERN.test(key)) result.testimonial = url;
      else if (!result.beforeAfter && BEFORE_AFTER_PATTERN.test(key)) result.beforeAfter = url;
    }
  } catch {
    // Sin Admin API (o con error de query) seguimos con la clasificacion
    // por alt/nombre de archivo de las fotos publicas.
  }

  return result;
}

// Elige la fuente mp4 mas liviana (menor altura) para no pasar el limite de
// 16MB de WhatsApp; cae a la primera fuente con url si faltan metadatos.
function pickVideoSource(sources) {
  const mp4 = sources.filter((s) => s && s.url && (/mp4/i.test(s.mimeType || "") || /mp4/i.test(s.format || "")));
  const pool = mp4.length ? mp4 : sources.filter((s) => s && s.url);
  if (pool.length === 0) return null;
  return pool.slice().sort((a, b) => (Number(a.height) || 1e9) - (Number(b.height) || 1e9))[0];
}

function videoItem(product, url, mimeType) {
  return {
    mediaType: "video",
    type: "video",
    label: "Video",
    caption: product.title || "Video",
    url,
    mediaUrl: url,
    mimeType: mimeType || "video/mp4",
  };
}

async function shopifyAdminGraphql(config, query, variables) {
  const response = await fetch(
    `https://${config.adminShopDomain}/admin/api/${config.adminApiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.adminToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (!response.ok) throw new Error(`Admin GraphQL HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors) throw new Error(`Admin GraphQL: ${JSON.stringify(payload.errors)}`);
  return payload.data;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

globalThis.__kenkuProductMediaLookup = {
  buildMediaItems,
  buildPresentationResponse,
  classifyPresentationImages,
  detectPresentationRequest,
  detectTestimonialRequest,
  detectVideoRequest,
  fetchPresentationMetafieldImages,
  fetchProductVideo,
  findInlineProductVideo,
  handleRequest,
  handler,
  pickVideoSource,
  videoItem,
};
