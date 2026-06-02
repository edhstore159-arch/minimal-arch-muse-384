import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { image1_base64, image2_base64, prompt } = await req.json();
    if (!image1_base64 || !image2_base64) {
      return new Response(JSON.stringify({ ok: false, error: 'Envie as duas imagens.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'LOVABLE_API_KEY ausente.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userText =
      (prompt && String(prompt).trim()) ||
      'Combine/funda as duas imagens em uma única composição harmoniosa, mantendo elementos principais de ambas, com qualidade fotográfica.';

    const body = {
      model: 'google/gemini-2.5-flash-image',
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: image1_base64 } },
            { type: 'image_url', image_url: { url: image2_base64 } },
          ],
        },
      ],
    };

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Lovable-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: `Gateway ${resp.status}: ${txt}` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const msg = data?.choices?.[0]?.message;
    let imageDataUrl: string | null = null;

    const images = msg?.images;
    if (Array.isArray(images) && images.length > 0) {
      const first = images[0];
      const url = first?.image_url?.url || first?.url;
      if (url) imageDataUrl = url;
    }
    if (!imageDataUrl && typeof msg?.content === 'string') {
      const m = msg.content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);
      if (m) imageDataUrl = m[0];
    }

    if (!imageDataUrl) {
      return new Response(JSON.stringify({ ok: false, error: 'Modelo não retornou imagem.', raw: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, image: imageDataUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
