#!/usr/bin/env bash
# Rebuild the site copy of SAVE LOST ANGELES from the LOST-ANGELES-OPUS repo (PAID game: the code is protected).
#
#   games/save-lost-angeles/          PUBLIC (committed): page shell + paywall gate/sell page, art (assets/), phone art
#                                     (assets-m/), sell-page media (promo/), home-screen manifest + icons. None of it plays on its own.
#   dist/save-lost-angeles/game.js    PROTECTED bundle (gitignored): all of OPUS's code in index.html order.
#                                     Goes to the private Supabase bucket via tools/publish-lost-angeles-bundle.sh.
#
# Usage: bash tools/update-lost-angeles.sh      (then commit + push, then publish the bundle - see the output)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${OPUS_SRC:-$ROOT/../LOST-ANGELES-OPUS}"
DST="$ROOT/games/save-lost-angeles"
SITE="$ROOT/tools/la-site"
BUNDLE="$ROOT/dist/save-lost-angeles/game.js"
MCACHE="$ROOT/dist/la-mobile-cache"
[ -f "$SRC/index.html" ] || { echo "OPUS build not found at $SRC" >&2; exit 1; }
SHA="$(git -C "$SRC" rev-parse --short HEAD)"

PY=""; for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c 1 >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python not found" >&2; exit 1; }

# Code from the last COMMIT only (never someone's half-finished working-tree edits). Read-only on OPUS.
CODE="$(mktemp -d)"; trap 'rm -rf "$CODE"' EXIT
git -C "$SRC" archive --format=tar HEAD index.html data src | tar -C "$CODE" -xf -

rm -rf "$DST" && mkdir -p "$DST"
# The art isn't in git (ignored, ~130MB), so it comes from the folder. Art changes are whole files, not half-edits.
cp -Rp "$SRC/assets" "$DST/"   # -p keeps mtimes so the phone-art cache stays incremental
find "$DST" \( -name 'manifest.json' -o -name 'srcmap.json' \) -delete
# Phone art (600px cap) - cached in dist/ so only changed files get re-encoded.
"$PY" "$SITE/build.py" mobile "$DST/assets" "$MCACHE"
mkdir -p "$DST/assets-m" && cp -R "$MCACHE/." "$DST/assets-m/"
# Home-screen app: own manifest + Golden Boy icons (site-owned, live in tools/la-site/).
cp "$SITE/manifest.webmanifest" "$DST/" && cp -R "$SITE/icons" "$DST/"
# Sell-page media for the paywall gate (trailer + poster + screenshots; site-owned, made from OPUS media/ + review/).
cp -R "$SITE/promo" "$DST/"
# Page shell + protected bundle.
"$PY" "$SITE/build.py" page "$CODE" "$DST" "$BUNDLE" "$SHA"
if grep -q '<script src="\(data\|src\)/' "$DST/index.html"; then echo "code <script> tags leaked into the public page" >&2; exit 1; fi

echo
echo "Updated games/save-lost-angeles from OPUS $SHA (public: $(du -sh "$DST" | cut -f1); bundle: $BUNDLE)"
echo "Publish, in this order (new code may need the new art to be live first):"
echo "  1) git add -A games/save-lost-angeles && git commit -m \"Save Lost Angeles: OPUS $SHA\" && git push"
echo "  2) wait ~1 minute for GitHub Pages, then:  bash tools/publish-lost-angeles-bundle.sh"
