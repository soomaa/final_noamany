#!/usr/bin/env bash
cd ~/Desktop/nomany_hr/GYM/one80 && \
scp one80-search-recovery-20261008-v2.zip root@144.76.74.208:~/ && \
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-search-recovery-20261008-v2.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' 'dca35e30f1842646eb2d55187f327841c09d73b272a61f4c771f9deac64cedb3' "$FILE" | sha256sum -c -
unzip -tqq "$FILE"
BACKUP_ROOT=/home/alatheertech/one80-shared/code-backups
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP="$BACKUP_ROOT/before-search-recovery-$(date +%Y%m%d_%H%M%S)-$$.tar.gz"
tar --exclude='./node_modules' --exclude='./uploads' --exclude='./private-uploads' \
  --exclude='./backups' --exclude='./tmp' --exclude='./data' --exclude='./database' \
  --exclude='*.log' --exclude='*.zip' -czf "$BACKUP" -C "$APP" .
printf 'Code backup: %s\n' "$BACKUP"
cd "$APP"
unzip -oq "$FILE" -d .
bash server-deploy.sh
REMOTE
