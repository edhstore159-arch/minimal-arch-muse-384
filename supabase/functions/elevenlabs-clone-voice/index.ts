// Edge function that proxies voice cloning to ElevenLabs so the frontend
// doesn't need a separate Node backend (VITE_BACKEND_URL).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const form = await req.formData();
    const apiKey =
      (form.get("api_key") as string | null) ||
      Deno.env.get("ELEVENLABS_API_KEY") ||
      "";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "missing_api_key", detail: "ELEVENLABS_API_KEY ausente. Cole sua API key no campo acima ou configure no backend." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voiceName = (form.get("voice_name") as string) || "Voz clonada";
    const description = (form.get("description") as string) || `Voz clonada — ${voiceName}`;
    const audio = form.get("audio_file");

    if (!(audio instanceof File)) {
      return new Response(
        JSON.stringify({ error: "missing_audio", detail: "audio_file é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upstream = new FormData();
    upstream.append("name", voiceName);
    upstream.append("description", description);
    upstream.append("files", audio, audio.name || "sample.mp3");

    const resp = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey.trim() },
      body: upstream,
    });

    const text = await resp.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          error: "elevenlabs_error",
          status: resp.status,
          detail: payload?.detail?.message || payload?.detail || payload?.raw || `HTTP ${resp.status}`,
          raw_error: payload,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, voice_id: payload.voice_id, name: voiceName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "exception", detail: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
