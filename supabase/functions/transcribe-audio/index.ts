import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY ausente");
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { audio_base64, mime_type } = body;

    console.log("📝 Transcrição iniciada", {
      audio_size: audio_base64?.length || 0,
      mime_type,
    });

    if (!audio_base64) {
      console.error("❌ audio_base64 vazio");
      return new Response(JSON.stringify({ error: "audio_base64 vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mt = mime_type || "audio/webm";
    const format = mt.includes("wav") ? "wav"
      : mt.includes("mp3") || mt.includes("mpeg") ? "mp3"
      : mt.includes("ogg") ? "ogg"
      : "webm";

    console.log("📊 Enviando para AI Gateway", { format, apiKeyLength: LOVABLE_API_KEY?.length });

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
              {
                type: "text",
                text: "Transcreva fielmente o áudio a seguir em português do Brasil. Retorne APENAS o texto transcrito, sem comentários, sem prefixos.",
              },
              {
                type: "input_audio",
                input_audio: { data: audio_base64, format },
              },
            ],
          },
        ],
      }),
    });

    console.log("📡 Resposta do AI Gateway:", {
      status: aiResp.status,
      ok: aiResp.ok,
    });

    if (!aiResp.ok) {
      const detail = await aiResp.text();
      console.error("❌ AI Gateway error", {
        status: aiResp.status,
        detail: detail.slice(0, 200),
      });
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 502;
      return new Response(
        JSON.stringify({
          error: "AI Gateway error",
          status: aiResp.status,
          detail: detail.slice(0, 500),
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const text: string = (data?.choices?.[0]?.message?.content || "").trim();

    console.log("✅ Transcrição concluída", { text: text.slice(0, 100) });

    if (!text) {
      console.warn("⚠️ Transcrição vazia retornada");
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("🔥 Erro geral na transcrição:", e);
    return new Response(
      JSON.stringify({
        error: String(e?.message || e),
        stack: String(e?.stack || ""),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
