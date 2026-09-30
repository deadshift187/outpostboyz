// bounty-claim: an entrant says "I beat it — here's my video". POST JSON:
//   { video_url: "https://...", run_time?: "1:23:45", notes?: "...", attest: true }
// Creates a PENDING claim for the crew to review. Never pays, never marks anything verified.
// Limits: must have an entry, bounty must be open, still eligible, max CLAIMS_PER_DAY per 24h.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  bountyState, caller, CLAIMS_PER_DAY, ELIGIBILITY_MSG, eligibility, jsonFor, serviceClient, SLUG,
} from "../_shared/bounty.ts";

function cleanUrl(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (s.length < 12 || s.length > 500) return null;
  let u: URL;
  try { u = new URL(s); } catch (_) { return null; }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;   // a real domain, not an IP or localhost
  return u.toString();
}

function cleanText(raw: unknown, max: number): string | null {
  // deno-lint-ignore no-control-regex
  const s = String(raw || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, max) : null;
}

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

    const video = cleanUrl(body.video_url);
    if (!video) {
      return json({ error: "Paste the full https:// link to your video (YouTube unlisted, Google Drive, Twitch VOD...).", code: "url" }, 400);
    }
    if (body.attest !== true) return json({ error: "Tick the box confirming the run follows the rules.", code: "attest" }, 400);
    const runTime = cleanText(body.run_time, 20);
    const notes = cleanText(body.notes, 1000);

    const bounty = await bountyState(db);
    if (bounty.status === "unknown") return json({ error: "Couldn't confirm the bounty is open. Try again in a minute." }, 503);
    if (bounty.status !== "open") {
      const why = bounty.status === "claimed" ? "The bounty has already been claimed." :
        bounty.status === "ended" ? "The bounty window has ended." : "The bounty isn't open yet.";
      return json({ error: why, code: bounty.status }, 409);
    }

    const { data: entry } = await db.from("bounty_entries").select("id").eq("user_id", uid).eq("game_slug", SLUG).maybeSingle();
    if (!entry) return json({ error: "Enter the bounty first (the ENTER THE BOUNTY button), then submit your run.", code: "no_entry" }, 403);

    const elig = await eligibility(db, uid);
    if (elig !== "ok") return json({ error: ELIGIBILITY_MSG[elig] || "This account can't claim.", code: elig }, 403);

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db.from("bounty_claims").select("id", { count: "exact", head: true })
      .eq("user_id", uid).gte("created_at", since);
    if ((count || 0) >= CLAIMS_PER_DAY) {
      return json({ error: "That's " + CLAIMS_PER_DAY + " claims in 24 hours. Your earlier claims are in the queue — the crew will get to them.", code: "rate" }, 429);
    }

    const { data, error } = await db.from("bounty_claims").insert({
      entry_id: entry.id, user_id: uid, game_slug: SLUG, video_url: video, run_time: runTime, notes, attest_run: true,
    }).select("id,created_at,status").single();
    if (error) {
      if (/bounty_claim_rate/.test(error.message || "")) {
        return json({ error: "That's " + CLAIMS_PER_DAY + " claims in 24 hours. Your earlier claims are in the queue.", code: "rate" }, 429);
      }
      return json({ error: "Claim didn't save — try again in a minute." }, 500);
    }
    return json({ ok: true, claim: data });
  } catch (_e) {
    return json({ error: "Server hiccup — try again in a minute." }, 500);
  }
});
