// bounty-enter: the /bounty/ page's backend for signed-in players. POST JSON:
//   { action: "status" }                                   -> bounty status + my eligibility, entry, claims
//   { action: "enter", state, adult: true, resident: true, rules: RULES_VERSION }
//                                                          -> creates my bounty_entries row (owners only, bounty open)
//   { action: "notify" }                                   -> puts me on the "tell me when it opens" list
// Nobody writes bounty tables from the browser; this function (service role) is the only door.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  bountyState, caller, ELIGIBILITY_MSG, eligibility, EXCLUDED, jsonFor, RULES_VERSION, serviceClient, SLUG, US,
} from "../_shared/bounty.ts";

Deno.serve(async (req) => {
  const { cors, json } = jsonFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = serviceClient();
    const user = await caller(db, req);
    if (!user) return json({ error: "Sign in first" }, 401);
    const uid = user.id;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "status") {
      const [bounty, elig, prof, ent, cl, nt] = await Promise.all([
        bountyState(db),
        eligibility(db, uid),
        db.from("profiles").select("gamertag").eq("id", uid).maybeSingle(),
        db.from("bounty_entries").select("state_code,entered_at,rules_version").eq("user_id", uid).eq("game_slug", SLUG).maybeSingle(),
        db.from("bounty_claims").select("id,video_url,run_time,status,reject_reason,created_at,reviewed_at")
          .eq("user_id", uid).eq("game_slug", SLUG).order("created_at", { ascending: false }).limit(20),
        db.from("bounty_notify").select("user_id").eq("user_id", uid).eq("game_slug", SLUG).maybeSingle(),
      ]);
      return json({
        bounty,
        rulesVersion: RULES_VERSION,
        excluded: EXCLUDED,
        me: {
          gamertag: (prof.data && prof.data.gamertag) || null,
          eligibility: elig,
          eligibilityMessage: ELIGIBILITY_MSG[elig] || null,
          entry: ent.data || null,
          claims: cl.data || [],
          notify: !!nt.data,
        },
      });
    }

    if (action === "notify") {
      const { error } = await db.from("bounty_notify")
        .upsert({ user_id: uid, game_slug: SLUG }, { onConflict: "user_id,game_slug", ignoreDuplicates: true });
      if (error) return json({ error: "Couldn't save that — try again in a minute." }, 500);
      return json({ ok: true });
    }

    if (action === "enter") {
      const bounty = await bountyState(db);
      if (bounty.status === "unknown") return json({ error: "Couldn't confirm the bounty is open. Try again in a minute." }, 503);
      if (bounty.status === "soon") return json({ error: "The bounty opens soon. It isn't taking entries yet.", code: "soon" }, 409);
      if (bounty.status === "claimed") return json({ error: "The bounty has been claimed. It's over.", code: "claimed" }, 409);
      if (bounty.status === "ended") return json({ error: "The bounty window has ended.", code: "ended" }, 409);

      const elig = await eligibility(db, uid);
      if (elig !== "ok") return json({ error: ELIGIBILITY_MSG[elig] || "This account can't enter.", code: elig }, 403);

      const state = String(body.state || "").toUpperCase();
      if (!US.includes(state)) return json({ error: "Pick your US state. The bounty is open to US residents only.", code: "state" }, 400);
      if (EXCLUDED.includes(state)) {
        return json({ error: "Sorry, the bounty isn't open to residents of " + state + ". You can still play the game.", code: "excluded_state" }, 403);
      }
      if (body.adult !== true) return json({ error: "You must be 18 or older to enter.", code: "adult" }, 400);
      if (body.resident !== true) return json({ error: "You must be a legal US resident to enter.", code: "resident" }, 400);
      if (body.rules !== RULES_VERSION) {
        return json({ error: "The Official Rules were updated. Reload the page, read them, and agree again.", code: "rules" }, 409);
      }

      const { data: existing } = await db.from("bounty_entries").select("id,entered_at").eq("user_id", uid).eq("game_slug", SLUG).maybeSingle();
      if (existing) return json({ ok: true, already: true, entered_at: existing.entered_at });
      const { data, error } = await db.from("bounty_entries").insert({
        user_id: uid, game_slug: SLUG, state_code: state, attest_adult: true, attest_resident: true, rules_version: RULES_VERSION,
      }).select("entered_at").single();
      if (error) {
        if (error.code === "23505") return json({ ok: true, already: true });
        return json({ error: "Entry didn't save — try again in a minute." }, 500);
      }
      return json({ ok: true, entered_at: data.entered_at });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    return json({ error: "Server hiccup — try again in a minute." }, 500);
  }
});
