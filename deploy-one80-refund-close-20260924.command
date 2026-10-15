#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ARCHIVE=one80-refund-close-20260924.zip
REPAIR=repair-refunded-subscriptions.sh
printf '%s  %s\n' '36a97773e17d75a5d6c3c2ac1447276db8c4b2b3cc4fd9894d323cab536b593b' "$ARCHIVE" | shasum -a 256 -c -
printf '%s  %s\n' 'ccd846bf3732b137872c82ece0d914a72f847988f9e2088443ebc8b4e6e27066' "$REPAIR" | shasum -a 256 -c -
scp "$ARCHIVE" "$REPAIR" root@144.76.74.208:~/
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
ARCHIVE="$HOME/one80-refund-close-20260924.zip"
printf '%s  %s\n' '36a97773e17d75a5d6c3c2ac1447276db8c4b2b3cc4fd9894d323cab536b593b' "$ARCHIVE" | sha256sum -c -
printf '%s  %s\n' 'ccd846bf3732b137872c82ece0d914a72f847988f9e2088443ebc8b4e6e27066' "$HOME/repair-refunded-subscriptions.sh" | sha256sum -c -
cd /home/alatheertech/one80.alatheertech.com
unzip -tq "$ARCHIVE"
unzip -oq "$ARCHIVE" -d .
bash server-deploy.sh
curl --fail --silent --show-error http://127.0.0.1:9041/api/health; echo

echo
echo "=== الكود الجديد في dist؟ ==="
grep -rl "تم استرداد هذا الاشتراك وإنهاؤه بالفعل" dist/ | head -1 || { echo "!! الكود الجديد مش موجود في dist"; exit 1; }
pm2 describe one80 | grep -iE "script path|exec cwd|status" || true

echo
echo "=== إصلاح الاشتراكات المستردة القديمة (بعد الباك أب اللي فوق) ==="
bash "$HOME/repair-refunded-subscriptions.sh" --apply
REMOTE
