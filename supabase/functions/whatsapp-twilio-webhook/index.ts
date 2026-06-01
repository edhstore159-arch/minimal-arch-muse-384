// Webhook do Twilio WhatsApp.
// Configure no Twilio Console (Messaging → Sandbox/Sender → "When a message comes in"):
//   https://<PROJECT_REF>.functions.supabase.co/whatsapp-twilio-webhook
//   método: POST
// Recebe form-urlencoded da Twilio, transcreve áudio (se houver),
// chama chat-ai e responde via Twilio.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY")!;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchTwilioMedia(mediaUrl: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  // MediaUrl no formato: https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages/{MSid}/Media/{MeSid}
  // Reescrevemos para o gateway: /Messages/{MSid}/Media/{MeSid}
  const m = mediaUrl.match(/\/Messages\/([^/]+)\/Media\/([^/?]+)/);
  if (!m) throw new Error("media URL inesperada: " + mediaUrl);
  const url = `${GATEWAY_URL}/Messages/${m[1]}/Media/${m[2]}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
    },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`media ${r.status}`);
  return { buffer: await r.arrayBuffer(), contentType: r.headers.get("content-type") || "audio/ogg" };
}

async function transcribe(buffer: ArrayBuffer, mime: string): Promise<string> {
  const b64 = arrayBufferToBase64(buffer);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ audio_base64: b64, mime_type: mime }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`transcribe ${r.status}: ${JSON.stringify(d)}`);
  return d.text || d.transcript || "";
}

async function callChatAI(userText: string, wantAudio: boolean): Promise<{ reply: string; audioBase64: string | null }> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/chat-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ message: userText, want_audio: wantAudio }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`chat-ai ${r.status}: ${JSON.stringify(d)}`);
  return {
    reply: d.response || d.reply || "Desculpe, não consegui processar agora.",
    audioBase64: typeof d.audio_base64 === "string" ? d.audio_base64 : null,
  };
}

async function sendTwilioMessage(from: string, to: string, body: string, mediaUrl?: string) {
  const params = new URLSearchParams({ From: from, To: to, Body: body });
  if (mediaUrl) params.set("MediaUrl", mediaUrl);
  const r = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`twilio send ${r.status}: ${t}`);
  }
}

async function uploadAudio(base64: string): Promise<string | null> {
  if (!base64) return null;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const filename = `whatsapp/replies/${Date.now()}-${crypto.randomUUID()}.mp3`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/social-media/${filename}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "audio/mpeg",
      "x-upsert": "false",
    },
    body: bytes,
  });
  if (!r.ok) throw new Error(`upload audio ${r.status}: ${await r.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/social-media/${filename}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const form = await req.formData();
    const from = String(form.get("From") || "");      // ex: whatsapp:+5511...
    const to = String(form.get("To") || "");          // seu número Twilio
    const body = String(form.get("Body") || "").trim();
    const numMedia = Number(form.get("NumMedia") || "0");

    let userText = body;
    let receivedAudio = false;

    if (!userText && numMedia > 0) {
      const mediaUrl = String(form.get("MediaUrl0") || "");
      const mediaType = String(form.get("MediaContentType0") || "audio/ogg");
      if (mediaUrl && mediaType.startsWith("audio")) {
        receivedAudio = true;
        const { buffer, contentType } = await fetchTwilioMedia(mediaUrl);
        userText = await transcribe(buffer, contentType);
      }
    }

    if (!userText) {
      // Responde 200 vazio (TwiML) para evitar retry
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
    }

    const { reply, audioBase64 } = await callChatAI(userText, receivedAudio);
    const audioUrl = receivedAudio && audioBase64 ? await uploadAudio(audioBase64) : null;
    // From e To invertidos para responder
    await sendTwilioMessage(to, from, reply, audioUrl || undefined);

    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
  } catch (e) {
    console.error("[whatsapp-twilio-webhook]", e);
    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
  }
});
