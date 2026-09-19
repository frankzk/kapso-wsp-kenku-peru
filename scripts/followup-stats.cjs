// Mide la cadena de seguimientos del kenku-sales-bot con datos reales:
// cuantas conversaciones reciben cada paso, cuantas responden despues de cada
// uno, a que hora de Lima se envian y que responden los que se quejan.
//
// Uso: KAPSO_API_KEY=... node scripts/followup-stats.cjs [dias] [maxConversaciones]
// Ej:  KAPSO_API_KEY=... node scripts/followup-stats.cjs 7 120
//
// Los textos de STEPS deben coincidir con los mensajes de los nodos fu-s1..fu-s7
// del workflow: si se reescribe un seguimiento, actualizar aqui su `match`.
const API = "https://api.kapso.ai/platform/v1";
const KEY = process.env.KAPSO_API_KEY;
const DAYS = Number(process.argv[2] || 7);
const MAX_CONVERSATIONS = Number(process.argv[3] || 300);

const STEPS = [
  { id: "s1", match: "¿te quedó alguna duda? Con gusto te la respondo" },
  { id: "s2", match: "Cuando gustes lo retomamos" },
  { id: "s3", match: "Nuestras promos *3x2*" },
  { id: "s4", match: "Si algo te frenó" },
  { id: "s5", match: "Aquí sigo por si lo quieres retomar" },
  { id: "s6", match: "Te dejo una opción para animarte" },
  { id: "s7", match: "Último mensajito, prometido" },
];

const QUEJAS = /(no me escrib|deja de escrib|dejen de escrib|no moleste|molest|spam|ya te dije|no me interesa|no quiero nada|bloque)/i;

async function get(path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${API}${path}`, { headers: { "X-API-Key": KEY, "Content-Type": "application/json" } });
    if (response.ok) return response.json();
    if (response.status >= 500) continue;
    throw new Error(`HTTP ${response.status} en ${path}`);
  }
  throw new Error(`fallo tras 3 intentos: ${path}`);
}

function textOf(message) {
  return message?.text?.body || message?.kapso?.content?.text?.body || message?.kapso?.content?.body || "";
}

function millisOf(message) {
  const ts = message?.timestamp;
  if (typeof ts === "number") return ts * 1000;
  if (typeof ts === "string" && /^\d+$/.test(ts)) return Number(ts) * 1000;
  return Date.parse(message?.kapso?.created_at || ts || 0) || 0;
}

function limaHour(ms) {
  return new Date(ms - 5 * 3600 * 1000).getUTCHours();
}

(async () => {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const conversations = [];
  let cursor = null;

  while (conversations.length < MAX_CONVERSATIONS) {
    const query = `/whatsapp/conversations?limit=100&created_after=${encodeURIComponent(since)}${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`;
    const page = await get(query);
    const rows = page.data || [];
    conversations.push(...rows);
    cursor = page.paging?.cursors?.after;
    if (!cursor || rows.length === 0) break;
  }

  const sample = conversations.slice(0, MAX_CONVERSATIONS);
  const sent = new Map(STEPS.map((s) => [s.id, 0]));
  const replied = new Map(STEPS.map((s) => [s.id, 0]));
  const hours = new Map();
  const quejas = [];
  let withAnyFollowup = 0;
  let inboundAfterFirstBot = 0;
  let totalFollowups = 0;
  const perConversation = [];

  for (const conversation of sample) {
    let messages = [];
    let messageCursor = null;
    for (let page = 0; page < 4; page += 1) {
      const query = `/whatsapp/messages?conversation_id=${conversation.id}&limit=100${messageCursor ? `&after=${encodeURIComponent(messageCursor)}` : ""}`;
      const payload = await get(query);
      const rows = payload.data || [];
      messages.push(...rows);
      messageCursor = payload.paging?.cursors?.after;
      if (!messageCursor || rows.length === 0) break;
    }

    messages = messages
      .map((message) => ({
        at: millisOf(message),
        out: message?.kapso?.direction === "outbound",
        text: textOf(message),
      }))
      .filter((message) => message.at)
      .sort((a, b) => a.at - b.at);

    const inbound = messages.filter((m) => !m.out);
    const steps = [];

    for (const message of messages) {
      if (!message.out) continue;
      const step = STEPS.find((s) => message.text.includes(s.match));
      if (!step) continue;
      steps.push({ id: step.id, at: message.at });
      sent.set(step.id, sent.get(step.id) + 1);
      totalFollowups += 1;
      const hour = limaHour(message.at);
      hours.set(hour, (hours.get(hour) || 0) + 1);
      if (inbound.some((m) => m.at > message.at && m.at - message.at < 24 * 3600 * 1000)) {
        replied.set(step.id, replied.get(step.id) + 1);
      }
    }

    if (steps.length > 0) withAnyFollowup += 1;
    if (inbound.length > 1) inboundAfterFirstBot += 1;
    for (const message of inbound) {
      if (QUEJAS.test(message.text)) quejas.push(message.text.slice(0, 90));
    }
    perConversation.push({ id: conversation.id, steps: steps.length, inbound: inbound.length });
  }

  console.log(`Conversaciones creadas en los ultimos ${DAYS} dias: ${conversations.length} (analizadas ${sample.length})`);
  console.log(`Con al menos un seguimiento automatico: ${withAnyFollowup} (${Math.round(100 * withAnyFollowup / sample.length)}%)`);
  console.log(`Mensajes de seguimiento enviados en total: ${totalFollowups}\n`);
  console.log("paso  enviados  respondieron en 24h");
  for (const step of STEPS) {
    const s = sent.get(step.id);
    const r = replied.get(step.id);
    console.log(`${step.id}     ${String(s).padStart(5)}     ${String(r).padStart(4)}  ${s ? `(${Math.round(100 * r / s)}%)` : ""}`);
  }

  const distribution = new Map();
  for (const row of perConversation) distribution.set(row.steps, (distribution.get(row.steps) || 0) + 1);
  console.log("\nseguimientos por conversacion:");
  [...distribution.entries()].sort((a, b) => a[0] - b[0]).forEach(([n, count]) => console.log(`  ${n} seguimiento(s): ${count} conversaciones`));

  console.log("\nenvios por hora de Lima:");
  [...hours.entries()].sort((a, b) => a[0] - b[0]).forEach(([hour, count]) => console.log(`  ${String(hour).padStart(2, "0")}:00  ${"#".repeat(Math.min(count, 60))} ${count}`));

  console.log(`\nrespuestas con queja/rechazo detectadas: ${quejas.length}`);
  quejas.slice(0, 15).forEach((q) => console.log("  -", q));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
