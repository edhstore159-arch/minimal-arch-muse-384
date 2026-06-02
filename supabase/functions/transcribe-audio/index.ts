import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pickExtension(mime: string): string {
  const mt = (mime || "").toLowerCase();
  if (mt.includes("wav")) return "wav";
  if (mt.includes("mp3") || mt.includes("mpeg")) return "mp3";
  if (mt.includes("ogg")) return "ogg";
  if (mt.includes("mp4") || mt.includes("m4a")) return "m4a";
  return "webm";
}

async function transcribeWithElevenLabs(bytes: Uint8Array, mime: string, modelId: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY ausente");
  const ext = pickExtension(mime);
  const blob = new Blob([bytes], { type: mime || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model_id", modelId);
  form.append("language_code", "por");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");

  const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
    body: form,
  });

  if (!resp.ok) {
    const detail = await resp.text();
    console.error("❌ ElevenLabs STT error", { model: modelId, status: resp.status, detail: detail.slice(0, 300) });
    throw new Error(`ElevenLabs STT ${resp.status}: ${detail.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text: string = (data?.text || "").trim();
  return text;
}

async function transcribeWithLovableAI(audio_base64: string, mime: string): Promise<string> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  const format = pickExtension(mime);
  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva fielmente o áudio em português do Brasil. Retorne APENAS o texto transcrito." },
            { type: "input_audio", input_audio: { data: audio_base64, format } },
          ],
        },
      ],
    }),
  });
  if (!aiResp.ok) {
    const detail = await aiResp.text();
    throw new Error(`Lovable AI ${aiResp.status}: ${detail.slice(0, 200)}`);
  }
  const data = await aiResp.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { audio_base64, mime_type } = body || {};
    const mt = mime_type || "audio/webm";

    console.log("📝 Transcrição iniciada", {
      audio_size: audio_base64?.length || 0,
      mime_type: mt,
      hasElevenLabs: !!ELEVENLABS_API_KEY,
      hasLovableAI: !!LOVABLE_API_KEY,
    });

    if (!audio_base64) {
      return new Response(JSON.stringify({ error: "audio_base64 vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = "";
    let provider = "";
    let lastError: string | null = null;

    // Primary: ElevenLabs Scribe — tenta scribe_v1 (estável) e cai para scribe_v2 se falhar
    if (ELEVENLABS_API_KEY) {
      const bytes = base64ToBytes(audio_base64);
      for (const model of ["scribe_v1", "scribe_v2"]) {
        try {
          text = await transcribeWithElevenLabs(bytes, mt, model);
          provider = `elevenlabs:${model}`;
          if (text) break;
        } catch (err) {
          lastError = String((err as Error)?.message || err);
          console.warn(`⚠️ ElevenLabs ${model} falhou:`, lastError);
        }
      }
    }

    // Fallback: Lovable AI Gateway
    if (!text && LOVABLE_API_KEY) {
      try {
        text = await transcribeWithLovableAI(audio_base64, mt);
        provider = "lovable-ai";
      } catch (err) {
        lastError = String((err as Error)?.message || err);
        console.error("❌ Lovable AI também falhou:", lastError);
      }
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Falha na transcrição", detail: lastError || "Sem provedor disponível" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("✅ Transcrição concluída", { provider, preview: text.slice(0, 100) });

    return new Response(JSON.stringify({ text, provider }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("🔥 Erro geral na transcrição:", e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
