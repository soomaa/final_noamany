#!/usr/bin/env bash
# Assembles noamany-daily-update-20261125-r2.zip (on top of 24-r7, the last verified install).
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <frontend-dist-new> <server-dir> <out-dir>
# backend-dist-base  `tsc -p backend/tsconfig.build.json` of the 24-r7 tree (commit 82ba455, src/modules/uploads copied in).
# backend-dist-new   the same on the release tree (claude/hr-fixes-20261124 = meeting follow-ups incl. the unshipped 25-r1 + HR).
# frontend-dist-new  `vite build` of the release tree.
# server-dir         read-only fingerprints from the server: dist-hashes.txt ("<norm sha> <path>"), assets.txt (`ls public/assets`).
# No Prisma Client / schema change: the release code type-checks against a Client generated from the server's own
# prisma/schema.prisma with exactly the same errors as 24-r7 (every new table is read/written with raw SQL).
set -euo pipefail
REL=20261125-r2
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; FE_NEW="$3"; SRV="$4"; OUT="$5"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }
# Files that on the server are newer than the 24-r7 base: the fingerprint agent was installed by hand on 24 Nov
# (attendance.module.js registers it). The release versions are those server files + this release's changes
# (diff reviewed); the installer checks the server still has exactly the copies that were reviewed.
SERVER_AHEAD="modules/attendance/attendance.module.js modules/attendance/attendance-device-agent.service.js"

P="$OUT/$NAME"
rm -rf "$P" "$OUT/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public" "$P/sql"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
cp "$HERE"/sql/0*.sql "$P/sql/"

: > "$P/expected/backend-baseline.txt"
: > "$P/expected/backend-new.txt"
(cd "$BE_NEW" && find . -name '*.js' ! -name '*.spec.js' | sed 's#^\./##' | sort) | while read -r f; do
  case "$f" in modules/uploads/*|scripts/*) continue ;; esac
  new=$(norm "$BE_NEW/$f")
  srv=$(awk -v f="$f" '$2==f{print $1}' "$SRV/dist-hashes.txt")
  [ -n "$srv" ] && [ "$srv" = "$new" ] && continue
  if [ -n "$srv" ]; then
    if [ -f "$BE_BASE/$f" ] && [ "$(norm "$BE_BASE/$f")" = "$new" ]; then continue; fi
    case " $SERVER_AHEAD " in
      *" $f "*) ;;
      *) [ -f "$BE_BASE/$f" ] && [ "$srv" = "$(norm "$BE_BASE/$f")" ] || { echo "$f: server copy differs from the 24-r7 base — refusing"; exit 1; } ;;
    esac
    echo "$f $srv" >> "$P/expected/backend-baseline.txt"
  else
    [ ! -f "$BE_BASE/$f" ] || { echo "$f: in the 24-r7 base but not on the server — refusing"; exit 1; }
    echo "$f" >> "$P/expected/backend-new.txt"
  fi
  mkdir -p "$P/payload/dist/$(dirname "$f")"
  cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
[ ! -e "$P/payload/dist/main.js" ] || { echo "main.js changed — the server's main.js must stay"; exit 1; }
for f in app.controller.js common/filters/all-exceptions.filter.js common/guards/permissions.guard.js \
         modules/finance/finance-reports.controller.js modules/rbac/admin/audit.service.js \
         modules/uploads/uploads.controller.js modules/uploads/uploads.service.js; do
  [ ! -e "$P/payload/dist/$f" ] || { echo "$f is hand-edited on the server and must not ship"; exit 1; }
done
grep -q AttendanceExceptionsModule "$P/payload/dist/app.module.js"
grep -q HrPayrollSettingsModule "$P/payload/dist/app.module.js"
grep -q OvertimeRequestsModule "$P/payload/dist/app.module.js"
grep -q AttendanceDeviceAgentController "$P/payload/dist/modules/attendance/attendance.module.js"
grep -q AttendanceOfflineReviewController "$P/payload/dist/modules/attendance/attendance.module.js"
grep -q ClubSubscriptionPurgeService "$P/payload/dist/modules/club-subscriptions/club-subscriptions.module.js"

# Production fingerprints (read from the server 25 Nov, 24-r7 verified installed).
echo 4c68c02dbea49ee77b0aebf25ecf91f7af85d8fc30f3353176568949c7287c18 > "$P/expected/schema.sha256"
echo 8304f9e6eda09e438c2b0344a4d5071d41346d441110e318eb9f756c6c382083 > "$P/expected/client-index.sha256"
echo 78606b70aaafb25923ca3b37e52f685b2f50c343d16ad64555ab837359b210e2 > "$P/expected/system.html.sha256"

cp "$FE_NEW/index.html" "$P/payload/public/system.html"
(cd "$FE_NEW" && find assets -type f | sort) | while read -r f; do
  grep -qxF "$(basename "$f")" "$SRV/assets.txt" && continue
  echo "$f"
done > "$P/expected/assets.txt"
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || grep -qxF "$(basename "$a")" "$SRV/assets.txt" || { echo "missing $a"; exit 1; }
done
grep -rq "الحالات اليومية" "$P/payload/public/assets"
grep -rq "إعدادات الحضور والمرتبات" "$P/payload/public/assets"
grep -rq "بانتظار الموافقة" "$P/payload/public/assets"

(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') changed + $(wc -l < "$P/expected/backend-new.txt" | tr -d ' ') new backend files, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets, $(ls "$P/sql" | wc -l | tr -d ' ') SQL files"
shasum -a 256 "$OUT/$NAME.zip"
