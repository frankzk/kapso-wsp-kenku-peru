#!/usr/bin/env node
// Obtiene el Admin API access token (shpat_...) de una tienda para la app
// interna del Dev Dashboard, via OAuth authorization code grant.
//
// La app kapso-wsp-aurela-peru tiene registrada la URL de redireccion
// http://127.0.0.1:3456/shopify/callback, asi que este script levanta un
// servidor local en ese puerto, imprime el link de instalacion, y cuando
// apruebas la instalacion en el admin de Shopify, recibe el ?code=... y lo
// canjea por el token offline de esa tienda.
//
// Uso:
//   node scripts/get-shopify-token.mjs --store kenkuperu \
//     --client-id <CLIENT_ID> --client-secret <CLIENT_SECRET>
//
// El Client ID y el Client secret estan en dev.shopify.com → la app →
// Configuracion. El token se imprime SOLO en la terminal: pegalo en la config
// de las funciones de Kapso (SHOPIFY_ADMIN_ACCESS_TOKEN). No lo comitees.

import http from "node:http";
import crypto from "node:crypto";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[name.replace(/-/g, "_").toUpperCase()] || fallback;
}

const store = arg("store");            // handle, ej: kenkuperu
const clientId = arg("client-id");
const clientSecret = arg("client-secret");
const port = Number(arg("port", "3456"));
const callbackPath = "/shopify/callback";

if (!store || !clientId || !clientSecret) {
  console.error("Faltan argumentos. Uso:\n  node scripts/get-shopify-token.mjs --store kenkuperu --client-id XXX --client-secret YYY");
  process.exit(1);
}

const shop = store.includes(".") ? store : `${store}.myshopify.com`;
const redirectUri = `http://127.0.0.1:${port}${callbackPath}`;
const state = crypto.randomBytes(12).toString("hex");

// Sin parametro scope: la app usa los alcances declarados en su configuracion
// del Dev Dashboard (instalacion administrada).
const installUrl =
  `https://${shop}/admin/oauth/authorize` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&state=${state}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname !== callbackPath) { res.writeHead(404); res.end(); return; }

  const code = url.searchParams.get("code");
  const gotState = url.searchParams.get("state");
  const gotShop = url.searchParams.get("shop") || shop;

  if (!code) { res.writeHead(400); res.end("Falta ?code en el callback"); return; }
  if (gotState !== state) { res.writeHead(400); res.end("state invalido, reintenta"); return; }

  try {
    const r = await fetch(`https://${gotShop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      console.error("\nError al canjear el codigo:", r.status, JSON.stringify(data));
      res.writeHead(500); res.end("Fallo el canje del codigo. Revisa la terminal.");
      process.exit(1);
    }
    console.log(`\n✅ Token de ${gotShop}:\n`);
    console.log(`   SHOPIFY_ADMIN_ACCESS_TOKEN = ${data.access_token}\n`);
    console.log(`   scopes: ${data.scope}\n`);
    console.log("Pegalo en la config de las funciones en Kapso. NO lo subas a git.");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>Listo ✅</h2><p>El token se imprimio en la terminal. Ya puedes cerrar esta pestaña.</p>");
  } catch (e) {
    console.error("\nError:", e.message);
    res.writeHead(500); res.end("Error, revisa la terminal.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 200);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Escuchando en ${redirectUri}\n`);
  console.log("1) Abre este link de instalacion en el navegador donde estas logueado en Shopify:\n");
  console.log(`   ${installUrl}\n`);
  console.log("2) Aprueba la instalacion para la tienda. Shopify redirigira al callback local");
  console.log("   y aqui aparecera el shpat_ de esa tienda.\n");
});
