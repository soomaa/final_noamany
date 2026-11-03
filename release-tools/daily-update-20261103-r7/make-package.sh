#!/usr/bin/env bash
# Assembles noamany-daily-update-20261103-r7.zip.
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <frontend-dist-base> <frontend-dist-new> <out-dir>
# Inputs, built beforehand with the same toolchain:
#   backend-dist-base  `tsc -p backend/tsconfig.build.json --outDir …` of production 03-r6,
#                      with the git-ignored modules/uploads copied in
#   backend-dist-new   the same build (this release changes no backend file)
#   frontend-dist-base `vite build` of the base tree after `npm ci`; its index.html equals production
#                      public/system.html (03-r6)
#   frontend-dist-new  same `npm ci` node_modules, built on base + 906084f (no first-use guide, full-width add subscription)
# The changed backend list is every compiled .js whose normalized content differs between the two
# builds; modules/uploads is excluded (git-ignored locally, untouched by this release).
set -euo pipefail
REL=20261103-r7
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_BASE="$1"; BE_NEW="$2"; FE_BASE="$3"; FE_NEW="$4"; OUT="$5"
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | shasum -a 256 | cut -d' ' -f1; }

P="$OUT/$NAME"
rm -rf "$P" "$OUT/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public"
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
# This release changes no backend file.
[ ! -s "$P/expected/backend-baseline.txt" ] && [ ! -s "$P/expected/backend-new.txt" ] \
  || { echo "unexpected backend changes:"; cat "$P/expected/backend-baseline.txt" "$P/expected/backend-new.txt"; exit 1; }
# The guide is in production (base) and gone from the new build.
grep -rq "دليل الافتتاح الأول" "$FE_BASE/assets" || { echo "base build has no first-use guide — wrong base?"; exit 1; }
# (ui-map-*.js is the app-wide Arabic→English dictionary; its leftover unused entries are not the guide.)
! grep -rq --exclude='ui-map-*' "دليل الافتتاح الأول" "$FE_NEW/assets" || { echo "new build still has the first-use guide"; exit 1; }
grep -rq "one80.onboarding" "$FE_NEW/assets" && { echo "new build still has the guide storage key"; exit 1; } || true
grep -rqF '2xl\:grid-cols-4' "$FE_NEW/assets" || { echo "new build lacks 2xl:grid-cols-4"; exit 1; }

echo 63f965a823d6595447aed5d8d4a8a563ab6d68dd9cbda6e7250cb3afcb81ef54 > "$P/expected/schema.sha256"
echo 77c6a652e36af760b0c9be70f8288a3504db9b1938ba179e2561107487440a3e > "$P/expected/system.html.sha256"
[ "$(shasum -a 256 "$FE_BASE/index.html" | cut -d' ' -f1)" = "$(cat "$P/expected/system.html.sha256")" ] \
  || { echo "frontend base build does not match production"; exit 1; }

# Management UI: new system.html + every asset file the base build does not have.
cp "$FE_NEW/index.html" "$P/payload/public/system.html"
comm -13 <(cd "$FE_BASE" && find . -type f ! -name index.html | sed 's#^\./##' | sort) \
         <(cd "$FE_NEW" && find . -type f ! -name index.html | sed 's#^\./##' | sort) > "$P/expected/assets.txt"
comm -12 <(cd "$FE_BASE" && find . -type f ! -name index.html | sed 's#^\./##' | sort) \
         <(cd "$FE_NEW" && find . -type f ! -name index.html | sed 's#^\./##' | sort) | while read -r f; do
  cmp -s "$FE_BASE/$f" "$FE_NEW/$f" || { echo "same name, different content: $f"; exit 1; }
done
while read -r f; do mkdir -p "$P/payload/public/$(dirname "$f")"; cp "$FE_NEW/$f" "$P/payload/public/$f"; done < "$P/expected/assets.txt"
# Every asset the new HTML references must exist in the package or in production already.
for a in $(grep -oE '/assets/[^"]+' "$P/payload/public/system.html"); do
  [ -f "$P/payload/public${a}" ] || [ -f "$FE_BASE${a}" ] || { echo "missing $a"; exit 1; }
done

# sha256sum on the server reads this list.
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') changed + $(wc -l < "$P/expected/backend-new.txt" | tr -d ' ') new backend files, $(wc -l < "$P/expected/assets.txt" | tr -d ' ') new assets"
