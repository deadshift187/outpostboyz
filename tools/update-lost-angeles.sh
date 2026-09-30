#!/usr/bin/env bash
# Copy the latest LOST-ANGELES-OPUS build into games/save-lost-angeles/ and add the site-only bits
# (title/og/manifest tags, a menu-only home link, the OB play counter). Then commit + push yourself.
# Usage: bash tools/update-lost-angeles.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${OPUS_SRC:-$ROOT/../LOST-ANGELES-OPUS}"
DST="$ROOT/games/save-lost-angeles"
[ -f "$SRC/index.html" ] || { echo "OPUS build not found at $SRC" >&2; exit 1; }

rm -rf "$DST" && mkdir -p "$DST"
# Ship the last COMMIT only (never someone's half-finished working-tree edits). Same file set as the
# OPUS repo's own `tools/package.sh zip`.
git -C "$SRC" archive --format=tar HEAD index.html data src assets | tar -C "$DST" -xf -
# The art isn't in git (ignored, ~130MB), so it comes from the folder. Art changes are whole files, not half-edits.
(cd "$SRC" && tar -cf - assets) | tar -C "$DST" -xf -
find "$DST" \( -name 'manifest.json' -o -name 'srcmap.json' \) -delete

PY=""; for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c 1 >/dev/null 2>&1 && { PY="$c"; break; }; done
"$PY" - "$DST/index.html" <<'PYEOF'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
head = '''<title>Save Lost Angeles — Outpost Boyz</title>
<meta name="description" content="Save Lost Angeles: a free Mario-style platformer. You're Golden Boy: 27 levels across 5 worlds of LA, 18 bosses, 2-player co-op. Play free in your browser.">
<meta property="og:title" content="Save Lost Angeles — Outpost Boyz">
<meta property="og:description" content="Golden Boy vs. the system. 27 levels, 18 bosses, 2-player co-op. Free in your browser.">
<meta property="og:url" content="https://outpostboyz.com/games/save-lost-angeles/">
<link rel="canonical" href="https://outpostboyz.com/games/save-lost-angeles/">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="icon" href="/assets/icons/icon-192.png">'''
tail = '''<!-- ===== OUTPOST BOYZ (site only): home link on menu screens, never over gameplay + play counter ===== -->
<style>
#obHome{position:fixed;top:max(10px,env(safe-area-inset-top));left:10px;z-index:50;display:none;align-items:center;
  padding:8px 12px;min-height:28px;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:rgba(8,10,16,.72);
  color:#cfd6e4;font:600 10px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.15em;text-decoration:none}
#obHome:hover,#obHome:focus-visible{color:#fff;border-color:#FF5A1F;outline:none}
</style>
<a id="obHome" href="/">&#9666; OUTPOST BOYZ</a>
<script>
(function () {
  var MENUS = { title: 1, gameover: 1, credits: 1 };   // not map/results: their headers sit top-left
  var el = document.getElementById('obHome');
  function show(name) { el.style.display = MENUS[name] ? 'flex' : 'none'; }
  if (window.LA && LA.on) { LA.on('scene', show); if (LA.scenes) show(LA.scenes.curName); }
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2"></script>
<script src="/assets/ob-sdk.js"></script>
</body>'''
if s.count('<title>LOST ANGELES</title>') != 1 or s.count('</body>') != 1:
    sys.exit('OPUS index.html changed shape (<title> or </body>) - update this script')
s = s.replace('<title>LOST ANGELES</title>', head, 1).replace('</body>', tail, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
PYEOF

echo "Updated games/save-lost-angeles from OPUS $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo '?') ($(du -sh "$DST" | cut -f1))"
echo "Next: git add -A games/save-lost-angeles && git commit && git push"
