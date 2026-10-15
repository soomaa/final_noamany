#!/usr/bin/env bash
# Confirms that the member-login endpoint accepts the legacy `username` field.
# A deliberately invalid account must reach authentication and return 401; a
# 400 mentioning "رقم الجوال مطلوب" means the compatibility change is absent.
set -euo pipefail

API_BASE_URL="${1:-http://127.0.0.1:${PORT:-9041}/api}"
RESULT="$(curl -sS --connect-timeout 10 -w $'\n%{http_code}' \
  -X POST "${API_BASE_URL%/}/member/auth/login" \
  -H 'Content-Type: application/json' \
  --data '{"username":"01000000000","password":"not-a-real-password"}')"
STATUS="${RESULT##*$'\n'}"
BODY="${RESULT%$'\n'*}"

if [ "$STATUS" != '401' ]; then
  echo "FAILED: expected HTTP 401 after accepting username, received HTTP $STATUS"
  echo "$BODY"
  exit 1
fi

if [[ "$BODY" == *'رقم الجوال مطلوب'* ]]; then
  echo 'FAILED: server still requires phone and did not accept username.'
  exit 1
fi

echo 'PASS: member login accepts username as the phone-number alias.'
