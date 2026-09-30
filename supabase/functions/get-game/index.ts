// get-game: hands the protected game code to signed-in players who bought it or were comped.
// Returns { url, version }: url = a 60-second signed URL for the private bundle (paid-games/<slug>/game.js),
// version = its content hash (eTag) + size, so the page can reuse the copy it cached for this player.
// The page fetches that text (or its cached copy) and runs it via a Blob URL <script>.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Games that ship as a protected bundle.
const PAID = new Set(["save-lost-angeles"]);
const ORIGINS = ["https://outpostboyz.com", "https://www.outpostboyz.com"];

function corsFor(req: Request) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Real verification of the caller's session (the anon key or a forged token gets 401).
    let userId: string | null = null;
    if (token) {
      const { data: u, error: uerr } = await admin.auth.getUser(token);
      if (!uerr && u && u.user) userId = u.user.id;
    }
    if (!userId) return json({ error: "Sign in first", code: "signin" }, 401);

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") || "";
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return json({ error: "Bad slug" }, 400);
    if (!PAID.has(slug)) return json({ error: "Unknown game" }, 404);

    const { data: ok, error: aerr } = await admin.rpc("has_access", { p_user: userId, p_slug: slug });
    if (aerr) return json({ error: "Couldn't check your library — try again" }, 500);
    if (ok !== true) return json({ error: "You don't own this one yet", code: "not_owned" }, 403);

    const bucket = admin.storage.from("paid-games");
    // version = the stored bundle's content hash (Storage eTag = MD5 of the bytes) + size. The page keeps the
    // bundle in the player's own browser under this id and skips the ~4MB download while it's unchanged.
    // Best effort: any failure here = "" and the page just downloads, like before.
    const versionP = (async () => {
      try {
        const { data: files } = await bucket.list(slug, { search: "game.js", limit: 10 });
        const f = (files || []).find((x) => x.name === "game.js");
        const meta = (f && f.metadata) || {};
        const etag = String(meta.eTag || "").replace(/[^0-9a-f]/gi, "");
        return etag ? etag + "-" + (meta.size || meta.contentLength || 0) : "";
      } catch (_) {
        return "";
      }
    })();
    const { data: signed, error } = await bucket.createSignedUrl(slug + "/game.js", 60);
    if (error || !signed) return json({ error: "Game file not uploaded yet" }, 404);
    return json({ url: signed.signedUrl, version: await versionP });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
