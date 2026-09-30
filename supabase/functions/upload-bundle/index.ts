// upload-bundle: publishes a new protected game bundle into the private paid-games bucket.
// Auth is an upload key (x-upload-key header), NOT a JWT: only its sha256 is stored in the DB
// (private.upload_keys, checked via public.check_upload_key, service role only). The plaintext key
// lives on Saint's machine at ~/.outpost/la-upload-token. The service-role key never leaves the server.
//   curl -X POST "$FN/upload-bundle?slug=save-lost-angeles" -H "x-upload-key: $(cat ~/.outpost/la-upload-token)" \
//        -H "Content-Type: application/javascript" --data-binary @dist/save-lost-angeles/game.js
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SLUGS = new Set(["save-lost-angeles"]);
const MAX_BYTES = 40 * 1024 * 1024;

async function sha256hex(data: Uint8Array) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(h).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const key = req.headers.get("x-upload-key") || "";
    if (!/^[0-9a-f]{64}$/.test(key)) return json({ error: "forbidden" }, 403);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const keyHash = await sha256hex(new TextEncoder().encode(key));
    const { data: ok, error: kerr } = await admin.rpc("check_upload_key", { p_hash: keyHash });
    if (kerr || ok !== true) return json({ error: "forbidden" }, 403);

    const slug = new URL(req.url).searchParams.get("slug") || "";
    if (!SLUGS.has(slug)) return json({ error: "Unknown game" }, 400);

    const body = new Uint8Array(await req.arrayBuffer());
    if (body.length < 1000 || body.length > MAX_BYTES) return json({ error: "Bad size " + body.length }, 400);
    const sha = await sha256hex(body);

    const path = slug + "/game.js";
    const { error: uerr } = await admin.storage.from("paid-games").upload(path, body, {
      upsert: true,
      contentType: "application/javascript; charset=utf-8",
      cacheControl: "0",
    });
    if (uerr) return json({ error: "Upload failed: " + uerr.message }, 500);

    // Read it back so the caller knows the stored copy is byte-identical.
    const { data: back, error: derr } = await admin.storage.from("paid-games").download(path);
    if (derr || !back) return json({ error: "Stored, but read-back failed" }, 500);
    const backSha = await sha256hex(new Uint8Array(await back.arrayBuffer()));
    return json({ ok: backSha === sha, slug, path, bytes: body.length, sha256: sha, storedSha256: backSha });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
