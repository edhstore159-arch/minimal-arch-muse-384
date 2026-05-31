// Backend mínimo para WhatsApp via Baileys.
// Deploy no Render como Web Service: Build `npm install`, Start `npm start`.
// Endpoints expostos sob /api/* para casar com o frontend (VITE_BACKEND_URL).

import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import { rm, mkdir } from "node:fs/promises";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT) || 8080;
const AUTH_DIR = process.env.AUTH_DIR || "./auth";
const logger = pino({ level: "warn" });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

// ---- Estado do socket Baileys ----
let sock = null;
let currentQR = null;
let connectionState = "disconnected"; // connecting | open | disconnected
let lastError = null;
let starting = false;
let whatsappConfig = { provider: "baileys", bot_enabled: true };

// ---- Armazenamento em memória de contatos e mensagens ----
const contactsStore = new Map(); // jid -> contato
const messagesStore = new Map(); // jid -> Array<mensagens>

const jidToPhone = (jid) => String(jid || "").split("@")[0].replace(/\D/g, "");
const extractText = (m) =>
  m?.message?.conversation ||
  m?.message?.extendedTextMessage?.text ||
  m?.message?.imageMessage?.caption ||
  m?.message?.videoMessage?.caption ||
  m?.message?.documentMessage?.caption ||
  "";

const upsertContact = (jid, patch = {}) => {
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  const prev = contactsStore.get(jid) || {
    id: jid,
    jid,
    phone: jidToPhone(jid),
    name: jidToPhone(jid),
    last_message: "",
    last_message_at: new Date().toISOString(),
    unread: 0,
  };
  const next = { ...prev, ...patch };
  contactsStore.set(jid, next);
  return next;
};

const appendMessage = (jid, msg) => {
  if (!jid) return;
  const list = messagesStore.get(jid) || [];
  list.push(msg);
  messagesStore.set(jid, list);
};

// ---- Atendente automático com IA (Emergent ou Lovable AI Gateway) ----
const EMERGENT_API_KEY = process.env.EMERGENT_API_KEY || process.env.EMERGENT_LLM_KEY || "";
const EMERGENT_BASE_URL =
  process.env.EMERGENT_BASE_URL || "https://integrations.emergentagent.com/llm/v1";
const EMERGENT_MODEL = process.env.EMERGENT_MODEL || "gpt-4o-mini";
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY || process.env.VITE_LOVABLE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "google/gemini-2.5-flash";
const AI_SYSTEM_PROMPT =
  process.env.AI_SYSTEM_PROMPT ||
  "Você é a Kenia, assistente virtual de um escritório de advocacia. Responda em português brasileiro, de forma cordial, objetiva e empática. Faça perguntas para qualificar o lead (área do direito, urgência, descrição do caso, cidade). Nunca prometa resultado jurídico. Mantenha respostas curtas (até 3 frases).";
const aiHistory = new Map(); // jid -> [{role, content}]

async function callAI(messagesPayload) {
  const useEmergent = Boolean(EMERGENT_API_KEY);
  if (!useEmergent && !LOVABLE_API_KEY) {
    return { ok: false, error: "Nenhuma chave de IA configurada (EMERGENT_API_KEY ou LOVABLE_API_KEY)." };
  }
  const endpoint = useEmergent
    ? `${EMERGENT_BASE_URL.replace(/\/$/, "")}/chat/completions`
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const apiKey = useEmergent ? EMERGENT_API_KEY : LOVABLE_API_KEY;
  const model = useEmergent ? EMERGENT_MODEL : AI_MODEL;
  const provider = useEmergent ? "emergent" : "lovable";
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: messagesPayload }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, provider, endpoint, model, status: resp.status, error: errText.slice(0, 500) };
    }
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, provider, endpoint, model, error: "Resposta vazia da IA.", raw: data };
    return { ok: true, provider, endpoint, model, reply };
  } catch (e) {
    return { ok: false, provider, endpoint, model, error: e?.message || String(e) };
  }
}

const autoReplyDebug = { last: null, history: [] };
function recordAutoReply(entry) {
  const stamped = { at: new Date().toISOString(), ...entry };
  autoReplyDebug.last = stamped;
  autoReplyDebug.history.unshift(stamped);
  autoReplyDebug.history = autoReplyDebug.history.slice(0, 30);
  console.log("[autoReply]", JSON.stringify(stamped));
}

async function autoReply(jid, userText, contactName) {
  recordAutoReply({ step: "trigger", jid, userText: String(userText || "").slice(0, 200), hasEmergent: Boolean(EMERGENT_API_KEY), hasLovable: Boolean(LOVABLE_API_KEY), botEnabled: whatsappConfig.bot_enabled, connectionState });
  if (!sock || connectionState !== "open") {
    recordAutoReply({ step: "skip_socket", jid, connectionState });
    return;
  }
  const history = aiHistory.get(jid) || [];
  const messagesPayload = [
    { role: "system", content: `${AI_SYSTEM_PROMPT}\nNome do contato: ${contactName || "Cliente"}.` },
    ...history.slice(-10),
    { role: "user", content: userText },
  ];
  const result = await callAI(messagesPayload);
  if (!result.ok) {
    recordAutoReply({ step: "ai_fail", jid, result });
    return;
  }
  const reply = result.reply;
  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: reply });
  aiHistory.set(jid, history.slice(-20));
  try { await sock.sendPresenceUpdate("composing", jid); } catch {}
  await new Promise((r) => setTimeout(r, 600));
  try {
    const providerResult = await sock.sendMessage(jid, { text: reply });
    const out = outboundMessage(reply, jid, providerResult);
    upsertContact(jid, { last_message: out.text, last_message_at: out.created_at });
    appendMessage(jid, { id: out.id, text: out.text, from_me: true, created_at: out.created_at });
    recordAutoReply({ step: "sent", jid, provider: result.provider, model: result.model, reply: reply.slice(0, 200) });
  } catch (e) {
    recordAutoReply({ step: "send_error", jid, error: e?.message || String(e) });
  }
}

async function closeSock() {
  try { sock?.end?.(); } catch {}
  try { sock?.ws?.close?.(); } catch {}
  sock = null;
  starting = false;
}

async function startSock() {
  if (starting) return;
  starting = true;
  connectionState = "connecting";
  let state;
  let saveCreds;
  let version;
  try {
    ({ state, saveCreds } = await useMultiFileAuthState(AUTH_DIR));
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    starting = false;
    connectionState = "disconnected";
    lastError = e?.message || String(e);
    throw e;
  }

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ["Kenia", "Chrome", "1.0"],
  });
  const activeSock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    if (sock !== activeSock) return;
    const { connection, lastDisconnect, qr } = u;
    if (qr) currentQR = qr;
    if (connection) connectionState = connection === "open" ? "open" : connection;
    if (connection === "open") {
      currentQR = null;
      lastError = null;
      starting = false;
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode || new Boom(lastDisconnect?.error)?.output?.statusCode;
      lastError = lastDisconnect?.error?.message || null;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      await closeSock();
      starting = false;
      connectionState = shouldReconnect ? "disconnected" : "logged_out";
      if (shouldReconnect) setTimeout(() => startSock().catch(() => {}), 2000);
    }
  });

  // Capturar mensagens recebidas/enviadas para alimentar a lista de contatos
  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (sock !== activeSock || !Array.isArray(messages)) return;
    for (const m of messages) {
      const jid = m?.key?.remoteJid;
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const text = extractText(m);
      if (!text) continue;
      const fromMe = Boolean(m?.key?.fromMe);
      const created_at = m?.messageTimestamp
        ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();
      const name = m?.pushName || jidToPhone(jid);
      const prev = contactsStore.get(jid);
      upsertContact(jid, {
        name: prev?.name && prev.name !== jidToPhone(jid) ? prev.name : name,
        last_message: text,
        last_message_at: created_at,
        unread: fromMe ? prev?.unread || 0 : (prev?.unread || 0) + 1,
      });
      appendMessage(jid, {
        id: m?.key?.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        from_me: fromMe,
        created_at,
      });

      // Atendente automatico: responde com IA quando bot_enabled estiver ativo
      if (!fromMe && whatsappConfig.bot_enabled) {
        autoReply(jid, text, name).catch((e) => console.error("autoReply error:", e?.message || e));
      }
    }
  });

  // Atualizar nomes quando o WhatsApp empurra contatos conhecidos
  sock.ev.on("contacts.update", (updates) => {
    if (sock !== activeSock || !Array.isArray(updates)) return;
    for (const u of updates) {
      if (!u?.id) continue;
      const name = u.name || u.notify || u.verifiedName;
      if (name) upsertContact(u.id, { name });
    }
  });

  starting = false;
}

async function restartSock({ resetAuth = false } = {}) {
  await closeSock();
  currentQR = null;
  lastError = null;
  connectionState = "connecting";
  if (resetAuth) {
    await rm(AUTH_DIR, { recursive: true, force: true });
    await mkdir(AUTH_DIR, { recursive: true });
  }
  await startSock();
  return {
    connected: connectionState === "open",
    state: connectionState,
    last_error: lastError,
  };
}

startSock().catch((e) => {
  lastError = e?.message || String(e);
  console.error("startSock error:", e);
});

// ---- Helpers ----
const ok = (data = {}) => ({ ok: true, ...data });
const normalizeRecipient = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes("@")) return raw;

  let digits = raw.replace(/\D/g, "");
  while (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits ? `${digits}@s.whatsapp.net` : null;
};

const outboundMessage = (text, to, providerResult = {}) => ({
  id: providerResult?.key?.id || `msg-${Date.now()}`,
  text: String(text || ""),
  from_me: true,
  created_at: new Date().toISOString(),
  to,
});

const baileysRuntimeStatus = () => {
  const connected = connectionState === "open" || Boolean(sock?.user && connectionState !== "logged_out");
  return {
    ok: true,
    connected,
    state: connected ? "open" : connectionState,
    last_error: connected ? null : lastError,
    me: sock?.user || null,
  };
};

// ---- Healthcheck ----
app.get("/", (_req, res) => res.json(ok({ service: "kenia-whatsapp-backend" })));
app.get("/api/health", (_req, res) => res.json(ok({ state: connectionState })));

app.get("/api/whatsapp/config", (_req, res) => res.json(whatsappConfig));

// Teste rapido da chave de IA configurada no servidor
app.get("/api/whatsapp/ai-test", async (_req, res) => {
  const info = {
    has_emergent_key: Boolean(EMERGENT_API_KEY),
    has_lovable_key: Boolean(LOVABLE_API_KEY),
    emergent_base_url: EMERGENT_BASE_URL,
    emergent_model: EMERGENT_MODEL,
    lovable_model: AI_MODEL,
    bot_enabled: whatsappConfig.bot_enabled,
  };
  const result = await callAI([
    { role: "system", content: "Responda apenas com a palavra OK." },
    { role: "user", content: "ping" },
  ]);
  res.status(result.ok ? 200 : 500).json({ ...info, result });
});

app.put("/api/whatsapp/config", (req, res) => {
  whatsappConfig = { ...whatsappConfig, ...(req.body || {}) };
  res.json(whatsappConfig);
});

// ---- Diagnostics ----
app.get("/api/whatsapp/diagnostics", (_req, res) => {
  const status = baileysRuntimeStatus();
  res.json({
    ok: status.connected,
    checks: [
      {
        id: "backend",
        ok: true,
        label: "Backend ativo",
        msg: "Servidor Baileys respondendo.",
      },
      {
        id: "session",
        ok: status.connected,
        label: "Sessão WhatsApp",
        msg:
          status.connected
            ? "Conectado."
            : "Aguardando leitura do QR Code.",
      },
    ],
  });
});

// ---- Status ----
app.get("/api/whatsapp/baileys/status", (_req, res) => {
  res.json(baileysRuntimeStatus());
});

app.get("/api/whatsapp/test-connection", (_req, res) => {
  const status = baileysRuntimeStatus();
  res.json({
    connected: status.connected,
    provider: "baileys",
    error: status.connected ? null : lastError,
    state: status.state,
  });
});

app.post("/api/whatsapp/test-connection", (_req, res) => {
  const status = baileysRuntimeStatus();
  res.json({
    connected: status.connected,
    provider: "baileys",
    error: status.connected ? null : lastError || "Aguardando leitura do QR Code.",
    state: status.state,
  });
});

// ---- QR Code ----
app.get("/api/whatsapp/baileys/qr", async (_req, res) => {
  const qr = currentQR ? await QRCode.toDataURL(currentQR, { width: 320, margin: 2 }) : null;
  res.json({ qr, raw: currentQR, state: connectionState, connected: connectionState === "open" });
});

app.get("/api/whatsapp/qr", async (_req, res) => {
  if (!currentQR) {
    return res.json({
      connected: connectionState === "open",
      qr: null,
    });
  }
  const dataUrl = await QRCode.toDataURL(currentQR);
  res.json({ connected: false, qr: dataUrl });
});

app.get("/api/whatsapp/qr/image", async (_req, res) => {
  if (!currentQR) return res.status(404).send("No QR available");
  const buf = await QRCode.toBuffer(currentQR, { width: 320 });
  res.setHeader("Content-Type", "image/png");
  res.send(buf);
});

// ---- Enviar mensagem ----
app.post("/api/whatsapp/send", async (req, res) => {
  try {
    if (!sock || connectionState !== "open") {
      return res
        .status(503)
        .json({ ok: false, error: "NOT_CONNECTED", state: connectionState });
    }
    const { to, phone, contact_phone, message, text } = req.body || {};
    const jid = normalizeRecipient(to || phone || contact_phone);
    if (!jid) return res.status(400).json({ ok: false, delivered: false, error: "missing 'to'" });
    const body = message || text || "";
    if (!String(body).trim()) return res.status(400).json({ ok: false, delivered: false, error: "missing message" });
    const providerResult = await sock.sendMessage(jid, { text: String(body) });
    const outMsg = outboundMessage(body, jid, providerResult);
    upsertContact(jid, { last_message: outMsg.text, last_message_at: outMsg.created_at });
    appendMessage(jid, { id: outMsg.id, text: outMsg.text, from_me: true, created_at: outMsg.created_at });
    res.json(ok({ delivered: true, to: jid, message: outMsg, provider_result: providerResult }));
  } catch (e) {
    res.status(500).json({ ok: false, delivered: false, error: e?.message || "send_failed" });
  }
});

app.post("/api/whatsapp/send-direct", async (req, res) => {
  try {
    if (!sock || connectionState !== "open") {
      return res.status(503).json({ delivered: false, ok: false, error: "NOT_CONNECTED", state: connectionState });
    }
    const { phone, to, contact_phone, text, message } = req.body || {};
    const jid = normalizeRecipient(phone || to || contact_phone);
    if (!jid) return res.status(400).json({ delivered: false, ok: false, error: "missing phone" });
    const body = text || message || "";
    if (!String(body).trim()) return res.status(400).json({ delivered: false, ok: false, error: "missing message" });
    const providerResult = await sock.sendMessage(jid, { text: String(body) });
    const outMsg = outboundMessage(body, jid, providerResult);
    upsertContact(jid, { last_message: outMsg.text, last_message_at: outMsg.created_at });
    appendMessage(jid, { id: outMsg.id, text: outMsg.text, from_me: true, created_at: outMsg.created_at });
    res.json(ok({ delivered: true, to: jid, message: outMsg, provider_result: providerResult }));
  } catch (e) {
    res.status(500).json({ delivered: false, ok: false, error: e?.message || "send_failed" });
  }
});

app.post("/api/whatsapp/baileys/reconnect", async (_req, res) => {
  try {
    const status = await restartSock({ resetAuth: false });
    res.json(ok(status));
  } catch (e) {
    res.status(500).json({ ok: false, connected: false, state: connectionState, error: e?.message });
  }
});

app.post("/api/whatsapp/baileys/restart", async (_req, res) => {
  try {
    const status = await restartSock({ resetAuth: true });
    res.json(ok(status));
  } catch (e) {
    res.status(500).json({ ok: false, connected: false, state: connectionState, error: e?.message });
  }
});

// ---- Logout ----
app.post("/api/whatsapp/logout", async (_req, res) => {
  try {
    if (sock && connectionState === "open") await sock.logout();
    const status = await restartSock({ resetAuth: true });
    res.json(ok(status));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

app.post("/api/whatsapp/baileys/logout", async (req, res) => {
  try {
    if (sock && connectionState === "open") await sock.logout();
    const status = await restartSock({ resetAuth: true });
    res.json(ok(status));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ---- Contatos e mensagens ----
app.get("/api/whatsapp/contacts", (_req, res) => {
  const list = Array.from(contactsStore.values()).sort((a, b) =>
    String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""))
  );
  res.json(list);
});

app.get("/api/whatsapp/messages/:id", (req, res) => {
  const raw = req.params.id;
  const direct = messagesStore.get(raw);
  if (direct) return res.json(direct);
  // permite buscar pelo telefone também
  const digits = String(raw).replace(/\D/g, "");
  for (const [jid, list] of messagesStore.entries()) {
    if (jidToPhone(jid).endsWith(digits.slice(-8))) return res.json(list);
  }
  res.json([]);
});

// ---- Fallback /api/* ----
app.all("/api/*", (_req, res) => res.json(ok({ fallback: true })));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on :${PORT}`);
});
