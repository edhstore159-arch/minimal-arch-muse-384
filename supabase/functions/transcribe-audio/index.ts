import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audio_base64, mime_type } = await req.json();
    if (!audio_base64) {
      return new Response(JSON.stringify({ error: "audio_base64 vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mt = mime_type || "audio/webm";
    // OpenAI-compatible "format" expects wav/mp3; we pass the codec suffix.
    const format = mt.includes("wav") ? "wav"
      : mt.includes("mp3") || mt.includes("mpeg") ? "mp3"
      : mt.includes("ogg") ? "ogg"
      : "webm";

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

    if (!aiResp.ok) {
      const detail = await aiResp.text();
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 502;
      return new Response(
        JSON.stringify({ error: "AI Gateway error", status: aiResp.status, detail }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const text: string = (data?.choices?.[0]?.message?.content || "").trim();

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
