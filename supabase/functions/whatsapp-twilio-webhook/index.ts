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
const AUDIO_BUCKET = "debug-uploads"; // bucket público

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getSaoPauloHour() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value || "0");
}

function isBusinessHours() {
  const hour = getSaoPauloHour();
  return hour >= 8 && hour < 20;
}

function isOptOut(text: string) {
  return /\b(sair|parar|cancelar|stop|remover)\b/i.test(text);
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
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
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

async function callChatAI(userText: string, sessionId: string, wantAudio: boolean): Promise<{ reply: string; audio_base64: string | null }> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/chat-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ message: userText, want_audio: wantAudio, session_id: sessionId }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`chat-ai ${r.status}: ${JSON.stringify(d)}`);
  return {
    reply: d.response || d.reply || "Desculpe, não consegui processar agora.",
    audio_base64: d.audio_base64 || null,
  };
}

async function uploadAudioPublic(audioB64: string): Promise<string | null> {
  try {
    const bin = atob(audioB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `wa-tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!r.ok) {
      console.error("[whatsapp] upload áudio falhou", r.status, await r.text());
      return null;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`;
  } catch (e) {
    console.error("[whatsapp] upload exceção", e);
    return null;
  }
}

async function sendTwilioMessage(from: string, to: string, body: string, mediaUrl?: string | null) {
  const params: Record<string, string> = { From: from, To: to, Body: body };
  if (mediaUrl) params.MediaUrl = mediaUrl;
  const r = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`twilio send ${r.status}: ${t}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const form = await req.formData();
    const from = String(form.get("From") || "");      // ex: whatsapp:+5511...
    const to = String(form.get("To") || "");          // seu número Twilio
    const body = String(form.get("Body") || "").trim();
    const numMedia = Number(form.get("NumMedia") || "0");

    console.log("[whatsapp] inbound", {
      from,
      to,
      hasBody: body.length > 0,
      numMedia,
      mediaType0: form.get("MediaContentType0"),
    });

    let userText = body;
    let audioFailed = false;
    let inboundWasAudio = false;

    // Processa áudio sempre que houver mídia de áudio (mesmo se também vier Body)
    if (numMedia > 0) {
      const mediaUrl = String(form.get("MediaUrl0") || "");
      const mediaTypeRaw = String(form.get("MediaContentType0") || "audio/ogg");
      const mediaType = mediaTypeRaw.split(";")[0].trim().toLowerCase();
      const isAudio = mediaType.startsWith("audio") || mediaType.includes("ogg") || mediaType.includes("opus");
      if (mediaUrl && isAudio) {
        try {
          console.log("[whatsapp] baixando áudio", { mediaUrl, mediaType });
          const { buffer, contentType } = await fetchTwilioMedia(mediaUrl);
          const cleanCt = (contentType || mediaType).split(";")[0].trim().toLowerCase();
          console.log("[whatsapp] áudio baixado", { bytes: buffer.byteLength, cleanCt });
          const transcribed = await transcribe(buffer, cleanCt);
          console.log("[whatsapp] transcrição", { chars: transcribed.length, preview: transcribed.slice(0, 80) });
          if (transcribed) userText = transcribed;
          else audioFailed = true;
        } catch (audioErr) {
          console.error("[whatsapp] erro no áudio:", audioErr);
          audioFailed = true;
        }
      }
    }

    if (!userText) {
      if (audioFailed) {
        await sendTwilioMessage(
          to,
          from,
          "Recebi seu áudio, mas não consegui entender desta vez. Pode tentar gravar novamente ou enviar por texto? 🙏",
        ).catch((err) => console.error("[whatsapp] falha ao avisar áudio:", err));
      }
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
    }

    if (isOptOut(userText)) {
      await sendTwilioMessage(to, from, "Tudo bem, atendimento automático pausado. Se precisar falar conosco novamente, envie uma nova mensagem. ✨");
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
    }

    if (!isBusinessHours()) {
      await sendTwilioMessage(to, from, "Recebi sua mensagem. Nosso atendimento funciona das 8h às 20h, e retornaremos no próximo horário útil. ✨");
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
    }

    const reply = await callChatAI(userText, from.replace(/[^\d+]/g, ""));
    await sleep(1000 + Math.floor(Math.random() * 2000));
    // From e To invertidos para responder
    await sendTwilioMessage(to, from, reply);

    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
  } catch (e) {
    console.error("[whatsapp-twilio-webhook]", e);
    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 200 });
  }
});
