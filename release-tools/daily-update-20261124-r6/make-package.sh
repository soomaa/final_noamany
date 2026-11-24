#!/usr/bin/env bash
# Assembles noamany-daily-update-20261124-r6.zip.
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <frontend-dist-new> <server-dir> <prisma-client-dir> <schema.patched.prisma> <out-dir>
# backend-dist-base  `tsc -p backend/tsconfig.build.json` of the 24-r5 tree (main checkout working tree, with
#                    src/modules/uploads copied in). Every file this release changes was compared with the
#                    server: all equal to the base (the server's 10 hand-edited files are not touched).
# backend-dist-new   the same command on the release tree (claude/meeting-followups-20261124).
# frontend-dist-new  `vite build` of the release tree.
# server-dir         read-only fingerprints from the server: dist-hashes.txt ("<norm sha> <path>"), assets.txt
#                    (`ls public/assets`).
# prisma-client-dir  Client generated (prisma 5.22.0, custom output like the live one) from schema.patched.prisma
#                    = the server's prisma/schema.prisma + 4 models / 2 club_leads fields, with the production
#                    compatibility lines (last 2 lines of the live index.js) appended; darwin engine removed.
set -euo pipefail
REL=20261124-r6
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; FE_NEW="$3"; SRV="$4"; CLIENT="$5"; SCHEMA="$6"; OUT="$7"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }

P="$OUT/$NAME"
rm -rf "$P" "$OUT/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public" "$P/sql"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
cp "$HERE"/sql/0*.sql "$P/sql/"

: > "$P/expected/backend-baseline.txt"
: > "$P/expected/backend-new.txt"
(cd "$BE_NEW" && find . -name '*.js' ! -name '*.spec.js' | sed 's#^\./##' | sort) | while read -r f; do
  case "$f" in modules/uploads/*|main.js|scripts/*) continue ;; esac
  srv=$(awk -v f="$f" '$2==f{print $1}' "$SRV/dist-hashes.txt")
  if [ -f "$BE_BASE/$f" ]; then
    base=$(norm "$BE_BASE/$f")
    [ "$base" = "$(norm "$BE_NEW/$f")" ] && continue
    [ "$srv" = "$base" ] || { echo "$f: server copy differs from the 24-r5 base — refusing"; exit 1; }
    echo "$f $base" >> "$P/expected/backend-baseline.txt"
  else
    [ -z "$srv" ] || { echo "$f: new file already on the server — refusing"; exit 1; }
    echo "$f" >> "$P/expected/backend-new.txt"
  fi
  mkdir -p "$P/payload/dist/$(dirname "$f")"
  cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
[ "$(norm "$BE_BASE/main.js")" = "$(norm "$BE_NEW/main.js")" ] || { echo "main.js changed — the server's main.js must stay"; exit 1; }
for f in app.controller.js common/filters/all-exceptions.filter.js common/guards/permissions.guard.js \
         modules/attendance/attendance.module.js modules/finance/finance-reports.controller.js \
         modules/rbac/admin/audit.service.js modules/uploads/uploads.controller.js modules/uploads/uploads.service.js; do
  [ ! -e "$P/payload/dist/$f" ] || { echo "$f is hand-edited on the server and must not ship"; exit 1; }
done
grep -q PeriodSummaryModule "$P/payload/dist/app.module.js"
grep -q ContactMaskingInterceptor "$P/payload/dist/app.module.js"
grep -q leadNameData "$P/payload/dist/modules/club-sales/club-leads.service.js"

cp -R "$CLIENT" "$P/payload/prisma-client"
rm -f "$P/payload/prisma-client"/libquery_engine-darwin-*.node
[ -f "$P/payload/prisma-client/libquery_engine-rhel-openssl-1.1.x.so.node" ] || { echo "no rhel-openssl-1.1.x engine"; exit 1; }
[ -f "$P/payload/prisma-client/runtime/library.js" ] || { echo "Client runtime missing (custom output expected)"; exit 1; }
tail -1 "$P/payload/prisma-client/index.js" | grep -q '^Object.assign(exports, {"QuickSaleStatus"' || { echo "compatibility line missing"; exit 1; }
node -e 'process.stdout.write(String(require(process.argv[1]).Prisma.dmmf.datamodel.models.length))' "$P/payload/prisma-client" > "$P/expected/client-models.txt"
cp "$SCHEMA" "$P/payload/schema.prisma"

# Production fingerprints (read from the server, 24 Nov, 24-r5 verified installed).
echo cfada630888db83c26d86302c1a2f0038bdeca4f3fd3164c08fa2c2f3bbd764e > "$P/expected/schema.sha256"
echo 11df00a7d995d312366200d5369d72c5154dc9480c5bf699889fdc4409268192 > "$P/expected/client-index.sha256"
echo c2d6fd9972a66680034a979369c3220d5e1f2c4e7579bc9c1f7c09fc85b0fe98 > "$P/expected/system.html.sha256"

cp "$FE_NEW/index.html" "$P/payload/public/system.html"
(cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do
  grep -qxF "$(basename "$f")" "$SRV/assets.txt" && continue
  echo "$f"
done > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SRV/assets.txt" || { echo "missing $a"; exit 1; }
done
grep -rq "يومية الاستقبال" "$P/payload/public/assets"
grep -rq "دعوة بكود موظف" "$P/payload/public/assets"
grep -rq "ملخص الفترة" "$P/payload/public/assets"

(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') changed + $(wc -l < "$P/expected/backend-new.txt" | tr -d ' ') new backend files, Client $(cat "$P/expected/client-models.txt") models, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets, $(ls "$P/sql" | wc -l | tr -d ' ') SQL files"
shasum -a 256 "$OUT/$NAME.zip"
