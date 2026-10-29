#!/usr/bin/env bash
# Read-only inspection of the Noamany production server before building the 2026-10-27 update.
# Changes nothing: no writes, no restart, does not print .env or customer data.
# Run in cPanel Terminal:  bash deploy-check-20261027.sh   (or paste the whole file)

APP=/home/noamanycenter/final.noamanycenter.com
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP" || { echo "!! app root not found: $APP"; exit 0; }

norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | sha256sum | cut -d' ' -f1; }

echo "=== 1) environment ==="
echo "user=$(whoami) host=$(hostname) date=$(date '+%Y-%m-%d %H:%M')"
echo "node=$(node -v 2>/dev/null)"
echo "prisma client=$(node -p "require('./node_modules/@prisma/client/package.json').version" 2>/dev/null) cli=$(node -p "require('./node_modules/prisma/package.json').version" 2>/dev/null)"
echo "schema.prisma=$(sha256sum prisma/schema.prisma | cut -d' ' -f1)  (expected after 22-r1: 63f965a8...)"

echo
echo "=== 2) installed packages and locks ==="
ls -d noamany-daily-update-* 2>/dev/null | tail -5
ls -d tmp/*update-backup* 2>/dev/null | tail -3
ls tmp/*.lock tmp/*lock* 2>/dev/null || echo "no lock files"
ls -l --time-style=long-iso tmp/restart.txt 2>/dev/null

echo
echo "=== 3) contents of the last package (install/rollback tools) ==="
LAST=$(ls -d noamany-daily-update-*/ 2>/dev/null | sort | tail -1)
echo "last=$LAST"
[ -n "$LAST" ] && find "$LAST" -maxdepth 2 -type f | head -40

echo
echo "=== 4) backend files this update replaces ==="
# expected = compiled from GitHub main 9f40e86 (CRLF and sourceMappingURL ignored)
while read -r f exp; do
  for root in dist dist/dist; do
    p="$root/$f"
    if [ -f "$p" ]; then
      got=$(norm "$p")
      [ "$got" = "$exp" ] && st=MATCH || st=DIFF
      echo "$st  $p  $(date -r "$p" '+%Y-%m-%d %H:%M')"
    else
      echo "MISSING  $p"
    fi
  done
done <<'LIST'
modules/auth/auth.service.js 4bd59dd0a8b7090455452c9e41dc79b924a195a80c6429f5dfadac9b29f0bdaa
modules/auth/strategies/jwt.strategy.js c6f7b006250c21a76df2daad879278371d35c670493a89ff50de7f968c1b302b
modules/employees/employees.service.js 641ecbf35a28704f907585dc271230f8a3429fba0fe33a131c91b9f6ef5fb5d8
modules/inventory/inventory-transactions.controller.js 7b1a88b2c8e7a520f9048d822e495c63a8d6bac6db042132717eccf9f3f3abc8
modules/inventory/inventory-transactions.service.js 80be80b11b8d30d64087541790aea9744e921836b0fd196d0440eb9c63b25cee
LIST
ls dist/modules/auth/employee-status.util.js 2>/dev/null && echo "!! new file already exists" || echo "OK: employee-status.util.js not present yet"

echo
echo "=== 5) what Passenger actually runs ==="
grep -iE "^\s*Passenger" .htaccess 2>/dev/null
ls -l --time-style=long-iso dist/main.js dist/app.module.js 2>/dev/null
[ -d dist/dist ] && echo "dist/dist exists" || echo "no dist/dist"

echo
echo "=== 6) management UI ==="
ls -l --time-style=long-iso public/system.html public/index.html 2>/dev/null
echo "system.html sha=$(sha256sum public/system.html | cut -d' ' -f1)"
grep -oE '(src|href)="/assets/[^"]+"' public/system.html | head -5
echo "assets count=$(ls public/assets 2>/dev/null | wc -l)"
du -sh public/assets 2>/dev/null
df -h "$APP" | tail -1

echo
echo "=== 7) health ==="
curl -s -H 'Cache-Control: no-cache' "https://final.noamanycenter.com/api/health?t=$(date +%s)"; echo

echo
echo "=== end: nothing was changed ==="
