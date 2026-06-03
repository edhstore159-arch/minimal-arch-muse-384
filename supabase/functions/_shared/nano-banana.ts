// Shared helper: call Gemini Nano Banana (image generation/editing)
// Prefers the Emergent universal LLM key; falls back to the Lovable AI Gateway.
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

async function callEmergent(opts: NanoBananaOptions): Promise<{ url: string | null; error?: string }> {
  const key = Deno.env.get("EMERGENT_API_KEY");
  if (!key) return { url: null, error: "EMERGENT_API_KEY ausente" };
  const baseUrl = (Deno.env.get("EMERGENT_BASE_URL") || "https://integrations.emergentagent.com/llm/v1").replace(/\/$/, "");
  // Try several model identifiers since Emergent's universal LLM accepts a few variants.
  const models = [
    Deno.env.get("EMERGENT_IMAGE_MODEL"),
    "gemini-2.5-flash-image-preview",
    "gemini-2.5-flash-image",
    "google/gemini-2.5-flash-image",
    "gpt-image-1",
    "gemini-2.0-flash-exp-image-generation",
  ].filter(Boolean) as string[];
  let lastError = "";
  for (const model of models) {
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
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
        if (resp.status === 401 || resp.status === 403) break;
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
      const txt = await resp.text();
      return { url: null, error: `Lovable Gateway ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json();
    const url = extractImageFromMessage(data?.choices?.[0]?.message);
    return { url, error: url ? undefined : "Lovable Gateway não retornou imagem" };
  } catch (e) {
    return { url: null, error: `Lovable Gateway erro: ${(e as Error)?.message || e}` };
  }
}

export async function generateWithNanoBanana(
  opts: NanoBananaOptions,
): Promise<{ url: string | null; provider: string; error?: string }> {
  let emergentError = "";
  // Try Emergent first
  if (Deno.env.get("EMERGENT_API_KEY")) {
    const r = await callEmergent(opts);
    if (r.url) return { url: r.url, provider: "emergent" };
    emergentError = r.error || "Emergent falhou";
    console.warn("⚠️ Emergent falhou, tentando Lovable Gateway:", emergentError);
  }
  const r2 = await callLovableGateway(opts);
  if (r2.url) return { url: r2.url, provider: "lovable" };

  // Friendly error when Lovable returns 402 (no credits)
  const lovableErr = r2.error || "";
  if (/\b402\b|payment_required|Not enough credits/i.test(lovableErr)) {
    return {
      url: null,
      provider: "none",
      error:
        "Créditos da Lovable AI esgotados e provedor alternativo (Emergent) também falhou. " +
        "Adicione créditos em Lovable → Settings → Cloud & AI balance ou verifique a EMERGENT_API_KEY. " +
        `Detalhe Emergent: ${emergentError || "n/a"}`,
    };
  }
  return { url: null, provider: "none", error: lovableErr || emergentError || "Sem provedor disponível" };
}


export function stripDataUrl(url: string): string {
  const m = url.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return m ? m[1] : url;
}
