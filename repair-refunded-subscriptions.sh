#!/usr/bin/env bash
# ============================================================================
# ONE80 — close subscriptions that were refunded BEFORE the 2026-09-24 fix.
#
# Old refunds set subscription_end_date = stop_date. Status is derived from dates and the end
# date itself is an active day, so those members could still check in (and burn sessions) on
# the stop date. The fixed code sets end = stop_date − 1 and uses up remaining sessions.
#
# Only touches subscriptions whose end date is still EXACTLY the refund's stop date (i.e. left
# as the old refund wrote them — anything edited afterwards is skipped).
#
#   bash repair-refunded-subscriptions.sh           → report only (no changes)
#   bash repair-refunded-subscriptions.sh --apply   → report, then fix in one transaction
#
# Run from the app folder on the server (reads the DB name from .env, uses the root socket).
# ============================================================================
set -euo pipefail
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

DB=$(grep -oP 'mysql://[^/]+/\K[^"?]+' .env)
[ -n "$DB" ] || { echo "!! couldn't read the DB name from .env"; exit 1; }
MY=(mysql --default-character-set=utf8mb4 "$DB")
TODAY=$(TZ=Africa/Cairo date +%F)

TARGETS="
  SELECT s.id, r.stop_date
  FROM club_subscriptions s
  JOIN (
    SELECT subscription_id, MAX(stop_date) AS stop_date
    FROM club_subscription_refunds
    WHERE status = 'completed'
    GROUP BY subscription_id
  ) r ON r.subscription_id = s.id
  WHERE s.subscription_end_date = r.stop_date
"

echo "==> DB: $DB   (today $TODAY)"
echo "==> Subscriptions left open by an old refund:"
"${MY[@]}" -t -e "
  SELECT s.subscription_number AS sub_no, s.customer_name AS name, t.stop_date,
         IF(t.stop_date >= '$TODAY', 'YES', '-') AS still_open_now,
         IF(s.is_linked_to_sessions, CONCAT(s.sessions_used, '/', s.sessions_count), '-') AS sessions,
         (SELECT COUNT(*) FROM club_attendance a
           WHERE a.subscription_id = s.id AND a.attendance_date >= t.stop_date) AS visits_after_refund
  FROM ($TARGETS) t JOIN club_subscriptions s ON s.id = t.id
  ORDER BY t.stop_date DESC;"

N=$("${MY[@]}" -N -e "SELECT COUNT(*) FROM ($TARGETS) t;")
echo "    total: $N"

if [ "$APPLY" != 1 ]; then
  echo "==> Report only. Re-run with --apply to fix."
  exit 0
fi
[ "$N" -gt 0 ] || { echo "==> Nothing to fix ✅"; exit 0; }

echo "==> Applying…"
"${MY[@]}" -e "
  START TRANSACTION;
  CREATE TEMPORARY TABLE _refund_fix AS $TARGETS;
  UPDATE club_subscriptions s JOIN _refund_fix f ON f.id = s.id
     SET s.subscription_end_date = DATE_FORMAT(DATE_SUB(f.stop_date, INTERVAL 1 DAY), '%Y-%m-%d'),
         s.status = 'expired',
         s.sessions_used = IF(s.is_linked_to_sessions AND s.sessions_count IS NOT NULL,
                              GREATEST(s.sessions_used, s.sessions_count), s.sessions_used);
  SELECT ROW_COUNT() AS fixed;
  COMMIT;"

LEFT=$("${MY[@]}" -N -e "SELECT COUNT(*) FROM ($TARGETS) t;")
echo "    still left open: $LEFT (expected 0)"
[ "$LEFT" = 0 ] && echo "==> Done ✅" || { echo "!! some rows were not fixed"; exit 1; }
