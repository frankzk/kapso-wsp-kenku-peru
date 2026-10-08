const MIN_SECONDS = 1;
const MAX_SECONDS = 5;
const DEFAULT_SECONDS = 3;

// Herramienta del agente: espera N segundos (2-4 tipico) antes de devolver,
// para que los mensajes de la secuencia lleguen con ritmo humano y no como
// rafaga instantanea. No envia nada: solo duerme.

async function handler(request, env = globalThis) {
  return handleRequest(request, env);
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

async function handleRequest(request) {
  let seconds = DEFAULT_SECONDS;
  try {
    const payload = await request.json();
    const input = payload && typeof payload.input === "object" && payload.input ? payload.input : payload || {};
    const requested = Number(input.seconds);
    if (Number.isFinite(requested)) {
      seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, requested));
    }
  } catch {
    // sin input: usar el default
  }

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  return new Response(
    JSON.stringify({ ok: true, waited_seconds: seconds, message: "Pausa lista: envia el siguiente mensaje." }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}

globalThis.__kenkuPause = { handler, handleRequest };
