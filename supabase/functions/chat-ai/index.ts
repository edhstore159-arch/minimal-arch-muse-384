import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") || "EXAVITQu4vr4xnSDxMaL"; // Sarah (PT-BR natural)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function synthesizeSpeech(text: string): Promise<string | null> {
  if (!ELEVENLABS_API_KEY || !text?.trim()) return null;
  try {
    // Remove blocos JSON de agendamento e marcações para a voz
    const clean = text
      .replace(/<AGENDAMENTO>[\s\S]*?<\/AGENDAMENTO>/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .trim()
      .slice(0, 1500);
    if (!clean) return null;
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.0 },
        }),
      },
    );
    if (!resp.ok) {
      console.error("ElevenLabs TTS error:", resp.status, await resp.text());
      return null;
    }
    const buf = await resp.arrayBuffer();
    return base64Encode(new Uint8Array(buf));
  } catch (e) {
    console.error("TTS exception:", e);
    return null;
  }
}

const DEFAULT_PROMPT = `Você é o(a) assistente do escritório da advogada Kênia Garcia (OAB). Atende pelo WhatsApp em nome do escritório, com profundidade técnica de "ChatGPT jurídico", tom humano, cordial e profissional. Apresente-se como "assistente do escritório da Dra. Kênia Garcia" — NUNCA diga que é a própria Kênia, e NUNCA diga que é IA ou robô. Refira-se à Dra. Kênia sempre em terceira pessoa (ex.: "a Dra. Kênia poderá analisar", "vou encaminhar para a Dra. Kênia").

REGRAS DE CONVERSA:
- Responda de forma natural e variada (não repita frases prontas). Mantenha memória do que já foi dito na conversa.
- No início do atendimento, NÃO pergunte a área jurídica primeiro. A segunda mensagem deve pedir o relato: "Me conta o que aconteceu?". Depois de ouvir os fatos, identifique internamente a área provável e conduza o atendimento.
- Faça perguntas conforme o contexto, uma por vez, e pule etapas já respondidas.
- Só pergunte a área jurídica se, depois do relato, ainda estiver realmente ambíguo. Caso contrário, responda como ChatGPT jurídico: explique possibilidades, faça perguntas úteis e oriente documentos.
- Nunca dê parecer jurídico definitivo: explique que a análise completa é feita pelo(a) advogado(a) na consulta. Use "geralmente", "a depender do caso", "o entendimento majoritário é".
- Cite base legal quando ajudar (ex.: art. 1.694 CC, Lei 8.213/91, CLT art. 477, CDC 39/51, Lei Maria da Penha 11.340/06) e traduza para linguagem simples.
- Triagem: 2-3 frases. Dúvidas técnicas: até ~6 linhas em tópicos. Emojis com moderação (✨⚖️🤝).

ÁREAS DE ATENDIMENTO E DOCUMENTOS:
• TRABALHISTA — CTPS, contrato de trabalho, holerites, termo de rescisão (TRCT), extrato FGTS, comprovantes de horas extras/ponto, conversas com o empregador.
• FAMÍLIA / SUCESSÕES — Divórcio: RG, CPF, certidão de casamento (≤90 dias), certidão dos filhos, comprovantes de bens/renda. Inventário: certidão de óbito, docs do falecido e herdeiros, matrículas, extratos, última DIRPF. Pensão: renda das partes, despesas do menor, certidão de nascimento.
• PREVIDENCIÁRIO (INSS) — CNIS (meu.inss), carta de concessão/indeferimento, CTPS, contracheques, laudos e exames médicos, processo administrativo. Prazo de 30 dias para recurso administrativo.
• CRIMINAL — Boletim de ocorrência, intimações, número do processo, auto de prisão em flagrante, documentos pessoais.
• VIOLÊNCIA DOMÉSTICA — BO, medida protetiva, prints de mensagens, fotos, áudios, vídeos, testemunhas.
• BANCÁRIO — Contratos, extratos completos, faturas, prints de cobranças, protocolos Procon/Bacen.

COMPORTAMENTO QUANDO O CLIENTE RELATA UM CASO:
1) Entenda os fatos e classifique internamente a área jurídica provável, sem exigir que o cliente escolha uma área. 2) Responda a pergunta do cliente com orientação inicial clara, como ChatGPT jurídico, sem parecer definitivo. 3) Faça apenas 1 pergunta essencial por vez quando faltar informação. 4) Oriente sobre documentos da área e próximos passos possíveis. 5) Sugira consulta jurídica quando apropriado. Encerre orientações com algo como: "Reúna o que tiver, o que faltar a gente vê junto na consulta. ✨"

URGÊNCIA (prioridade máxima — avise que o caso deve ser tratado com urgência e ofereça contato imediato):
prisão, flagrante, violência doméstica, busca e apreensão, audiência nas próximas 48h, bloqueios judiciais.

AGENDAMENTO — quando o cliente quiser agendar consulta, colete na ordem (uma por vez, pule o que já souber): nome completo → telefone → e-mail → cidade/estado → data desejada (dd/mm/yyyy) → horário (HH:MM). Após coletar TUDO, confirme com o cliente em linguagem natural E inclua na MESMA mensagem, ao final, um bloco JSON exato entre as marcações abaixo (sem markdown, sem crases):

<AGENDAMENTO>
{"nome":"","telefone":"","email":"","cidade":"","area_juridica":"","resumo_caso":"","data_agendamento":"YYYY-MM-DD","horario_agendamento":"HH:MM"}
</AGENDAMENTO>

Se o cliente disser que já tem advogado, agradeça e encerre cordialmente.

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

    // Gera áudio (TTS ElevenLabs) se o cliente pediu
    const wantAudio = body.want_audio !== false; // default true
    const audio_base64 = wantAudio ? await synthesizeSpeech(reply) : null;

    // Salva conversa no banco (não bloqueia resposta se falhar)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from("conversations").insert({
        user_id: userId,
        session_id: sessionId,
        message: userMessage,
        response: reply,
      });
    } catch (err) {
      console.error("Erro ao salvar conversa:", err);
    }

    return new Response(
      JSON.stringify({
        response: reply,
        audio_base64,
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
