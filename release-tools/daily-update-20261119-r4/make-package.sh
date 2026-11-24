#!/usr/bin/env bash
# Assembles noamany-daily-update-20261119-r4.zip (one backend file, no UI change).
#   bash make-package.sh <backend-dist-new> <server-dist.hashes> <server system.html> <out-dir>
# server-dist.hashes = "<normalized sha256> <path>" for every dist/*.js on the server, plus "HTML <sha256>"
# for public/system.html — read from the live server, so the baseline is what is really installed.
set -euo pipefail
REL=20261119-r4
NAME="noamany-daily-update-$REL"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_NEW="$1"; SERVER_HASHES="$2"; SERVER_HTML="$3"; OUT="$4"
FILES="modules/employees/employees.service.js"
P="$OUT/$NAME"; rm -rf "$P" "$OUT/$NAME.zip"; mkdir -p "$P/expected" "$P/payload/dist" "$P/payload/public"
cp "$HERE/install.sh" "$HERE/rollback.sh" "$HERE/check-backend.cjs" "$HERE/README-AR.txt" "$P/"
: > "$P/expected/backend-baseline.txt"
for f in $FILES; do
  base=$(awk -v f="$f" '$2==f{print $1}' "$SERVER_HASHES"); [ -n "$base" ] || { echo "$f not on the server"; exit 1; }
  echo "$f $base" >> "$P/expected/backend-baseline.txt"
  mkdir -p "$P/payload/dist/$(dirname "$f")"; cp "$BE_NEW/$f" "$BE_NEW/$f.map" "$P/payload/dist/$(dirname "$f")/"
done
grep -q "employees.updateMany({ where: { id }, data: { employee_type: employeeType } })" "$P/payload/dist/modules/employees/employees.service.js"
HTML=$(awk '$1=="HTML"{print $2}' "$SERVER_HASHES")
echo "$HTML" > "$P/expected/system.html.sha256"
echo cfada630888db83c26d86302c1a2f0038bdeca4f3fd3164c08fa2c2f3bbd764e > "$P/expected/schema.sha256"
echo 11df00a7d995d312366200d5369d72c5154dc9480c5bf699889fdc4409268192 > "$P/expected/client-index.sha256"
# No UI change: ship the server's own system.html (same bytes; install.sh rewrites it unchanged).
[ "$(shasum -a 256 "$SERVER_HTML" | cut -d' ' -f1)" = "$HTML" ] || { echo "server system.html copy does not match"; exit 1; }
cp "$SERVER_HTML" "$P/payload/public/system.html"
: > "$P/expected/assets.txt"
(cd "$P" && find . -type f ! -name PACKAGE-SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done > PACKAGE-SHA256SUMS)
(cd "$OUT" && zip -qr "$NAME.zip" "$NAME")
echo "built $OUT/$NAME.zip: $(wc -l < "$P/expected/backend-baseline.txt" | tr -d ' ') backend file, no UI change"
