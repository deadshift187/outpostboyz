// admin-stats: the /admin/live/ launch dashboard's backend. Caller must be signed in AND in public.admins.
// POST (no body needed) -> aggregated numbers only (no emails, no user ids).
// ONE database round trip per call: public.admin_live_stats(uid) re-checks admins itself and returns
// NULL for non-admins (service_role-only function, see supabase/migrations/20260930_admin_live_stats.sql).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { caller, jsonFor, serviceClient, SLUG } from "../_shared/bounty.ts";

Deno.serve(async (req) => {
  const { cors, json } = jsonFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = serviceClient();
    const user = await caller(db, req);
    if (!user) return json({ error: "Sign in first" }, 401);
    const { data, error } = await db.rpc("admin_live_stats", { p_uid: user.id, p_slug: SLUG });
    if (error) return json({ error: "Stats unavailable — try again in a minute." }, 500);
    if (!data) return json({ error: "Admins only" }, 403);
    return json(data);
  } catch (_e) {
    return json({ error: "Server hiccup — try again in a minute." }, 500);
  }
});
