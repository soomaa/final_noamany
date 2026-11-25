#!/usr/bin/env bash
# Assembles noamany-daily-update-20261125-r3.zip (on top of 25-r2, the last verified install).
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <frontend-dist-new> <server-dir> <prisma-client-dir> <schema.patched.prisma> <out-dir>
# backend-dist-base  `tsc -p backend/tsconfig.build.json` of 25-r2 (claude/hr-fixes-20261124 @ 748379d, src/modules/uploads copied in).
#                    Matches the server byte-for-byte except the server's hand-edited files (never shipped).
# backend-dist-new   the same on the release tree (claude/hr-fixes-20261124 @ merge of claude/meeting-followups-20261124).
# frontend-dist-new  `vite build` of the release tree.
# server-dir         read-only fingerprints from the server: dist-hashes.txt ("<norm sha> <path>"), assets.txt (`ls public/assets`).
# prisma-client-dir  Client generated (prisma 5.22.0, custom output like the live one) from schema.patched.prisma
#                    = the server's prisma/schema.prisma (4c68c02d…) + 13 models and the new columns of 7 models only,
#                    with the production compatibility lines (last 2 lines of the live index.js) appended.
#                    Compared with the live Client: every live export, model and field identical; only additions.
set -euo pipefail
REL=20261125-r3
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; FE_NEW="$3"; SRV="$4"; CLIENT="$5"; SCHEMA="$6"; OUT="$7"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }
HAND_EDITED="app.controller.js common/filters/all-exceptions.filter.js common/guards/permissions.guard.js \
  modules/finance/finance-reports.controller.js modules/rbac/admin/audit.service.js \
  modules/uploads/uploads.controller.js modules/uploads/uploads.service.js modules/uploads/uploads.module.js"

P="$OUT/$NAME"
rm -rf "${P:?}" "${OUT:?}/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public" "$P/sql"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
cp "$HERE"/sql/0*.sql "$P/sql/"

: > "$P/expected/backend-baseline.txt"
: > "$P/expected/backend-new.txt"
(cd "$BE_NEW" && find . \( -name '*.js' -o -name '*.json' \) ! -name '*.spec.js' ! -name '*.d.ts' ! -name '*.map' | sed 's#^\./##' | sort) | while read -r f; do
  case "$f" in modules/uploads/*|main.js|scripts/*|tsconfig*.json) continue ;; esac
  new=$(norm "$BE_NEW/$f")
  srv=$(awk -v f="$f" '$2==f{print $1}' "$SRV/dist-hashes.txt")
  if [ -f "$BE_BASE/$f" ]; then
    [ "$(norm "$BE_BASE/$f")" = "$new" ] && continue
    case "$f" in *.json) [ "$(norm "$BE_BASE/$f")" = "$new" ] && continue ;; esac
    if [ "${f##*.}" = js ]; then
      [ "$srv" = "$(norm "$BE_BASE/$f")" ] || { echo "$f: server copy differs from the 25-r2 base — refusing"; exit 1; }
    fi
    echo "$f $(norm "$BE_BASE/$f")" >> "$P/expected/backend-baseline.txt"
  else
    [ -z "$srv" ] || { echo "$f: new file already on the server — refusing"; exit 1; }
    echo "$f" >> "$P/expected/backend-new.txt"
  fi
  mkdir -p "$P/payload/dist/$(dirname "$f")"
  cp "$BE_NEW/$f" "$P/payload/dist/$f"
  [ ! -f "$BE_NEW/$f.map" ] || cp "$BE_NEW/$f.map" "$P/payload/dist/$f.map"
done
[ "$(norm "$BE_BASE/main.js")" = "$(norm "$BE_NEW/main.js")" ] || { echo "main.js changed — the server's main.js must stay"; exit 1; }
for f in $HAND_EDITED; do
  [ ! -e "$P/payload/dist/$f" ] || { echo "$f is hand-edited on the server and must not ship"; exit 1; }
done
grep -q TrainingJourneyModule "$P/payload/dist/app.module.js"
grep -q ClubMemberGroupsService "$P/payload/dist/modules/club-members/club-members.module.js"
grep -q ClubInbodySettingsController "$P/payload/dist/modules/club-fitness/club-fitness.module.js"
[ -f "$P/payload/dist/modules/training-journey/standard-exercise-profiles.json" ]
grep -q commitmentLookup "$P/payload/dist/modules/whatsapp-campaigns/wa-campaigns.service.js"

cp -R "$CLIENT" "$P/payload/prisma-client"
rm -f "$P/payload/prisma-client"/libquery_engine-darwin-*.node
[ -f "$P/payload/prisma-client/libquery_engine-rhel-openssl-1.1.x.so.node" ] || { echo "no rhel-openssl-1.1.x engine"; exit 1; }
[ -f "$P/payload/prisma-client/runtime/library.js" ] || { echo "Client runtime missing (custom output expected)"; exit 1; }
tail -1 "$P/payload/prisma-client/index.js" | grep -q '^Object.assign(exports, {"QuickSaleStatus"' || { echo "compatibility line missing"; exit 1; }
node -e 'process.stdout.write(String(require(process.argv[1]).Prisma.dmmf.datamodel.models.length))' "$P/payload/prisma-client" > "$P/expected/client-models.txt"
[ "$(cat "$P/expected/client-models.txt")" = 517 ] || { echo "Client should have 517 models (504 + 13)"; exit 1; }
cp "$SCHEMA" "$P/payload/schema.prisma"

# Production fingerprints (read from the server 25 Nov ~02:35, 25-r2 verified installed).
echo 4c68c02dbea49ee77b0aebf25ecf91f7af85d8fc30f3353176568949c7287c18 > "$P/expected/schema.sha256"
echo 8304f9e6eda09e438c2b0344a4d5071d41346d441110e318eb9f756c6c382083 > "$P/expected/client-index.sha256"
echo eaf7fbc3a2c907df2cabbf8fd43b8f80a66c07e113daa51786bd4141f6aa05b1 > "$P/expected/system.html.sha256"

cp "$FE_NEW/index.html" "$P/payload/public/system.html"
{
  (cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do
    grep -qxF "$(basename "$f")" "$SRV/assets.txt" && continue
    echo "$f"
  done
  # Training space body maps (new folders next to the site files).
  (cd "$FE_NEW" && find anatomy body3d -type f | sort)
} > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SRV/assets.txt" || { echo "missing $a"; exit 1; }
done
grep -rq "مساحة التدريب" "$P/payload/public/assets"
grep -rq "مجموعات الأعضاء" "$P/payload/public/assets"
grep -rq "زيارات الفترة" "$P/payload/public/assets"
grep -rq "عدم الالتزام بالحضور" "$P/payload/dist/modules/whatsapp-campaigns/wa-default-templates.js"

(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') changed + $(wc -l < "$P/expected/backend-new.txt" | tr -d ' ') new backend files, Client $(cat "$P/expected/client-models.txt") models, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new public files, $(ls "$P/sql" | wc -l | tr -d ' ') SQL files"
shasum -a 256 "$OUT/$NAME.zip"
