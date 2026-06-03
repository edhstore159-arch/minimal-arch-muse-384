// Shared LLM helpers with Emergent ⇄ Lovable Gateway fallback.
// Used by edge functions so chat completions and image generation work
// transparently whether only EMERGENT_API_KEY or only LOVABLE_API_KEY is set.

type ChatMessage = { role: string; content: any };

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  response_format?: any;
  temperature?: number;
}

export interface ImageOptions {
  prompt: string;
  size?: string;
  quality?: string;
}

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
const EMERGENT_KEY = Deno.env.get("EMERGENT_API_KEY");
const EMERGENT_BASE_URL = (Deno.env.get("EMERGENT_BASE_URL") || "https://integrations.emergentagent.com/llm/v1").replace(/\/$/, "");
const EMERGENT_CHAT_MODELS = [Deno.env.get("EMERGENT_MODEL"), "gpt-4o-mini", "gpt-4o"].filter(Boolean) as string[];
const EMERGENT_IMAGE_MODELS = [Deno.env.get("EMERGENT_IMAGE_MODEL"), "gpt-image-1", "dall-e-3"].filter(Boolean) as string[];

// ---------- chat completions ----------

async function chatLovable(opts: ChatOptions) {
  if (!LOVABLE_KEY) return { ok: false as const, status: 0, error: "LOVABLE_API_KEY ausente" };
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({ model: opts.model || "google/gemini-3-flash-preview", ...opts }),
  });
  if (!resp.ok) return { ok: false as const, status: resp.status, error: await resp.text() };
  return { ok: true as const, data: await resp.json(), provider: "lovable" };
}

async function chatEmergent(opts: ChatOptions) {
  if (!EMERGENT_KEY) return { ok: false as const, status: 0, error: "EMERGENT_API_KEY ausente" };
  let last = { status: 502, error: "Emergent falhou" };
  for (const model of EMERGENT_CHAT_MODELS) {
    const resp = await fetch(`${EMERGENT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMERGENT_KEY}` },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        ...(opts.response_format ? { response_format: opts.response_format } : {}),
        ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
      }),
    });
    if (resp.ok) return { ok: true as const, data: await resp.json(), provider: "emergent", model };
    last = { status: resp.status, error: `Emergent[${model}] ${resp.status}: ${(await resp.text()).slice(0, 400)}` };
    if (resp.status === 401 || resp.status === 403) break;
  }
  return { ok: false as const, ...last };
}

export async function chatCompletion(opts: ChatOptions) {
  // Prefer Lovable Gateway; fall back to Emergent on failure.
  if (LOVABLE_KEY) {
    const r = await chatLovable(opts);
    if (r.ok) return r;
    console.warn("⚠️ Lovable chat falhou, tentando Emergent:", r.status, r.error?.slice?.(0, 200));
  }
  const r2 = await chatEmergent(opts);
  if (r2.ok) return r2;
  return { ok: false as const, status: r2.status || 502, error: r2.error || "Nenhum provider disponível", provider: "none" };
}

// ---------- text-to-image ----------

async function imageLovable(opts: ImageOptions) {
  if (!LOVABLE_KEY) return { ok: false as const, error: "LOVABLE_API_KEY ausente" };
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt: opts.prompt,
      quality: opts.quality || "low",
      size: opts.size || "1024x1024",
      stream: false,
    }),
  });
  if (!resp.ok) return { ok: false as const, error: `Lovable ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false as const, error: "Lovable não retornou imagem" };
  return { ok: true as const, b64, provider: "lovable" };
}

async function imageEmergent(opts: ImageOptions) {
  if (!EMERGENT_KEY) return { ok: false as const, error: "EMERGENT_API_KEY ausente" };
  let last = "Emergent image falhou";
  for (const model of EMERGENT_IMAGE_MODELS) {
    const resp = await fetch(`${EMERGENT_BASE_URL}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMERGENT_KEY}` },
      body: JSON.stringify({ model, prompt: opts.prompt, size: opts.size || "1024x1024", n: 1 }),
    });
    if (!resp.ok) {
      last = `Emergent[${model}] ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
      if (resp.status === 401 || resp.status === 403) break;
      continue;
    }
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (b64) return { ok: true as const, b64, provider: "emergent", model };
    if (url) return { ok: true as const, b64: url.replace(/^data:image\/[^;]+;base64,/, ""), provider: "emergent", model };
    last = `Emergent[${model}] não retornou imagem`;
  }
  return { ok: false as const, error: last };
}

export async function generateImage(opts: ImageOptions) {
  if (LOVABLE_KEY) {
    const r = await imageLovable(opts);
    if (r.ok) return r;
    console.warn("⚠️ Lovable image falhou, tentando Emergent:", r.error);
  }
  const r2 = await imageEmergent(opts);
  if (r2.ok) return r2;
  return { ok: false as const, error: r2.error || "Nenhum provider de imagem disponível", provider: "none" };
}
