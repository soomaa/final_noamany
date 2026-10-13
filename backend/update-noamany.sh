#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR=/home/noamanycenter/final.noamanycenter.com
RELEASE=noamany-update-20261001-r1
ZIP="$APP_DIR/$RELEASE.zip"
BACKUP_ROOT=/home/noamanycenter/update-backups

fail() { printf 'UPDATE_STOPPED: %s\n' "$*" >&2; exit 1; }
trap 'echo "UPDATE_FAILED: stop here. Do not run reset, restore, seed, or repeat a failed migration. Keep the terminal output and private backup." >&2' ERR

[ "$(id -un)" = noamanycenter ] || fail 'Use the noamanycenter cPanel account, not root.'
[ "$(readlink -f "$APP_DIR")" = "$APP_DIR" ] || fail 'Unexpected app directory.'
[ -f "$APP_DIR/.env" ] && [ -f "$ZIP" ] || fail 'Missing .env or update ZIP.'
[ ! -e /usr/local/sbin/restart-noamany-on-request.recovery-paused ] || fail 'The existing restart monitor is paused. Hosting must restore it before updating.'
[ -e /usr/local/sbin/restart-noamany-on-request ] || fail 'The existing restart monitor is absent. Updating root-owned PM2 without it requires hosting support.'
[ -w "$APP_DIR" ] || fail 'App directory is not writable.'

export PATH="/opt/cpanel/ea-nodejs22/bin:/opt/cpanel/ea-nodejs20/bin:$PATH"
hash -r
for cmd in node npm mysql mysqldump unzip tar flock curl; do command -v "$cmd" >/dev/null || fail "Missing command: $cmd"; done
node -e 'if(Number(process.versions.node.split(".")[0])<20) process.exit(1)'
exec 9>"$APP_DIR/tmp-noamany-update.lock"
flock -n 9 || fail 'Another update is running.'

# SQL dumps/code archives stay outside the web document root.
mkdir -p "$BACKUP_ROOT"
[ "$(readlink -f "$BACKUP_ROOT")" = "$BACKUP_ROOT" ] || fail 'Unexpected backup directory.'
SNAPSHOT="$(mktemp -d "$BACKUP_ROOT/$RELEASE-XXXXXXXX")"
chmod 700 "$SNAPSHOT"
STAGE="$SNAPSHOT/stage"
mkdir "$STAGE"
printf 'PRIVATE_BACKUP: %s\n' "$SNAPSHOT"

# Reject traversal, absolute paths, symlinks and private/runtime files before extraction.
unzip -Z1 "$ZIP" > "$SNAPSHOT/zip-entries.txt"
node - "$SNAPSHOT/zip-entries.txt" <<'NODE'
const fs=require('node:fs');
const files=fs.readFileSync(process.argv[2],'utf8').trim().split('\n');
if(files.length<1000||files.some(f=>f.startsWith('/')||f.includes('\\')||f.split('/').some(p=>p==='..'||p==='.env'||p==='uploads'||p==='node_modules'))) throw Error('Unsafe ZIP contents');
NODE
unzip -q "$ZIP" -d "$STAGE"
CHECK="$STAGE/scripts/update-data-safety.cjs"
node "$CHECK" verify-package "$STAGE"
node "$CHECK" plan "$APP_DIR" "$STAGE" "$SNAPSHOT"
node "$CHECK" backup "$APP_DIR" "$STAGE" "$SNAPSHOT"
tar -czf "$SNAPSHOT/code-before.tar.gz" -C "$APP_DIR" .env dist src prisma public package.json package-lock.json
node "$CHECK" before "$APP_DIR" "$STAGE" "$SNAPSHOT"

printf 'Installing dependencies privately; live files and .env remain unchanged.\n'
(cd "$STAGE" && npm ci --include=dev --ignore-scripts)
node "$CHECK" validate "$APP_DIR" "$STAGE" "$SNAPSHOT"
node "$CHECK" generate "$APP_DIR" "$STAGE" "$SNAPSHOT"

printf 'Applying reviewed pending migrations only. No restore/reset/seed.\n'
node "$CHECK" deploy "$APP_DIR" "$STAGE" "$SNAPSHOT"
node "$CHECK" after "$APP_DIR" "$STAGE" "$SNAPSHOT"
NOAMANY_CONFIG_FILE="$APP_DIR/.env" node "$STAGE/scripts/recovery-read-tests.cjs" --configured-database

# Replace code/runtime only. Preserve .env and uploads. Old runtime stays recoverable.
cp -a "$STAGE/src/." "$APP_DIR/src/"
cp -a "$STAGE/prisma/." "$APP_DIR/prisma/"
cp -a "$STAGE/public/." "$APP_DIR/public/"
mkdir -p "$APP_DIR/scripts"
cp -a "$STAGE/scripts/." "$APP_DIR/scripts/"
for file in package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json; do cp -a "$STAGE/$file" "$APP_DIR/$file"; done
mv "$APP_DIR/dist" "$SNAPSHOT/dist-before"
mv "$STAGE/dist" "$APP_DIR/dist"
mv "$APP_DIR/node_modules" "$SNAPSHOT/node_modules-before"
mv "$STAGE/node_modules" "$APP_DIR/node_modules"
node "$APP_DIR/scripts/update-data-safety.cjs" after "$APP_DIR" "$APP_DIR" "$SNAPSHOT"

mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"
printf 'Restart requested using the existing monitor. Waiting for the running release identity.\n'
HEALTH_FILE="$SNAPSHOT/health.json"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 4 "http://127.0.0.1:9043/api/health?update=$RELEASE-$attempt" -o "$HEALTH_FILE"; then
    if node - "$HEALTH_FILE" "$RELEASE" <<'NODE'
const fs=require('node:fs');
try{const h=JSON.parse(fs.readFileSync(process.argv[2]));process.exit(h.status==='ok'&&h.release===process.argv[3]?0:1)}catch{process.exit(1)}
NODE
    then
      printf 'UPDATE_OK: %s\nPRIVATE_BACKUP: %s\n' "$RELEASE" "$SNAPSHOT"
      exit 0
    fi
  fi
  if (( attempt % 3 == 0 )); then printf 'Waiting for restart (%s checks)...\n' "$attempt"; fi
  sleep 4
done
fail "Migrations and data checks completed, but the new backend has not restarted. Do not start a second PM2 instance. Hosting must check its restart monitor. Backup: $SNAPSHOT"
