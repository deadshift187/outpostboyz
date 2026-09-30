// Shared bounty config for bounty-enter / bounty-claim / bounty-admin.
// THE SWITCH lives in the site repo: games/store.json -> gauntlet[slug].bountyStatus = "soon" | "open" | "claimed"
// (+ bountyOpenedAt = "YYYY-MM-DD" when it opens; the contest ends 12 months later).
// An approved claim (public.bounty_winners row) always wins over the file: status becomes "claimed".
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SLUG = "save-lost-angeles";
export const GAME_TITLE = "SAVE LOST ANGELES";
export const RULES_VERSION = "2026-09-29";
export const CLAIMS_PER_DAY = 3;
export const STORE_URL = "https://outpostboyz.com/games/store.json";

// Not open to residents of these states (see /bounty/rules/).
export const EXCLUDED = ["AR", "AZ", "CT", "DE", "IA", "IN", "LA", "ME", "MT", "SC", "SD", "TN"];
// 50 states + DC.
export const US = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const ORIGINS = ["https://outpostboyz.com", "https://www.outpostboyz.com"];

export function corsFor(req: Request) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonFor(req: Request) {
  const cors = corsFor(req);
  return {
    cors,
    json: (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      }),
  };
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verifies the caller's access token with Supabase Auth. Returns the user or null.
export async function caller(db: SupabaseClient, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

export type BountyState = {
  status: "soon" | "open" | "claimed" | "ended" | "unknown";
  openedAt: string | null;
  endsAt: string | null;
  winner: { gamertag: string; won_at: string } | null;
};

// "unknown" = the site's store.json couldn't be read: callers must treat that as CLOSED.
export async function bountyState(db: SupabaseClient): Promise<BountyState> {
  const { data: w } = await db.from("bounty_winners").select("gamertag,won_at").eq("game_slug", SLUG).maybeSingle();
  let status: BountyState["status"] = "unknown";
  let openedAt: string | null = null;
  let endsAt: string | null = null;
  try {
    const r = await fetch(STORE_URL + "?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const store = await r.json();
      const g = (store.gauntlet || []).find((x: { slug?: string }) => x && x.slug === SLUG) || {};
      const s = String(g.bountyStatus || "soon");
      status = s === "open" || s === "claimed" ? s : "soon";
      const t = Date.parse(String(g.bountyOpenedAt || ""));
      if (!isNaN(t)) {
        openedAt = new Date(t).toISOString();
        const end = new Date(t);
        end.setUTCFullYear(end.getUTCFullYear() + 1);
        endsAt = end.toISOString();
        if (status === "open" && Date.now() > end.getTime()) status = "ended";
      }
    }
  } catch (_) { /* stays unknown */ }
  if (w) status = "claimed";
  return { status, openedAt, endsAt, winner: w || null };
}

export const ELIGIBILITY_MSG: Record<string, string> = {
  crew: "Crew accounts can't win the bounty. You can still play all you want.",
  comped: "Crew and comped accounts can't win the bounty. Only accounts that bought the game can enter.",
  not_owner: "The bounty is for owners of SAVE LOST ANGELES. Buy the game ($4.99), then come back and enter.",
  no_gamertag: "Pick a gamertag on your account page first. It's the name that goes on the Beat Pile if you win.",
};

export async function eligibility(db: SupabaseClient, uid: string): Promise<string> {
  const { data, error } = await db.rpc("bounty_eligibility", { p_user: uid, p_slug: SLUG });
  if (error) throw new Error("eligibility check failed");
  return String(data || "error");
}
