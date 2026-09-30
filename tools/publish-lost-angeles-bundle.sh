#!/usr/bin/env bash
# Upload the protected SAVE LOST ANGELES bundle (built by tools/update-lost-angeles.sh) to the private
# Supabase bucket paid-games/save-lost-angeles/game.js, via the upload-bundle edge function.
# Auth = the upload key in ~/.outpost/la-upload-token (only its sha256 is on the server, in private.upload_keys).
# Never commit that file. Lost it? Make a new one (openssl rand -hex 32) and have Claude store its sha256.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${1:-$ROOT/dist/save-lost-angeles/game.js}"
KEYFILE="${OB_UPLOAD_KEY_FILE:-$HOME/.outpost/la-upload-token}"
FN="https://duogqviqgmbaynfrhrmq.supabase.co/functions/v1"
[ -f "$BUNDLE" ] || { echo "No bundle at $BUNDLE - run: bash tools/update-lost-angeles.sh" >&2; exit 1; }
[ -f "$KEYFILE" ] || { echo "No upload key at $KEYFILE" >&2; exit 1; }
LOCAL_SHA="$(sha256sum "$BUNDLE" | cut -d' ' -f1)"
echo "Uploading $(du -h "$BUNDLE" | cut -f1) bundle (sha256 ${LOCAL_SHA:0:16}...)"
RES="$(curl -sS -X POST "$FN/upload-bundle?slug=save-lost-angeles" \
  -H "x-upload-key: $(tr -d '\r\n' < "$KEYFILE")" \
  -H "Content-Type: application/javascript" \
  --data-binary @"$BUNDLE")"
echo "$RES"
case "$RES" in
  *'"ok":true'*"$LOCAL_SHA"*) echo "Published. Players get it on their next page load." ;;
  *) echo "Upload did NOT verify - the live game is unchanged." >&2; exit 1 ;;
esac
