async function handler(request, env) {
  const payload = await readJson(request);
  const edges = Array.isArray(payload.available_edges) ? payload.available_edges : [];

  const vars = payload.execution_context?.vars || payload.vars || {};
  const stage = String(vars.stage || "").toLowerCase();

  const terminalMarkers = [
    "orden_creada",
    "orden creada",
    "no_interesado",
    "no interesado",
    "lead_perdido",
    "lead perdido",
    "reclamo",
    "handoff",
    "derivad",
    "cancel",
  ];

  if (terminalMarkers.some((marker) => stage.includes(marker))) {
    return json({ next_edge: pickEdge(edges, "terminar") });
  }

  // Race condition guard:
  // If the customer writes while the agent is finishing its turn but before the
  // workflow enters wait_for_response, the next step would normally start the
  // follow-up wait and ignore that inbound message until the customer writes
  // again. Detect that case and route back to the agent immediately.
  const unanswered = hasUnansweredInbound(payload);
  if (unanswered && edges.includes("respondio")) {
    return json({ next_edge: "respondio", reason: "unanswered_inbound_after_last_assistant" });
  }

  return json({ next_edge: pickEdge(edges, "seguir") });
}

function hasUnansweredInbound(payload) {
  const messages = collectMessages(payload);
  if (!messages.length) return false;

  let lastInboundIndex = -1;
  let lastOutboundIndex = -1;
  let lastInboundAt = 0;
  let lastOutboundAt = 0;

  messages.forEach((message, index) => {
    const role = roleOf(message);
    const ts = timestampOf(message);
    if (role === "inbound") {
      lastInboundIndex = index;
      if (ts) lastInboundAt = Math.max(lastInboundAt, ts);
    }
    if (role === "outbound") {
      lastOutboundIndex = index;
      if (ts) lastOutboundAt = Math.max(lastOutboundAt, ts);
    }
  });

  if (lastInboundIndex < 0) return false;
  if (lastOutboundIndex < 0) return true;

  // Prefer timestamps when present; fall back to array order.
  if (lastInboundAt || lastOutboundAt) return lastInboundAt > lastOutboundAt;
  return lastInboundIndex > lastOutboundIndex;
}

function collectMessages(payload) {
  const lists = [
    payload.conversation_history,
    payload.messages,
    payload.whatsapp_context?.messages,
    payload.whatsapp_context?.conversation_history,
    payload.execution_context?.conversation_history,
    payload.execution_context?.context?.conversation_history,
  ];

  const out = [];
  for (const list of lists) {
    if (Array.isArray(list)) out.push(...list);
  }

  // Some workflow payloads include flow events. Use only obvious chat events.
  const flowEvents = payload.flow_events;
  if (Array.isArray(flowEvents)) {
    for (const event of flowEvents) {
      const p = event.payload || event.data || event;
      if (!p) continue;
      if (p.role || p.direction || p.content || p.message || p.text) out.push(p);
    }
  }

  return out;
}

function roleOf(message) {
  const role = String(message.role || "").toLowerCase();
  const direction = String(message.direction || message.kapso?.direction || "").toLowerCase();
  const type = String(message.type || message.event_type || "").toLowerCase();

  if (["user", "customer", "inbound", "incoming"].includes(role)) return "inbound";
  if (["assistant", "bot", "agent", "outbound", "business"].includes(role)) return "outbound";
  if (["in", "inbound", "incoming", "received"].includes(direction)) return "inbound";
  if (["out", "outbound", "outgoing", "sent"].includes(direction)) return "outbound";
  if (type.includes("user") || type.includes("inbound")) return "inbound";
  if (type.includes("assistant") || type.includes("outbound")) return "outbound";

  return "";
}

function timestampOf(message) {
  const raw = message.timestamp || message.created_at || message.sent_at || message.received_at || message.message_timestamp;
  if (raw === undefined || raw === null || raw === "") return 0;
  if (typeof raw === "number") return raw > 1e12 ? raw : raw * 1000;
  const parsed = Date.parse(String(raw));
  if (Number.isFinite(parsed)) return parsed;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  return 0;
}

function pickEdge(edges, preferred) {
  if (edges.includes(preferred)) return preferred;
  return edges[0] || preferred;
}

async function readJson(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
