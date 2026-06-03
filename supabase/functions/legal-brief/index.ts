import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const now = new Date();
  const dateHuman = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).format(now);

  const fallback = {
    date_human: dateHuman,
    brief:
      "Resumo jurídico do dia indisponível agora. Tente novamente em alguns minutos.",
  };

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é uma advogada brasileira. Gere um resumo curto (máx. 4 bullets, 1 linha cada) das tendências e atualizações legislativas relevantes no Brasil para hoje, cobrindo áreas como Trabalhista, Previdenciário, Civil/Família, Consumidor e Criminal. Use linguagem objetiva, sem inventar números de lei. Se não houver novidade clara, dê dica prática do dia em cada área. Formato: apenas os bullets com '•'.",
          },
          {
            role: "user",
            content: `Hoje é ${weekday}, ${dateHuman}. Gere o resumo do dia.`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const brief = String(data?.choices?.[0]?.message?.content || "").trim() || fallback.brief;
    return new Response(JSON.stringify({ date_human: dateHuman, brief }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("legal-brief error", e);
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
