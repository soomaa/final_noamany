#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — ONE-COMMAND customer import (append-only, SAFE for live data).
# Run as root from the app folder AFTER unzipping the release:
#   cd /home/alatheertech/one80club.alatheertech.com
#   bash import-data.sh
#
# Order: backup DB (root socket) → import data/2.xlsx → import data/games.xlsx
# → provision mobile-app logins (password 000000). Nothing is ever deleted;
# import-customers.ts skips members whose phone already exists (dedup).
# Uses tsx (works on Node 24) instead of ts-node.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")"
BRANCH="${BRANCH:-1}"

for f in data/2.xlsx data/games.xlsx; do
  [ -f "$f" ] || { echo "!! Missing $f — it must be in the app's data/ folder."; exit 1; }
done

# --- DB name from .env ------------------------------------------------------
URL="$(grep -E '^DATABASE_URL' .env | head -1 | sed -E 's#^DATABASE_URL=##; s#^"##; s#"$##')"
DBN="${URL##*/}"; DBN="${DBN%%\?*}"

# --- [1/4] Backup via root socket (reliable here; app user may lack dump priv)
echo "==> [1/4] Backing up '$DBN' (root socket)…"
mkdir -p backups
BK="backups/${DBN}_pre-import_$(date +%Y%m%d_%H%M%S).sql.gz"
if mysqldump --protocol=socket --single-transaction --quick --no-tablespaces "$DBN" 2>/dev/null | gzip > "$BK" && [ -s "$BK" ]; then
  echo "    ok ($(du -h "$BK" | cut -f1)) -> $BK"
else
  rm -f "$BK"; BK=""
  echo "    !! backup couldn't run — continuing anyway (import only ADDS rows, never deletes)."
fi

# --- TS runner: tsx (Node 24-compatible). Install locally if missing. --------
if [ ! -x node_modules/.bin/tsx ]; then
  echo "==> Installing tsx (TypeScript runner)…"
  npm install --no-save --no-audit --no-fund tsx@4 >/dev/null 2>&1 || { echo "!! failed to install tsx"; exit 1; }
fi
RUN="node_modules/.bin/tsx"

echo "==> [2/4] Importing data/2.xlsx (branch $BRANCH)…"
"$RUN" prisma/scripts/import-customers.ts --branch="$BRANCH" --file=data/2.xlsx --commit || { echo "!! 2.xlsx import failed"; exit 1; }

echo "==> [3/4] Importing data/games.xlsx (branch $BRANCH)…"
"$RUN" prisma/scripts/import-customers.ts --branch="$BRANCH" --file=data/games.xlsx --commit || { echo "!! games.xlsx import failed"; exit 1; }

echo "==> [4/4] Provisioning mobile-app logins (password 000000)…"
"$RUN" prisma/scripts/provision-member-app-accounts.ts --commit || { echo "!! provisioning failed"; exit 1; }

echo ""
echo "✅ Done. Customers imported (dedup-safe) and app accounts provisioned."
echo "   Members log in with phone + 000000."
[ -n "$BK" ] && echo "   Pre-import backup: $BK"
