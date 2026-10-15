#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ARCHIVE=one80-gate-release-20260923.zip
printf '%s  %s\n' '0191a19540ee66417ff373c16ff3a7edb452c3f88d4044b51a82ec79652aec35' "$ARCHIVE" | shasum -a 256 -c -
scp "$ARCHIVE" root@144.76.74.208:~/
ssh root@144.76.74.208 'bash -s' <<'REMOTE'
set -euo pipefail
ARCHIVE="$HOME/one80-gate-release-20260923.zip"
printf '%s  %s\n' '0191a19540ee66417ff373c16ff3a7edb452c3f88d4044b51a82ec79652aec35' "$ARCHIVE" | sha256sum -c -
cd /home/alatheertech/one80.alatheertech.com
unzip -tq "$ARCHIVE"
unzip -oq "$ARCHIVE" -d .
bash server-deploy.sh
curl --fail --silent --show-error http://127.0.0.1:9041/api/health
REMOTE
