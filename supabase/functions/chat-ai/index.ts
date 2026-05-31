const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SAO_PAULO_TZ = "America/Sao_Paulo";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";
const EMERGENT_MODEL = Deno.env.get("EMERGENT_MODEL") || "gpt-4o-mini";
const EMERGENT_BASE_URL = (Deno.env.get("EMERGENT_BASE_URL") || "https://integrations.emergentagent.com/llm/v1").replace(/\/$/, "");

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const nowContext = () => {
  const now = new Date();
  return {
    iso: now.toISOString(),
    sao_paulo: new Intl.DateTimeFormat("pt-BR", {
      timeZone: SAO_PAULO_TZ,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now),
  };
};

const normalizeMessages = (messages: unknown, fallbackMessage: string): ChatMessage[] => {
  if (!Array.isArray(messages)) return [{ role: "user", content: fallbackMessage }];
  return messages
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const item = m as { role?: string; content?: unknown };
      const role = item.role === "assistant" || item.role === "system" || item.role === "user" ? item.role : "user";
      return { role, content: String(item.content || "").slice(0, 8000) };
    })
    .filter((m) => m.content.trim().length > 0)
    .slice(-16);
};

async function callProvider(cfg: { provider: string; endpoint: string; model: string; headers: HeadersInit }, messages: ChatMessage[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: cfg.headers,
      signal: controller.signal,
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.45 }),
    });
    const raw = await resp.text();
    if (!resp.ok) {
      return { ok: false, provider: cfg.provider, status: resp.status, error: raw.slice(0, 600) };
    }
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, provider: cfg.provider, status: 502, error: "Resposta vazia da IA" };
    return { ok: true, provider: cfg.provider, model: cfg.model, text };
  } catch (error) {
    return {
      ok: false,
      provider: cfg.provider,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const buildLocalFallback = (message: string, dateHuman: string) =>
  `Estou com uma instabilidade temporária na IA, mas sigo com você. Hoje é ${dateHuman} em São Paulo.\n\nPara eu organizar seu atendimento, me diga: qual é a área do caso, o que aconteceu, se existe prazo/audiência e em qual cidade você está?`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.message || "").trim();
    if (!userMessage) return json({ error: "Mensagem obrigatória" }, 400);

    const current = nowContext();
    const system: ChatMessage = {
      role: "system",
      content: [
        "Você é Ana, secretária jurídica virtual da Dra. Kênia Garcia. Responda em português brasileiro, com tom humano, acolhedor e profissional.",
        "Nunca diga que é IA. Não dê promessa de resultado, valores definitivos ou parecer jurídico fechado.",
        `Data e hora atuais oficiais fornecidas pelo servidor: ${current.sao_paulo} (${SAO_PAULO_TZ}). Use esta informação sempre que o usuário perguntar data, hora, hoje, amanhã ou agendamento. Não invente datas pelo modelo.`,
        "Ao final, quando útil, faça uma pergunta objetiva para qualificar: área, resumo do caso, urgência/prazo, cidade e documentos.",
      ].join("\n"),
    };

    const messages = [system, ...normalizeMessages(body?.messages, userMessage), { role: "user", content: userMessage } as ChatMessage];
    const providers = [
      Deno.env.get("LOVABLE_API_KEY") && {
        provider: "lovable",
        endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
        model: LOVABLE_MODEL,
        headers: {
          "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY")!,
          "X-Lovable-AIG-SDK": "fetch-edge-function",
          "Content-Type": "application/json",
        },
      },
      Deno.env.get("EMERGENT_API_KEY") && {
        provider: "emergent",
        endpoint: `${EMERGENT_BASE_URL}/chat/completions`,
        model: EMERGENT_MODEL,
        headers: { Authorization: `Bearer ${Deno.env.get("EMERGENT_API_KEY")}`, "Content-Type": "application/json" },
      },
    ].filter(Boolean) as Array<{ provider: string; endpoint: string; model: string; headers: HeadersInit }>;

    const attempts = [];
    for (const provider of providers) {
      const result = await callProvider(provider, messages);
      attempts.push(result);
      if (result.ok) {
        return json({
          session_id: body?.session_id || crypto.randomUUID(),
          response: result.text,
          audio_base64: null,
          provider: result.provider,
          model: result.model,
          current_datetime: current,
          analysis: { acertividade: 72, chance_exito: 60, qualificacao: "necessita_mais_info", area: "Em análise", proxima_pergunta: "Você possui algum prazo, audiência ou notificação relacionada a esse caso?" },
        });
      }
    }

    return json({
      session_id: body?.session_id || crypto.randomUUID(),
      response: buildLocalFallback(userMessage, current.sao_paulo),
      audio_base64: null,
      provider: "local_fallback",
      current_datetime: current,
      attempts,
      analysis: { acertividade: 45, chance_exito: 45, qualificacao: "necessita_mais_info", area: "Em análise", proxima_pergunta: "Qual é a área do seu caso e existe algum prazo próximo?" },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});