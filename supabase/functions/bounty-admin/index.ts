// bounty-admin: the /admin/bounty/ page's backend. Caller must be signed in AND in public.admins (checked here).
// POST JSON:
//   { action: "list" }                                    -> bounty status, every claim (with entrant info), entry + notify counts
//   { action: "approve", claim_id, skip_earlier?: true }  -> claim = approved + public winner row (Beat Pile). ONE winner, ever.
//   { action: "reject",  claim_id, reason }               -> claim = rejected with a reason the player sees
//   { action: "reset",   claim_id }                       -> back to pending (undo a mistake; removes the winner row if it was the winner)
// Paying is done by hand (PayPal) — nothing here moves money.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { bountyState, caller, eligibility, jsonFor, serviceClient, SLUG } from "../_shared/bounty.ts";

Deno.serve(async (req) => {
  const { cors, json } = jsonFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = serviceClient();
    const user = await caller(db, req);
    if (!user) return json({ error: "Sign in first" }, 401);
    const me = user.id;
    const { data: adm } = await db.from("admins").select("user_id").eq("user_id", me).maybeSingle();
    if (!adm) return json({ error: "Admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "list") {
      const [bounty, claims, entries, notify, profiles, purchases] = await Promise.all([
        bountyState(db),
        db.from("bounty_claims").select("*").eq("game_slug", SLUG).order("created_at", { ascending: true }).limit(1000),
        db.from("bounty_entries").select("id,user_id,state_code,entered_at,rules_version").eq("game_slug", SLUG).order("entered_at", { ascending: true }).limit(5000),
        db.from("bounty_notify").select("user_id", { count: "exact", head: true }).eq("game_slug", SLUG),
        db.from("profiles").select("id,gamertag"),
        db.from("purchases").select("user_id,created_at,amount_cents").eq("game_slug", SLUG),
      ]);
      const tag: Record<string, string> = {};
      (profiles.data || []).forEach((p) => (tag[p.id] = p.gamertag));
      const bought: Record<string, { created_at: string; amount_cents: number }> = {};
      (purchases.data || []).forEach((p) => (bought[p.user_id] = { created_at: p.created_at, amount_cents: p.amount_cents }));
      const entryById: Record<string, { state_code: string; entered_at: string; rules_version: string }> = {};
      (entries.data || []).forEach((e) => (entryById[String(e.id)] = e));

      // Emails only for people who actually claimed (the crew needs them to request ID / pay).
      const ids = [...new Set((claims.data || []).map((c) => c.user_id))];
      const email: Record<string, string> = {};
      const elig: Record<string, string> = {};
      await Promise.all(ids.map(async (id) => {
        const { data } = await db.auth.admin.getUserById(id);
        email[id] = (data && data.user && data.user.email) || "";
        try { elig[id] = await eligibility(db, id); } catch (_) { elig[id] = "error"; }
      }));

      const rows = (claims.data || []).map((c) => ({
        id: c.id,
        status: c.status,
        created_at: c.created_at,
        video_url: c.video_url,
        run_time: c.run_time,
        notes: c.notes,
        reject_reason: c.reject_reason,
        reviewed_at: c.reviewed_at,
        user_id: c.user_id,
        gamertag: tag[c.user_id] || "",
        email: email[c.user_id] || "",
        eligibility_now: elig[c.user_id] || "",
        entry: entryById[String(c.entry_id)] || null,
        purchase: bought[c.user_id] || null,
      }));
      return json({
        bounty,
        claims: rows,
        entries: (entries.data || []).length,
        notify: notify.count || 0,
        entrants: (entries.data || []).map((e) => ({ gamertag: tag[e.user_id] || "", state: e.state_code, entered_at: e.entered_at })),
      });
    }

    const id = Number(body.claim_id);
    if (!Number.isInteger(id) || id <= 0) return json({ error: "Bad claim id" }, 400);
    const { data: claim } = await db.from("bounty_claims").select("*").eq("id", id).eq("game_slug", SLUG).maybeSingle();
    if (!claim) return json({ error: "Claim not found" }, 404);

    if (action === "approve") {
      if (claim.status !== "pending") return json({ error: "Only a PENDING claim can be approved (this one is " + claim.status + ")." }, 409);
      const { data: win } = await db.from("bounty_winners").select("gamertag").eq("game_slug", SLUG).maybeSingle();
      if (win) return json({ error: "There is already a winner (" + win.gamertag + "). One prize only." }, 409);
      const elig = await eligibility(db, claim.user_id);
      if (elig !== "ok") return json({ error: "This account is no longer eligible (" + elig + "). Reject it instead." }, 409);
      if (body.skip_earlier !== true) {
        const { count } = await db.from("bounty_claims").select("id", { count: "exact", head: true })
          .eq("game_slug", SLUG).eq("status", "pending").lt("created_at", claim.created_at);
        if ((count || 0) > 0) {
          return json({ error: count + " earlier claim(s) are still pending. Earliest valid claim wins — review those first.", code: "earlier", earlier: count }, 409);
        }
      }
      const { data: prof } = await db.from("profiles").select("gamertag").eq("id", claim.user_id).maybeSingle();
      const now = new Date().toISOString();
      const { error: e1 } = await db.from("bounty_claims")
        .update({ status: "approved", reviewed_by: me, reviewed_at: now, reject_reason: null })
        .eq("id", id).eq("status", "pending");
      if (e1) return json({ error: e1.code === "23505" ? "Another claim was just approved. One prize only." : "Approve failed." }, 409);
      const { error: e2 } = await db.from("bounty_winners")
        .insert({ game_slug: SLUG, gamertag: (prof && prof.gamertag) || "UNKNOWN", claim_id: id, won_at: now });
      if (e2) {
        await db.from("bounty_claims").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", id);
        return json({ error: "Couldn't record the winner — nothing changed. Try again." }, 500);
      }
      return json({ ok: true });
    }

    if (action === "reject") {
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (reason.length < 3) return json({ error: "Give a short reason — the player sees it." }, 400);
      if (claim.status === "approved") return json({ error: "That's the winning claim. RESET it first if you really mean it." }, 409);
      const { error } = await db.from("bounty_claims")
        .update({ status: "rejected", reject_reason: reason, reviewed_by: me, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return json({ error: "Reject failed." }, 500);
      return json({ ok: true });
    }

    if (action === "reset") {
      if (claim.status === "approved") {
        const { error } = await db.from("bounty_winners").delete().eq("game_slug", SLUG).eq("claim_id", id);
        if (error) return json({ error: "Couldn't remove the winner row." }, 500);
      }
      const { error } = await db.from("bounty_claims")
        .update({ status: "pending", reject_reason: null, reviewed_by: null, reviewed_at: null }).eq("id", id);
      if (error) return json({ error: "Reset failed." }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    return json({ error: "Server hiccup — try again in a minute." }, 500);
  }
});
