const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é a Sofia, atendente virtual da plataforma DeusObrigado (conecta pessoas a prestadores de serviço: reformas, pintura, elétrica, hidráulica, marcenaria, limpeza, jardinagem, transporte, mecânica, etc).

OBJETIVO: descobrir as DORES do cliente e AGENDAR uma conversa com um especialista para solucionar.

REGRAS:
- Seja calorosa, breve (1-3 frases por mensagem), empática e use português brasileiro.
- Faça UMA pergunta por vez, em ordem:
  1. Cumprimente e pergunte o nome.
  2. Pergunte qual o principal problema/dor que está enfrentando.
  3. Pergunte há quanto tempo e qual o impacto disso.
  4. Pergunte a cidade/bairro.
  5. Pergunte o melhor dia e horário para uma conversa de 15min com um especialista.
  6. Peça WhatsApp ou e-mail para confirmar o agendamento.
- Ao final, confirme o agendamento resumindo: nome, dor, cidade, data/hora, contato. Termine com "✅ Agendamento registrado! Em breve um especialista entrará em contato."
- Nunca invente preços. Se perguntarem, diga que o especialista trará uma proposta personalizada.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: text }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Desculpe, não consegui responder agora.";
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
