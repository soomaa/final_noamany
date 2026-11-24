#!/usr/bin/env bash
# Upload and install noamany-hidden-members-fix-20261121 on 144.76.74.208 (Noamany hidden-members hotfix, code only, no database change).
# Runs straight through: checksum → live-file hash check → backup → replace → restart → 3 health checks → rollback on failure.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NAME=noamany-hidden-members-fix-20261121
ZIP="$ROOT/$NAME.zip"
printf '%s  %s\n' '4a889657f4ddadc71ed05c4e059c4cec2e8b410022f5622050187ca34e9dcd5f' "$ZIP" | shasum -a 256 -c -
SOCKET_DIR="$(mktemp -d /tmp/hotfix-ssh.XXXXXXXX)"; chmod 700 "$SOCKET_DIR"; SOCKET="$SOCKET_DIR/control"
SSH_OPTIONS=(-o ConnectTimeout=25 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o PreferredAuthentications=publickey,password,keyboard-interactive -o ControlPath="$SOCKET")
cleanup() { ssh "${SSH_OPTIONS[@]}" -o BatchMode=yes -O exit root@144.76.74.208 >/dev/null 2>&1 || true; rm -f "$SOCKET"; rmdir "$SOCKET_DIR" 2>/dev/null || true; }
trap cleanup EXIT
ssh "${SSH_OPTIONS[@]}" -M -o NumberOfPasswordPrompts=1 -o ControlPersist=600 -fnNT root@144.76.74.208
scp "${SSH_OPTIONS[@]}" -o BatchMode=yes "$ZIP" root@144.76.74.208:~/
ssh "${SSH_OPTIONS[@]}" -o BatchMode=yes root@144.76.74.208 "NAME=$NAME bash -s" <<'REMOTE'
set -euo pipefail
umask 077
ZIP="$HOME/$NAME.zip"; LOG="$HOME/$NAME.log"
echo '4a889657f4ddadc71ed05c4e059c4cec2e8b410022f5622050187ca34e9dcd5f  '"$ZIP" | sha256sum -c -
if [ -f "$LOG" ] && grep -q "^UPDATE VERIFIED" "$LOG"; then tail -n 5 "$LOG"; echo 'This hotfix already succeeded; nothing was run again.'; exit 0; fi
exec 9>"$HOME/$NAME.lock"; flock -n 9 || { echo 'This hotfix is already running; nothing was started.'; exit 0; }
STAGE="$(mktemp -d "$HOME/$NAME.XXXXXX")"; unzip -q "$ZIP" -d "$STAGE"
bash "$STAGE/$NAME/install.sh" 2>&1 | tee "$LOG"
REMOTE
