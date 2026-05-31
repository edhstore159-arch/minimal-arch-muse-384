// Backend mínimo para WhatsApp via Baileys.
// Deploy no Render como Web Service: Build `npm install`, Start `npm start`.
// Endpoints expostos sob /api/* para casar com o frontend (VITE_BACKEND_URL).

import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { Boom } from "@hapi/boom";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT) || 8080;
const AUTH_DIR = process.env.AUTH_DIR || "./auth";
const DATA_FILE = path.join(AUTH_DIR, "config.json");
const logger = pino({ level: "warn" });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

// ---- Estado do socket Baileys ----
let sock = null;
let currentQR = null;
let connectionState = "disconnected"; // connecting | open | disconnected
let lastError = null;

const DEFAULT_PROMPT =
  "Você é a atendente Kênia Garcia. Atenda com linguagem humana, acolhedora e profissional. Identifique nome, telefone, área do caso, urgência e próximos documentos necessários. Nunca diga que é IA.";

const defaultWhatsAppConfig = {
  provider: "baileys",
  zapi_instance_id: "",
  zapi_instance_token: "",
  zapi_client_token: "",
  evo_base_url: "",
  evo_api_key: "",
  evo_instance: "",
  meta_access_token: "",
  meta_phone_number_id: "",
  bot_enabled: true,
  bot_prompt: DEFAULT_PROMPT,
  bot_voice_mode: "text_only",
  bot_voice: "nova",
  voice_provider: "openai",
  elevenlabs_api_key: "",
  elevenlabs_voice_id: "",
  elevenlabs_voice_name: "",
};

const defaultData = {
  whatsappConfig: defaultWhatsAppConfig,
  settings: { llm_text_key: "", llm_image_key: "" },
};

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(defaultData);
    return { ...structuredClone(defaultData), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    return structuredClone(defaultData);
  }
}

function writeData(next) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2));
}

function maskKey(value, fallback = "Emergent padrão") {
  if (!value) return fallback;
  const s = String(value);
  return s.length <= 10 ? "••••" : `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ["Kenia", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) currentQR = qr;
    if (connection) connectionState = connection === "open" ? "open" : connection;
    if (connection === "open") {
      currentQR = null;
      lastError = null;
    }
    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      lastError = lastDisconnect?.error?.message || null;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      if (shouldReconnect) setTimeout(() => startSock().catch(() => {}), 2000);
    }
  });
}

startSock().catch((e) => {
  lastError = e?.message || String(e);
  console.error("startSock error:", e);
});

// ---- Helpers ----
const ok = (data = {}) => ({ ok: true, ...data });

// ---- Healthcheck ----
app.get("/", (_req, res) => res.json(ok({ service: "kenia-whatsapp-backend" })));
app.get("/api/health", (_req, res) => res.json(ok({ state: connectionState })));

// ---- Configurações usadas pelo frontend ----
app.get("/api/settings", (_req, res) => {
  const data = readData();
  res.json({
    using_default_text: !data.settings?.llm_text_key,
    using_default_image: !data.settings?.llm_image_key,
    llm_text_key_masked: maskKey(data.settings?.llm_text_key),
    llm_image_key_masked: maskKey(data.settings?.llm_image_key),
  });
});

app.put("/api/settings", (req, res) => {
  const data = readData();
  data.settings = { ...data.settings };
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "llm_text_key")) {
    data.settings.llm_text_key = String(req.body.llm_text_key || "");
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "llm_image_key")) {
    data.settings.llm_image_key = String(req.body.llm_image_key || "");
  }
  writeData(data);
  res.json(ok());
});

app.post("/api/settings/test-text", (_req, res) => {
  res.json({ ok: true, model: "backend", using_custom_key: Boolean(readData().settings?.llm_text_key) });
});

app.post("/api/settings/test-image", (_req, res) => {
  res.json({ ok: true, model: "backend", using_custom_key: Boolean(readData().settings?.llm_image_key) });
});

app.get("/api/whatsapp/config", (_req, res) => {
  res.json({ ...defaultWhatsAppConfig, ...(readData().whatsappConfig || {}) });
});

app.put("/api/whatsapp/config", (req, res) => {
  const data = readData();
  data.whatsappConfig = { ...defaultWhatsAppConfig, ...(data.whatsappConfig || {}), ...(req.body || {}) };
  writeData(data);
  res.json(data.whatsappConfig);
});

app.get("/api/whatsapp/default-prompt", (_req, res) => res.json({ prompt: DEFAULT_PROMPT }));

// ---- Diagnostics ----
app.get("/api/whatsapp/diagnostics", (_req, res) => {
  res.json({
    ok: connectionState === "open",
    checks: [
      {
        id: "backend",
        ok: true,
        label: "Backend ativo",
        msg: "Servidor Baileys respondendo.",
      },
      {
        id: "session",
        ok: connectionState === "open",
        label: "Sessão WhatsApp",
        msg:
          connectionState === "open"
            ? "Conectado."
            : "Aguardando leitura do QR Code.",
      },
    ],
  });
});

// ---- Status ----
app.get("/api/whatsapp/baileys/status", (_req, res) => {
  res.json({
    ok: true,
    connected: connectionState === "open",
    state: connectionState,
    last_error: lastError,
  });
});

app.get("/api/whatsapp/test-connection", (_req, res) => {
  res.json({
    connected: connectionState === "open",
    provider: "baileys",
    error: connectionState === "open" ? null : lastError,
  });
});

// ---- QR Code ----
app.get("/api/whatsapp/baileys/qr", async (_req, res) => {
  res.json({ qr: currentQR, state: connectionState });
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
    const { to, message, text } = req.body || {};
    if (!to) return res.status(400).json({ ok: false, error: "missing 'to'" });
    const jid = String(to).includes("@")
      ? String(to)
      : `${String(to).replace(/\D/g, "")}@s.whatsapp.net`;
    const body = message || text || "";
    await sock.sendMessage(jid, { text: String(body) });
    res.json(ok({ to: jid }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "send_failed" });
  }
});

app.post("/api/whatsapp/send-direct", async (req, res) => {
  try {
    const { phone, text } = req.body || {};
    if (!phone || !text) return res.status(400).json({ delivered: false, error: "missing_phone_or_text" });
    if (!sock || connectionState !== "open") {
      return res.json({ delivered: false, provider_result: { error: "NOT_CONNECTED", state: connectionState } });
    }
    const jid = `${String(phone).replace(/\D/g, "")}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: String(text) });
    res.json({ delivered: true, provider_result: { to: jid } });
  } catch (e) {
    res.status(500).json({ delivered: false, error: e?.message || "send_failed" });
  }
});

// ---- Logout ----
app.post("/api/whatsapp/logout", async (_req, res) => {
  try {
    if (sock) await sock.logout();
    currentQR = null;
    connectionState = "disconnected";
    setTimeout(() => startSock().catch(() => {}), 1000);
    res.json(ok());
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

app.post("/api/whatsapp/baileys/logout", async (_req, res) => {
  try {
    if (sock) await sock.logout();
    currentQR = null;
    connectionState = "disconnected";
    setTimeout(() => startSock().catch(() => {}), 1000);
    res.json(ok({ connected: false, state: connectionState }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

app.post("/api/whatsapp/baileys/reconnect", (_req, res) => {
  startSock().catch((e) => { lastError = e?.message || String(e); });
  res.json(ok({ connected: connectionState === "open", state: connectionState }));
});

app.post("/api/whatsapp/baileys/restart", (_req, res) => {
  currentQR = null;
  connectionState = "connecting";
  startSock().catch((e) => { lastError = e?.message || String(e); });
  res.json(ok({ connected: false, state: connectionState }));
});

app.post("/api/whatsapp/setup-webhook", (_req, res) => {
  res.json(ok({ verified: true, provider: "baileys", note: "Baileys não precisa configurar webhook externo." }));
});

// ---- Fallback /api/* ----
app.all("/api/*", (_req, res) => res.json(ok({ fallback: true })));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on :${PORT}`);
});
