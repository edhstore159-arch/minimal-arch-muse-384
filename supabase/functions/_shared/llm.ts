// Shared LLM helpers with fallback chain: Lovable → Google Gemini (direct) → Emergent.

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
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const EMERGENT_KEY = Deno.env.get("EMERGENT_API_KEY");

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

function messagesToGeminiContents(messages: ChatMessage[]) {
  const system: string[] = [];
  const contents: any[] = [];
  for (const m of messages) {
    const text = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map((p: any) => p?.text || "").filter(Boolean).join("\n")
        : String(m.content || "");
    if (m.role === "system") { system.push(text); continue; }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }
  return { system: system.join("\n\n"), contents };
}

async function chatGemini(opts: ChatOptions) {
  if (!GEMINI_KEY) return { ok: false as const, status: 0, error: "GEMINI_API_KEY ausente" };
  const { system, contents } = messagesToGeminiContents(opts.messages);
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const body: any = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (opts.response_format?.type === "json_object") {
    body.generationConfig = { responseMimeType: "application/json" };
  }
  if (typeof opts.temperature === "number") {
    body.generationConfig = { ...(body.generationConfig || {}), temperature: opts.temperature };
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return { ok: false as const, status: resp.status, error: await resp.text() };
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
  // Wrap into OpenAI-compatible shape so callers can read choices[0].message.content
  return {
    ok: true as const,
    provider: "gemini",
    data: { choices: [{ message: { role: "assistant", content: text } }] },
  };
}

async function chatEmergent(opts: ChatOptions) {
  if (!EMERGENT_KEY) return { ok: false as const, status: 0, error: "EMERGENT_API_KEY ausente" };
  const resp = await fetch("https://integrations.emergentagent.com/llm/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMERGENT_KEY}` },
    body: JSON.stringify({
      model: opts.model?.startsWith("openai/") || opts.model?.startsWith("google/")
        ? opts.model
        : "gpt-4o-mini",
      messages: opts.messages,
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
      ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
    }),
  });
  if (!resp.ok) return { ok: false as const, status: resp.status, error: await resp.text() };
  return { ok: true as const, data: await resp.json(), provider: "emergent" };
}

export async function chatCompletion(opts: ChatOptions) {
  // Order: Lovable → Gemini (direct) → Emergent
  if (LOVABLE_KEY) {
    const r = await chatLovable(opts);
    if (r.ok) return r;
    console.warn("⚠️ Lovable chat falhou, tentando Gemini direto:", r.status, r.error?.slice?.(0, 200));
  }
  if (GEMINI_KEY) {
    const r = await chatGemini(opts);
    if (r.ok) return r;
    console.warn("⚠️ Gemini direto falhou, tentando Emergent:", r.status, r.error?.slice?.(0, 200));
  }
  const r3 = await chatEmergent(opts);
  if (r3.ok) return r3;
  return { ok: false as const, status: r3.status || 502, error: r3.error || "Nenhum provider disponível", provider: "none" };
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

async function imageGemini(opts: ImageOptions) {
  if (!GEMINI_KEY) return { ok: false as const, error: "GEMINI_API_KEY ausente" };
  const model = "gemini-2.5-flash-image";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });
  if (!resp.ok) return { ok: false as const, error: `Gemini ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
  const b64 = inline?.inlineData?.data || inline?.inline_data?.data;
  if (!b64) return { ok: false as const, error: "Gemini direto não retornou imagem" };
  return { ok: true as const, b64, provider: "gemini" };
}

async function imageEmergent(opts: ImageOptions) {
  if (!EMERGENT_KEY) return { ok: false as const, error: "EMERGENT_API_KEY ausente" };
  const resp = await fetch("https://integrations.emergentagent.com/llm/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMERGENT_KEY}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: opts.prompt,
      size: opts.size || "1024x1024",
      n: 1,
    }),
  });
  if (!resp.ok) return { ok: false as const, error: `Emergent ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false as const, error: "Emergent não retornou imagem" };
  return { ok: true as const, b64, provider: "emergent" };
}

export async function generateImage(opts: ImageOptions) {
  if (LOVABLE_KEY) {
    const r = await imageLovable(opts);
    if (r.ok) return r;
    console.warn("⚠️ Lovable image falhou, tentando Gemini direto:", r.error);
  }
  if (GEMINI_KEY) {
    const r = await imageGemini(opts);
    if (r.ok) return r;
    console.warn("⚠️ Gemini direto falhou, tentando Emergent:", r.error);
  }
  const r3 = await imageEmergent(opts);
  if (r3.ok) return r3;
  return { ok: false as const, error: r3.error || "Nenhum provider de imagem disponível", provider: "none" };
}
