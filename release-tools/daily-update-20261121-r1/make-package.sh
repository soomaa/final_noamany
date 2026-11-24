#!/usr/bin/env bash
# Assembles noamany-daily-update-20261121-r1.zip (management UI only).
#   bash make-package.sh <frontend-dist-new> <server-assets.txt> <out-dir>
# server-assets.txt = `ls public/assets` on the live server.
set -euo pipefail
REL=20261121-r1
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE_NEW="$1"; SERVER_ASSETS="$2"; OUT="$3"
# 20-r1 left exactly its payload/public/system.html on the server.
BASE_HTML=1b8c3abfcecfc417d4e9f767dbcd88431f037e48ceaf8dbf02f4d43467787cf9
P="$OUT/$NAME"; rm -rf "$P" "$OUT/$NAME.zip"; mkdir -p "$P/expected" "$P/payload/public"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/README-AR.txt" "$P/"
echo "$BASE_HTML" > "$P/expected/system.html.sha256"
cp "$FE_NEW/index.html" "$P/payload/public/system.html"
(cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do grep -qxF "$(basename "$f")" "$SERVER_ASSETS" || echo "$f"; done > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SERVER_ASSETS" || { echo "missing $a"; exit 1; }
done
CHUNK=$(cd "$P/payload/public/assets" && grep -l "lg:sticky lg:top-0 lg:z-10" ./*.js | head -1 | sed 's#^\./##')
[ -n "$CHUNK" ] || { echo "reception photo fix not in the build"; exit 1; }
echo "$CHUNK" > "$P/expected/reception-chunk.txt"
grep -rq "محضر جرد لوكر جديد" "$P/payload/public/assets" || grep -rq "محضر جرد لوكر جديد" "$FE_NEW/assets" || { echo "locker inventory hint not in the build"; exit 1; }
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: UI only, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets (reception chunk $CHUNK)"
