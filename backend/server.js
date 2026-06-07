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
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kzlxysxvvlupjtrmxqmb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imt6bHh5c3h2dmx1cGp0cm14cW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTM3MDUsImV4cCI6MjA5MjQ2OTcwNX0.iU5enYnsJExOHtbwpJKQ4bMGZS8hzQIURi6T2y2EQVM";

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

// ---- Ponte para Ollama (via ngrok) usada pelo bot do Baileys ----
const OLLAMA_RAW_URL =
  process.env.OLLAMA_URL ||
  "https://unabashed-vertical-crispness.ngrok-free.dev/api/generate";
const normalizeOllamaBaseUrl = (value) => {
  const trimmed = String(value || "").trim().replace(/\/+$/g, "");
  const withoutEndpoint = trimmed
    .replace(/\/api\/(?:generate|chat|tags|show)\/?$/i, "")
    .replace(/\/api\/?$/i, "");
  return withoutEndpoint || "http://127.0.0.1:11434";
};
const OLLAMA_BASE_URL = normalizeOllamaBaseUrl(OLLAMA_RAW_URL);
const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/generate`;
const OLLAMA_TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const OLLAMA_REQUEST_RETRIES = Number(process.env.OLLAMA_REQUEST_RETRIES || 2);
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "10m";
const OLLAMA_HEALTH_INTERVAL_MS = Number(process.env.OLLAMA_HEALTH_INTERVAL_MS || 240000);
const OLLAMA_HEALTH_TIMEOUT_MS = Number(process.env.OLLAMA_HEALTH_TIMEOUT_MS || 8000);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getOllamaBaseUrl = () => OLLAMA_BASE_URL;
const formatOllamaHttpError = (status, raw, context = "Ollama") => {
  const body = String(raw || "").replace(/\s+/g, " ").trim();
  if (status === 404 && /ngrok|<!doctype html|<html/i.test(body)) {
    return `${context} desconectado: o túnel respondeu 404/HTML. Atualize OLLAMA_URL no Render com o ngrok ativo apontando para http://localhost:11434.`;
  }
  if (status === 404) {
    return `${context} respondeu 404. Verifique se OLLAMA_URL aponta para a base do Ollama ou para /api/generate e se o modelo ${OLLAMA_MODEL} existe.`;
  }
  return `${context} ${status}: ${body.slice(0, 500)}`;
};
let ollamaStatus = {
  ok: false,
  configured_url: OLLAMA_RAW_URL,
  base_url: OLLAMA_BASE_URL,
  endpoint: OLLAMA_URL,
  model: OLLAMA_MODEL,
  last_checked_at: null,
  last_success_at: null,
  last_error: null,
};

export async function perguntarIA(texto) {
  let lastErrorForThrow = null;
  for (let attempt = 1; attempt <= OLLAMA_REQUEST_RETRIES + 1; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const resposta = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: texto,
          stream: false,
          keep_alive: OLLAMA_KEEP_ALIVE,
        }),
      });
      const raw = await resposta.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      if (!resposta.ok) throw new Error(formatOllamaHttpError(resposta.status, raw));
      const reply = String(data?.response || "").trim();
      if (!reply) throw new Error("Resposta vazia do Ollama.");
      ollamaStatus = { ...ollamaStatus, ok: true, last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null };
      return reply;
    } catch (e) {
      lastErrorForThrow = e;
      const timedOut = e?.name === "AbortError";
      const message = timedOut ? `timeout ${AI_REQUEST_TIMEOUT_MS}ms` : e?.message || String(e);
      ollamaStatus = { ...ollamaStatus, ok: false, last_checked_at: new Date().toISOString(), last_error: message };
      if (attempt <= OLLAMA_REQUEST_RETRIES) await delay(800 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErrorForThrow || new Error("Falha ao consultar Ollama.");
}

async function refreshOllamaStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_HEALTH_TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_TAGS_URL, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(formatOllamaHttpError(resp.status, await resp.text(), "Ollama health"));
    ollamaStatus = { ...ollamaStatus, ok: true, last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null };
  } catch (e) {
    const message = e?.name === "AbortError" ? `health timeout ${OLLAMA_HEALTH_TIMEOUT_MS}ms` : e?.message || String(e);
    ollamaStatus = { ...ollamaStatus, ok: false, last_checked_at: new Date().toISOString(), last_error: message };
  } finally {
    clearTimeout(timeout);
  }
  return ollamaStatus;
}

function startOllamaKeepAlive() {
  if (!OLLAMA_HEALTH_INTERVAL_MS) return;
  setTimeout(() => refreshOllamaStatus().catch(() => {}), 3000);
  setInterval(() => refreshOllamaStatus().catch(() => {}), OLLAMA_HEALTH_INTERVAL_MS);
}

const PORT = Number(process.env.PORT) || 8080;
const AUTH_DIR = process.env.AUTH_DIR || "./auth";
const QR_TIMEOUT_MS = Number(process.env.QR_TIMEOUT_MS || 300000);
const CONNECT_TIMEOUT_MS = Number(process.env.CONNECT_TIMEOUT_MS || 60000);
const KEEP_ALIVE_INTERVAL_MS = Number(process.env.KEEP_ALIVE_INTERVAL_MS || 20000);
const RECONNECT_DELAY_MS = Number(process.env.RECONNECT_DELAY_MS || 2000);
const RECONNECT_MAX_DELAY_MS = Number(process.env.RECONNECT_MAX_DELAY_MS || 60000);
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
let reconnectAttempts = 0;
let reconnectingSince = null;
let lastOpenAt = null;
let lastDisconnectCode = null;
let manualLogoutRequested = false;
let whatsappConfig = { provider: "baileys", bot_enabled: true };

// ---- Armazenamento em memória de contatos e mensagens ----
const contactsStore = new Map(); // jid -> contato
const messagesStore = new Map(); // jid -> Array<mensagens>
const processedAutoReplyMessageIds = new Set();
const debugInstructions = [];
const legalDeadlines = [
  {
    id: "deadline-1",
    client_name: "Mariana Souza",
    client_phone: "(62) 99123-4455",
    process_number: "0001234-56.2026.5.18.0001",
    court: "TRT 18ª Região",
    title: "Manifestação sobre documentos juntados",
    description: "Intimação aguardando providência da equipe jurídica.",
    due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    source: "monitoramento interno",
    status: "pending",
    urgency: "alta",
    assigned_to: "Advogada",
    whatsapp_notified: false,
  },
];

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
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000);
const AUTO_REPLY_SEND_TIMEOUT_MS = Number(process.env.AUTO_REPLY_SEND_TIMEOUT_MS || 20000);
const AUTO_REPLY_RETRY_EVERY_MS = Number(process.env.AUTO_REPLY_RETRY_EVERY_MS || 10000);
const AUTO_REPLY_QUEUE_MAX = Number(process.env.AUTO_REPLY_QUEUE_MAX || 50);
const SECRETARY_SYSTEM_PROMPT = [
  "Você é a secretária da Kênia Garcia no WhatsApp.",
  "Sua função é atender clientes com cordialidade, empatia e profissionalismo, auxiliando em questões jurídicas e dúvidas gerais.",
  "Aja como uma secretária humana experiente, com capacidade de triagem inicial, esclarecimento informativo e coleta de dados relevantes.",
  "Nunca diga que é uma inteligência artificial, assistente virtual, chatbot, robô ou sistema automatizado.",
  "Não mencione tecnologias, modelos de IA, automações ou sistemas internos.",
  "Quando iniciar conversa ou se apresentar, use apenas: \"Olá! Sou a secretária da Kênia Garcia. Como posso ajudar?\"",
  "",
  "Regras obrigatórias:",
  "- Responda em português do Brasil, de forma clara, objetiva, humanizada, empática e profissional.",
  "- Evite respostas excessivamente longas.",
  "- Não repita a mesma frase em mensagens consecutivas.",
  "- Não repita a apresentação em todas as respostas; apresente-se apenas no início da conversa ou quando necessário.",
  "- Evite repetir perguntas já respondidas e orientações já fornecidas.",
  "- Caso o cliente não responda uma pergunta, reformule-a de maneira diferente em vez de repetir exatamente.",
  "- Varie a forma de responder para manter um diálogo natural, humano e acolhedor.",
  "- Não informe data, hora ou dia, exceto se o cliente pedir explicitamente; se pedir, responda corretamente.",
  "- Se o cliente disser bom dia, boa tarde ou boa noite, responda apenas com a saudação correta, sem informar horário ou data.",
  "- Nunca diga que está consultando sites, tribunais ou bancos de dados em tempo real.",
  "- Responda perguntas gerais, educacionais e informativas normalmente, mantendo tom cordial e humano.",
  "- Em casos sensíveis, demonstre acolhimento antes de perguntar algo.",
  "",
  "Memória e contexto da conversa:",
  "- Use todo o histórico disponível para manter continuidade no atendimento.",
  "- Não faça perguntas que já foram respondidas anteriormente pelo cliente.",
  "- Relacione novas informações com fatos já informados e personalize a resposta quando fizer sentido.",
  "- Mantenha registro mental de nome, telefone, e-mail, área jurídica, fatos principais, datas relevantes, documentos mencionados, objetivo do cliente e status do atendimento.",
  "- Em agendamentos, confirme apenas dados necessários que ainda não foram fornecidos.",
  "- Nunca trate cada mensagem como uma conversa nova quando houver histórico disponível.",
  "",
  "- Responda dúvidas jurídicas com conhecimento jurídico geral, explicando direitos, deveres, procedimentos e possibilidades em linguagem simples.",
  "- Ao receber relato jurídico: demonstre compreensão, identifique a área, explique possibilidades, faça perguntas complementares, oriente documentos/provas e sugira próximos passos responsáveis.",
  "- Identifique oportunidades em Civil, Família, Consumidor, Trabalhista, Previdenciário, Penal, Empresarial, Imobiliário, Administrativo e áreas correlatas.",
  "- Nunca invente leis, artigos, jurisprudências ou decisões judiciais; nunca garanta vitória, indenização ou resultado processual.",
  "- Não explique regras internas e não diga que é IA, robô, chatbot, assistente virtual ou sistema automatizado.",
].join("\n");

// Mantém o comportamento do atendente fixo mesmo se existir prompt antigo salvo no ambiente.
const AI_SYSTEM_PROMPT = SECRETARY_SYSTEM_PROMPT;

const aiHistory = new Map(); // jid -> [{role, content}]

function saoPauloTemporalContext() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(now));
  const greeting = hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
  return `CONTEXTO TEMPORAL INTERNO — nunca mostre estes dados ao cliente, salvo pedido explícito de data/hora: referência ${date}, ${time}, America/Sao_Paulo. Saudação correta: ${greeting}.`;
}

function cleanRepeatedText(text) {
  const noRepeatedWords = String(text || "")
    .replace(/<?\/?\s*HANDOFF[_\s-]*K[EÊ]NIA\s*\/?>/giu, "")
    .replace(/`{1,3}\s*HANDOFF[_\s-]*K[EÊ]NIA\s*`{1,3}/giu, "")
    .replace(/\b((?:[\p{L}\p{N}]{2,}\s+){1,3}[\p{L}\p{N}]{2,})(?:[\s,.;:!?-]+\1\b)+/giu, "$1")
    .replace(/\b([\p{L}\p{N}]{2,})(?:[\s,.;:!?-]+\1\b)+/giu, "$1")
    .replace(/([^.!?\n]{8,}[.!?])(?:\s+\1)+/giu, "$1")
    .replace(/[ \t]{2,}/g, " ");
  const lines = noRepeatedWords.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const uniqueLines = [];
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/[^\p{L}\p{N}]+/giu, " ").trim();
    const previous = uniqueLines[uniqueLines.length - 1]?.toLowerCase().replace(/[^\p{L}\p{N}]+/giu, " ").trim();
    if (normalized && normalized !== previous) uniqueLines.push(line);
  }
  return uniqueLines.join("\n").trim();
}

function normalizeForSimilarity(text) {
  return String(text || "")
    .replace(/<AGENDAMENTO>[\s\S]*?<\/AGENDAMENTO>/g, "")
    .replace(/<?\/?\s*HANDOFF[_\s-]*K[EÊ]NIA\s*\/?>/giu, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a, b) {
  const left = new Set(normalizeForSimilarity(a).split(" ").filter((word) => word.length > 2));
  const right = new Set(normalizeForSimilarity(b).split(" ").filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function recentAssistantReplies(history) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m.role === "assistant" && String(m.content || "").trim())
    .map((m) => cleanRepeatedText(m.content))
    .slice(-4);
}

function isNearDuplicateReply(reply, history) {
  const normalizedReply = normalizeForSimilarity(reply);
  if (!normalizedReply) return false;
  return recentAssistantReplies(history).some((previous) => {
    const normalizedPrevious = normalizeForSimilarity(previous);
    if (!normalizedPrevious) return false;
    const score = similarityScore(normalizedReply, normalizedPrevious);
    return normalizedReply === normalizedPrevious || score >= 0.86 || (normalizedReply.length < 240 && score >= 0.72);
  });
}

function buildNonRepeatingFallback(userText, contactName = "cliente") {
  const firstName = String(contactName || "cliente").split(" ")[0] || "cliente";
  const txt = String(userText || "").toLowerCase();
  if (userAskedTemporalInfo(txt)) return `Hoje é ${saoPauloTemporalContext().replace(/^.*referência\s+/i, "").replace(/,\s*America\/Sao_Paulo\..*$/i, ".")}`;
  if (/\b(agendar|marcar|consulta|reuni[aã]o|hor[aá]rio|atendimento)\b/i.test(txt)) {
    return `${firstName}, claro. Para registrar a consulta, me envie nome completo, telefone, e-mail, cidade/estado, área do caso, data e horário desejados.`;
  }
  if (/\b(div[oó]rcio|guarda|pens[aã]o|fam[ií]lia|invent[aá]rio|trabalhista|demiss[aã]o|rescis[aã]o|inss|aposentadoria|consumidor|cobran[cç]a|audi[eê]ncia|intima[cç][aã]o)\b/i.test(txt)) {
    return `${firstName}, entendi. Me diga quando isso aconteceu, sua cidade/estado e se existe algum prazo, audiência ou documento recebido.`;
  }
  return `${firstName}, entendi. Para eu avançar no atendimento, me conte em uma frase o que aconteceu e qual orientação você precisa agora.`;
}

function userAskedTemporalInfo(text) {
  return /\b(que\s+horas|qual\s+(?:é\s+)?(?:a\s+)?hora|hor[áa]rio\s+atual|data\s+de\s+hoje|que\s+dia\s+(?:é|estamos)|hoje\s+[ée]\s+que\s+dia|dia\s+da\s+semana)\b/i.test(String(text || ""));
}

function removeTemporalLeaks(reply, userText) {
  if (userAskedTemporalInfo(userText)) return reply;
  return String(reply || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/\b(hoje\s+[ée]|agora\s+s[aã]o|s[aã]o\s+\d{1,2}:\d{2}|hora\s+atual|data\s+de\s+hoje|segunda-feira|terça-feira|ter[cç]a-feira|quarta-feira|quinta-feira|sexta-feira|s[áa]bado|domingo)\b/i.test(part))
    .join(" ")
    .trim();
}

async function callAI(messagesPayload, options = {}) {
  const ollamaPrompt = messagesPayload
    .map((message) => {
      const role = message.role === "system" ? "Instruções" : message.role === "assistant" ? "Atendente" : "Cliente";
      return `${role}: ${message.content}`;
    })
    .join("\n\n");

  const attempts = [];
  const fallbackProviderConfigured = Boolean(LOVABLE_API_KEY || OPENAI_API_KEY || EMERGENT_API_KEY);
  const skipOllamaWhenDisconnected = !ollamaStatus.ok && fallbackProviderConfigured && ollamaStatus.last_checked_at;
  if (skipOllamaWhenDisconnected) {
    attempts.push({
      ok: false,
      provider: "ollama",
      endpoint: OLLAMA_URL,
      model: OLLAMA_MODEL,
      skipped: true,
      error: ollamaStatus.last_error || "Ollama desconectado no último healthcheck.",
    });
  }
  if (!skipOllamaWhenDisconnected) {
    try {
      const reply = await perguntarIA(`${ollamaPrompt}\n\nAtendente:`);
      return { ok: true, provider: "ollama", endpoint: OLLAMA_URL, model: OLLAMA_MODEL, reply: cleanRepeatedText(reply), attempts };
    } catch (e) {
      const timedOut = e?.name === "AbortError";
      const failed = {
        ok: false,
        provider: "ollama",
        endpoint: OLLAMA_URL,
        model: OLLAMA_MODEL,
        error: timedOut ? `Tempo esgotado após ${AI_REQUEST_TIMEOUT_MS}ms aguardando resposta do Ollama.` : e?.message || String(e),
      };
      attempts.push(failed);
      recordAutoReply({ step: "ai_provider_fail", provider: "ollama", error: failed.error });
    }
  }

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
    return { ok: false, error: "Ollama falhou e nenhuma chave alternativa de IA está configurada (OPENAI_API_KEY, EMERGENT_API_KEY ou LOVABLE_API_KEY).", attempts, ...attempts[attempts.length - 1] };
  }

  for (const cfg of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(cfg.endpoint, {
        method: "POST",
        headers: cfg.headers,
        signal: controller.signal,
          body: JSON.stringify({
            model: cfg.model,
            messages: messagesPayload,
            ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
          }),
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
      return { ok: true, provider: cfg.provider, endpoint: cfg.endpoint, model: cfg.model, reply: cleanRepeatedText(reply), attempts };
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
  if (userTurns <= 1) return "Olá! Sou a secretária da Kênia Garcia. Como posso ajudar?";
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

function shouldScheduleWaitFollowUp(reply) {
  const text = String(reply || "").toLowerCase();
  return /\b(vou\s+verificar|vou\s+confirmar|te\s+retorno|retorno\s+em|aguard|um\s+momento|minutinho|minuto)\b/i.test(text);
}

function waitFollowUpText(contactName) {
  const name = String(contactName || "").trim().split(/\s+/)[0] || "cliente";
  return `${name}, ainda estou verificando por aqui e já te retorno. Obrigada por aguardar. 🙏`;
}

function scheduleWaitFollowUp(jid, contactName) {
  setTimeout(async () => {
    if (!sock || connectionState !== "open") return;
    try {
      await sendBotText(jid, waitFollowUpText(contactName), { source: "wait_follow_up" });
      recordAutoReply({ step: "wait_follow_up_sent", jid });
    } catch (e) {
      queueAutoReply(jid, waitFollowUpText(contactName), { source: "wait_follow_up", reason: e?.message || String(e) });
    }
  }, 65000);
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
  const lastReplies = recentAssistantReplies(history);
  const antiRepetitionContext = lastReplies.length
    ? `\nANTI-REPETIÇÃO OPERACIONAL:\nÚltimas respostas enviadas:\n${lastReplies.map((item, index) => `${index + 1}. ${item}`).join("\n")}\nNão repita nenhuma delas; avance a conversa respondendo à última mensagem do cliente.`
    : "";
  const messagesPayload = [
    { role: "system", content: `${AI_SYSTEM_PROMPT}\n${saoPauloTemporalContext()}\nNome do contato: ${contactName || "Cliente"}.${antiRepetitionContext}` },
    ...history,
    { role: "user", content: userText },
  ];
  recordAutoReply({ step: "ai_request", jid, providers: ["ollama", OPENAI_API_KEY && "openai", EMERGENT_API_KEY && "emergent", LOVABLE_API_KEY && "lovable"].filter(Boolean) });
  let result = await callAI(messagesPayload, { temperature: 0.72 });
  const usedFallback = !result.ok;
  let rawReply = usedFallback ? buildLocalLegalReply(jid, userText, contactName) : result.reply;
  if (!usedFallback && isNearDuplicateReply(rawReply, history)) {
    const retry = await callAI([
      { role: "system", content: `${AI_SYSTEM_PROMPT}\n${saoPauloTemporalContext()}\nCORREÇÃO OBRIGATÓRIA: a resposta candidata repetiu uma mensagem anterior. Gere uma resposta nova, curta, útil, sem saudação inicial e sem repetir perguntas já feitas.` },
      ...history,
      { role: "user", content: userText },
    ], { temperature: 0.9 });
    if (retry.ok) {
      result = retry;
      rawReply = retry.reply;
    }
    if (isNearDuplicateReply(rawReply, history)) rawReply = buildNonRepeatingFallback(userText, contactName);
  }
  const reply = cleanRepeatedText(removeTemporalLeaks(rawReply, userText));
  if (usedFallback) recordAutoReply({ step: "ai_fail_local_fallback", jid, result, reply: reply.slice(0, 200) });
  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: reply });
  aiHistory.set(jid, history);
  try {
    const sent = await sendBotText(jid, reply, { source: usedFallback ? "local_fallback" : result.provider });
    recordAutoReply({ step: "sent", jid, attempt: sent.attempt, provider: usedFallback ? "local_fallback" : result.provider, model: result.model || null, reply: reply.slice(0, 200) });
    if (shouldScheduleWaitFollowUp(reply)) scheduleWaitFollowUp(jid, contactName);
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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "120.0.0.0"],
    qrTimeout: QR_TIMEOUT_MS,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    emitOwnEvents: false,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 500,
    getMessage: async () => ({ conversation: "" }),
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
      lastDisconnectCode = null;
      lastOpenAt = Date.now();
      reconnectAttempts = 0;
      reconnectingSince = null;
      manualLogoutRequested = false;
      starting = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      processAutoReplyQueue().catch((e) => recordAutoReply({ step: "queue_process_error", error: e?.message || String(e) }));
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode || new Boom(lastDisconnect?.error)?.output?.statusCode;
      lastError = lastDisconnect?.error?.message || null;
      lastDisconnectCode = code || null;
      const loggedOut = code === DisconnectReason.loggedOut;
      const replaced = code === DisconnectReason.connectionReplaced;
      const transientLoggedOut = loggedOut && !manualLogoutRequested && lastOpenAt && Date.now() - lastOpenAt < 30000;
      const shouldReconnect = !manualLogoutRequested && (!loggedOut || transientLoggedOut);
      reconnectAttempts = shouldReconnect ? reconnectAttempts + 1 : 0;
      if (shouldReconnect && !reconnectingSince) reconnectingSince = Date.now();
      const backoff = Math.min(RECONNECT_DELAY_MS * Math.max(1, reconnectAttempts), RECONNECT_MAX_DELAY_MS);
      const delay = code === DisconnectReason.restartRequired ? 250 : replaced ? 5000 : backoff;
      await closeSock();
      starting = false;
      connectionState = shouldReconnect ? "disconnected" : "logged_out";
      currentQR = null;
      currentQRAt = null;
      if (!shouldReconnect && loggedOut) {
        try {
          const fs = await import("node:fs/promises");
          await fs.rm(AUTH_DIR, { recursive: true, force: true });
        } catch {}
      }
      if (shouldReconnect && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startSock().catch((e) => { lastError = e?.message || String(e); });
        }, replaced ? 5000 : delay);
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
  manualLogoutRequested = Boolean(resetAuth);
  await closeSock();
  currentQR = null;
  currentQRAt = null;
  lastError = null;
  lastDisconnectCode = null;
  reconnectAttempts = 0;
  reconnectingSince = null;
  connectionState = "connecting";
  if (resetAuth) {
    await rm(AUTH_DIR, { recursive: true, force: true });
    await mkdir(AUTH_DIR, { recursive: true });
  }
  manualLogoutRequested = false;
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
startOllamaKeepAlive();
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

const buildDeadlineNotice = (item) => {
  const due = item?.due_at ? new Date(item.due_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "prazo próximo";
  return [
    `Olá, ${item?.client_name || "cliente"}. O escritório identificou uma movimentação/prazo no seu processo.`,
    `Processo: ${item?.process_number || "não informado"}`,
    `Providência: ${item?.title || "verificação jurídica"}`,
    `Prazo: ${due}`,
    "A equipe vai acompanhar e, se precisar de documento, avisaremos por aqui.",
  ].join("\n");
};

const baileysRuntimeStatus = () => {
  const connected = connectionState === "open" || Boolean(sock?.user && connectionState !== "logged_out");
  const qrAgeMs = currentQRAt ? Date.now() - currentQRAt : null;
  return {
    ok: true,
    connected,
    state: connected ? "open" : connectionState,
    last_error: connected ? null : lastError,
    last_disconnect_code: lastDisconnectCode,
    reconnect_attempts: reconnectAttempts,
    reconnecting_for_s: reconnectingSince ? Math.floor((Date.now() - reconnectingSince) / 1000) : 0,
    last_open_at: lastOpenAt ? new Date(lastOpenAt).toISOString() : null,
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

app.get("/api/debug/instructions", (_req, res) => {
  res.json(debugInstructions.slice(0, 50));
});

app.post("/api/debug/instruction", (req, res) => {
  const instruction = String(req.body?.instruction || "").trim();
  if (!instruction) return res.status(400).json({ ok: false, error: "Instrução vazia." });
  debugInstructions.unshift({ id: `debug-${Date.now()}`, instruction, created_at: new Date().toISOString() });
  res.status(201).json({ ok: true });
});

app.get("/api/legal-deadlines", (_req, res) => {
  res.json(legalDeadlines.sort((a, b) => String(a.due_at || "").localeCompare(String(b.due_at || ""))));
});

app.post("/api/legal-deadlines/sync", (_req, res) => {
  const updatedAt = new Date().toISOString();
  for (const item of legalDeadlines) item.last_sync_at = updatedAt;
  res.json(ok({ providers: ["escavador", "jusbrasil", "datalawyer"], fallback: true, updated_at: updatedAt, items: legalDeadlines }));
});

app.post("/api/legal-deadlines", (req, res) => {
  const item = {
    id: `deadline-${Date.now()}`,
    status: "pending",
    urgency: "media",
    whatsapp_notified: false,
    created_at: new Date().toISOString(),
    ...(req.body || {}),
  };
  legalDeadlines.unshift(item);
  res.status(201).json(item);
});

app.patch("/api/legal-deadlines/:id", (req, res) => {
  const item = legalDeadlines.find((d) => d.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "deadline_not_found" });
  Object.assign(item, req.body || {}, { updated_at: new Date().toISOString() });
  res.json(item);
});

app.post("/api/legal-deadlines/:id/notify", async (req, res) => {
  const item = legalDeadlines.find((d) => d.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "deadline_not_found" });
  const jid = normalizeRecipient(req.body?.phone || item.client_phone);
  if (!jid || !sock || connectionState !== "open") {
    Object.assign(item, { whatsapp_notified: false, notification_channel: "app", notification_status: "fallback", notified_at: new Date().toISOString() });
    return res.json(ok({ delivered: false, channel: "app", fallback: true, state: connectionState }));
  }
  try {
    const out = await sendBotText(jid, buildDeadlineNotice(item), { source: "deadline_notice" });
    Object.assign(item, { whatsapp_notified: true, notification_channel: "whatsapp", notification_status: "sent", notified_at: new Date().toISOString() });
    res.json(ok({ delivered: true, channel: "whatsapp", message: out.out }));
  } catch (e) {
    Object.assign(item, { whatsapp_notified: false, notification_channel: "app", notification_status: "fallback", notification_error: e?.message || String(e), notified_at: new Date().toISOString() });
    res.json(ok({ delivered: false, channel: "app", fallback: true, error: e?.message || String(e) }));
  }
});

app.get("/api/whatsapp/config", (_req, res) => res.json({ ...whatsappConfig, bot_prompt: AI_SYSTEM_PROMPT }));

// Teste rapido da chave de IA configurada no servidor
app.get("/api/whatsapp/ai-test", async (_req, res) => {
  const ollama = await refreshOllamaStatus().catch(() => ollamaStatus);
  const info = {
    ollama,
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
  res.json({ ok: result.ok, fallback: !result.ok, ...info, result });
});

// Mostra os últimos eventos do atendente automático (substitui leitura de log do Render)
app.get("/api/whatsapp/ai-debug", (_req, res) => {
  const status = baileysRuntimeStatus();
  res.json({
    ollama: ollamaStatus,
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

app.get("/api/whatsapp/ollama-status", async (_req, res) => {
  const status = await refreshOllamaStatus().catch(() => ollamaStatus);
  res.json({
    ok: status.ok,
    connected: status.ok,
    ...status,
    keep_alive: OLLAMA_KEEP_ALIVE,
    health_interval_ms: OLLAMA_HEALTH_INTERVAL_MS,
    hint: status.ok ? null : "Se aparecer 404/HTML/ngrok, abra um novo túnel para a porta 11434 e atualize OLLAMA_URL no backend publicado.",
  });
});



app.put("/api/whatsapp/config", (req, res) => {
  whatsappConfig = { ...whatsappConfig, ...(req.body || {}), bot_prompt: AI_SYSTEM_PROMPT };
  res.json({ ...whatsappConfig, bot_prompt: AI_SYSTEM_PROMPT });
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
      {
        id: "ollama",
        ok: ollamaStatus.ok,
        label: "Ollama / IA local",
        msg: ollamaStatus.ok
          ? `Conectado em ${ollamaStatus.base_url} com modelo ${ollamaStatus.model}.`
          : `Desconectado: ${ollamaStatus.last_error || "ainda não testado"}`,
        hint: ollamaStatus.ok
          ? null
          : "Atualize OLLAMA_URL no Render para o ngrok ativo do Ollama (porta 11434) e redeploy; enquanto isso, o robô usa fallback/local se disponível.",
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
    manualLogoutRequested = true;
    if (sock && connectionState === "open") await sock.logout();
    const status = await restartSock({ resetAuth: true });
    res.json(ok(status));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

app.post("/api/whatsapp/baileys/logout", async (req, res) => {
  try {
    manualLogoutRequested = true;
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
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const normalizedHistory = history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
  const lastReplies = recentAssistantReplies(normalizedHistory);
  const antiRepetitionContext = lastReplies.length
    ? `\nANTI-REPETIÇÃO OPERACIONAL:\nÚltimas respostas enviadas:\n${lastReplies.map((item, index) => `${index + 1}. ${item}`).join("\n")}\nNão repita nenhuma delas; avance a conversa respondendo à última mensagem do cliente.`
    : "";
  let result = await callAI([
    { role: "system", content: `${AI_SYSTEM_PROMPT}\n${saoPauloTemporalContext()}${antiRepetitionContext}` },
    ...normalizedHistory,
    { role: "user", content: message },
  ], { temperature: 0.72 });
  let rawReply = result.ok ? result.reply : buildLocalLegalReply(req.body?.session_id || "web", message, req.body?.visitor_name || "Cliente");
  if (result.ok && isNearDuplicateReply(rawReply, normalizedHistory)) {
    const retry = await callAI([
      { role: "system", content: `${AI_SYSTEM_PROMPT}\n${saoPauloTemporalContext()}\nCORREÇÃO OBRIGATÓRIA: a resposta candidata repetiu uma mensagem anterior. Gere uma resposta nova, curta, útil, sem saudação inicial e sem repetir perguntas já feitas.` },
      ...normalizedHistory,
      { role: "user", content: message },
    ], { temperature: 0.9 });
    if (retry.ok) {
      result = retry;
      rawReply = retry.reply;
    }
    if (isNearDuplicateReply(rawReply, normalizedHistory)) rawReply = buildNonRepeatingFallback(message, req.body?.visitor_name || "Cliente");
  }
  const handoff = /HANDOFF[_\s-]*K[EÊ]NIA/i.test(rawReply);
  const reply = cleanRepeatedText(removeTemporalLeaks(rawReply, message)).trim();
  res.json({
    session_id: req.body?.session_id || `session-${Date.now()}`,
    response: reply,
    audio_base64: null,
    handoff,
    speaker: handoff ? "Dra. Kênia Garcia" : "Secretária",
    analysis: { acertividade: result.ok ? 90 : 70, qualificacao: result.ok ? "ok" : "fallback" },
  });
});

// ---- Fallback /api/* ----
app.all("/api/*", (_req, res) => res.json(ok({ fallback: true })));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on :${PORT}`);
});
