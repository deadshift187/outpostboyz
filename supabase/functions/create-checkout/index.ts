import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// comingSoon: true = checkout refuses (409) so nobody can buy yet; owners/comped accounts still play via get-game.
// Flip back to on sale: set comingSoon to false (see the header of tools/update-lost-angeles.sh).
const CATALOG: Record<string, { name: string; cents: number; comingSoon?: boolean }> = {
  "save-lost-angeles": { name: "Save Lost Angeles — Outpost Boyz", cents: 499, comingSoon: true },
};

const cors = {
  "Access-Control-Allow-Origin": "https://outpostboyz.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// JWT payloads are base64url; plain atob() throws on '-' / '_'.
function b64url(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return json({ error: "Store is not armed yet — check back soon" }, 503);

    const { slug } = await req.json();
    const item = CATALOG[slug];
    if (!item) return json({ error: "Unknown game" }, 404);
    if (item.comingSoon) return json({ error: "Coming soon" }, 409);

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const payload = JSON.parse(b64url(token.split(".")[1] || ""));
    const userId = payload.sub as string | undefined;
    const email = payload.email as string | undefined;
    if (!userId) return json({ error: "Sign in first" }, 401);

    const page = "https://outpostboyz.com/games/" + slug + "/";
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(item.cents),
      "line_items[0][price_data][product_data][name]": item.name,
      success_url: page + "?purchased=1",
      cancel_url: page,
      "metadata[user_id]": userId,
      "metadata[game_slug]": slug,
    });
    if (email) body.set("customer_email", email);

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const session = await r.json();
    if (!r.ok) return json({ error: session.error?.message || "Stripe error" }, 502);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
