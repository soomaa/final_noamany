#!/usr/bin/env bash
# Assembles noamany-daily-update-20261122-r2.zip.
#   bash make-package.sh <backend-dist-new> <server-dist.hashes> <frontend-dist-new> <server-assets.txt> <out-dir>
# server-dist.hashes: "<normalised sha> <dist-relative path>" per changed file plus "HTML <sha>",
# read from the live server (what is really installed).
set -euo pipefail
REL=20261122-r2
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_NEW="$1"; SERVER_HASHES="$2"; FE_NEW="$3"; SERVER_ASSETS="$4"; OUT="$5"
FILES="${FILES:-modules/club-subscriptions/club-subscriptions.service.js modules/club-subscriptions/club-subscriptions.controller.js modules/club-subscriptions/club-subscription-status.cron.js}"
NEW_FILES="modules/club-subscriptions/freeze-chain.js"
P="$OUT/$NAME"; rm -rf "$P" "$OUT/$NAME.zip"; mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
: > "$P/expected/backend-baseline.txt"
for f in $FILES; do
  base=$(awk -v f="$f" '$2==f{print $1}' "$SERVER_HASHES"); [ -n "$base" ] || { echo "$f not on the server"; exit 1; }
  echo "$f $base" >> "$P/expected/backend-baseline.txt"
  mkdir -p "$P/payload/dist/$(dirname "$f")"; cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
for f in $NEW_FILES; do
  awk -v f="$f" '$2==f{found=1} END{exit found}' "$SERVER_HASHES" || { echo "$f already on the server"; exit 1; }
  echo "$f ABSENT" >> "$P/expected/backend-baseline.txt"
  mkdir -p "$P/payload/dist/$(dirname "$f")"; cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
grep -q startDueFreezes "$P/payload/dist/modules/club-subscriptions/club-subscriptions.service.js"
grep -q editFreezeDays "$P/payload/dist/modules/club-subscriptions/club-subscriptions.controller.js"
awk '$1=="HTML"{print $2}' "$SERVER_HASHES" > "$P/expected/system.html.sha256"
echo cfada630888db83c26d86302c1a2f0038bdeca4f3fd3164c08fa2c2f3bbd764e > "$P/expected/schema.sha256"
echo 11df00a7d995d312366200d5369d72c5154dc9480c5bf699889fdc4409268192 > "$P/expected/client-index.sha256"
cp "$FE_NEW/index.html" "$P/payload/public/system.html"
(cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do grep -qxF "$(basename "$f")" "$SERVER_ASSETS" || echo "$f"; done > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SERVER_ASSETS" || { echo "missing $a"; exit 1; }
done
grep -rq "إظهار الاشتراكات المنتهية" "$P/payload/public/assets" || { echo "expired switch not in the build"; exit 1; }
grep -rq "تعديل الأيام" "$P/payload/public/assets" || { echo "freeze edit not in the build"; exit 1; }
grep -rq "متابعة الحضور" "$P/payload/public/assets" || { echo "resume attendance not in the build"; exit 1; }
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') backend files, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets"
