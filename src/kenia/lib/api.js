import axios from "axios";
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
export const HAS_BACKEND = Boolean(BACKEND_URL);
export const API = HAS_BACKEND ? `${BACKEND_URL}/api` : "";


const nowIso = () => new Date().toISOString();
const inDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};

const DEFAULT_PROMPT =
  "Você é a atendente Kênia Garcia. Atenda com linguagem humana, acolhedora e profissional. Não pergunte a área jurídica no início; peça primeiro para o cliente contar o que aconteceu, identifique a área automaticamente pelo relato e responda às dúvidas com orientação jurídica inicial, sem parecer definitivo. Depois colete nome, telefone, urgência e documentos necessários. Nunca diga que é IA.";

const defaultWhatsAppConfig = {
  provider: "zapi",
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

const stages = [
  { id: "novos_leads", label: "Novos Leads", color: "blue" },
  { id: "em_contato", label: "Em Contato", color: "yellow" },
  { id: "interessado", label: "Interessado", color: "green" },
  { id: "qualificado", label: "Qualificado", color: "emerald" },
  { id: "em_negociacao", label: "Em Negociação", color: "orange" },
  { id: "convertido", label: "Convertido", color: "purple" },
  { id: "nao_interessado", label: "Não Interessado", color: "red" },
];

const seedLeads = [
  {
    id: "lead-1",
    name: "Mariana Souza",
    phone: "(62) 99123-4455",
    email: "mariana@email.com",
    case_type: "Trabalhista",
    description: "Relata rescisão sem pagamento de verbas e precisa separar documentos do contrato.",
    stage: "qualificado",
    urgency: "alta",
    score: 88,
    source: "WhatsApp",
    tags: ["verbas rescisórias", "documentos pendentes"],
  },
  {
    id: "lead-2",
    name: "Carlos Henrique",
    phone: "(62) 99888-1200",
    email: "carlos@email.com",
    case_type: "Previdenciário/INSS",
    description: "Busca revisão de benefício e já possui carta de concessão.",
    stage: "em_contato",
    urgency: "media",
    score: 72,
    source: "Landing",
    tags: ["INSS", "revisão"],
  },
];

const seedContacts = [
  {
    id: "contact-1",
    name: "Mariana Souza",
    phone: "(62) 99123-4455",
    last_message: "Dra., posso enviar a rescisão por aqui?",
    last_message_at: nowIso(),
    unread: 2,
    avatar_color: "bg-gold-600",
    sinestesic_style: "visual",
    prefers_audio: false,
  },
  {
    id: "contact-2",
    name: "Carlos Henrique",
    phone: "(62) 99888-1200",
    last_message: "Tenho a carta do INSS em PDF.",
    last_message_at: inDays(-1),
    unread: 0,
    avatar_color: "bg-nude-700",
    sinestesic_style: "auditivo",
    prefers_audio: true,
  },
];

const seedMessages = {
  "contact-1": [
    { id: "m1", text: "Oi, Dra. Kênia. Saí da empresa e não recebi tudo.", from_me: false, created_at: nowIso() },
    { id: "m2", text: "Entendo, Mariana. Me envie a rescisão e os comprovantes para eu conferir.", from_me: true, created_at: nowIso() },
    { id: "m3", text: "Dra., posso enviar a rescisão por aqui?", from_me: false, created_at: nowIso() },
  ],
  "contact-2": [
    { id: "m4", text: "Tenho a carta do INSS em PDF.", from_me: false, created_at: inDays(-1) },
    { id: "m5", text: "Pode enviar. Vou verificar se cabe revisão do benefício.", from_me: true, created_at: inDays(-1) },
  ],
};

const seedProcesses = [
  {
    id: "proc-1",
    client_name: "Mariana Souza",
    process_number: "0001234-56.2026.5.18.0001",
    case_type: "Trabalhista",
    court: "TRT 18ª Região",
    status: "Em Andamento",
    description: "Pedido de verbas rescisórias e multa.",
    next_hearing: inDays(7).slice(0, 10),
  },
  {
    id: "proc-2",
    client_name: "Carlos Henrique",
    process_number: "0009876-11.2026.4.01.3500",
    case_type: "Previdenciário",
    court: "JEF Goiás",
    status: "Aguardando Sentença",
    description: "Revisão de benefício previdenciário.",
    next_hearing: inDays(21).slice(0, 10),
  },
];

const seedAppointments = [
  {
    id: "appt-1",
    title: "Consulta inicial — Trabalhista",
    client_name: "Mariana Souza",
    starts_at: inDays(2),
    duration_min: 60,
    location: "Google Meet",
    notes: "Analisar TRCT e comprovantes.",
    status: "confirmado",
  },
];

const seedTransactions = [
  { id: "tx-1", client_name: "Mariana Souza", description: "Honorários iniciais", amount: 1800, type: "receita", status: "pago", due_date: inDays(-3).slice(0, 10) },
  { id: "tx-2", client_name: "Carlos Henrique", description: "Parcela consultoria", amount: 900, type: "receita", status: "pendente", due_date: inDays(5).slice(0, 10) },
  { id: "tx-3", client_name: "Escritório", description: "Custas operacionais", amount: 320, type: "despesa", status: "pago", due_date: inDays(-1).slice(0, 10) },
];

const seedCreatives = [
  {
    id: "creative-1",
    title: "Direitos na rescisão",
    network: "instagram",
    format: "post",
    caption: "Você saiu da empresa e não sabe se recebeu tudo? Separe TRCT, holerites e comprovantes. A análise correta evita prejuízo.",
    image_b64: "",
  },
];

const seedLogs = [
  { id: "log-1", text: "Oi, preciso de ajuda trabalhista", contact_name: "Mariana Souza", contact_phone: "(62) 99123-4455", from_me: false, bot: false, created_at: nowIso() },
  { id: "log-2", text: "Claro, me conte o que aconteceu.", contact_name: "Mariana Souza", contact_phone: "(62) 99123-4455", from_me: true, bot: true, created_at: nowIso() },
];

const seedAnalyses = [
  {
    id: "case-1",
    visitor_name: "Mariana Souza",
    visitor_phone: "(62) 99123-4455",
    area: "Trabalhista",
    qualificacao: "qualificado",
    acertividade: 86,
    chance_exito: 74,
    resumo: "Possível atraso em verbas rescisórias após desligamento.",
    motivo: "Há indícios de vínculo formal e documentos disponíveis para conferência.",
    fundamentos: ["CLT — verbas rescisórias", "Multa por atraso quando aplicável"],
    proxima_pergunta: "Você tem o TRCT e os últimos holerites?",
    admin_notes: "Priorizar retorno em até 24h.",
  },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(`static_api_${key}`);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch {
    return clone(fallback);
  }
};
const write = (key, value) => localStorage.setItem(`static_api_${key}`, JSON.stringify(value));
const response = (data, status = 200, headers = {}) => Promise.resolve({ data: clone(data), status, statusText: "OK", headers, config: {} });
const nextId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const getMetrics = () => {
  const leads = read("leads", seedLeads);
  const processes = read("processes", seedProcesses);
  const transactions = read("transactions", seedTransactions);
  const byStage = leads.reduce((acc, l) => ({ ...acc, [l.stage || "novos_leads"]: (acc[l.stage || "novos_leads"] || 0) + 1 }), {});
  const receitaPaga = transactions.filter((t) => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount || 0), 0);
  const receitaPendente = transactions.filter((t) => t.type === "receita" && t.status === "pendente").reduce((s, t) => s + Number(t.amount || 0), 0);
  const despesas = transactions.filter((t) => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount || 0), 0);
  return {
    leads: { total: leads.length, conversion_rate: leads.length ? Math.round(((byStage.convertido || 0) / leads.length) * 100) : 0, by_stage: byStage },
    finance: { receita_paga: receitaPaga, receita_pendente: receitaPendente, despesas, lucro: receitaPaga - despesas },
    processes: { total: processes.length, ativos: processes.filter((p) => p.status !== "Concluído").length },
    alerts: {
      upcoming_hearings: processes.map((p) => ({ process_id: p.id, client_name: p.client_name, case_type: p.case_type, days_left: 7 })).slice(0, 3),
    },
  };
};

const staticGet = (url, config = {}) => {
  const [path] = String(url).split("?");
  if (path === "/whatsapp/config") return response(read("whatsapp_config", defaultWhatsAppConfig));
  if (path === "/crm/stages") return response(stages);
  if (path === "/leads") return response(read("leads", seedLeads));
  if (path === "/whatsapp/contacts") return response(read("contacts", seedContacts));
  if (path.startsWith("/whatsapp/messages/")) return response(read("messages", seedMessages)[path.split("/").pop()] || []);
  if (path === "/dashboard/metrics") return response(getMetrics());
  if (path === "/processes") return response(read("processes", seedProcesses));
  if (path === "/finance/transactions") return response(read("transactions", seedTransactions));
  if (path === "/appointments") return response(read("appointments", seedAppointments));
  if (path === "/creatives") return response(read("creatives", seedCreatives));
  if (path === "/settings") return response({ using_default_text: true, using_default_image: true, llm_text_key_masked: "Emergent padrão", llm_image_key_masked: "Emergent padrão" });
  if (path === "/whatsapp/diagnostics") return response({ ok: true, static_mode: true, checks: [
    { id: "static-site", ok: true, label: "Modo demonstração ativo", msg: "Painel rodando sem backend externo — as funções de WhatsApp em tempo real ficam desativadas até você publicar um backend (Render/VPS) e definir VITE_BACKEND_URL.", hint: "Você pode continuar usando CRM, Agenda, ChatIA e Finance normalmente. Quando publicar o backend Baileys, esta tela passa a exibir o QR Code real." },
  ] });
  if (path === "/whatsapp/default-prompt") return response({ prompt: DEFAULT_PROMPT });
  if (path === "/whatsapp/qr" || path === "/whatsapp/qr/image") return response({ connected: false, error: "STATIC_MODE", fallback: true });
  if (path === "/whatsapp/baileys/status") return response({ ok: true, connected: false, state: "static", last_error: "Modo site estático ativo. Para conectar WhatsApp real, publique também um backend e configure VITE_BACKEND_URL." });
  if (path === "/whatsapp/baileys/qr") return response({ qr: null, state: "static" });
  if (path === "/whatsapp/logs") return response(read("logs", seedLogs));
  if (path === "/whatsapp/bot-delivery-stats") return response({ total_bot: 1, total_failures: 0, recent_failures: [] });
  if (path === "/debug/instructions") return response(read("debug_instructions", []));
  if (path === "/admin/case-analyses") {
    const items = read("case_analyses", seedAnalyses);
    return response({ total: items.length, qualificados: items.filter((i) => i.qualificacao === "qualificado").length, nao_qualificados: items.filter((i) => i.qualificacao === "nao_qualificado").length, necessita_mais_info: items.filter((i) => i.qualificacao === "necessita_mais_info").length, avg_acertividade: items.length ? Math.round(items.reduce((s, i) => s + i.acertividade, 0) / items.length) : 0, items });
  }
  if (path.startsWith("/admin/case-analyses/")) {
    const analysis = read("case_analyses", seedAnalyses).find((i) => i.id === path.split("/").pop()) || seedAnalyses[0];
    return response({ analysis, messages: seedMessages["contact-1"] || [] });
  }
  if (path === "/legislation/today") return response({ date_human: new Date().toLocaleDateString("pt-BR"), brief: "Modo estático ativo. Sem atualização automática de legislação." });
  if (path === "/whatsapp/elevenlabs/voices") return response({ voices: [] });
  return response({ ok: false, error: "STATIC_MODE", fallback: true });
};

const staticPost = (url, body = {}) => {
  const [path] = String(url).split("?");
  if (path === "/public/leads" || path === "/leads") {
    const leads = read("leads", seedLeads);
    const lead = { id: nextId("lead"), stage: "novos_leads", urgency: "media", score: 50, created_at: nowIso(), ...body };
    leads.unshift(lead);
    write("leads", leads);
    return response(lead, 201);
  }
  if (path === "/whatsapp/send") {
    const messages = read("messages", seedMessages);
    const msg = { id: nextId("msg"), text: body.text, from_me: true, created_at: nowIso() };
    messages[body.contact_id] = [...(messages[body.contact_id] || []), msg];
    write("messages", messages);
    return response({ message: msg, provider_result: { static: true } });
  }
  if (path === "/chat/message") {
    return (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("chat-ai", {
          body: {
            message: body.message || body.text || "",
            history: body.history || [],
            system_prompt: body.system_prompt,
          },
        });
        if (error) throw error;
        return {
          data: {
            session_id: body.session_id || nextId("session"),
            response: data?.response || "Sem resposta da IA.",
            audio_base64: data?.audio_base64 || null,
            analysis: data?.analysis || { acertividade: 80, qualificacao: "ok" },
            server_time: data?.server_time,
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {},
        };
      } catch (e) {
        return {
          data: {
            session_id: body.session_id || nextId("session"),
            response: `Erro ao consultar IA: ${e?.message || e}. Verifique se a edge function chat-ai está publicada.`,
            audio_base64: null,
            analysis: { acertividade: 0, qualificacao: "erro" },
          },
          status: 200, statusText: "OK", headers: {}, config: {},
        };
      }
    })();
  }

  if (path === "/finance/transactions") return insertItem("transactions", seedTransactions, "tx", body);
  if (path === "/appointments") return insertItem("appointments", seedAppointments, "appt", body);
  if (path === "/processes") return insertItem("processes", seedProcesses, "proc", body);
  if (path === "/creatives/generate") {
    const item = { id: nextId("creative"), ...body, caption: `Post sugerido: ${body.topic}.\n\nExplique o direito com clareza, convide o cliente a separar documentos e finalize com chamada para atendimento.`, image_b64: "" };
    const items = read("creatives", seedCreatives);
    items.unshift(item);
    write("creatives", items);
    return response(item, 201);
  }
  if (path === "/debug/instruction") {
    const items = read("debug_instructions", []);
    items.unshift({ id: nextId("debug"), instruction: body.instruction, created_at: nowIso() });
    write("debug_instructions", items);
    return response({ ok: true });
  }
  if (path === "/settings/test-text" || path === "/settings/test-image") return response({ ok: false, error: "Modo estático: backend de teste indisponível.", model: "static" });
  if (path === "/whatsapp/test-connection") return response({ connected: false, provider: "static", error: "STATIC_MODE", hint: "Site publicado como estático; conexão real de WhatsApp exige backend externo." });
  if (path.startsWith("/whatsapp/")) return response({ ok: false, connected: false, fallback: true, state: "offline", error: "STATIC_MODE" });
  if (path === "/legislation/refresh" || path === "/seed/demo") return response({ ok: true });
  if (path === "/creatives/fuse-images") return response({ ok: false, error: "Modo estático: geração de imagem exige backend." });
  if (path === "/public/consulta") return response({ found: true, processes: seedProcesses, client_name: "Cliente demonstração" });
  return response({ ok: false, fallback: true, error: "STATIC_MODE" });
};

const insertItem = (key, fallback, prefix, body) => {
  const items = read(key, fallback);
  const item = { id: nextId(prefix), created_at: nowIso(), ...body };
  items.unshift(item);
  write(key, items);
  return response(item, 201);
};

const staticPut = (url, body = {}) => {
  const [path] = String(url).split("?");
  if (path === "/whatsapp/config") {
    const cfg = { ...read("whatsapp_config", defaultWhatsAppConfig), ...body };
    write("whatsapp_config", cfg);
    return response(cfg);
  }
  if (path === "/settings") return response({ ok: true });
  return response({ ok: true, fallback: true });
};

const staticPatch = (url, body = {}) => {
  const [path] = String(url).split("?");
  const updateCollection = (key, fallback) => {
    const id = path.split("/").pop();
    const items = read(key, fallback).map((item) => (item.id === id ? { ...item, ...body } : item));
    write(key, items);
    return response(items.find((item) => item.id === id) || { ok: true });
  };
  if (path.startsWith("/leads/")) return updateCollection("leads", seedLeads);
  if (path.startsWith("/finance/transactions/")) return updateCollection("transactions", seedTransactions);
  if (path.startsWith("/appointments/")) return updateCollection("appointments", seedAppointments);
  if (path.startsWith("/admin/case-analyses/")) return updateCollection("case_analyses", seedAnalyses);
  return response({ ok: true, fallback: true });
};

const staticDelete = (url) => {
  const [path] = String(url).split("?");
  const removeFrom = (key, fallback) => {
    const id = path.split("/").pop();
    write(key, read(key, fallback).filter((item) => item.id !== id));
    return response({ ok: true });
  };
  if (path.startsWith("/leads/")) return removeFrom("leads", seedLeads);
  if (path.startsWith("/finance/transactions/")) return removeFrom("transactions", seedTransactions);
  if (path.startsWith("/appointments/")) return removeFrom("appointments", seedAppointments);
  if (path.startsWith("/processes/")) return removeFrom("processes", seedProcesses);
  if (path.startsWith("/creatives/")) return removeFrom("creatives", seedCreatives);
  return response({ ok: true, fallback: true });
};

const liveApi = axios.create({ baseURL: API });

liveApi.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("lf_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

liveApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("lf_token");
      localStorage.removeItem("lf_user");
      if (!window.location.pathname.startsWith("/login") && window.location.pathname !== "/") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const api = HAS_BACKEND
  ? liveApi
  : {
      get: staticGet,
      post: staticPost,
      put: staticPut,
      patch: staticPatch,
      delete: staticDelete,
    };