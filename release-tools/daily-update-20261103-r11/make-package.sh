#!/usr/bin/env bash
# Assembles noamany-daily-update-20261103-r11.zip.
#   bash make-package.sh <backend-dist-base> <backend-dist-new> <frontend-dist-base> <frontend-dist-new> <out-dir>
# Inputs, built beforehand with the same toolchain:
#   backend-dist-base  `tsc -p backend/tsconfig.build.json --outDir …` of ca5218a (= production 03-r10),
#                      with the git-ignored modules/uploads copied in
#   backend-dist-new   the same command on 695cdda (subscription plan list policy)
#   frontend-dist-base `vite build` of ca5218a after `npm ci`; its index.html equals production
#                      public/system.html (61a7de15…)
#   frontend-dist-new  the same build (this release changes no management UI)
# The changed backend list is every compiled .js whose normalized content differs between the two
# builds; modules/uploads is excluded (git-ignored locally, untouched by this release).
set -euo pipefail
REL=20261103-r11
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
# This release changes exactly one backend file.
[ "$(cut -d' ' -f1 "$P/expected/backend-baseline.txt" | sort | tr '\n' ' ')" = "common/guards/sidebar-api-permissions.js " ] \
  && [ ! -s "$P/expected/backend-new.txt" ] \
  || { echo "unexpected backend changes:"; cat "$P/expected/backend-baseline.txt" "$P/expected/backend-new.txt"; exit 1; }
grep -q "ClubSubscriptionTypesController.listAll" "$P/payload/dist/common/guards/sidebar-api-permissions.js"
grep -rq "تقارير حضور" "$FE_NEW/assets"

echo 63f965a823d6595447aed5d8d4a8a563ab6d68dd9cbda6e7250cb3afcb81ef54 > "$P/expected/schema.sha256"
echo 61a7de15035a3f8e0a5bcaa1ab17f8673a7339bc983ba328e0a8bd5798a77bfe > "$P/expected/system.html.sha256"
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
