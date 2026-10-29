#!/usr/bin/env bash
# Assembles noamany-daily-update-20261027-r1.zip.
#   bash make-package.sh <backend-dist-new> <frontend-dist-base> <frontend-dist-new> <out-dir>
# Inputs, built beforehand:
#   backend-dist-new   `tsc -p backend/tsconfig.build.json --outDir …` from the fixed tree
#                      (backend/node_modules compiles the 5 unchanged-baseline files byte-identical
#                      to production 22-r1, verified with deploy-check-20261027.sh)
#   frontend-dist-base `vite build` of GitHub main 9f40e86 after `npm ci` (lockfile); its
#                      index.html equals production public/system.html (f557ca4c…)
#   frontend-dist-new  same `npm ci` tree plus the fixed frontend files
set -euo pipefail
REL=20261027-r1
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_NEW="$1"; FE_BASE="$2"; FE_NEW="$3"; OUT="$4"

BACKEND_CHANGED="modules/auth/auth.service.js modules/auth/strategies/jwt.strategy.js modules/employees/employees.service.js modules/inventory/inventory-transactions.controller.js modules/inventory/inventory-transactions.service.js"
BACKEND_NEW="modules/auth/employee-status.util.js"

P="$OUT/$NAME"
rm -rf "$P" "$OUT/$NAME.zip"
mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"

for f in $BACKEND_CHANGED $BACKEND_NEW; do
  mkdir -p "$P/payload/dist/$(dirname "$f")"
  cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
grep -q createAndApprove "$P/payload/dist/modules/inventory/inventory-transactions.service.js"

# Baseline = production 22-r1, normalized (CRLF and sourceMappingURL ignored).
cat > "$P/expected/backend-baseline.txt" <<'EOF'
modules/auth/auth.service.js 4bd59dd0a8b7090455452c9e41dc79b924a195a80c6429f5dfadac9b29f0bdaa
modules/auth/strategies/jwt.strategy.js c6f7b006250c21a76df2daad879278371d35c670493a89ff50de7f968c1b302b
modules/employees/employees.service.js 641ecbf35a28704f907585dc271230f8a3429fba0fe33a131c91b9f6ef5fb5d8
modules/inventory/inventory-transactions.controller.js 7b1a88b2c8e7a520f9048d822e495c63a8d6bac6db042132717eccf9f3f3abc8
modules/inventory/inventory-transactions.service.js 80be80b11b8d30d64087541790aea9744e921836b0fd196d0440eb9c63b25cee
EOF
printf '%s\n' $BACKEND_NEW > "$P/expected/backend-new.txt"
echo 63f965a823d6595447aed5d8d4a8a563ab6d68dd9cbda6e7250cb3afcb81ef54 > "$P/expected/schema.sha256"
echo f557ca4c81bb0d6eb1c1a09ef05edc87d26a120976e56ac0a360eac65d692a65 > "$P/expected/system.html.sha256"
[ "$(sha256sum "$FE_BASE/index.html" | cut -d' ' -f1)" = "$(cat "$P/expected/system.html.sha256")" ] \
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

(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | xargs sha256sum > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "package: $OUT/$NAME.zip"
echo "files: $(wc -l < "$P/PACKAGE-SHA256SUMS" | tr -d ' ')  assets: $(wc -l < "$P/expected/assets.txt" | tr -d ' ')"
echo "zip sha256: $(sha256sum "$OUT/$NAME.zip" | cut -d' ' -f1)"
