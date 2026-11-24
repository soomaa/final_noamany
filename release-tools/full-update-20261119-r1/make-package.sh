#!/usr/bin/env bash
# Assembles noamany-full-update-20261119-r1.zip.
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <frontend-dist-new> \
#        <server-assets.txt> <prisma-client-dir> <schema.patched.prisma> <out-dir>
# backend-dist-base  `tsc -p backend/tsconfig.build.json` of d58bb6a (18-r1, verified installed on the
#                    server 18 Nov) with modules/uploads copied in. Every changed file was compared
#                    with the server: only main.js, app.module.js and 8 hand-edited files differ, and
#                    none of those 8 is in this release.
# backend-dist-new   the same command on the release tree.
# frontend-dist-new  `vite build` of the release tree.
# server-assets.txt  `ls public/assets` from the server (assets already there are not shipped).
# prisma-client-dir  Client generated (prisma 5.22.0) from schema.patched.prisma = the server's own
#                    prisma/schema.prisma + the 17 models / 18 fields the new code needs, with the
#                    production compatibility line (last 2 lines of the live index.js) appended.
set -euo pipefail
REL=20261119-r1
NAME="noamany-full-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; FE_NEW="$3"; SERVER_ASSETS="$4"; CLIENT="$5"; SCHEMA="$6"; OUT="$7"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }

P="$OUT/$NAME"
rm -rf "$P" "$OUT/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public" "$P/sql"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
cp "$HERE"/sql/0*.sql "$P/sql/"

# Backend: every compiled file whose content differs from 18-r1, plus new files.
: > "$P/expected/backend-baseline.txt"
: > "$P/expected/backend-new.txt"
(cd "$BE_NEW" && find . -name '*.js' ! -name '*.spec.js' | sed 's#^\./##' | sort) | while read -r f; do
  case "$f" in modules/uploads/*|main.js|scripts/*) continue ;; esac
  if [ -f "$BE_BASE/$f" ]; then
    base=$(norm "$BE_BASE/$f")
    [ "$base" = "$(norm "$BE_NEW/$f")" ] && continue
    [ "$f" = app.module.js ] || echo "$f $base" >> "$P/expected/backend-baseline.txt"
  else
    echo "$f" >> "$P/expected/backend-new.txt"
  fi
  mkdir -p "$P/payload/dist/$(dirname "$f")"
  cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
[ "$(norm "$BE_BASE/main.js")" = "$(norm "$BE_NEW/main.js")" ] || { echo "main.js changed — the server's main.js (enum aliases) must stay"; exit 1; }
[ -f "$P/payload/dist/app.module.js" ] || { echo "app.module.js unchanged? (5 new modules expected)"; exit 1; }
for f in app.controller.js common/filters/all-exceptions.filter.js common/guards/permissions.guard.js \
         modules/club-members/club-leads.service.js modules/finance/finance-reports.controller.js \
         modules/rbac/admin/audit.service.js modules/uploads/uploads.controller.js modules/uploads/uploads.service.js; do
  [ ! -e "$P/payload/dist/$f" ] || { echo "$f is hand-edited on the server and must not ship"; exit 1; }
done
grep -q ClubSalesModule "$P/payload/dist/app.module.js"
[ -f "$P/payload/dist/modules/club-subscriptions/club-whatsapp-templates.controller.js" ]
[ ! -e "$P/payload/dist/scripts/cleanup-cafe-warehouses.js" ] || { echo "the café cleanup must not ship (production stores are in use)"; exit 1; }

# Prisma Client + the schema it was generated from.
cp -R "$CLIENT" "$P/payload/prisma-client"
rm -f "$P/payload/prisma-client"/libquery_engine-darwin-*.node
[ -f "$P/payload/prisma-client/libquery_engine-rhel-openssl-1.1.x.so.node" ] || { echo "no rhel-openssl-1.1.x engine"; exit 1; }
tail -1 "$P/payload/prisma-client/index.js" | grep -q '^Object.assign(exports, {"QuickSaleStatus"' || { echo "compatibility line missing"; exit 1; }
node -e 'process.stdout.write(String(require(process.argv[1]).Prisma.dmmf.datamodel.models.length))' "$P/payload/prisma-client" > "$P/expected/client-models.txt"
cp "$SCHEMA" "$P/payload/schema.prisma"

# Production fingerprints the installer requires before it changes anything.
echo 63f965a823d6595447aed5d8d4a8a563ab6d68dd9cbda6e7250cb3afcb81ef54 > "$P/expected/schema.sha256"
echo d40a9154396a7de17486556aa76dc6265651b6cbd6c50acb3f26d5f0b8d61a8c > "$P/expected/client-index.sha256"
echo a6460f1db889f7eb4d0a6eccadffa343357ee4f1db1a8770e846e54081fe8da8 > "$P/expected/system.html.sha256"
echo 0683a9f04e510afbd8a89c5c2532fd43220b3db084d1dd0de7c5281f68b8c4e3 > "$P/expected/app.module.sha256"

# Management UI: new system.html + every asset the server does not have yet.
cp "$FE_NEW/index.html" "$P/payload/public/system.html"
(cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do
  grep -qxF "$(basename "$f")" "$SERVER_ASSETS" && continue
  echo "$f"
done > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SERVER_ASSETS" || { echo "missing $a"; exit 1; }
done
grep -rq "اشتراكات على وشك الانتهاء" "$P/payload/public/assets"
grep -rq "حفظ وإرسال واتساب" "$P/payload/public/assets"

(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') changed + $(wc -l < "$P/expected/backend-new.txt" | tr -d ' ') new backend files + app.module.js, Client $(cat "$P/expected/client-models.txt") models, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets, $(ls "$P/sql" | wc -l | tr -d ' ') SQL files"
