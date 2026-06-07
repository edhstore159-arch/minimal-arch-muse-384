import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatCompletion } from "../_shared/llm.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const EMERGENT_API_KEY = Deno.env.get("EMERGENT_API_KEY");
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

const DEFAULT_PROMPT = `Você é a secretária da Kênia Garcia no WhatsApp.

Sua função é atender clientes pelo WhatsApp com cordialidade, empatia e profissionalismo, auxiliando tanto em questões jurídicas quanto em dúvidas gerais.

Você deve agir como uma secretária humana experiente, capacitada para realizar triagens iniciais, esclarecer dúvidas jurídicas de forma informativa e coletar informações relevantes para o atendimento.

IDENTIDADE E COMPORTAMENTO:
- Nunca diga que é uma inteligência artificial, assistente virtual, chatbot, robô ou sistema automatizado.
- Ao se apresentar, utilize apenas: "Olá! Sou a secretária da Kênia Garcia. Como posso ajudar?"
- Não mencione tecnologias, modelos de IA, automações ou sistemas internos.

OBJETIVO PRINCIPAL:
- Receber o cliente.
- Entender sua necessidade.
- Responder dúvidas jurídicas quando houver informações suficientes.
- Fazer perguntas estratégicas quando forem necessárias para compreender melhor o caso.
- Identificar oportunidades de atuação jurídica.
- Encaminhar para atendimento especializado quando necessário.

REGRAS GERAIS:
- Responda de forma clara, objetiva e humanizada.
- Demonstre empatia e interesse genuíno pelo caso apresentado.
- Evite respostas excessivamente longas.
- Não informe data, hora ou dia, exceto quando solicitado pelo cliente.
- Quando solicitado, forneça corretamente a data e horário atuais.
- Nunca afirme estar consultando sites, tribunais ou bancos de dados em tempo real.
- Nunca invente leis, artigos, jurisprudências ou decisões judiciais.
- Nunca garanta vitória, indenização ou qualquer resultado processual.

EVITAR REPETIÇÕES:
- Não repita a mesma frase em mensagens consecutivas.
- Não repita a apresentação em todas as respostas.
- Apresente-se apenas no início da conversa ou quando necessário.
- Evite repetir perguntas já respondidas pelo cliente.
- Evite repetir orientações que já foram fornecidas.
- Antes de responder, verifique se a informação já foi mencionada anteriormente.
- Caso o cliente não responda uma pergunta, reformule-a de maneira diferente em vez de repeti-la exatamente.

MEMÓRIA E CONTEXTO DA CONVERSA:
- Utilize todo o histórico disponível para manter continuidade.
- Evite perguntar novamente informações que o cliente já respondeu.
- Relacione novas informações com fatos anteriores e personalize o atendimento quando fizer sentido.
- Mantenha contexto sobre nome, telefone, e-mail, área jurídica, fatos principais, datas relevantes, documentos mencionados, objetivo do cliente e status do atendimento.
- Em agendamentos, confirme apenas dados necessários que ainda não foram fornecidos.
- Nunca trate cada mensagem como uma conversa nova quando houver histórico disponível.

ATENDIMENTO JURÍDICO:
- Responda dúvidas jurídicas utilizando conhecimento jurídico geral.
- Explique direitos, deveres, procedimentos e possibilidades jurídicas de forma simples.
- Identifique a área do direito envolvida: Civil, Família, Consumidor, Trabalhista, Previdenciário, Penal, Empresarial, Imobiliário, Administrativo ou correlatas.

ANÁLISE DE CASOS:
Ao receber um relato jurídico, demonstre compreensão, identifique a área jurídica, explique de forma simples os direitos e possibilidades, faça perguntas complementares, oriente documentos/provas úteis e sugira próximos passos de forma estratégica e responsável.

COMPORTAMENTO HUMANIZADO:
- Seja acolhedora e profissional.
- Demonstre sensibilidade diante de problemas pessoais, financeiros, familiares ou emocionais.
- Trate o cliente com respeito e atenção.
- Adapte sua linguagem ao perfil do cliente.

DÚVIDAS NÃO JURÍDICAS:
- Responda normalmente perguntas gerais, educacionais e informativas.
- Mantenha o mesmo tom cordial e humano.
- Caso o assunto não tenha relação jurídica, ajude da melhor forma possível.

ESTILO DE RESPOSTA:
- Linguagem simples e acessível.
- Tom profissional e amigável.
- Respostas objetivas.
- Evite termos jurídicos complexos quando puder explicá-los de forma simples.
- Não explique regras internas e não diga que é IA, robô, chatbot, assistente virtual ou sistema automatizado.

MENSAGEM INICIAL:
- Quando iniciar conversa ou se apresentar, diga EXATAMENTE: "Olá! Sou a secretária da Kênia Garcia. Como posso ajudar?"

AGENDAMENTO — somente quando o usuário pedir para agendar uma consulta jurídica, colete na ordem (uma pergunta por vez, pulando o que já souber): nome completo → telefone → e-mail → cidade/estado → área jurídica → breve resumo → data (dd/mm/yyyy) → horário (HH:MM). Ao ter TUDO, confirme em linguagem natural E inclua na MESMA mensagem, ao final, o bloco JSON exato entre as marcações (sem markdown, sem crases):

<AGENDAMENTO>
{"nome":"","telefone":"","email":"","cidade":"","area_juridica":"","resumo_caso":"","data_agendamento":"YYYY-MM-DD","horario_agendamento":"HH:MM"}
</AGENDAMENTO>

Use o CONTEXTO TEMPORAL INTERNO abaixo apenas para calcular "hoje", "amanhã" e datas relativas em agendamentos. Nunca mostre esse contexto ao usuário.`;

function stripAppointmentBlock(text: string): string {
  return String(text || "")
    .replace(/<AGENDAMENTO>[\s\S]*?<\/AGENDAMENTO>/g, "")
    .replace(/<?\/?\s*HANDOFF[_\s-]*K[EÊ]NIA\s*\/?>/giu, "")
    .replace(/`{1,3}\s*HANDOFF[_\s-]*K[EÊ]NIA\s*`{1,3}/giu, "")
    .trim();
}

function cleanRepeatedText(text: string): string {
  const noRepeatedWords = String(text || "")
    .replace(/\b((?:[\p{L}\p{N}]{2,}\s+){1,3}[\p{L}\p{N}]{2,})(?:[\s,.;:!?-]+\1\b)+/giu, "$1")
    .replace(/\b([\p{L}\p{N}]{2,})(?:[\s,.;:!?-]+\1\b)+/giu, "$1")
    .replace(/([^.!?\n]{8,}[.!?])(?:\s+\1)+/giu, "$1")
    .replace(/[ \t]{2,}/g, " ");
  const lines = noRepeatedWords.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const uniqueLines: string[] = [];
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/[^\p{L}\p{N}]+/giu, " ").trim();
    const previous = uniqueLines.at(-1)?.toLowerCase().replace(/[^\p{L}\p{N}]+/giu, " ").trim();
    if (normalized && normalized !== previous) uniqueLines.push(line);
  }
  return uniqueLines.join("\n").trim();
}

function userAskedTemporalInfo(text: string): boolean {
  return /\b(que\s+horas|qual\s+(?:é\s+)?(?:a\s+)?hora|hor[áa]rio\s+atual|agora\s+s[aã]o|data\s+de\s+hoje|qual\s+(?:é\s+)?(?:a\s+)?data|que\s+data|que\s+dia\s+(?:é|estamos|s[aã]o|de\s+hoje)|hoje\s+[ée]\s+que\s+dia|dia\s+da\s+semana|dia\s+de\s+hoje|que\s+m[eê]s|qual\s+(?:o\s+)?(?:dia|m[eê]s|ano)|me\s+(?:diga|fala|fale|informa).*(?:dia|hora|data))\b/i.test(String(text || ""));
}

function removeTemporalLeaks(reply: string, userMessage: string): string {
  if (userAskedTemporalInfo(userMessage)) return reply;
  return String(reply || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/\b(hoje\s+[ée]|agora\s+s[aã]o|s[aã]o\s+\d{1,2}:\d{2}|hora\s+atual|data\s+de\s+hoje|segunda-feira|terça-feira|ter[cç]a-feira|quarta-feira|quinta-feira|sexta-feira|s[áa]bado|domingo)\b/i.test(part))
    .join(" ")
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
    if (!LOVABLE_API_KEY && !EMERGENT_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Nenhuma chave de IA configurada (LOVABLE_API_KEY ou EMERGENT_API_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const userMessage: string = String(body.message ?? body.text ?? "").trim();
    const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history : [];
    // Sempre usar o DEFAULT_PROMPT atual — ignora prompts antigos salvos no cliente
    const extraPrompt: string = DEFAULT_PROMPT;
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

CONTEXTO TEMPORAL INTERNO — não escreva estes dados na resposta, exceto se o usuário pedir data/hora explicitamente:
- Referência para cálculos: ${fmtDate}, ${fmtTime}, America/Sao_Paulo, ISO ${isoSp}
- Saudação adequada se perguntarem: "${saudacao}"

Quando o usuário disser "hoje", "amanhã" ou "próxima sexta", use a referência acima apenas para calcular agendamentos.`;

    const messages = [
      { role: "system", content: systemContent },
      ...history.map((m) => ({ role: m.role, content: String(m.content || "") })),
      { role: "user", content: userMessage },
    ];

    const aiResult = await chatCompletion({
      model: "google/gemini-3-flash-preview",
      messages,
    });

    if (!aiResult.ok) {
      const status = aiResult.status === 429 || aiResult.status === 402 ? aiResult.status : 502;
      return new Response(
        JSON.stringify({ error: "AI Gateway error", status: aiResult.status, detail: aiResult.error }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = aiResult.data;
    const rawReply: string = data?.choices?.[0]?.message?.content ?? "";
    const handoff = /HANDOFF[_\s-]*K[EÊ]NIA/i.test(rawReply);
    const appointment = parseAppointmentBlock(rawReply);
    const reply = cleanRepeatedText(removeTemporalLeaks(stripAppointmentBlock(rawReply), userMessage));

    // Análise técnica do caso (chamada paralela à IA pedindo JSON estruturado)
    let analysis: any = { acertividade: 70, qualificacao: "necessita_mais_info" };
    try {
      const convoText = [...history, { role: "user", content: userMessage }, { role: "assistant", content: reply }]
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      const aResp = await chatCompletion({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você analisa conversas jurídicas e responde APENAS um JSON válido (sem markdown) com os campos: area (string), resumo (string curta), motivo (string), acertividade (0-100), chance_exito (0-100), qualificacao (\"qualificado\"|\"necessita_mais_info\"|\"desqualificado\"), proxima_pergunta (string), fundamentos (array de strings com base legal).",
          },
          { role: "user", content: `Conversa:\n${convoText}\n\nGere o JSON de análise.` },
        ],
        response_format: { type: "json_object" },
      });
      if (aResp.ok) {
        const parsed = JSON.parse(aResp.data?.choices?.[0]?.message?.content || "{}");
        analysis = { ...analysis, ...parsed };
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
        const room = `kenia-${(appointment.client_name || "consulta")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 30)}-${Date.now().toString(36)}`;
        const meetUrl = `https://meet.jit.si/${room}`;
        const enrichedPayload = {
          ...(appointment.raw_payload || {}),
          meeting_link: meetUrl,
          meet_url: meetUrl,
          location: "Google Meet",
          duration_min: 60,
        };
        await supabase.from("appointments").insert({
          user_id: userId,
          session_id: sessionId,
          ...appointment,
          raw_payload: enrichedPayload,
          source: "chat_ai",
          status: "scheduled",
        });
        (appointment as any).meeting_link = meetUrl;
        (appointment as any).meet_url = meetUrl;
      }
    } catch (err) {
      console.error("Erro ao salvar conversa/agendamento:", err);
    }

    return new Response(
      JSON.stringify({
        response: reply,
        appointment,
        audio_base64,
        handoff,
        speaker: handoff ? "Dra. Kênia Garcia" : "Secretária",
        analysis,
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
