#!/usr/bin/env bash
# Runs ON THE SERVER (piped through ssh): check the uploaded 20261125-r2 zip, unzip, start install.sh
# detached, follow it, print its log.
set -u
APP=/home/noamanycenter/final.noamanycenter.com
NAME=noamany-daily-update-20261125-r2
ZIP_SHA=8aea744548fa07418736a298de35af92458d8dd6b2c4b86f8bd05dac85ced61c
LOG=$APP/tmp/install-20261125-r2.log
cd "$APP" || exit 1
[ -f "$NAME.zip" ] || { echo "missing $APP/$NAME.zip (upload it first)"; exit 1; }
[ "$(sha256sum "$NAME.zip" | cut -d' ' -f1)" = "$ZIP_SHA" ] || { echo "the uploaded zip is incomplete or different — nothing was changed"; exit 1; }
if pgrep -f "$NAME/install.sh" >/dev/null; then
  echo "an install is already running; following it"
else
  rm -rf "$NAME"; unzip -oq "$NAME.zip" || { echo "unzip failed"; exit 1; }
  mkdir -p tmp
  nohup setsid bash "$APP/$NAME/install.sh" > "$LOG" 2>&1 < /dev/null &
  sleep 2; echo "installer started; log: $LOG"
fi
for _ in $(seq 1 600); do pgrep -f "$NAME/install.sh" >/dev/null || break; sleep 3; done
echo "=== installer log ==="; cat "$LOG"
