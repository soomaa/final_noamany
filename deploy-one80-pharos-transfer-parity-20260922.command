cd ~/Desktop/nomany_hr/GYM/one80 && \
scp one80-pharos-transfer-parity-20260922.zip root@144.76.74.208:~/ && \
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-pharos-transfer-parity-20260922.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' '8bca9845578216db2c9b432cf988007575b15b6278fffd0df8d892b0cf1b9662' "$FILE" | sha256sum -c -
cd "$APP"
unzip -oq "$FILE" -d .
bash server-deploy.sh
REMOTE
