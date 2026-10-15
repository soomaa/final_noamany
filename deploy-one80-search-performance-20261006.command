#!/usr/bin/env bash
cd ~/Desktop/nomany_hr/GYM/one80 && \
scp one80-search-performance-20261006.zip root@144.76.74.208:~/ && \
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-search-performance-20261006.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' '340c245dc29854148664044c8ec9c3bc0f7a51969ef00ecaf770be5db00640e0' "$FILE" | sha256sum -c -
unzip -tqq "$FILE"
BACKUP_ROOT=/home/alatheertech/one80-shared/code-backups
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP="$BACKUP_ROOT/before-search-$(date +%Y%m%d_%H%M%S)-$$.tar.gz"
tar --exclude='./node_modules' --exclude='./uploads' --exclude='./private-uploads' \
  --exclude='./backups' --exclude='./tmp' --exclude='./data' --exclude='./database' \
  --exclude='*.log' --exclude='*.zip' -czf "$BACKUP" -C "$APP" .
printf 'Code backup: %s\n' "$BACKUP"
cd "$APP"
unzip -oq "$FILE" -d .
bash server-deploy.sh
REMOTE
