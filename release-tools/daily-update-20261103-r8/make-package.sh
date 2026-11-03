#!/usr/bin/env bash
# Assembles noamany-daily-update-20261103-r8.zip.
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <out-dir>
# Inputs, built beforehand with the same toolchain (`npm ci` + `prisma generate` in the build tree):
#   backend-dist-base  `tsc -p backend/tsconfig.build.json --outDir …` of production 03-r7
#                      (97f4aa2 + 0d21edd e64ccd4 0ad6093 2a2dd1c c2ef717 e006ed1 4512791 0b880d4 906084f),
#                      with the git-ignored modules/uploads copied in
#   backend-dist-new   the same command with 3fb75e9 (employee-app notifications) on top
# This release changes no management UI: no frontend build is needed and public/system.html stays
# 03-r7's (the installer only checks it). modules/uploads is excluded (git-ignored locally).
set -euo pipefail
REL=20261103-r8
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; OUT="$3"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }

P="$OUT/$NAME"
rm -rf "$P" "$OUT/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"

: > "$P/expected/backend-baseline.txt"
: > "$P/expected/backend-new.txt"
(cd "$BE_NEW" && find . -name '*.js' ! -name '*.spec.js' | sed 's#^\./##' | sort) | while read -r f; do
  case "$f" in modules/uploads/*|main.js|app.module.js) continue ;; esac
  if [ -f "$BE_BASE/$f" ]; then
    base=$(norm "$BE_BASE/$f")
    [ "$base" = "$(norm "$BE_NEW/$f")" ] && continue
    echo "$f $base" >> "$P/expected/backend-baseline.txt"
  else
    echo "$f" >> "$P/expected/backend-new.txt"
  fi
  mkdir -p "$P/payload/dist/$(dirname "$f")"
  cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
# main.js / app.module.js must not change in a daily update.
for f in main.js app.module.js; do
  [ "$(norm "$BE_BASE/$f")" = "$(norm "$BE_NEW/$f")" ] || { echo "$f changed — not a daily update"; exit 1; }
done
# This release changes exactly these three backend files.
[ "$(cut -d' ' -f1 "$P/expected/backend-baseline.txt" | sort | tr '\n' ' ')" = "common/utils/legacy-notification.util.js modules/mobile/mobile.service.js modules/push/push.service.js " ] && [ ! -s "$P/expected/backend-new.txt" ] \
  || { echo "unexpected backend changes:"; cat "$P/expected/backend-baseline.txt" "$P/expected/backend-new.txt"; exit 1; }
grep -q LEGACY_NOTIFICATION_TITLES "$P/payload/dist/modules/mobile/mobile.service.js"
grep -q fcmAccessToken "$P/payload/dist/modules/push/push.service.js"

echo 63f965a823d6595447aed5d8d4a8a563ab6d68dd9cbda6e7250cb3afcb81ef54 > "$P/expected/schema.sha256"
echo 41df1f0faff1f318c8acae07689f7f3473b41e718ca400acc40eb96fd6a4fbe1 > "$P/expected/system.html.sha256"

# sha256sum on the server reads this list.
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') changed + $(wc -l < "$P/expected/backend-new.txt" | tr -d ' ') new backend files"
