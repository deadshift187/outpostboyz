#!/usr/bin/env bash
# Build dist/outpost-arcade-batocera.zip — the Outpost Boyz free games as a Batocera system.
#
# Single source of truth: the game files come straight from this site's games/ folder.
# The kiosk runtime (_kiosk/: kiosk.py, launch.bash, per-game key shims) and
# es_systems_outpostboyz.cfg come from the OUTPOSTBOYZ-ARCADE pack (override with ARCADE_SRC=...).
#
# Zip layout (matches the download page's install steps):
#   outpostboyz/                      -> copy to /userdata/roms/
#     <Game>.sh                       launchers (LF, exec bit set in the zip)
#     _kiosk/                         kiosk.py + launch.bash + shims
#     web/                            served by python http.server on 127.0.0.1:<port>
#       assets/ob-sdk.js
#       games/<slug>/...
#     images/<id>.png                 640x480 title cards
#     gamelist.xml
#   es_systems_outpostboyz.cfg        -> copy to /userdata/system/configs/emulationstation/
#   README.txt
#
# Usage: bash tools/build-arcade-pack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCADE_SRC="${ARCADE_SRC:-$ROOT/../OUTPOSTBOYZ-ARCADE}"
DIST="$ROOT/dist"
STAGE="$DIST/stage"
PACK="$STAGE/outpostboyz"
ZIP="$DIST/outpost-arcade-batocera.zip"
CARDS="$ROOT/tools/arcade-cards"
ROMS=/userdata/roms/outpostboyz

# id | launcher name | site slug | page+query | port | shim (or -) | genre | players | card accent | description
GAMES=(
  "scraprun|SCRAP RUN|scrap-run|index.html?arcade=1|8181|-|Run and Gun|1-2|#ff4d4d|Humanity vs the machines. A Metal Slug style run and gun: missions, bosses, tanks, POWs, 1-2 players. Stick moves, B1 shoots (tap - no auto-fire), B2 jumps, B3 bombs."
  "tapflip|Tap Flip|tap-flip|index.html|8182|shim-tapflip.js|Arcade|1|#41ff6b|One button. Flip gravity, dodge everything, chase the high score. Every button flips."
  "paperroute|Paper Route|paper-route|index.html|8183|shim-paperroute.js|Arcade|1|#4dd8ff|Deliver the papers, dodge cars and dogs, don't run dry. Stick rides, button 1 throws left, button 2 throws right."
  "snowline|Snowline|snowline|index.html?arcade=1|8184|shim-snowline.js|Puzzle|1|#9dc0dd|Draw the line, ride the snow. 300 levels. Draw with the TRACKBALL; button 1 rides, button 2 resets, button 4 undoes, coin opens the level menu."
  "blocknine|Block Nine|block-nine|index.html|8185|-|Puzzle|1|#ffb454|Drag, fit, clear the grid - one wrong block ends it all. Use the TRACKBALL to drag pieces."
)

say() { printf '  %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

PY=""
for c in python3 python py; do   # (skips the Windows Store "python3" stub, which exists but can't run)
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import zipfile' >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || die "python3 is required (used to write the zip with exec bits)"
[ -d "$ARCADE_SRC/_kiosk" ] || die "arcade kiosk source not found at $ARCADE_SRC/_kiosk (set ARCADE_SRC)"
[ -f "$ARCADE_SRC/es_systems_outpostboyz.cfg" ] || die "missing $ARCADE_SRC/es_systems_outpostboyz.cfg"

echo "Building Outpost Boyz arcade pack"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$PACK/_kiosk" "$PACK/web/assets" "$PACK/web/games" "$PACK/images"

# LF-only copy for text files that run on the cabinet.
lfcopy() { sed 's/\r$//' "$1" > "$2"; }

# ---- kiosk runtime + system config (from the ARCADE pack) ----
for f in kiosk.py launch.bash shim-paperroute.js shim-snowline.js shim-tapflip.js; do
  [ -f "$ARCADE_SRC/_kiosk/$f" ] || die "missing $ARCADE_SRC/_kiosk/$f"
  lfcopy "$ARCADE_SRC/_kiosk/$f" "$PACK/_kiosk/$f"
done
lfcopy "$ARCADE_SRC/es_systems_outpostboyz.cfg" "$STAGE/es_systems_outpostboyz.cfg"
say "_kiosk + es_systems from $ARCADE_SRC"

# ---- shared web assets + games (from the site) ----
cp "$ROOT/assets/ob-sdk.js" "$PACK/web/assets/ob-sdk.js"

# Game home links point at ../../ (the web root): give it a tiny offline menu instead of a 404.
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<title>Outpost Boyz Arcade</title><style>html,body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center}'
  echo 'h1{margin:60px 0 8px;letter-spacing:-1px}p{color:#999}a{display:block;margin:12px auto;max-width:320px;padding:14px;border:2px solid #39ff14;color:#39ff14;text-decoration:none;font-weight:900;letter-spacing:1px}</style></head>'
  echo '<body><h1>OUTPOST BOYZ</h1><p>Press START + COIN to exit back to the arcade menu.</p>'
  for row in "${GAMES[@]}"; do
    IFS='|' read -r id name slug page port shim genre players accent desc <<<"$row"
    echo "<a href=\"games/$slug/$page\">$(echo "$name" | tr '[:lower:]' '[:upper:]')</a>"
  done
  echo '</body></html>'
} > "$PACK/web/index.html"

for row in "${GAMES[@]}"; do
  IFS='|' read -r id name slug page port shim genre players accent desc <<<"$row"
  src="$ROOT/games/$slug"
  [ -f "$src/index.html" ] || die "site game missing: $src/index.html"
  mkdir -p "$PACK/web/games/$slug"
  # Copy the whole game folder (index.html + any js/ data) — no media in these games.
  (cd "$src" && find . -type f ! -name '*.wav' ! -name '*.mp3' ! -name '*.mp4' -print0) |
    while IFS= read -r -d '' f; do
      mkdir -p "$PACK/web/games/$slug/$(dirname "$f")"
      cp "$src/$f" "$PACK/web/games/$slug/$f"
    done

  # launcher — same convention as the original pack: exec launch.bash <dir> <page> <port> [shim]
  shimarg=""
  if [ "$shim" != "-" ]; then
    [ -f "$PACK/_kiosk/$shim" ] || die "shim not found: $shim"
    shimarg="$ROMS/_kiosk/$shim"
  fi
  printf '#!/bin/bash\n# OUTPOST BOYZ - %s\nexec %s/_kiosk/launch.bash "%s/web" "games/%s/%s" %s %s\n' \
    "$name" "$ROMS" "$ROMS" "$slug" "$page" "$port" "$shimarg" > "$PACK/$name.sh"
  # evmapy pad->key map. Batocera's keyboardToPads turns keyboard encoders (I-PAC) into
  # virtual gamepads and hides the keyboard, so the kiosk would get no input without this.
  # Also makes any regular gamepad work: ES button names -> the keys the games listen for.
  lfcopy "$ROOT/tools/arcade-ipac.keys" "$PACK/$name.sh.keys"

  # title card (generated once with PowerShell System.Drawing, cached in tools/arcade-cards/)
  if [ ! -f "$CARDS/$id.png" ]; then
    if command -v powershell.exe >/dev/null 2>&1; then
      mkdir -p "$CARDS"
      title="$(echo "$name" | tr '[:lower:]' '[:upper:]')"
      sub="$(echo "$genre" | tr '[:lower:]' '[:upper:]') - $players PLAYER$([ "$players" = 1 ] || echo S)"
      winout="$(cygpath -w "$CARDS/$id.png" 2>/dev/null || echo "$CARDS/$id.png")"
      winps="$(cygpath -w "$ROOT/tools/make-png.ps1" 2>/dev/null || echo "$ROOT/tools/make-png.ps1")"
      powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$winps" -Out "$winout" -W 640 -H 480 \
        -Title "$title" -Sub "$sub" -Accent "$accent" -Card >/dev/null
    else
      say "WARN: no title card for $id (needs Windows PowerShell once; cards are cached in tools/arcade-cards/)"
    fi
  fi
  [ -f "$CARDS/$id.png" ] && cp "$CARDS/$id.png" "$PACK/images/$id.png"
  say "$name  <- games/$slug  (port $port${shimarg:+, $shim})"
done

# ---- gamelist.xml ----
xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
{
  echo '<?xml version="1.0"?>'
  echo '<!-- OUTPOST BOYZ free arcade - generated by tools/build-arcade-pack.sh from outpostboyz.com games/.'
  echo '     Not included: RUN THE BOARD (voice trivia - needs a microphone or keyboard to answer) and'
  echo '     LOST ANGELES (separate paid game - its files are not part of this free pack). -->'
  echo '<gameList>'
  for row in "${GAMES[@]}"; do
    IFS='|' read -r id name slug page port shim genre players accent desc <<<"$row"
    echo '  <game>'
    echo "    <path>./$name.sh</path>"
    echo "    <name>$(printf '%s' "$name" | xml)</name>"
    echo "    <desc>$(printf '%s' "$desc" | xml)</desc>"
    [ -f "$PACK/images/$id.png" ] && echo "    <image>./images/$id.png</image>"
    echo '    <developer>Outpost Boyz</developer>'
    echo '    <publisher>Outpost Boyz</publisher>'
    echo "    <genre>$genre</genre>"
    echo "    <players>$players</players>"
    echo '  </game>'
  done
  echo '</gameList>'
} > "$PACK/gamelist.xml"

cat > "$STAGE/README.txt" <<EOF
OUTPOST BOYZ ARCADE - Batocera pack   (https://outpostboyz.com/download/)

1. Copy the "outpostboyz" folder to /userdata/roms/
2. Copy es_systems_outpostboyz.cfg to /userdata/system/configs/emulationstation/
3. Over SSH (root):
     chmod +x /userdata/roms/outpostboyz/*.sh /userdata/roms/outpostboyz/_kiosk/*.bash
4. Restart EmulationStation. "Outpost Boyz" appears as a new system.

Controls: arcade sticks (I-PAC) and regular gamepads both work - each game's
<Game>.sh.keys file maps the pad to the keys the game expects. START = Enter.
Exit a game: HOTKEY/COIN + START, or F10 on a keyboard.
Games run fully offline from 127.0.0.1 in a fullscreen WebKitGTK kiosk.
EOF

# ---- zip (python: sets unix exec bits so launchers survive a Windows build) ----
"$PY" - "$STAGE" "$ZIP" <<'PYEOF'
import os, sys, zipfile, time
stage, out = sys.argv[1], sys.argv[2]
EXEC = ('.sh', '.bash', '.py')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, dirs, files in os.walk(stage):
        dirs.sort()
        for d in dirs:
            p = os.path.join(base, d); arc = os.path.relpath(p, stage).replace(os.sep, '/') + '/'
            zi = zipfile.ZipInfo(arc, time.localtime()[:6]); zi.external_attr = (0o40755 << 16) | 0x10
            z.writestr(zi, b'')
        for f in sorted(files):
            p = os.path.join(base, f); arc = os.path.relpath(p, stage).replace(os.sep, '/')
            zi = zipfile.ZipInfo.from_file(p, arc); zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = ((0o100755 if f.endswith(EXEC) else 0o100644) << 16)
            with open(p, 'rb') as fh: z.writestr(zi, fh.read())
PYEOF

# ---- verify: launchers must be LF-only ----
bad=0
for f in "$PACK"/*.sh "$PACK"/_kiosk/*.bash "$PACK"/_kiosk/*.py; do
  if grep -q $'\r' "$f"; then echo "CRLF in $f" >&2; bad=1; fi
done
[ "$bad" = 0 ] || die "CRLF line endings found"

echo "Wrote $ZIP ($(du -h "$ZIP" | cut -f1))"
