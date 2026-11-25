#!/usr/bin/env bash
#   bash make-package.sh <frontend-dist-new> <new-assets-list> <out-dir>
set -euo pipefail
REL=20261125-r4; NAME="noamany-daily-update-$REL"; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$1"; LIST="$2"; OUT="$3"; P="$OUT/$NAME"
rm -rf "${P:?}" "${OUT:?}/$NAME.zip"; mkdir -p "$P/expected" "$P/payload/public"
cp "$HERE/install.sh" "$P/"
cp "$LIST" "$P/expected/assets.txt"
# 25-r3's system.html (payload of noamany-daily-update-20261125-r3, verified live 25 Nov).
echo d8712c2a876ebdd9c40309ac393b7b5d17b6531358cfc43fbc2a78d93cb03929 > "$P/expected/system.html.sha256"
cp "$FE/index.html" "$P/payload/public/system.html"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE/$f" "$P/payload/public/$f"; done < "$LIST"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || [ -n "$(grep -lF "$(basename "$a")" "$OUT/../srv-r3-assetlist.txt" 2>/dev/null)" ] || true
done
grep -rq "openReveal\|owner" "$P/payload/public/assets" || true
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME"); shasum -a 256 "$OUT/$NAME.zip"
