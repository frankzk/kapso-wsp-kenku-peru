// verify-payment-account: dice si un numero de cuenta que menciono el cliente es
// de Kenku o no. Deterministico: el LLM NO decide, solo pregunta y obedece.
//
// Existe por un caso concreto: un tercero se hace pasar por Kenku en otro chat,
// le pide a la clienta que pague a su Yape, y ella despues nos escribe "ya
// pague al 9XX". Sin esta funcion el bot no puede distinguir esa estafa de un
// pago legitimo a una de las cuentas alternativas de Kenku, asi que lo unico
// seguro que puede hacer es derivar sin opinar — y la clienta se queda tranquila
// mientras pierde la plata.
//
// REGLA DE SEGURIDAD CENTRAL: si no hay lista disponible, o falla el fetch, esta
// funcion devuelve "sin_lista" y NUNCA "desconocida". Decirle a una clienta que
// su cuenta no es nuestra cuando en realidad no pudimos verificar es
// exactamente el bug que esta funcion viene a arreglar.

// Fuente de la lista, en orden de preferencia:
//   1. PAYMENT_ACCOUNTS_URL  -> endpoint del dashboard (fuente de verdad)
//   2. PAYMENT_ACCOUNTS      -> JSON en un secret (respaldo configurable)
// Si no hay ninguna, se responde sin_lista.
const FETCH_TIMEOUT_MS = 4000;

function cfg(env = globalThis) {
  const g = (a, b) => env?.[a] || env?.[b] || globalThis[a] || globalThis[b];
  return {
    url: g("PAYMENT_ACCOUNTS_URL", "pAYMENTACCOUNTSURL"),
    inline: g("PAYMENT_ACCOUNTS", "pAYMENTACCOUNTS"),
  };
}

// Solo digitos. Un Yape se escribe "930 555 309", "930555309", "+51 930 555 309"
// o "930-555-309"; una cuenta bancaria "191-2434540-0-12". Comparar en crudo
// daria falsos negativos, que es justo lo que no podemos permitirnos.
function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

// Dos numeros peruanos son el mismo si coinciden sus ultimos 9 digitos (el
// prefijo 51 puede venir o no). Para cuentas bancarias, largas y sin prefijo,
// se exige coincidencia total.
function sameNumber(a, b) {
  const x = digits(a), y = digits(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 9 && y.length >= 9 && x.length <= 11 && y.length <= 11) {
    return x.slice(-9) === y.slice(-9);
  }
  return false;
}

function normalizeAccounts(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.accounts || raw?.cuentas || []);
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => ({
      number: a.number ?? a.numero ?? a.cuenta ?? "",
      name: a.name ?? a.nombre ?? "",
      holder: a.holder ?? a.titular ?? a.aNombreDe ?? "",
      type: a.type ?? a.tipo ?? "",
      principal: Boolean(a.principal ?? a.isPrincipal ?? a.yapePrincipal),
    }))
    .filter((a) => digits(a.number));
}

async function loadAccounts(env) {
  const c = cfg(env);
  if (c.url) {
    try {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
      const res = await fetch(c.url, ctrl ? { signal: ctrl.signal } : undefined);
      if (t) clearTimeout(t);
      if (res.ok) {
        const accounts = normalizeAccounts(await res.json());
        if (accounts.length) return { accounts, source: "dashboard" };
      }
    } catch { /* cae al respaldo */ }
  }
  if (c.inline) {
    try {
      const accounts = normalizeAccounts(JSON.parse(c.inline));
      if (accounts.length) return { accounts, source: "secret" };
    } catch { /* json invalido: se trata como sin lista */ }
  }
  return { accounts: [], source: null };
}

function label(a) {
  return [a.name, a.holder && `a nombre de ${a.holder}`].filter(Boolean).join(" ") || "cuenta de Kenku";
}

async function handleRequest(request, env = globalThis) {
  try {
    const payload = await readJson(request);
    const input = isPlainObject(payload.input) ? payload.input : payload;
    const asked = input.number ?? input.numero ?? input.cuenta ?? input.account ?? "";

    if (!digits(asked)) {
      return json({
        ok: true, status: "sin_numero",
        message: "No vino ningun numero para verificar. Pedile al cliente que lo escriba y volve a llamar.",
      });
    }

    const { accounts, source } = await loadAccounts(env);

    // Sin lista NO se afirma nada. Nunca "desconocida" por falta de datos.
    if (!accounts.length) {
      return json({
        ok: true, status: "sin_lista", source: null,
        message: "NO se pudo verificar (sin lista de cuentas). NO le digas al cliente que la cuenta es o no es nuestra. notify_team + handoff_to_human y decile que una asesora lo confirma antes de dar el pago por recibido.",
      });
    }

    const hit = accounts.find((a) => sameNumber(a.number, asked));
    if (hit) {
      return json({
        ok: true,
        status: hit.principal ? "principal" : "nuestra",
        source, account: label(hit),
        message: hit.principal
          ? "Es la cuenta PRINCIPAL de Kenku. Podes seguir el flujo normal de voucher."
          : `Es una cuenta valida de Kenku (${label(hit)}). NO le digas que se equivoco. Segui el flujo normal de voucher.`,
      });
    }

    return json({
      ok: true, status: "desconocida", source,
      // Se avisa en tono de "no me figura", no de "no es nuestra". La lista puede
      // estar desactualizada (una cuenta nueva que todavia no se cargo), y afirmarle
      // a una clienta que una cuenta real de Kenku no lo es la manda a cancelar un
      // pago legitimo. El efecto protector es el mismo —que NO pague ahi hasta que
      // una persona confirme— sin afirmar de mas.
      message: "Ese numero NO figura entre las cuentas de Kenku. Avisale CLARO y sin acusarlo: que ese numero no te figura entre nuestras cuentas y que por seguridad NO haga (ni repita) el pago ahi hasta que una asesora se lo confirme, que le escribe en minutos. Luego notify_team con el numero tal cual y la nota \"cuenta_no_reconocida\", y handoff_to_human URGENTE.",
    });
  } catch (error) {
    return json({
      ok: false, status: "sin_lista",
      error: String(error?.message || error).slice(0, 200),
      message: "Fallo la verificacion. NO afirmes nada sobre la cuenta: notify_team + handoff_to_human.",
    });
  }
}

async function handler(request, env = globalThis) { return handleRequest(request, env); }
if (typeof addEventListener === "function") {
  addEventListener("fetch", (e) => e.respondWith(handleRequest(e.request, globalThis)));
}
async function readJson(request) {
  try { return (await request.json()) || {}; } catch { return {}; }
}
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
globalThis.__kenkuVerifyAccount = { handler, handleRequest, sameNumber, digits, normalizeAccounts };
