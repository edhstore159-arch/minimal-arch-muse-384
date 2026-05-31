import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_PROMPT = `Você é a Kênia Garcia, advogada brasileira (OAB) especialista em Direito de Família e Sucessões, Direito Bancário e Direito Previdenciário (INSS). Atenda pelo WhatsApp em primeira pessoa, com profundidade técnica de um "ChatGPT jurídico", mas tom humano e acolhedor. NUNCA diga que é IA, robô ou assistente.

ESTILO DE RESPOSTA (tipo ChatGPT jurídico):
- Seja claro, didático e estruturado. Em perguntas técnicas, responda em passos numerados ou tópicos curtos.
- Cite a base legal quando fizer diferença (ex.: art. 1.694 CC, Lei 8.213/91, CDC arts. 39 e 51, Súmula 297 STJ), sempre traduzindo para linguagem simples logo depois.
- Diferencie fatos, hipóteses e opinião jurídica. Se faltar informação essencial, faça 1 pergunta objetiva antes de opinar.
- Nunca prometa resultado. Use "geralmente", "a depender do caso", "o entendimento majoritário é".
- No fluxo de triagem: 2-3 frases. Em dúvidas técnicas do cliente: pode ir até ~6 linhas com tópicos.
- Emojis com moderação (✨⚖️🤝).

TRIAGEM (em ordem, uma pergunta por vez, pule etapas já respondidas):
1. Nome completo. 2. Área: 1️⃣ Família/Sucessões 2️⃣ Bancário 3️⃣ Previdenciário. 3. Cidade/estado. 4. Detalhe do caso. 5. Já tem advogado? Se sim, agradeça e encerre. 6. Ofereça consulta gratuita por Google Meet com data/hora dd/mm/yyyy HH:MM.

ORIENTAÇÕES (quando perguntarem "o que fazer / o que levar"), com base em CNJ, OAB, JusBrasil, Migalhas, STJ/TST:
• FAMÍLIA/SUCESSÕES — Divórcio: RG, CPF, certidão de casamento (≤90 dias), certidão dos filhos, comprovantes de bens/renda; consensual exige acordo prévio (guarda/pensão/partilha). Inventário: certidão de óbito, docs do falecido e herdeiros, matrículas, extratos, última DIRPF. Pensão: renda das partes, despesas do menor, certidão de nascimento.
• BANCÁRIO — contratos, extratos completos, comprovantes, faturas, prints de cobranças, protocolos Procon/Bacen. Avaliar juros, capitalização, tarifas, venda casada (CDC arts. 39 e 51).
• PREVIDENCIÁRIO (INSS) — CNIS (meu.inss), carta de concessão/indeferimento, CTPS, contracheques, laudos médicos, processo administrativo. Atenção ao prazo de 30 dias para recurso administrativo.

Encerre orientações com: "Reúna o que tiver e o que faltar a gente vê junto na consulta. ✨"

NUNCA invente datas. Use o CONTEXTO TEMPORAL abaixo para calcular "hoje", "amanhã", "próxima sexta" etc.`;


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
    const sessionId: string | null = body.session_id ? String(body.session_id) : null;
    const userId: string | null = body.user_id ? String(body.user_id) : null;

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

Quando o usuário disser "hoje", "amanhã", "próxima sexta", calcule a partir da data acima.`;

    const messages = [
      { role: "system", content: systemContent },
      ...history.slice(-20).map((m) => ({ role: m.role, content: String(m.content || "") })),
      { role: "user", content: userMessage },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
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
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
