#!/usr/bin/env bash
# Build ONE80 backend from an empty dist directory while retaining the previous
# compiled application as a rollback. This script never connects to the DB.
set -euo pipefail

APP_DIR="${1:?ONE80 app directory is required}"
SHARED_ROOT="${2:?ONE80 shared directory is required}"
BACKUP_ROOT="$SHARED_ROOT/dist-backups"
STAMP="$(date +%Y%m%d_%H%M%S)"
DIST_BACKUP=""

cd "$APP_DIR"
mkdir -p "$BACKUP_ROOT"

if [ -d dist ]; then
  DIST_BACKUP="$BACKUP_ROOT/dist-before-$STAMP"
  mv dist "$DIST_BACKUP"
  echo "    previous dist retained at: $DIST_BACKUP"
fi

restore_previous_dist() {
  if [ -d dist ]; then
    FAILED_DIST="$BACKUP_ROOT/dist-failed-$STAMP"
    [ ! -e "$FAILED_DIST" ] || FAILED_DIST="$FAILED_DIST-$$"
    mv dist "$FAILED_DIST"
    echo "    failed build retained at: $FAILED_DIST" >&2
  fi
  if [ -n "$DIST_BACKUP" ] && [ -d "$DIST_BACKUP" ]; then
    mv "$DIST_BACKUP" dist
    echo "    previous dist restored." >&2
  fi
}

if ! npm run build; then
  echo "!! backend build failed; restoring the previous dist." >&2
  restore_previous_dist
  exit 1
fi

PROFILE_CONTROLLER="dist/modules/club-members/club-members.controller.js"
ATTENDANCE_CONTROLLER="dist/modules/club-members/club-attendance.controller.js"
if [ ! -f dist/main.js ]; then
  echo "!! backend build produced no dist/main.js; restoring the previous dist." >&2
  restore_previous_dist
  exit 1
fi
if [ ! -f "$PROFILE_CONTROLLER" ] || ! grep -q "profile-summary" "$PROFILE_CONTROLLER"; then
  echo "!! backend build is missing the required profile-summary route; restoring the previous dist." >&2
  restore_previous_dist
  exit 1
fi
if [ ! -f "$ATTENDANCE_CONTROLLER" ] || ! grep -q "subscription-utilization" "$ATTENDANCE_CONTROLLER"; then
  echo "!! backend build is missing the required subscription-utilization route; restoring the previous dist." >&2
  restore_previous_dist
  exit 1
fi

echo "    clean backend build contains profile-summary and subscription-utilization ✅"
