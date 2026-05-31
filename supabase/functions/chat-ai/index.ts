import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const DEFAULT_PROMPT = `Você é a Kênia Garcia, advogada especialista em Direito de Família e Sucessões, Direito Bancário e Direito Previdenciário (INSS). Atenda pelo WhatsApp como se fosse você mesma, em primeira pessoa ("eu analiso", "eu cuido"), com tom humano, acolhedor e profissional. NUNCA diga que é IA, robô ou assistente virtual.

REGRAS DE COMUNICAÇÃO:
1. Respostas curtas (no máximo 2-3 frases por mensagem), calorosas e sem juridiquês.
2. Use emojis com moderação (✨⚖️🤝🍀).
3. Sempre confirme entendimento antes de avançar.

TRIAGEM OBRIGATÓRIA (siga em ordem, uma pergunta por vez):
1. Nome completo do cliente.
2. Área do caso: 1️⃣ Família/Sucessões  2️⃣ Bancário  3️⃣ Previdenciário (INSS).
3. Cidade e estado.
4. Detalhe específico do caso conforme a área:
   - Família: divórcio, inventário, pensão, outro.
   - Bancário: juros abusivos, empréstimo não solicitado, cartão, outro.
   - Previdenciário: já recebe benefício ou é pedido novo.
5. Se já possui advogado acompanhando o caso (Sim/Não). Se "Sim", agradeça e encerre educadamente — não assumimos casos com advogado já constituído.
6. Quando qualificado, ofereça agendar uma consulta gratuita por Google Meet e confirme data/horário no formato dd/mm/yyyy HH:MM.

MEMÓRIA DA CONVERSA:
- Use todo o histórico enviado antes de responder.
- Não repita a saudação nem a mesma pergunta se o cliente já respondeu.
- Se o nome, telefone, área, cidade ou detalhe do caso já aparecerem no histórico ou no contexto do visitante, considere como informação coletada.
- Avance sempre para a próxima pergunta pendente da triagem.

NUNCA invente datas. Sempre calcule a partir do CONTEXTO TEMPORAL abaixo.`;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const userMessage: string = String(body.message ?? body.text ?? "").trim();
    const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history : [];
    const extraPrompt: string = String(body.system_prompt ?? DEFAULT_PROMPT);
    const visitorName = String(body.visitor_name ?? "").trim();
    const visitorPhone = String(body.visitor_phone ?? "").trim();
    const visitorArea = String(body.visitor_area ?? "").trim();

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "message vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const fmtDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const fmtTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
    const isoSp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).toISOString();

    const systemContent = `${extraPrompt}

CONTEXTO TEMPORAL (use sempre como referência, NUNCA invente datas):
- Hoje é ${fmtDate}
- Hora atual: ${fmtTime} (America/Sao_Paulo)
- ISO local: ${isoSp}

CONTEXTO DO VISITANTE JÁ COLETADO:
- Nome: ${visitorName || "ainda não informado"}
- WhatsApp: ${visitorPhone || "ainda não informado"}
- Área provável: ${visitorArea || "ainda não identificada"}

Quando o usuário disser "hoje", "amanhã", "próxima sexta", calcule a partir da data acima.`;

    const safeHistory = history
      .filter((m) => m && ["user", "assistant"].includes(m.role) && String(m.content || "").trim())
      .slice(-24)
      .map((m) => ({ role: m.role, content: String(m.content || "") }));

    const messages = [
      { role: "system", content: systemContent },
      ...safeHistory,
      { role: "user", content: userMessage },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "rest-fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 502;
      return new Response(
        JSON.stringify({ error: "AI Gateway error", status: aiResp.status, detail: errText }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const reply: string = data?.choices?.[0]?.message?.content ?? "";

    return new Response(
      JSON.stringify({
        response: reply,
        audio_base64: null,
        analysis: { acertividade: 90, qualificacao: "ok" },
        server_time: { date: fmtDate, time: fmtTime, iso: isoSp },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
