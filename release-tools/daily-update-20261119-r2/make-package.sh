#!/usr/bin/env bash
# Assembles noamany-daily-update-20261119-r2.zip.
#   bash make-package.sh <backend-dist-19r1> <backend-dist-new> <frontend-dist-new> <server-assets.txt> <out-dir>
# backend-dist-19r1 = the backend build shipped in 19-r1 (verified installed). server-assets.txt = `ls public/assets`.
set -euo pipefail
REL=20261119-r2
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; FE_NEW="$3"; SERVER_ASSETS="$4"; OUT="$5"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }
P="$OUT/$NAME"; rm -rf "$P" "$OUT/$NAME.zip"; mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
: > "$P/expected/backend-baseline.txt"
(cd "$BE_NEW" && find . -name '*.js' ! -name '*.spec.js' | sed 's#^\./##' | sort) | while read -r f; do
  case "$f" in modules/uploads/*|main.js) continue ;; esac
  [ -f "$BE_BASE/$f" ] || { echo "new backend file $f — not expected in r2"; exit 1; }
  base=$(norm "$BE_BASE/$f"); [ "$base" = "$(norm "$BE_NEW/$f")" ] && continue
  echo "$f $base" >> "$P/expected/backend-baseline.txt"
  mkdir -p "$P/payload/dist/$(dirname "$f")"; cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
[ "$(cut -d' ' -f1 "$P/expected/backend-baseline.txt" | tr '\n' ' ')" = "modules/club-subscriptions/club-subscriptions.service.js " ] \
  || { echo "unexpected backend changes:"; cat "$P/expected/backend-baseline.txt"; exit 1; }
grep -q "paymentAmount, receiptNumber" "$P/payload/dist/modules/club-subscriptions/club-subscriptions.service.js"
echo 4740229cef88606b2eaef88aa2c324a5ea2c9270bf76a84b6cc4c1f07fa973e0 > "$P/expected/system.html.sha256"
echo cfada630888db83c26d86302c1a2f0038bdeca4f3fd3164c08fa2c2f3bbd764e > "$P/expected/schema.sha256"
echo 11df00a7d995d312366200d5369d72c5154dc9480c5bf699889fdc4409268192 > "$P/expected/client-index.sha256"
cp "$FE_NEW/index.html" "$P/payload/public/system.html"
(cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do grep -qxF "$(basename "$f")" "$SERVER_ASSETS" || echo "$f"; done > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SERVER_ASSETS" || { echo "missing $a"; exit 1; }
done
grep -rq "saveAndWhatsApp\|إرسال واتساب" "$P/payload/public/assets"
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') backend file, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets"
