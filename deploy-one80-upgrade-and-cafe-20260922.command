cd ~/Desktop/nomany_hr/GYM/one80 && \
scp one80-upgrade-and-cafe-20260922.zip root@144.76.74.208:~/ && \
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
FILE="$HOME/one80-upgrade-and-cafe-20260922.zip"
APP=/home/alatheertech/one80.alatheertech.com
printf '%s  %s\n' 'e7f0fa51ece9a75d9f113fd06142441d50bd1d693aa17bf74e40baca0fbb3bee' "$FILE" | sha256sum -c -
cd "$APP"
unzip -oq "$FILE" -d .
bash server-deploy.sh
REMOTE
