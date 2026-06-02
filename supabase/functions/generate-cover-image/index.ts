const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function stripDataUrl(url: string): string {
  const m = url.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return m ? m[1] : url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { prompt, reference_image_base64 } = body || {};
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Prompt obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullPrompt = `Arte quadrada profissional para redes sociais de um escritório de advocacia brasileiro. Tema: ${prompt}. Visual elegante, jurídico, humano, sem texto, sem letras, sem marcas d'água.`;

    // If user uploaded a reference image, use Gemini Nano Banana (image-in/image-out)
    if (reference_image_base64) {
      const refUrl = reference_image_base64.startsWith("data:")
        ? reference_image_base64
        : `data:image/png;base64,${reference_image_base64}`;

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          modalities: ["image", "text"],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `${fullPrompt}\n\nUse a imagem enviada como referência visual principal (mantenha o tema, cores e elementos).` },
                { type: "image_url", image_url: { url: refUrl } },
              ],
            },
          ],
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return new Response(JSON.stringify({ error: `Gateway ${resp.status}: ${text.slice(0, 300)}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const msg = data?.choices?.[0]?.message;
      let imgUrl: string | null = null;
      const images = msg?.images;
      if (Array.isArray(images) && images.length > 0) {
        imgUrl = images[0]?.image_url?.url || images[0]?.url || null;
      }
      if (!imgUrl && typeof msg?.content === "string") {
        const m = msg.content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);
        if (m) imgUrl = m[0];
      }
      if (!imgUrl) {
        return new Response(JSON.stringify({ error: "Modelo não retornou imagem." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ b64_json: stripDataUrl(imgUrl) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No reference: original text-to-image flow
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt: fullPrompt,
        quality: "low",
        size: "1024x1024",
        stream: false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: text }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return new Response(JSON.stringify({ error: "Sem imagem gerada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ b64_json: b64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
