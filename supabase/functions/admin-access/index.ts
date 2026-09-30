// admin-access: the /admin/ page's backend. Caller must be signed in AND listed in public.admins
// (checked here, server-side). Actions (POST JSON):
//   { action: "list" }                              -> every account + its access per game
//   { action: "grant",  user_id, slug, note? }      -> comp a game (access_grants row)
//   { action: "revoke", user_id, slug }             -> remove a comp (never touches purchases)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GAMES = [{ slug: "save-lost-angeles", title: "SAVE LOST ANGELES" }];
const SLUGS = new Set(GAMES.map((g) => g.slug));
const ORIGINS = ["https://outpostboyz.com", "https://www.outpostboyz.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsFor(req: Request) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let me: string | null = null;
    if (token) {
      const { data: u, error } = await db.auth.getUser(token);
      if (!error && u && u.user) me = u.user.id;
    }
    if (!me) return json({ error: "Sign in first" }, 401);
    const { data: adm } = await db.from("admins").select("user_id").eq("user_id", me).maybeSingle();
    if (!adm) return json({ error: "Admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "list") {
      const users: { id: string; email?: string; created_at: string }[] = [];
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json({ error: "Couldn't list accounts" }, 500);
        users.push(...data.users.map((x) => ({ id: x.id, email: x.email, created_at: x.created_at })));
        if (data.users.length < 1000) break;
      }
      const [pr, pu, gr, ad] = await Promise.all([
        db.from("profiles").select("id,gamertag"),
        db.from("purchases").select("user_id,game_slug,created_at"),
        db.from("access_grants").select("user_id,game_slug,note,created_at"),
        db.from("admins").select("user_id"),
      ]);
      const tag: Record<string, string> = {};
      (pr.data || []).forEach((p) => (tag[p.id] = p.gamertag));
      const admins = new Set((ad.data || []).map((a) => a.user_id));
      const rows = users.map((x) => ({
        id: x.id,
        email: x.email || "",
        gamertag: tag[x.id] || "",
        created_at: x.created_at,
        admin: admins.has(x.id),
        bought: (pu.data || []).filter((p) => p.user_id === x.id).map((p) => p.game_slug),
        comped: (gr.data || []).filter((g) => g.user_id === x.id).map((g) => g.game_slug),
      }));
      rows.sort((a, b) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || (a.gamertag || a.email).localeCompare(b.gamertag || b.email));
      return json({ games: GAMES, me, users: rows });
    }

    if (action === "grant" || action === "revoke") {
      const uid = String(body.user_id || "");
      const slug = String(body.slug || "");
      if (!UUID.test(uid)) return json({ error: "Bad user" }, 400);
      if (!SLUGS.has(slug)) return json({ error: "Unknown game" }, 400);
      if (action === "grant") {
        const note = String(body.note || "comped").slice(0, 200);
        const { error } = await db.from("access_grants")
          .upsert({ user_id: uid, game_slug: slug, note, granted_by: me }, { onConflict: "user_id,game_slug", ignoreDuplicates: true });
        if (error) return json({ error: "Grant failed: " + error.message }, 500);
        return json({ ok: true });
      }
      const { data: tAdm } = await db.from("admins").select("user_id").eq("user_id", uid).maybeSingle();
      // Admins keep their all-access ('*') grant; only per-game comps can be removed from them.
      const kill = tAdm ? [slug] : [slug, "*"];
      const { error } = await db.from("access_grants").delete().eq("user_id", uid).in("game_slug", kill);
      if (error) return json({ error: "Revoke failed: " + error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
