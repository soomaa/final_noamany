cd ~/Desktop/nomany_hr/GYM/one80 && \
scp one80-latest-split-payments-20260924.zip root@144.76.74.208:~/ && \
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-latest-split-payments-20260924.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' '5e268528fe2fa8c1ced329d83bd533564c58878215d9737cbc9f5813247ed410' "$FILE" | sha256sum -c -
cd "$APP"
unzip -oq "$FILE" -d .
bash server-deploy.sh
REMOTE
