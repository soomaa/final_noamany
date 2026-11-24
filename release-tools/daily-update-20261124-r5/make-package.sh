#!/usr/bin/env bash
# Assembles noamany-daily-update-20261124-r5.zip (WhatsApp templates as fields, default templates, «لم يحضر منذ مدة» on the attendance list).
#   bash make-package.sh <backend-dist-new> <frontend-dist-new> <server-baseline.txt> <out-dir>
# server-baseline.txt = the pasted output of the read-only server command (README-AR.txt):
#   "<normalised sha> <dist-relative path>" or "ABSENT <path>" per backend file, plus "HTML <sha>",
#   "SCHEMA <sha>" and "CLIENT <sha>" — what is really installed.
set -euo pipefail
REL=20261124-r5
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_NEW="$1"; FE_NEW="$2"; BASE="$3"; OUT="$4"
W=modules/whatsapp-campaigns
CHANGED="$W/wa-campaigns.service.js $W/wa-campaigns.controller.js $W/wa-campaigns.module.js $W/wa-campaigns.utils.js $W/dto/wa-campaigns.dto.js $W/wa-birthdays.settings.js $W/wa-template-options.js"
ADDED="$W/wa-default-templates.js"
# The management HTML this build sits on: 24-r4.
KNOWN_HTML="c8218787e8397dbdfeda69968537c97a14a5b8d9d237c5a3eaf6966d0d100390"
P="$OUT/$NAME"; rm -rf "$P" "$OUT/$NAME.zip"; mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
: > "$P/expected/backend-baseline.txt"
for f in $CHANGED; do
  base=$(awk -v f="$f" '$2==f{print $1}' "$BASE"); [ -n "$base" ] && [ "$base" != ABSENT ] || { echo "$f not on the server"; exit 1; }
  echo "$f $base" >> "$P/expected/backend-baseline.txt"
done
for f in $ADDED; do
  [ "$(awk -v f="$f" '$2==f{print $1}' "$BASE")" = ABSENT ] || { echo "$f already on the server"; exit 1; }
  echo "$f ABSENT" >> "$P/expected/backend-baseline.txt"
done
for f in $CHANGED $ADDED; do mkdir -p "$P/payload/dist/$(dirname "$f")"; cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"; done
grep -q WaRemindersController "$P/payload/dist/$W/wa-campaigns.module.js"
html=$(awk '$1=="HTML"{print $2}' "$BASE")
echo "$KNOWN_HTML" | tr ' ' '\n' | grep -qx "$html" || { echo "server system.html $html is not 24-r4 — find out what is installed first"; exit 1; }
echo "$html" > "$P/expected/system.html.sha256"
awk '$1=="SCHEMA"{print $2}' "$BASE" > "$P/expected/schema.sha256"
awk '$1=="CLIENT"{print $2}' "$BASE" > "$P/expected/client-index.sha256"
[ -s "$P/expected/schema.sha256" ] && [ -s "$P/expected/client-index.sha256" ]
cp "$FE_NEW/index.html" "$P/payload/public/system.html"
# Every asset of the build ships; the installer adds only those the server does not have yet.
(cd "$FE_NEW" && find assets -type f | sort) > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do [ -f "$P/payload/public${a}" ] || { echo "missing $a"; exit 1; }; done
CHUNK=$(cd "$P/payload/public/assets" && grep -l "صيغة تانية للسطر ده" ./*.js | head -1 | sed 's#^\./##')
[ -n "$CHUNK" ] || { echo "birthday card not in the build"; exit 1; }
echo "$CHUNK" > "$P/expected/whatsapp-chunk.txt"
(cd "$P/payload/public/assets" && grep -l "wa-reminders/absence" ./*.js >/dev/null) || { echo "attendance absence column not in the build"; exit 1; }
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: 7 changed + 1 new backend files, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') assets (WhatsApp chunk $CHUNK)"
shasum -a 256 "$OUT/$NAME.zip"
