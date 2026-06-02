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
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kzlxysxvvlupjtrmxqmb.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

async function transcribeAudioBuffer(buffer, mimetype = "audio/ogg") {
  if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY ausente no backend");
  const b64 = Buffer.from(buffer).toString("base64");
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ audio_base64: b64, mime_type: mimetype }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`transcribe ${resp.status}: ${JSON.stringify(data)}`);
  return data.text || data.transcript || "";
}

const PORT = Number(process.env.PORT) || 8080;
const AUTH_DIR = process.env.AUTH_DIR || "./auth";
const QR_TIMEOUT_MS = Number(process.env.QR_TIMEOUT_MS || 300000);
const CONNECT_TIMEOUT_MS = Number(process.env.CONNECT_TIMEOUT_MS || 60000);
const KEEP_ALIVE_INTERVAL_MS = Number(process.env.KEEP_ALIVE_INTERVAL_MS || 20000);
const RECONNECT_DELAY_MS = Number(process.env.RECONNECT_DELAY_MS || 2000);
const SERVER_STARTED_AT = Date.now();
const AUTO_REPLY_RECENT_WINDOW_MS = Number(process.env.AUTO_REPLY_RECENT_WINDOW_MS || 180000);
const logger = pino({ level: "warn" });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

// ---- Estado do socket Baileys ----
let sock = null;
let currentQR = null;
let currentQRAt = null;
let connectionState = "disconnected"; // connecting | open | disconnected
let lastError = null;
let starting = false;
let reconnectTimer = null;
let whatsappConfig = { provider: "baileys", bot_enabled: true };

// ---- Armazenamento em memória de contatos e mensagens ----
const contactsStore = new Map(); // jid -> contato
const messagesStore = new Map(); // jid -> Array<mensagens>
const processedAutoReplyMessageIds = new Set();

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

// ---- Atendente automático com IA (Gemini via Lovable AI Gateway primeiro; outras chaves como fallback) ----
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const EMERGENT_API_KEY = process.env.EMERGENT_API_KEY || process.env.EMERGENT_LLM_KEY || "";
const EMERGENT_BASE_URL =
  process.env.EMERGENT_BASE_URL || "https://integrations.emergentagent.com/llm/v1";
const EMERGENT_MODEL = process.env.EMERGENT_MODEL || "gpt-4o-mini";
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY || process.env.VITE_LOVABLE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "google/gemini-3-flash-preview";
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000);
const AUTO_REPLY_SEND_TIMEOUT_MS = Number(process.env.AUTO_REPLY_SEND_TIMEOUT_MS || 20000);
const AUTO_REPLY_RETRY_EVERY_MS = Number(process.env.AUTO_REPLY_RETRY_EVERY_MS || 10000);
const AUTO_REPLY_QUEUE_MAX = Number(process.env.AUTO_REPLY_QUEUE_MAX || 50);
const AI_SYSTEM_PROMPT =
  process.env.AI_SYSTEM_PROMPT ||
  [
    "Você é a assistente da Dra. Kênia Garcia, advogada brasileira (OAB). Atende pelo WhatsApp em primeira pessoa como assistente humana do escritório, com tom cordial, profissional e raciocínio jurídico inicial. NUNCA diga que é IA, robô, modelo ou assistente virtual.",
    "",
    "SAUDAÇÃO INICIAL: na primeira mensagem, use Bom dia, Boa tarde ou Boa noite conforme o CONTEXTO TEMPORAL, apresente-se como assistente da Dra. Kênia Garcia e pergunte o nome do cliente.",
    "Depois que o cliente informar o nome, trate pelo primeiro nome e pergunte: 'Me conta o que aconteceu?'.",
    "Identifique internamente a área provável pelo relato. Só pergunte a área se ainda estiver ambíguo.",
    "Responda perguntas abertas naturalmente, como apoio jurídico inicial, sem cair em roteiro fixo.",
    "Analise o caso em linguagem simples: direito provável, base legal, documentos/provas, próximos passos e por que vale uma consulta.",
    "Quando houver interesse em agendar, colete uma informação por vez: nome completo, telefone, e-mail, cidade/estado, data e horário.",
    "",
    "REGRAS:",
    "- Nunca prometa resultado jurídico, valores de indenização ou prazos de processo.",
    "- Use 'geralmente', 'a depender do caso' e 'a análise completa cabe à advogada na consulta'.",
    "- Cite base legal quando pertinente: CF/88 art. 5º; CC arts. 186, 927, 1.694, 1.829; CLT arts. 477, 482, 818; CDC arts. 6º, 14, 39, 42, 51; Lei 8.213/91; Lei Maria da Penha; CP/CPP conforme o caso.",
    "- Urgências como prisão, flagrante, violência doméstica, audiência em 48h ou bloqueio judicial devem ser sinalizadas imediatamente.",
    "- Use linguagem simples, respostas objetivas e emojis com moderação.",
  ].join("\n");
const aiHistory = new Map(); // jid -> [{role, content}]

function saoPauloTemporalContext() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(now);
  return `CONTEXTO TEMPORAL: hoje é ${date}; hora atual ${time} (America/Sao_Paulo). Use isso para saudação e para calcular hoje, amanhã e próximas datas.`;
}

async function callAI(messagesPayload) {
  const providers = [
    LOVABLE_API_KEY && {
      provider: "lovable-gemini",
      endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
      model: AI_MODEL,
      headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
    },
    OPENAI_API_KEY && {
      provider: "openai",
      endpoint: `${OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      model: OPENAI_MODEL,
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    },
    EMERGENT_API_KEY && {
      provider: "emergent",
      endpoint: `${EMERGENT_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      model: EMERGENT_MODEL,
      headers: { Authorization: `Bearer ${EMERGENT_API_KEY}`, "Content-Type": "application/json" },
    },
  ].filter(Boolean);

  if (!providers.length) {
    return { ok: false, error: "Nenhuma chave de IA configurada (OPENAI_API_KEY, EMERGENT_API_KEY ou LOVABLE_API_KEY)." };
  }

  const attempts = [];
  for (const cfg of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(cfg.endpoint, {
        method: "POST",
        headers: cfg.headers,
        signal: controller.signal,
        body: JSON.stringify({ model: cfg.model, messages: messagesPayload }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        const failed = { ok: false, provider: cfg.provider, endpoint: cfg.endpoint, model: cfg.model, status: resp.status, error: errText.slice(0, 500) };
        attempts.push(failed);
        recordAutoReply({ step: "ai_provider_fail", provider: cfg.provider, status: resp.status, error: failed.error });
        continue;
      }
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        const failed = { ok: false, provider: cfg.provider, endpoint: cfg.endpoint, model: cfg.model, error: "Resposta vazia da IA.", raw: data };
        attempts.push(failed);
        recordAutoReply({ step: "ai_provider_fail", provider: cfg.provider, error: failed.error });
        continue;
      }
      return { ok: true, provider: cfg.provider, endpoint: cfg.endpoint, model: cfg.model, reply, attempts };
    } catch (e) {
      const timedOut = e?.name === "AbortError";
      const failed = { ok: false, provider: cfg.provider, endpoint: cfg.endpoint, model: cfg.model, error: timedOut ? `Tempo esgotado após ${AI_REQUEST_TIMEOUT_MS}ms aguardando resposta da IA.` : e?.message || String(e) };
      attempts.push(failed);
      recordAutoReply({ step: "ai_provider_fail", provider: cfg.provider, error: failed.error });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, error: "Todos os provedores de IA configurados falharam.", attempts, ...attempts[attempts.length - 1] };
}

async function generateCreativeImage(prompt) {
  if (!LOVABLE_API_KEY) return { ok: false, error: "LOVABLE_API_KEY ausente no backend do Render." };
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt: `Arte quadrada profissional para redes sociais de um escritório de advocacia brasileiro. Tema: ${prompt}. Visual elegante, jurídico, humano, sem texto, sem letras, sem marcas d'água.`,
      quality: "low",
      size: "1024x1024",
      stream: false,
    }),
  });
  const data = await resp.json().catch(async () => ({ error: await resp.text().catch(() => "Erro desconhecido") }));
  if (!resp.ok) return { ok: false, status: resp.status, error: data?.error || JSON.stringify(data) };
  const b64 = data?.data?.[0]?.b64_json;
  return b64 ? { ok: true, b64_json: b64 } : { ok: false, error: "Sem imagem gerada." };
}

const autoReplyDebug = { last: null, history: [] };
function recordAutoReply(entry) {
  const stamped = { at: new Date().toISOString(), ...entry };
  autoReplyDebug.last = stamped;
  autoReplyDebug.history.unshift(stamped);
  autoReplyDebug.history = autoReplyDebug.history.slice(0, 30);
  console.log("[autoReply]", JSON.stringify(stamped));
}

function hasProcessedMessage(id) {
  return Boolean(id && processedAutoReplyMessageIds.has(id));
}

function markProcessedMessage(id) {
  if (!id) return;
  processedAutoReplyMessageIds.add(id);
  if (processedAutoReplyMessageIds.size > 500) {
    const first = processedAutoReplyMessageIds.values().next().value;
    processedAutoReplyMessageIds.delete(first);
  }
}

function shouldAutoReplyToMessage({ type, fromMe, text, jid, messageId, createdAtMs }) {
  if (fromMe || !whatsappConfig.bot_enabled) return { ok: false, reason: fromMe ? "from_me" : "bot_disabled" };
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return { ok: false, reason: "ignored_jid" };
  if (!String(text || "").trim()) return { ok: false, reason: "empty_text" };
  if (hasProcessedMessage(messageId)) return { ok: false, reason: "duplicate" };
  if (type === "notify") {
    markProcessedMessage(messageId);
    return { ok: true, reason: "notify" };
  }
  const recentEnough = createdAtMs && createdAtMs >= SERVER_STARTED_AT - AUTO_REPLY_RECENT_WINDOW_MS;
  if (recentEnough) {
    markProcessedMessage(messageId);
    return { ok: true, reason: `recent_${type || "unknown"}` };
  }
  return { ok: false, reason: `old_${type || "unknown"}` };
}

const pendingAutoReplies = [];
let processingAutoReplyQueue = false;

function buildLocalLegalReply(jid, userText, contactName) {
  const history = aiHistory.get(jid) || [];
  const userTurns = history.filter((m) => m.role === "user").length + 1;
  const name = String(contactName || "cliente").split(" ")[0];
  const txt = String(userText || "").toLowerCase();
  if (/urgente|pris[aã]o|audi[eê]ncia|prazo|intima[cç][aã]o|mandado|medida protetiva/.test(txt)) {
    return `${name}, entendi a urgência. Vou sinalizar seu caso para a equipe agora; por favor me envie sua cidade/estado e um resumo breve do que aconteceu.`;
  }
  if (userTurns <= 1) {
    return `Olá, ${name}! Sou a assistente virtual do escritório. Me conta com calma o que aconteceu? Pelo seu relato eu consigo identificar a área jurídica e te passar as primeiras orientações.`;
  }
  if (userTurns === 2) return "Entendi. Quando isso aconteceu e qual foi o principal prejuízo ou preocupação para você?";
  if (userTurns === 3) return "Certo. Existe algum prazo, audiência, notificação ou urgência nas próximas 24 a 72 horas?";
  if (userTurns === 4) return "Obrigado. Para direcionar corretamente, qual é sua cidade e estado?";
  return "Perfeito, já registrei as informações iniciais. Um advogado do escritório vai analisar e entrar em contato para orientar os próximos passos e agendar a consulta.";
}

function queueAutoReply(jid, reply, meta = {}) {
  pendingAutoReplies.push({ jid, reply, attempts: 0, created_at: new Date().toISOString(), ...meta });
  while (pendingAutoReplies.length > AUTO_REPLY_QUEUE_MAX) pendingAutoReplies.shift();
  recordAutoReply({ step: "queued", jid, queue_size: pendingAutoReplies.length, reason: meta.reason || null });
}

async function sendBotText(jid, reply, meta = {}) {
  try { await sock?.presenceSubscribe?.(jid); } catch {}
  try { await sock?.sendPresenceUpdate?.("composing", jid); } catch {}
  await new Promise((r) => setTimeout(r, 600));
  try { await sock?.sendPresenceUpdate?.("paused", jid); } catch {}

  let lastSendErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (!sock || connectionState !== "open") throw new Error(`socket_not_open:${connectionState}`);
      recordAutoReply({ step: "send_attempt", jid, attempt, source: meta.source || "auto", reply: reply.slice(0, 200) });
      console.log("[sendBotText] enviando", { jid, attempt, len: reply.length });
      const providerResult = await Promise.race([
        sock.sendMessage(jid, { text: reply }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`sendMessage timeout ${AUTO_REPLY_SEND_TIMEOUT_MS}ms`)), AUTO_REPLY_SEND_TIMEOUT_MS)),
      ]);
      console.log("[sendBotText] ENVIADO", { jid, id: providerResult?.key?.id, status: providerResult?.status });
      const out = outboundMessage(reply, jid, providerResult);
      upsertContact(jid, { last_message: out.text, last_message_at: out.created_at });
      appendMessage(jid, { id: out.id, text: out.text, from_me: true, created_at: out.created_at });
      return { ok: true, out, providerResult, attempt };
    } catch (e) {
      lastSendErr = e?.message || String(e);
      console.error("[sendBotText] ERRO ENVIO", { jid, attempt, error: lastSendErr });
      recordAutoReply({ step: "send_error", jid, attempt, source: meta.source || "auto", error: lastSendErr });
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(lastSendErr || "send_failed");
}

async function processAutoReplyQueue() {
  if (processingAutoReplyQueue || !pendingAutoReplies.length || !sock || connectionState !== "open") return;
  processingAutoReplyQueue = true;
  try {
    for (let i = 0; i < pendingAutoReplies.length;) {
      const item = pendingAutoReplies[i];
      item.attempts += 1;
      try {
        await sendBotText(item.jid, item.reply, { source: "queue" });
        pendingAutoReplies.splice(i, 1);
        recordAutoReply({ step: "queue_sent", jid: item.jid, queue_size: pendingAutoReplies.length });
      } catch (e) {
        item.last_error = e?.message || String(e);
        recordAutoReply({ step: "queue_retry_later", jid: item.jid, attempts: item.attempts, error: item.last_error });
        if (item.attempts >= 12) {
          pendingAutoReplies.splice(i, 1);
          recordAutoReply({ step: "queue_drop", jid: item.jid, error: item.last_error });
        } else {
          i += 1;
        }
      }
    }
  } finally {
    processingAutoReplyQueue = false;
  }
}

async function autoReply(jid, userText, contactName) {
  recordAutoReply({ step: "trigger", jid, userText: String(userText || "").slice(0, 200), hasOpenAI: Boolean(OPENAI_API_KEY), hasEmergent: Boolean(EMERGENT_API_KEY), hasLovable: Boolean(LOVABLE_API_KEY), botEnabled: whatsappConfig.bot_enabled, connectionState });
  if (!sock || connectionState !== "open") {
    recordAutoReply({ step: "skip_socket", jid, connectionState });
    return;
  }
  const history = aiHistory.get(jid) || [];
  const messagesPayload = [
    { role: "system", content: `${AI_SYSTEM_PROMPT}\n${saoPauloTemporalContext()}\nNome do contato: ${contactName || "Cliente"}.` },
    ...history.slice(-10),
    { role: "user", content: userText },
  ];
  recordAutoReply({ step: "ai_request", jid, providers: [OPENAI_API_KEY && "openai", EMERGENT_API_KEY && "emergent", LOVABLE_API_KEY && "lovable"].filter(Boolean) });
  const result = await callAI(messagesPayload);
  const usedFallback = !result.ok;
  const reply = usedFallback ? buildLocalLegalReply(jid, userText, contactName) : result.reply;
  if (usedFallback) recordAutoReply({ step: "ai_fail_local_fallback", jid, result, reply: reply.slice(0, 200) });
  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: reply });
  aiHistory.set(jid, history.slice(-20));
  try {
    const sent = await sendBotText(jid, reply, { source: usedFallback ? "local_fallback" : result.provider });
    recordAutoReply({ step: "sent", jid, attempt: sent.attempt, provider: usedFallback ? "local_fallback" : result.provider, model: result.model || null, reply: reply.slice(0, 200) });
  } catch (e) {
    queueAutoReply(jid, reply, { source: usedFallback ? "local_fallback" : result.provider, reason: e?.message || String(e) });
    recordAutoReply({ step: "send_queued_after_fail", jid, error: e?.message || String(e) });
  }
}

async function closeSock() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
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
    qrTimeout: QR_TIMEOUT_MS,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
  });
  const activeSock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    if (sock !== activeSock) return;
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      currentQR = qr;
      currentQRAt = Date.now();
    }
    if (connection) connectionState = connection === "open" ? "open" : connection;
    if (connection === "open") {
      currentQR = null;
      currentQRAt = null;
      lastError = null;
      starting = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      processAutoReplyQueue().catch((e) => recordAutoReply({ step: "queue_process_error", error: e?.message || String(e) }));
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode || new Boom(lastDisconnect?.error)?.output?.statusCode;
      lastError = lastDisconnect?.error?.message || null;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      await closeSock();
      starting = false;
      connectionState = shouldReconnect ? "disconnected" : "logged_out";
      currentQR = null;
      currentQRAt = null;
      if (shouldReconnect && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startSock().catch((e) => { lastError = e?.message || String(e); });
        }, RECONNECT_DELAY_MS);
      }
    }
  });

  // Capturar mensagens recebidas/enviadas para alimentar a lista de contatos
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (sock !== activeSock || !Array.isArray(messages)) return;
    for (const m of messages) {
      const jid = m?.key?.remoteJid;
      if (!jid) continue;
      const fromMe = Boolean(m?.key?.fromMe);
      let text = extractText(m);
      recordAutoReply({ step: "incoming", type, jid, fromMe, hasText: Boolean(text), preview: String(text || "").slice(0, 80) });
      if (jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const audioMsg =
        m?.message?.audioMessage ||
        m?.message?.pttMessage ||
        m?.message?.ephemeralMessage?.message?.audioMessage ||
        m?.message?.ephemeralMessage?.message?.pttMessage ||
        m?.message?.viewOnceMessage?.message?.audioMessage ||
        m?.message?.viewOnceMessage?.message?.pttMessage ||
        m?.message?.viewOnceMessageV2?.message?.audioMessage ||
        m?.message?.viewOnceMessageV2?.message?.pttMessage;
      console.log("[audio] audioMsg:", !!audioMsg, "mimetype:", audioMsg?.mimetype, "keys:", m?.message && Object.keys(m.message));
      recordAutoReply({ step: "audio_detect", jid, has: !!audioMsg, mimetype: audioMsg?.mimetype, msgKeys: m?.message ? Object.keys(m.message) : [] });
      if (!text && audioMsg && !fromMe) {
        try {
          recordAutoReply({ step: "audio_download_start", jid });
          const buf = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
          console.log("[audio] Buffer size:", buf?.length);
          recordAutoReply({ step: "audio_download_ok", jid, size: buf?.length || 0 });
          if (!buf || !buf.length) throw new Error("Buffer vazio do downloadMediaMessage");
          text = await transcribeAudioBuffer(buf, audioMsg.mimetype || "audio/ogg");
          recordAutoReply({ step: "audio_transcribed", jid, preview: String(text || "").slice(0, 120) });
        } catch (e) {
          console.error("TRANSCRIPTION ERROR:", e);
          recordAutoReply({ step: "audio_error", jid, error: e?.stack || e?.message || String(e) });
        }
      }
      if (!text) continue;
      const created_at = m?.messageTimestamp
        ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();
      const createdAtMs = new Date(created_at).getTime();
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

      const autoDecision = shouldAutoReplyToMessage({
        type,
        fromMe,
        text,
        jid,
        messageId: m?.key?.id,
        createdAtMs,
      });
      if (autoDecision.ok) {
        recordAutoReply({ step: "auto_allowed", jid, type, reason: autoDecision.reason });
        autoReply(jid, text, name).catch((e) => recordAutoReply({ step: "autoreply_throw", jid, error: e?.message || String(e) }));
      } else if (!fromMe && whatsappConfig.bot_enabled) {
        recordAutoReply({ step: "auto_skipped", jid, type, reason: autoDecision.reason });
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
  currentQRAt = null;
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
setInterval(() => {
  processAutoReplyQueue().catch((e) => recordAutoReply({ step: "queue_process_error", error: e?.message || String(e) }));
}, AUTO_REPLY_RETRY_EVERY_MS);

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
  const qrAgeMs = currentQRAt ? Date.now() - currentQRAt : null;
  return {
    ok: true,
    connected,
    state: connected ? "open" : connectionState,
    last_error: connected ? null : lastError,
    me: sock?.user || null,
    qr_available: Boolean(currentQR),
    qr_age_ms: qrAgeMs,
    qr_expires_in_s: currentQRAt ? Math.max(0, Math.ceil((QR_TIMEOUT_MS - qrAgeMs) / 1000)) : null,
    qr_timeout_s: Math.ceil(QR_TIMEOUT_MS / 1000),
  };
};

// ---- Healthcheck ----
app.get("/", (_req, res) => res.json(ok({ service: "kenia-whatsapp-backend" })));
app.get("/api/health", (_req, res) => res.json(ok({ state: connectionState })));

app.get("/api/whatsapp/config", (_req, res) => res.json(whatsappConfig));

// Teste rapido da chave de IA configurada no servidor
app.get("/api/whatsapp/ai-test", async (_req, res) => {
  const info = {
    has_openai_key: Boolean(OPENAI_API_KEY),
    has_emergent_key: Boolean(EMERGENT_API_KEY),
    has_lovable_key: Boolean(LOVABLE_API_KEY),
    openai_base_url: OPENAI_BASE_URL,
    openai_model: OPENAI_MODEL,
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

// Mostra os últimos eventos do atendente automático (substitui leitura de log do Render)
app.get("/api/whatsapp/ai-debug", (_req, res) => {
  const status = baileysRuntimeStatus();
  res.json({
    bot_enabled: whatsappConfig.bot_enabled,
    connection_state: status.state,
    connected: status.connected,
    qr_available: status.qr_available,
    qr_age_ms: status.qr_age_ms,
    qr_expires_in_s: status.qr_expires_in_s,
    qr_timeout_s: status.qr_timeout_s,
    has_openai_key: Boolean(OPENAI_API_KEY),
    has_emergent_key: Boolean(EMERGENT_API_KEY),
    has_lovable_key: Boolean(LOVABLE_API_KEY),
    last: autoReplyDebug.last,
    history: autoReplyDebug.history,
    queue_size: pendingAutoReplies.length,
    queued: pendingAutoReplies.map((m) => ({ jid: m.jid, attempts: m.attempts, created_at: m.created_at, source: m.source, reason: m.reason, last_error: m.last_error })),
  });
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
  const status = baileysRuntimeStatus();
  res.json({ qr, raw: currentQR, ...status });
});

app.get("/api/whatsapp/qr", async (_req, res) => {
  if (!currentQR) {
    return res.json({
      connected: connectionState === "open",
      qr: null,
    });
  }
  const dataUrl = await QRCode.toDataURL(currentQR);
  const status = baileysRuntimeStatus();
  res.json({ connected: false, qr: dataUrl, qr_expires_in_s: status.qr_expires_in_s, qr_timeout_s: status.qr_timeout_s });
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

const creativesStore = [];

app.get("/api/creatives", (_req, res) => {
  res.json(creativesStore);
});

app.post("/api/creatives/generate", async (req, res) => {
  const topic = req.body?.topic || req.body?.title || req.body?.prompt || "post jurídico";
  const result = await generateCreativeImage(topic).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  const item = {
    id: `creative-${Date.now()}`,
    title: req.body?.title || topic,
    network: req.body?.network || "instagram",
    format: req.body?.format || "post",
    caption: `Post sugerido: ${topic}.\n\nExplique o direito com clareza, cite documentos importantes e finalize convidando para atendimento com a Dra. Kênia Garcia.`,
    image_b64: result.ok ? result.b64_json : "",
    ...(result.ok ? {} : { error: result.error || "Imagem não gerada" }),
  };
  creativesStore.unshift(item);
  res.status(201).json(item);
});

app.post("/api/chat/message", async (req, res) => {
  const message = String(req.body?.message || req.body?.text || "").trim();
  if (!message) return res.status(400).json({ error: "message vazio" });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-20) : [];
  const result = await callAI([
    { role: "system", content: `${AI_SYSTEM_PROMPT}\n${saoPauloTemporalContext()}` },
    ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
    { role: "user", content: message },
  ]);
  const reply = result.ok ? result.reply : buildLocalLegalReply(req.body?.session_id || "web", message, req.body?.visitor_name || "Cliente");
  res.json({
    session_id: req.body?.session_id || `session-${Date.now()}`,
    response: reply,
    audio_base64: null,
    analysis: { acertividade: result.ok ? 90 : 70, qualificacao: result.ok ? "ok" : "fallback" },
  });
});

// ---- Fallback /api/* ----
app.all("/api/*", (_req, res) => res.json(ok({ fallback: true })));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on :${PORT}`);
});
