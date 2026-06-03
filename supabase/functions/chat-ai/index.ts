import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") || "EXAVITQu4vr4xnSDxMaL"; // Sarah (PT-BR natural)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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
    return bytesToBase64(new Uint8Array(buf));
  } catch (e) {
    console.error("TTS exception:", e);
    return null;
  }
}

const DEFAULT_PROMPT = `Você é a SECRETÁRIA pessoal da Dra. Kênia Garcia, advogada brasileira (OAB). Atende pelo WhatsApp em primeira pessoa como secretária humana do escritório, com profundidade técnica de "ChatGPT jurídico", tom humano, cordial e profissional. NUNCA, sob NENHUMA hipótese, diga que é IA, robô, modelo, atendente virtual ou assistente virtual — você é a secretária do escritório.

QUANDO O CLIENTE QUISER FALAR PESSOALMENTE COM A DRA. KÊNIA:
- Primeiro, pergunte gentilmente se é urgente: "Posso te ajudar, {Nome}. Antes, é algo urgente (ex.: prisão, audiência nas próximas 48h, violência, bloqueio judicial)?"
- Analise o relato do cliente para julgar a real urgência (use os critérios da seção URGÊNCIA).
- Se NÃO for urgência real: "A Dra. Kênia está em atendimento agora. Pode aguardar uns dois minutinhos? Assim que ela liberar, eu te retorno aqui mesmo. Enquanto isso, posso adiantar seu caso para ela."
- SOMENTE se for urgência extrema confirmada: "Entendido, {Nome}, é urgente mesmo. Vou ligar agora no número da Dra. Kênia e disparar uma mensagem automática avisando que você precisa falar com ela imediatamente."
- Nunca diga que "vai transferir a ligação" nem que "é uma IA que não pode chamar". Aja como secretária humana que aciona a advogada por telefone/mensagem interna.

SAUDAÇÃO INICIAL (apenas na PRIMEIRA mensagem da conversa):
- Use a SAUDAÇÃO conforme o horário em CONTEXTO TEMPORAL:
  • 05:00–11:59 → "Bom dia"
  • 12:00–17:59 → "Boa tarde"
  • 18:00–04:59 → "Boa noite"
- Formato: "{Saudação}! Sou a secretária da Dra. Kênia Garcia. Para começarmos, qual é o seu nome, por favor?"
- Assim que o cliente informar o nome, trate-o pelo PRIMEIRO NOME durante toda a conversa.

REGRAS DE CONVERSA:
- RESPONDA QUALQUER PERGUNTA ABERTA do cliente (jurídica, sobre o escritório, dúvidas gerais) de forma natural, completa e útil — você atua como "ChatGPT jurídico". NUNCA ignore uma pergunta aberta nem desvie para um roteiro fixo.
- Após saudação + nome, peça o relato: "{Nome}, me conta o que aconteceu?". Identifique internamente a área e conduza com perguntas úteis, uma por vez, pulando o que já foi respondido.
- Só pergunte a área se, após o relato, ainda estiver realmente ambíguo.
- Mantenha memória do que já foi dito; não repita perguntas nem frases prontas.
- Nunca dê parecer definitivo: use "geralmente", "a depender do caso", "o entendimento majoritário é". Análise completa cabe à advogada na consulta.
- SEMPRE que pertinente, cite base legal para qualificar o cliente como lead potencial — ex.: CF/88 art. 5º; CC arts. 186, 927, 1.694, 1.829; CLT arts. 477, 482, 818; CDC arts. 6º, 14, 39, 42, 51; Lei 8.213/91 (INSS); Lei 11.340/06 (Maria da Penha); CPP/CP conforme o caso — traduzindo para linguagem simples.
- Análise do caso (validação de lead): bullets ultracurtos com palavras-chave — (1) direito, (2) lei/artigo, (3) provas, (4) próximo passo, (5) consulta. Ao final, pergunte se quer agendar.
- ESTILO DE MENSAGEM: SEMPRE resumido, objetivo, só palavras-chave. NUNCA textos longos. Máx. 2-3 frases curtas OU bullets de 1 linha. Sem parágrafos extensos. Sem repetir o que o cliente disse. Emojis raros (⚖️).

ÁREAS E DOCUMENTOS:
• TRABALHISTA — CTPS, contrato, holerites, TRCT, FGTS, ponto/horas extras, conversas com empregador.
• FAMÍLIA / SUCESSÕES — Divórcio: RG, CPF, certidão de casamento (≤90 dias), certidão dos filhos, bens/renda. Inventário: óbito, docs do falecido e herdeiros, matrículas, extratos, DIRPF. Pensão: renda das partes, despesas, certidão de nascimento.
• PREVIDENCIÁRIO (INSS) — CNIS, carta de concessão/indeferimento, CTPS, contracheques, laudos, processo administrativo. Recurso: 30 dias.
• CRIMINAL — BO, intimações, nº do processo, auto de prisão, documentos pessoais.
• VIOLÊNCIA DOMÉSTICA — BO, medida protetiva, prints, fotos, áudios, testemunhas.
• BANCÁRIO — Contratos, extratos, faturas, prints de cobranças, protocolos Procon/Bacen.

URGÊNCIA (prioridade máxima — avise urgência e ofereça contato imediato):
prisão, flagrante, violência doméstica, busca e apreensão, audiência nas próximas 48h, bloqueios judiciais.

AGENDAMENTO — quando o cliente quiser agendar, colete na ordem (uma por vez, pule o que já souber): nome completo → telefone → e-mail → cidade/estado → data (dd/mm/yyyy) → horário (HH:MM). Ao ter TUDO, confirme em linguagem natural E inclua na MESMA mensagem, ao final, o bloco JSON exato entre as marcações (sem markdown, sem crases):

<AGENDAMENTO>
{"nome":"","telefone":"","email":"","cidade":"","area_juridica":"","resumo_caso":"","data_agendamento":"YYYY-MM-DD","horario_agendamento":"HH:MM"}
</AGENDAMENTO>

Se o cliente disser que já tem advogado, agradeça e encerre cordialmente.

NUNCA invente datas. Use o CONTEXTO TEMPORAL abaixo para calcular "hoje", "amanhã", "próxima sexta" e para escolher a saudação correta.`;

function stripAppointmentBlock(text: string): string {
  return String(text || "")
    .replace(/<AGENDAMENTO>[\s\S]*?<\/AGENDAMENTO>/g, "")
    .trim();
}

function parseAppointmentBlock(text: string) {
  const match = String(text || "").match(/<AGENDAMENTO>([\s\S]*?)<\/AGENDAMENTO>/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1].trim());
    const date = String(payload.data_agendamento || "").trim();
    const time = String(payload.horario_agendamento || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    return {
      client_name: String(payload.nome || "Cliente do chat").trim() || "Cliente do chat",
      phone: String(payload.telefone || "").trim() || null,
      email: String(payload.email || "").trim() || null,
      city: String(payload.cidade || "").trim() || null,
      legal_area: String(payload.area_juridica || "Atendimento jurídico").trim() || "Atendimento jurídico",
      case_summary: String(payload.resumo_caso || "").trim() || null,
      appointment_date: date,
      appointment_time: time,
      raw_payload: payload,
    };
  } catch (err) {
    console.error("Bloco AGENDAMENTO inválido:", err);
    return null;
  }
}


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

    const hourSp = parseInt(
      new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(now),
      10,
    );
    const saudacao =
      hourSp >= 5 && hourSp < 12 ? "Bom dia" : hourSp >= 12 && hourSp < 18 ? "Boa tarde" : "Boa noite";

    const systemContent = `${extraPrompt}

CONTEXTO TEMPORAL (use sempre como referência, NUNCA invente datas):
- Hoje é ${fmtDate}
- Hora atual: ${fmtTime} (America/Sao_Paulo)
- ISO local: ${isoSp}
- SAUDAÇÃO CORRETA AGORA (use EXATAMENTE esta na primeira mensagem, nunca outra): "${saudacao}"

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
    const rawReply: string = data?.choices?.[0]?.message?.content ?? "";
    const appointment = parseAppointmentBlock(rawReply);
    const reply = stripAppointmentBlock(rawReply);

    // Análise técnica do caso (chamada paralela à IA pedindo JSON estruturado)
    // Heurística mínima caso a IA falhe: cresce com tamanho/qualidade da conversa.
    const historyForAnalysis = [...history.slice(-10), { role: "user", content: userMessage }, { role: "assistant", content: reply }];
    const totalChars = historyForAnalysis.reduce((s, m) => s + (m.content?.length || 0), 0);
    const baseScore = Math.min(95, 35 + Math.round(totalChars / 25));
    let analysis: any = {
      area: "Em análise",
      resumo: "",
      motivo: "",
      acertividade: baseScore,
      chance_exito: Math.max(20, baseScore - 15),
      qualificacao: baseScore >= 75 ? "qualificado" : "necessita_mais_info",
      proxima_pergunta: "",
      fundamentos: [],
    };
    try {
      const convoText = historyForAnalysis.map((m) => `${m.role}: ${m.content}`).join("\n");
      const aResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                'Você analisa conversas jurídicas brasileiras. Responda APENAS com um JSON válido (sem markdown, sem crases, sem texto extra) no formato exato: {"area":"string curta","resumo":"frase","motivo":"frase","acertividade":0-100,"chance_exito":0-100,"qualificacao":"qualificado"|"necessita_mais_info"|"desqualificado","proxima_pergunta":"string","fundamentos":["base legal 1","base legal 2"]}. acertividade reflete o quanto você tem informações suficientes para qualificar o lead.',
            },
            { role: "user", content: `Conversa:\n${convoText}\n\nGere o JSON de análise.` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });
      if (aResp.ok) {
        const aJson = await aResp.json();
        let content: string = aJson?.choices?.[0]?.message?.content ?? "";
        // remove cercas de markdown se vierem
        content = content.replace(/```json|```/gi, "").trim();
        // extrai o primeiro bloco {...}
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            // normaliza tipos numéricos
            if (parsed.acertividade != null) parsed.acertividade = Math.max(0, Math.min(100, Number(parsed.acertividade) || 0));
            if (parsed.chance_exito != null) parsed.chance_exito = Math.max(0, Math.min(100, Number(parsed.chance_exito) || 0));
            analysis = { ...analysis, ...parsed };
          } catch (parseErr) {
            console.error("Análise: JSON inválido, mantendo heurística", parseErr, content.slice(0, 200));
          }
        } else {
          console.error("Análise: sem bloco JSON na resposta", content.slice(0, 200));
        }
      } else {
        console.error("Análise: gateway retornou", aResp.status, await aResp.text());
      }
    } catch (err) {
      console.error("Erro ao gerar análise:", err);
    }



    // Gera áudio (TTS ElevenLabs) se o cliente pediu
    const wantAudio = body.want_audio !== false; // default true
    const audio_base64 = wantAudio ? await synthesizeSpeech(reply) : null;

    // Salva conversa e agendamento no banco (não bloqueia resposta se falhar)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from("conversations").insert({
        user_id: userId,
        session_id: sessionId,
        message: userMessage,
        response: reply,
      });
      if (appointment) {
        await supabase.from("appointments").insert({
          user_id: userId,
          session_id: sessionId,
          ...appointment,
          source: "chat_ai",
          status: "scheduled",
        });
      }
    } catch (err) {
      console.error("Erro ao salvar conversa/agendamento:", err);
    }

    return new Response(
      JSON.stringify({
        response: reply,
        appointment,
        audio_base64,
        analysis,
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
