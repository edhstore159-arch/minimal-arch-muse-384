// Backend mínimo para WhatsApp via Baileys.
// Deploy no Render como Web Service: Build `npm install`, Start `npm start`.
// Endpoints expostos sob /api/* para casar com o frontend (VITE_BACKEND_URL).

import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
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

const statusPayload = () => ({
  ok: true,
  connected: connectionState === "open",
  state: connectionState,
  last_error: lastError,
});

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
  res.json(statusPayload());
});

app.all("/api/whatsapp/test-connection", (_req, res) => {
  res.json({
    connected: connectionState === "open",
    provider: "baileys",
    error: connectionState === "open" ? null : lastError,
  });
});

// ---- QR Code ----
app.get("/api/whatsapp/baileys/qr", async (_req, res) => {
  const qr = currentQR ? await QRCode.toDataURL(currentQR) : null;
  res.json({ qr, raw_qr: currentQR, state: connectionState });
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
    if (!sock || connectionState !== "open") {
      return res.status(503).json({ delivered: false, ok: false, error: "NOT_CONNECTED", state: connectionState });
    }
    const { phone, to, message, text } = req.body || {};
    const target = phone || to;
    if (!target) return res.status(400).json({ delivered: false, ok: false, error: "missing 'phone'" });
    const jid = String(target).includes("@")
      ? String(target)
      : `${String(target).replace(/\D/g, "")}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: String(message || text || "") });
    res.json(ok({ delivered: true, to: jid, provider_result: { baileys: true } }));
  } catch (e) {
    res.status(500).json({ delivered: false, ok: false, error: e?.message || "send_failed" });
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
    res.json(ok(statusPayload()));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

app.post("/api/whatsapp/baileys/reconnect", async (_req, res) => {
  try {
    if (connectionState !== "open") await startSock();
    res.json(statusPayload());
  } catch (e) {
    lastError = e?.message || String(e);
    res.status(500).json({ ok: false, connected: false, state: connectionState, last_error: lastError });
  }
});

app.post("/api/whatsapp/baileys/restart", async (_req, res) => {
  try {
    if (sock) {
      try { sock.end?.(); } catch {}
    }
    sock = null;
    currentQR = null;
    connectionState = "connecting";
    await startSock();
    res.json(statusPayload());
  } catch (e) {
    lastError = e?.message || String(e);
    res.status(500).json({ ok: false, connected: false, state: connectionState, last_error: lastError });
  }
});

// ---- Fallback /api/* ----
app.all("/api/*", (_req, res) => res.json(ok({ fallback: true })));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on :${PORT}`);
});
