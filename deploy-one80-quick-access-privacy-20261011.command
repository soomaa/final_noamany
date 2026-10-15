#!/usr/bin/env bash
cd ~/Desktop/nomany_hr/GYM/one80 && \
scp one80-quick-access-privacy-20261011.zip root@144.76.74.208:~/ && \
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-quick-access-privacy-20261011.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' 'c53867c341c720774f30e10ef080015957bad79225e8d5a0dab6c0a77db28a32' "$FILE" | sha256sum -c -
unzip -tqq "$FILE"
test -d "$APP"
BACKUP_ROOT=/home/alatheertech/one80-shared/code-backups
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP="$BACKUP_ROOT/before-quick-access-privacy-$(date +%Y%m%d_%H%M%S)-$$.tar.gz"
tar --exclude='./node_modules' --exclude='./uploads' --exclude='./private-uploads' \
  --exclude='./backups' --exclude='./tmp' --exclude='./data' --exclude='./database' \
  --exclude='*.log' --exclude='*.zip' -czf "$BACKUP" -C "$APP" .
printf 'Code backup: %s\n' "$BACKUP"
cd "$APP"
unzip -oq "$FILE" -d .
bash server-deploy.sh
REMOTE
