// Worker invoked by pg_cron. Publishes due scheduled_posts to connected
// social networks. Today only LinkedIn is supported via Lovable connector
// gateway; other networks stay queued with a "needs_connection" message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LINKEDIN_API_KEY = Deno.env.get("LINKEDIN_API_KEY");

const GATEWAY = "https://connector-gateway.lovable.dev";

async function publishLinkedIn(text: string): Promise<{ ok: boolean; info: string }> {
  if (!LOVABLE_API_KEY || !LINKEDIN_API_KEY) {
    return { ok: false, info: "LinkedIn não conectado" };
  }
  // Resolve the connected member URN
  const me = await fetch(`${GATEWAY}/linkedin/v2/userinfo`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": LINKEDIN_API_KEY,
    },
  });
  if (!me.ok) return { ok: false, info: `LinkedIn userinfo ${me.status}` };
  const profile = await me.json();
  const sub = profile?.sub;
  if (!sub) return { ok: false, info: "LinkedIn sub ausente" };

  const res = await fetch(`${GATEWAY}/linkedin/v2/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": LINKEDIN_API_KEY,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${sub}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const body = await res.text();
  return { ok: res.ok, info: res.ok ? "ok" : `LinkedIn ${res.status}: ${body.slice(0, 200)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: due, error } = await sb
    .from("scheduled_posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const post of due ?? []) {
    const text = [post.caption, post.hashtags].filter(Boolean).join("\n\n");
    const perPlatform: Record<string, { ok: boolean; info: string }> = {};
    for (const p of post.platforms ?? []) {
      if (p === "linkedin") {
        perPlatform[p] = await publishLinkedIn(text);
      } else {
        perPlatform[p] = { ok: false, info: "needs_connection" };
      }
    }
    const anyOk = Object.values(perPlatform).some((r) => r.ok);
    const allOk = Object.values(perPlatform).every((r) => r.ok);
    const status = allOk ? "published" : anyOk ? "partial" : "failed";
    await sb
      .from("scheduled_posts")
      .update({
        status,
        platform_results: perPlatform,
        last_attempt_at: new Date().toISOString(),
        published_at: anyOk ? new Date().toISOString() : null,
        error_message: allOk
          ? null
          : Object.entries(perPlatform)
              .filter(([, r]) => !r.ok)
              .map(([k, r]) => `${k}: ${r.info}`)
              .join(" | "),
      })
      .eq("id", post.id);
    results.push({ id: post.id, status, perPlatform });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
