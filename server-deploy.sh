#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — ONE-COMMAND deploy for THIS server (cPanel/WHM + Apache + PM2).
# Run as ROOT in the WHM terminal, from the app folder, after unzipping:
#   cd /home/alatheertech/one80.alatheertech.com
#   unzip -o one80-deploy.zip && bash server-deploy.sh
#
# Server facts this relies on (this server setup):
#   * Apache httpd (Cloudflare in front). NO Passenger / no cPanel Node UI.
#     Each Node site stays alive under PM2 (running as root).
#   * This app's PM2 process = "one80", entry = dist/main.js, cwd = app dir.
#   * Node listens on PORT=9041; an Apache userdata include proxies the whole
#     site to http://127.0.0.1:9041  (/.well-known kept local for AutoSSL).
#   * DB = the existing production DB in .env. This script creates it when
#     missing and always takes a backup. It only wipes/imports data when the
#     explicit --force-data flag is supplied.
#
# DEFAULT = data-preserving update (SAFE): backs up the existing database,
# applies versioned schema migrations/RBAC metadata, rebuilds the app, and
# NEVER wipes or imports operational data.
#   bash server-deploy.sh
# One-time production preparation after the automatic backup: removes demo
# employees/users/members/subscriptions while protecting cafe and package prices:
#   bash server-deploy.sh --prepare-production
# Reset Cafe operational data only while preserving users and shift definitions/sessions:
#   bash server-deploy.sh --reset-cafe
# Remove only orphan Cafe accounting left by an earlier reset, including old
# quick sales, partner settlements and supplier invoice correction/reversal rows:
#   bash server-deploy.sh --repair-cafe-accounting
# Permanently remove only the five confirmed test members A000001..A000005,
# including their subscriptions, receipts and generated accounting:
#   bash server-deploy.sh --purge-test-members-1-5
# Both targeted maintenance operations can run together after the same backup.
# Cafe accounting is repaired first, then the five test members are purged:
#   bash server-deploy.sh --repair-cafe-accounting --purge-test-members-1-5
# To WIPE the server DB and replace it with the shipped db-import.sql you MUST
# pass --force-data explicitly (dangerous — destroys live server data):
#   bash server-deploy.sh --force-data
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"
APP_DIR="$(pwd)"

# Keep environment configuration and uploads outside the replaceable release
# directory. This also lets a restored/fresh app directory reuse the existing
# server configuration without bundling production secrets in every release.
SHARED_ROOT="${ONE80_SHARED_DIR:-$(dirname "$APP_DIR")/one80-shared}"
SHARED_ENV="$SHARED_ROOT/.env"
SHARED_UPLOADS="$SHARED_ROOT/uploads"
mkdir -p "$SHARED_ROOT"

# ---- App identity (ONE80 production identity) ----------------
PORT_NUM=9041
PM2_NAME=one80
DOMAIN=one80.alatheertech.com
PROXY_CONF=one80-proxy.conf

# SAFE BY DEFAULT: never import the DB unless --force-data is explicitly passed.
# (--no-db is still accepted and also means "don't touch the DB".)
IMPORT_DB=0
PREPARE_PRODUCTION=0
RESET_CAFE=0
REPAIR_CAFE_ACCOUNTING=0
PURGE_TEST_MEMBERS=0
for a in "$@"; do
  case "$a" in
    --force-data) IMPORT_DB=1 ;;
    --no-db)      IMPORT_DB=0 ;;
    --prepare-production) PREPARE_PRODUCTION=1 ;;
    --reset-cafe) RESET_CAFE=1 ;;
    --repair-cafe-accounting) REPAIR_CAFE_ACCOUNTING=1 ;;
    --purge-test-members-1-5) PURGE_TEST_MEMBERS=1 ;;
    *) echo "!! Unknown option: $a"; exit 1 ;;
  esac
done
EXCLUSIVE_DATA_OPTIONS=$((IMPORT_DB + PREPARE_PRODUCTION + RESET_CAFE))
TARGETED_MAINTENANCE_OPTIONS=$((REPAIR_CAFE_ACCOUNTING + PURGE_TEST_MEMBERS))
if [ "$EXCLUSIVE_DATA_OPTIONS" -gt 1 ] || { [ "$EXCLUSIVE_DATA_OPTIONS" -eq 1 ] && [ "$TARGETED_MAINTENANCE_OPTIONS" -gt 0 ]; }; then
  echo "!! --force-data, --prepare-production and --reset-cafe must each run alone."
  echo "   Only --repair-cafe-accounting and --purge-test-members-1-5 may be combined safely."
  exit 1
fi
echo "==> App: $PM2_NAME   dir: $APP_DIR   port: $PORT_NUM   (import data: $([ $IMPORT_DB = 1 ] && echo 'YES — WIPES DB' || echo 'no'))   (prepare production: $([ $PREPARE_PRODUCTION = 1 ] && echo 'YES' || echo 'no'))   (reset cafe: $([ $RESET_CAFE = 1 ] && echo 'YES' || echo 'no'))   (repair cafe accounting: $([ $REPAIR_CAFE_ACCOUNTING = 1 ] && echo 'YES' || echo 'no'))   (purge test members 1-5: $([ $PURGE_TEST_MEMBERS = 1 ] && echo 'YES' || echo 'no'))"

if [ "$IMPORT_DB" = 1 ]; then
  echo ""
  echo "  ############################################################"
  echo "  # ⚠  --force-data: about to WIPE '$DOMAIN' database and    #"
  echo "  #    replace it with the shipped db-import.sql.            #"
  echo "  #    A backup is taken first. Ctrl-C NOW to abort.         #"
  echo "  ############################################################"
  for i in 8 7 6 5 4 3 2 1; do printf "\r    continuing in %ss…  " "$i"; sleep 1; done
  echo ""
fi

if [ -f "$SHARED_ENV" ]; then
  # The shared server copy always wins over an accidentally bundled .env.
  if [ ! -L .env ] || [ "$(readlink -f .env 2>/dev/null || true)" != "$SHARED_ENV" ]; then
    rm -f .env
    ln -s "$SHARED_ENV" .env
  fi
elif [ -f .env ]; then
  echo "==> Moving production environment to persistent shared storage…"
  cp -L -p .env "$SHARED_ENV"
  rm -f .env
  ln -s "$SHARED_ENV" .env
else
  echo "!! .env missing — cannot continue."
  echo "   First install: build/upload the private --include-env release once."
  echo "   Existing install: restore $SHARED_ENV from the server backup."
  exit 1
fi
grep -q '^DATABASE_URL' .env || { echo "!! .env has no DATABASE_URL"; exit 1; }
[ -f package.json ] || { echo "!! package.json missing — incomplete release archive."; exit 1; }
[ -f package-lock.json ] || { echo "!! package-lock.json missing — refusing a non-reproducible install."; exit 1; }
[ -f prisma/schema.prisma ] || { echo "!! prisma/schema.prisma missing — incomplete release archive."; exit 1; }
[ -f public/index.html ] || { echo "!! public/index.html missing — frontend build was not bundled."; exit 1; }
[ -f server-clean-build.sh ] || { echo "!! server-clean-build.sh missing — incomplete release archive."; exit 1; }

OWNER="$(stat -c '%U' . 2>/dev/null || stat -f '%Su' .)"
echo "==> Owner: $OWNER"
command -v npm >/dev/null || { echo "!! npm not in PATH"; exit 1; }
command -v node >/dev/null || { echo "!! node not in PATH"; exit 1; }
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] || {
  echo "!! Node.js 20 or newer is required (found: $(node -v 2>/dev/null || echo unavailable))."
  echo "   Upgrade Node before deploying; the live process has not been changed."
  exit 1
}
echo "==> node: $(node -v 2>/dev/null)"

# --- Persistent uploads outside the replaceable application tree -----------
# A code release must never own uploaded member/product/document images. On the
# first run, migrate any existing local files without overwriting shared files,
# keep the old directory as a safety copy, then point both .env and /uploads at
# the stable shared directory.
mkdir -p "$SHARED_UPLOADS"
if [ -L "$APP_DIR/uploads" ]; then
  CURRENT_UPLOADS="$(readlink -f "$APP_DIR/uploads" 2>/dev/null || true)"
  if [ "$CURRENT_UPLOADS" != "$SHARED_UPLOADS" ]; then
    echo "==> Migrating uploads from old symlink target to $SHARED_UPLOADS…"
    [ -d "$APP_DIR/uploads" ] && cp -a -n "$APP_DIR/uploads/." "$SHARED_UPLOADS/"
    rm -f "$APP_DIR/uploads"
  fi
elif [ -d "$APP_DIR/uploads" ]; then
  UPLOAD_BACKUP="$APP_DIR/uploads.pre-shared-$(date +%Y%m%d_%H%M%S)"
  echo "==> Migrating existing uploads to $SHARED_UPLOADS…"
  cp -a -n "$APP_DIR/uploads/." "$SHARED_UPLOADS/"
  mv "$APP_DIR/uploads" "$UPLOAD_BACKUP"
  echo "    original retained at: $UPLOAD_BACKUP"
fi
[ -L "$APP_DIR/uploads" ] || ln -s "$SHARED_UPLOADS" "$APP_DIR/uploads"

if grep -qE '^[[:space:]]*UPLOAD_DIR=' .env; then
  sed -i "s#^[[:space:]]*UPLOAD_DIR=.*#UPLOAD_DIR=$SHARED_UPLOADS#" .env
else
  printf 'UPLOAD_DIR=%s\n' "$SHARED_UPLOADS" >> .env
fi
if grep -qE '^[[:space:]]*PUBLIC_UPLOAD_BASE=' .env; then
  sed -i 's#^[[:space:]]*PUBLIC_UPLOAD_BASE=.*#PUBLIC_UPLOAD_BASE=/uploads#' .env
else
  printf 'PUBLIC_UPLOAD_BASE=/uploads\n' >> .env
fi
echo "==> Persistent uploads: $SHARED_UPLOADS"

# --- Ensure PORT + NODE_ENV in .env (this server proxies to PORT) -----------
if grep -qE '^[[:space:]]*#?[[:space:]]*PORT=' .env; then
  sed -i "s/^[[:space:]]*#\?[[:space:]]*PORT=.*/PORT=$PORT_NUM/" .env
else
  printf '\nPORT=%s\n' "$PORT_NUM" >> .env
fi
grep -qE "^NODE_ENV=" .env || printf 'NODE_ENV=production\n' >> .env

# --- Parse DATABASE_URL -----------------------------------------------------
URL="$(grep -E '^DATABASE_URL' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
rest="${URL#mysql://}"; creds="${rest%%@*}"; hpd="${rest#*@}"
DBU="${creds%%:*}"; DBP_ENC=""; [[ "$creds" == *:* ]] && DBP_ENC="${creds#*:}"
hostport="${hpd%%/*}"; DBN="${hpd##*/}"; DBN="${DBN%%\?*}"
DBPORT="3306"; [[ "$hostport" == *:* ]] && DBPORT="${hostport#*:}"
urldecode(){ local d="${1//+/ }"; printf '%b' "${d//%/\\x}"; }
DBP="$(urldecode "$DBP_ENC")"
echo "==> DB: name=$DBN user=$DBU host=localhost:$DBPORT"

# --- Root MySQL access (socket) — needed to create the new DB + user --------
if mysql --protocol=socket -e "SELECT 1" >/dev/null 2>&1; then
  ROOT_MY=(mysql --protocol=socket)
else
  echo "!! Cannot reach MySQL as root via socket (needed to create the DB)."; exit 1
fi

# --- 0) Create the NEW DB + user (idempotent) -------------------------------
echo "==> [0] Ensuring database '$DBN' and user '$DBU' exist…"
"${ROOT_MY[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`$DBN\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DBU'@'localhost' IDENTIFIED BY '$DBP';
CREATE USER IF NOT EXISTS '$DBU'@'127.0.0.1' IDENTIFIED BY '$DBP';
ALTER USER '$DBU'@'localhost' IDENTIFIED BY '$DBP';
ALTER USER '$DBU'@'127.0.0.1' IDENTIFIED BY '$DBP';
GRANT ALL PRIVILEGES ON \`$DBN\`.* TO '$DBU'@'localhost';
GRANT ALL PRIVILEGES ON \`$DBN\`.* TO '$DBU'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
[ $? -eq 0 ] || { echo "!! Failed to create DB/user."; exit 1; }

# Use root socket (selecting the db) for backup/wipe/import — root sees any db.
MY=(mysql --protocol=socket "$DBN"); MYDUMP=(mysqldump --protocol=socket "$DBN")

# --- 1) Back up existing data (only if the DB already has tables) -----------
mkdir -p backups
TBLCOUNT="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DBN';" 2>/dev/null || echo 0)"
if [ "${TBLCOUNT:-0}" -gt 0 ]; then
  TS="$(date +%Y%m%d_%H%M%S)"; BK="backups/${DBN}_pre-deploy_${TS}.sql.gz"
  echo "==> [1] Backup current DB ($TBLCOUNT tables) -> $BK"
  if "${MYDUMP[@]}" --single-transaction --quick --no-tablespaces --add-drop-table 2>backups/bk_err.log | gzip > "$BK" && [ -s "$BK" ]; then
    echo "    ok ($(du -h "$BK" | cut -f1))"; rm -f backups/bk_err.log
  else
    echo "    !! backup failed — ABORTING:"; tail -20 backups/bk_err.log; rm -f "$BK"; exit 1
  fi
else
  echo "==> [1] New/empty DB — nothing to back up."
  BK="(none — first deploy)"
fi

# --- 2) Wipe + import local data (ONLY with --force-data) --------------------
if [ "$IMPORT_DB" = 1 ]; then
  [ -f db-import.sql ] || { echo "!! db-import.sql missing (run without flags for code-only)"; exit 1; }
  echo "==> [2] Wiping + importing db-import.sql…"
  TBLS=(); while IFS= read -r t; do [ -n "$t" ] && TBLS+=("$t"); done < <(
    "${MY[@]}" -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$DBN';")
  if [ "${#TBLS[@]}" -gt 0 ]; then
    LIST="$(printf '`%s`,' "${TBLS[@]}")"; LIST="${LIST%,}"
    "${MY[@]}" -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS $LIST; SET FOREIGN_KEY_CHECKS=1;"
  fi
  if ! "${MY[@]}" < db-import.sql 2>import_err.log; then
    echo "!! DB import FAILED — aborting (app not touched):"; tail -15 import_err.log; exit 1
  fi
  NEWCOUNT="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DBN';")"
  echo "    imported. tables: $NEWCOUNT"
  [ "${NEWCOUNT:-0}" -gt 0 ] || { echo "!! import produced 0 tables — aborting."; tail -15 import_err.log 2>/dev/null; exit 1; }
  rm -f import_err.log
else
  echo "==> [2] DB import skipped (default/code-only). Live server data preserved. (Use --force-data to replace it.)"
fi

# --- 3) Install + build -----------------------------------------------------
echo "==> [3] npm ci (locked dependencies)…"; npm ci --include=dev
echo "==> [3] prisma generate…"; npx prisma generate
# Heal legacy ONE80 migration names (e.g. failed 20260707145000_hr_employment_type)
# before deploy — targeted schema/metadata repair, never touches business rows.
if [ -f prisma/scripts/heal-production-migrations.sh ]; then
  echo "==> [3] heal known migration drift…"
  bash prisma/scripts/heal-production-migrations.sh
fi
# Apply any pending schema migrations (ADDITIVE — keeps the code and DB in sync
# so a code deploy can't leave the DB behind). Never wipes data.
echo "==> [3] prisma migrate deploy…"
MIGRATE_OK=0
MIGRATE_MAX_ATTEMPTS=50
for MIGRATE_ATTEMPT in $(seq 1 "$MIGRATE_MAX_ATTEMPTS"); do
  if npx prisma migrate deploy; then
    MIGRATE_OK=1
    break
  fi

  FAILED_BEFORE="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;" 2>/dev/null || echo 0)"
  if [ "$MIGRATE_ATTEMPT" -lt "$MIGRATE_MAX_ATTEMPTS" ] && [ "${FAILED_BEFORE:-0}" -gt 0 ]; then
    echo "==> A migration failed; running safe reconciliation before retry $((MIGRATE_ATTEMPT + 1))/$MIGRATE_MAX_ATTEMPTS…"
    bash prisma/scripts/heal-production-migrations.sh
    FAILED_AFTER="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;" 2>/dev/null || echo 0)"
    if [ "${FAILED_AFTER:-0}" -lt "${FAILED_BEFORE:-0}" ]; then
      continue
    fi
    echo "    no known safe repair matched the failed migration."
  fi
  break
done

if [ "$MIGRATE_OK" = 1 ]; then
  echo "    schema up to date."
else
  echo "!! prisma migrate deploy failed — aborting before build/restart so old code stays running."
  echo "   Failed migration details:"
  "${MY[@]}" -e "SELECT migration_name, started_at, LEFT(COALESCE(logs, ''), 4000) AS logs FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at DESC;" 2>/dev/null || true
  echo "   Inspect with: npx prisma migrate status"
  exit 1
fi
# Keep the database-backed permissions matrix in sync with the versioned RBAC
# catalog. This seed is idempotent: it upserts permission definitions and never
# modifies members, subscriptions, receipts, or other operational data.
echo "==> [3] Syncing RBAC permissions matrix…"
npm run db:seed:rbac
if [ "$PREPARE_PRODUCTION" = 1 ]; then
  echo "==> [3] One-time production data preparation…"
  echo "    Protected: cafe/POS/inventory/procurement, job titles, packages and prices."
  PRODUCTION_CLEANUP_ACK=DELETE_HR_KEEP_CAFE \
    npm run db:prepare:production -- --confirm-production-cleanup
fi
if [ "$RESET_CAFE" = 1 ]; then
  echo "==> [3] Resetting Cafe operational data only…"
  echo "    Protected: users, shifts/sessions, members, subscriptions, packages, employees and every non-Cafe finance row."
  echo "    The full database backup above was completed before this reset."
  CAFE_RESET_ACK=DELETE_CAFE_KEEP_SHIFTS_USERS \
    npm run db:reset:cafe -- --confirm-cafe-reset
fi
if [ "$REPAIR_CAFE_ACCOUNTING" = 1 ]; then
  echo "==> [3] Repairing orphan Cafe accounting rows only…"
  echo "    Targets: orphan quick sales, partner settlements, supplier invoice corrections/reversals and Cafe opening balances."
  echo "    Protected: every current source document and every non-Cafe business/accounting row."
  CAFE_ACCOUNTING_REPAIR_ACK=DELETE_ORPHAN_CAFE_ACCOUNTING_ONLY \
    npm run db:repair:cafe-accounting -- --confirm-cafe-accounting-repair
fi
if [ "$PURGE_TEST_MEMBERS" = 1 ]; then
  echo "==> [3] Purging the five explicitly confirmed test members only…"
  echo "    Targets: A000001, A000002, A000003, A000004 and A000005."
  echo "    Deletes their subscriptions, receipts, related service rows and generated finance/accounting rows."
  echo "    Protected: every other member and every unrelated business/financial row."
  echo "    The full database backup above was completed before this purge."
  INITIAL_TEST_MEMBER_PURGE_ACK=PURGE_A000001_TO_A000005_TEST_DATA_ONLY \
    npm run db:purge:test-members -- --confirm-test-member-purge
fi
echo "==> [3] Clean backend build with rollback…"
bash "$APP_DIR/server-clean-build.sh" "$APP_DIR" "$SHARED_ROOT"
echo "==> Reconciling existing café/payroll finance projections (no duplicate ledger entries)…"
node scripts/reconcile-cafe-finance.cjs
mkdir -p uploads tmp

# --- 4) Apache proxy include (idempotent — reconcile this app's file) -------
SSL=/etc/apache2/conf.d/userdata/ssl/2_4/alatheertech/$DOMAIN
STD=/etc/apache2/conf.d/userdata/std/2_4/alatheertech/$DOMAIN
CONF="<Directory \"/home/alatheertech/$DOMAIN\">
    AllowOverride All
    Options +FollowSymLinks
    Require all granted
</Directory>

ProxyPreserveHost On
ProxyRequests Off
ProxyPass /.well-known !
ProxyPass        /  http://127.0.0.1:$PORT_NUM/
ProxyPassReverse /  http://127.0.0.1:$PORT_NUM/"

EXPECTED_PROXY="$(mktemp)"
printf '%s\n' "$CONF" > "$EXPECTED_PROXY"
PROXY_CHANGED=0
if [ ! -f "$SSL/$PROXY_CONF" ] || ! cmp -s "$EXPECTED_PROXY" "$SSL/$PROXY_CONF"; then
  PROXY_CHANGED=1
fi
if [ ! -f "$STD/$PROXY_CONF" ] || ! cmp -s "$EXPECTED_PROXY" "$STD/$PROXY_CONF"; then
  PROXY_CHANGED=1
fi

if [ "$PROXY_CHANGED" = 1 ]; then
  echo "==> [4] Reconciling Apache proxy include with Node port $PORT_NUM…"
  # Keep every unrelated cPanel userdata include; update only this app's file.
  mkdir -p "$SSL" "$STD"
  install -m 0644 "$EXPECTED_PROXY" "$SSL/$PROXY_CONF"
  install -m 0644 "$EXPECTED_PROXY" "$STD/$PROXY_CONF"
  /usr/local/cpanel/scripts/rebuildhttpdconf
  apachectl configtest && systemctl restart httpd && echo "    apache restarted"
else
  echo "==> [4] Apache proxy already matches Node port $PORT_NUM — leaving httpd untouched."
fi
rm -f "$EXPECTED_PROXY"

# --- 5) Restart the Node app under PM2 --------------------------------------
echo "==> [5] (Re)starting PM2 '$PM2_NAME' on port $PORT_NUM…"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  # Keep the existing PM2 process identity/log history; update its production env in place.
  PORT=$PORT_NUM NODE_ENV=production pm2 restart "$PM2_NAME" --update-env
else
  PORT=$PORT_NUM NODE_ENV=production pm2 start dist/main.js --name "$PM2_NAME" --time
fi
pm2 save >/dev/null 2>&1 || true

# --- 6) Cleanup + ownership -------------------------------------------------
rm -f one80-deploy.zip db-import.sql
chown -R "$OWNER":"$OWNER" "$APP_DIR" "$SHARED_ROOT" 2>/dev/null || true

# --- 7) Verify --------------------------------------------------------------
echo ""; echo "==> Verify:"
# Nest can take more than five seconds to register the full route tree on this
# server. Poll the real health endpoint instead of reporting a false failure
# while PM2 is still completing a healthy startup.
READY=0
for _ in $(seq 1 30); do
  if curl --fail --silent -o /dev/null "http://127.0.0.1:$PORT_NUM/api/health"; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" != 1 ]; then
  echo "    !! local API health check failed after 30 seconds — deploy failed"
  pm2 logs "$PM2_NAME" --lines 40 --nostream || true
  exit 1
fi
echo "    node listening and API healthy on $PORT_NUM ✅"
curl -s  -o /dev/null -w "    local  /    HTTP %{http_code}\n" "http://127.0.0.1:$PORT_NUM/"
curl -s  -o /dev/null -w "    local health HTTP %{http_code}\n" "http://127.0.0.1:$PORT_NUM/api/health"
curl -sk -o /dev/null -w "    public /    HTTP %{http_code}\n" "https://$DOMAIN/"

# An unauthenticated request to this protected endpoint must be rejected by
# the auth guard (401/403). A 404 means public traffic is still reaching an
# old backend which does not have the member profile route.
echo "    checking public profile route HTTP registration…"
PUBLIC_PROFILE_STATUS="$(curl -sk -o /dev/null -w '%{http_code}' \
  "https://$DOMAIN/api/club-members/1/profile-summary" || true)"
case "$PUBLIC_PROFILE_STATUS" in
  401|403)
    echo "    public profile route HTTP $PUBLIC_PROFILE_STATUS (registered) ✅"
    ;;
  *)
    echo "    !! public profile route HTTP ${PUBLIC_PROFILE_STATUS:-000} — expected 401/403"
    echo "       Apache may still be routing to a stale backend; deploy failed verification."
    pm2 logs "$PM2_NAME" --lines 40 --nostream || true
    exit 1
    ;;
esac
echo ""
echo "✅ Done. Backup: $BK"
echo "   Open: https://$DOMAIN   (use your configured administrator account)"
echo "   If node isn't listening:  pm2 logs $PM2_NAME --lines 40"
