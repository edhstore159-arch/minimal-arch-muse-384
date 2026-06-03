// Shared helper: call Gemini Nano Banana (image generation/editing)
// Fallback order: Lovable AI Gateway → Google Gemini (direct) → Emergent universal LLM.
// Returns a data URL (e.g. "data:image/png;base64,...") or null on failure.

type Content =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface NanoBananaOptions {
  prompt: string;
  imageUrls?: string[]; // data URLs or http(s) URLs
}

function extractImageFromMessage(msg: any): string | null {
  if (!msg) return null;
  const images = msg.images;
  if (Array.isArray(images) && images.length > 0) {
    const url = images[0]?.image_url?.url || images[0]?.url;
    if (url) return url;
  }
  if (typeof msg.content === "string") {
    const m = msg.content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);
    if (m) return m[0];
  }
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === "image_url" && part?.image_url?.url) return part.image_url.url;
      if (typeof part?.text === "string") {
        const m = part.text.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);
        if (m) return m[0];
      }
    }
  }
  return null;
}

function buildContent({ prompt, imageUrls }: NanoBananaOptions): Content[] {
  const parts: Content[] = [{ type: "text", text: prompt }];
  for (const u of imageUrls || []) parts.push({ type: "image_url", image_url: { url: u } });
  return parts;
}

async function callLovableGateway(opts: NanoBananaOptions): Promise<{ url: string | null; error?: string }> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { url: null, error: "LOVABLE_API_KEY ausente" };
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [{ role: "user", content: buildContent(opts) }],
      }),
    });
    if (!resp.ok) {
      return { url: null, error: `Lovable Gateway ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    }
    const data = await resp.json();
    const url = extractImageFromMessage(data?.choices?.[0]?.message);
    return { url, error: url ? undefined : "Lovable Gateway não retornou imagem" };
  } catch (e) {
    return { url: null, error: `Lovable Gateway erro: ${(e as Error)?.message || e}` };
  }
}

// Direct Google Generative Language API (Gemini) — uses GEMINI_API_KEY.
async function callGeminiDirect(opts: NanoBananaOptions): Promise<{ url: string | null; error?: string }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { url: null, error: "GEMINI_API_KEY ausente" };
  const model = "gemini-2.5-flash-image-preview";
  const parts: any[] = [{ text: opts.prompt }];
  for (const u of opts.imageUrls || []) {
    const m = String(u).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      },
    );
    if (!resp.ok) {
      return { url: null, error: `Gemini direto ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    }
    const data = await resp.json();
    const out = data?.candidates?.[0]?.content?.parts || [];
    const inline = out.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
    const b64 = inline?.inlineData?.data || inline?.inline_data?.data;
    const mime = inline?.inlineData?.mimeType || inline?.inline_data?.mime_type || "image/png";
    if (!b64) return { url: null, error: "Gemini direto não retornou imagem" };
    return { url: `data:${mime};base64,${b64}` };
  } catch (e) {
    return { url: null, error: `Gemini direto erro: ${(e as Error)?.message || e}` };
  }
}

async function callEmergent(opts: NanoBananaOptions): Promise<{ url: string | null; error?: string }> {
  const key = Deno.env.get("EMERGENT_API_KEY");
  if (!key) return { url: null, error: "EMERGENT_API_KEY ausente" };
  const models = [
    "gemini-2.5-flash-image-preview",
    "gemini-2.5-flash-image",
    "google/gemini-2.5-flash-image",
    "gemini-2.0-flash-exp-image-generation",
  ];
  let lastError = "";
  for (const model of models) {
    try {
      const resp = await fetch("https://integrations.emergentagent.com/llm/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          modalities: ["image", "text"],
          messages: [{ role: "user", content: buildContent(opts) }],
        }),
      });
      if (!resp.ok) {
        lastError = `Emergent[${model}] ${resp.status}: ${(await resp.text()).slice(0, 160)}`;
        continue;
      }
      const data = await resp.json();
      const url = extractImageFromMessage(data?.choices?.[0]?.message);
      if (url) return { url };
      lastError = `Emergent[${model}] sem imagem`;
    } catch (e) {
      lastError = `Emergent[${model}] erro: ${(e as Error)?.message || e}`;
    }
  }
  return { url: null, error: lastError || "Emergent falhou" };
}

export async function generateWithNanoBanana(
  opts: NanoBananaOptions,
): Promise<{ url: string | null; provider: string; error?: string }> {
  let lovableErr = "";
  let geminiErr = "";

  if (Deno.env.get("LOVABLE_API_KEY")) {
    const r = await callLovableGateway(opts);
    if (r.url) return { url: r.url, provider: "lovable" };
    lovableErr = r.error || "Lovable falhou";
    console.warn("⚠️ Lovable falhou, tentando Gemini direto:", lovableErr);
  }

  if (Deno.env.get("GEMINI_API_KEY")) {
    const r = await callGeminiDirect(opts);
    if (r.url) return { url: r.url, provider: "gemini" };
    geminiErr = r.error || "Gemini direto falhou";
    console.warn("⚠️ Gemini direto falhou, tentando Emergent:", geminiErr);
  }

  const r3 = await callEmergent(opts);
  if (r3.url) return { url: r3.url, provider: "emergent" };

  const emergentErr = r3.error || "Emergent falhou";
  if (/\b402\b|payment_required|Not enough credits/i.test(lovableErr)) {
    return {
      url: null,
      provider: "none",
      error:
        "Créditos da Lovable AI esgotados e fallbacks falharam. " +
        `Gemini direto: ${geminiErr || "n/a"}. Emergent: ${emergentErr}.`,
    };
  }
  return {
    url: null,
    provider: "none",
    error: [lovableErr, geminiErr, emergentErr].filter(Boolean).join(" | ") || "Sem provedor disponível",
  };
}

export function stripDataUrl(url: string): string {
  const m = url.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return m ? m[1] : url;
}
