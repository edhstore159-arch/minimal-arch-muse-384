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
    res.json(ok({ delivered: true, to: jid, message: outboundMessage(body, jid, providerResult), provider_result: providerResult }));
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
    res.json(ok({ delivered: true, to: jid, message: outboundMessage(body, jid, providerResult), provider_result: providerResult }));
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

// ---- Fallback /api/* ----
app.all("/api/*", (_req, res) => res.json(ok({ fallback: true })));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on :${PORT}`);
});
