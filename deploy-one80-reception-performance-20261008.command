#!/usr/bin/env bash
set -euo pipefail
cd ~/Desktop/nomany_hr/GYM/one80
scp one80-reception-performance-20261008.zip root@144.76.74.208:~/
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-reception-performance-20261008.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' '8ca2e5fb3b3ac2466f6ea54cef602e5969ffaa7450de37082cd06979dab4d93e' "$FILE" | sha256sum -c -
unzip -tqq "$FILE"
BACKUP_ROOT=/home/alatheertech/one80-shared/code-backups
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/reception-deploy.lock"
flock -n 9 || { echo 'Another reception update is running.'; exit 1; }
if pgrep -f '^bash server-(code-only-)?deploy\.sh($| )' >/dev/null; then
  echo 'An installer is still running. Check its log before retrying.'
  exit 1
fi
BACKUP="$BACKUP_ROOT/before-reception-$(date +%Y%m%d_%H%M%S)-$$.tar.gz"
tar --exclude='./node_modules' --exclude='./uploads' --exclude='./private-uploads' \
  --exclude='./backups' --exclude='./tmp' --exclude='./data' --exclude='./database' \
  --exclude='*.log' --exclude='*.zip' -czf "$BACKUP" -C "$APP" .
printf 'Code backup: %s\n' "$BACKUP"
cd "$APP"
unzip -oq "$FILE" -d .
LOG=/home/alatheertech/one80-shared/reception-performance-20261008.log
nohup bash -c 'set -euo pipefail; bash server-code-only-deploy.sh; echo ONE80_RECEPTION_DEPLOY_OK' >"$LOG" 2>&1 </dev/null &
DEPLOY_PID=$!
printf 'Installer PID: %s; continues if SSH disconnects. Log: %s\n' "$DEPLOY_PID" "$LOG"
tail --pid="$DEPLOY_PID" -n +1 -f "$LOG"
grep -qx 'ONE80_RECEPTION_DEPLOY_OK' "$LOG"
REMOTE
