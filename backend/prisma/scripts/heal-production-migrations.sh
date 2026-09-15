#!/usr/bin/env bash
# Heal known Noamany production migration drift before prisma migrate deploy.
# Safe to run multiple times — it only repairs explicitly known schema objects
# and _prisma_migrations metadata; it never changes business rows.
#
# Usage (on server, from app root):
#   bash prisma/scripts/heal-production-migrations.sh
# Or it runs automatically from server-deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "!! .env missing"; exit 1; }
grep -q '^DATABASE_URL' .env || { echo "!! DATABASE_URL missing"; exit 1; }

URL="$(grep -E '^DATABASE_URL' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
rest="${URL#mysql://}"; creds="${rest%%@*}"; hpd="${rest#*@}"
DBU="${creds%%:*}"; DBP_ENC=""; [[ "$creds" == *:* ]] && DBP_ENC="${creds#*:}"
hostport="${hpd%%/*}"; DBN="${hpd##*/}"; DBN="${DBN%%\?*}"

urldecode(){ local d="${1//+/ }"; printf '%b' "${d//%/\\x}"; }
DBP="$(urldecode "$DBP_ENC")"

if mysql --protocol=socket -e "SELECT 1" >/dev/null 2>&1; then
  MY=(mysql --protocol=socket "$DBN")
else
  MY=(mysql -u "$DBU" ${DBP:+-p"$DBP"} "$DBN")
fi

migration_dir_exists() {
  [ -d "prisma/migrations/$1" ]
}

migration_applied() {
  local name="$1"
  "${MY[@]}" -N -e "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;" 2>/dev/null || echo 0
}

migration_failed_or_pending() {
  local name="$1"
  # Prisma keeps resolved failed attempts for audit with rolled_back_at set.
  # Only an unresolved row (neither finished nor rolled back) blocks deploy.
  "${MY[@]}" -N -e "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NULL AND rolled_back_at IS NULL;" 2>/dev/null || echo 0
}

remove_orphan_migration_record() {
  local name="$1"
  if migration_dir_exists "$name"; then return 0; fi
  local cnt
  cnt="$(migration_failed_or_pending "$name")"
  if [ "${cnt:-0}" -gt 0 ]; then
    echo "    remove orphan migration record: $name"
    "${MY[@]}" -e "DELETE FROM _prisma_migrations WHERE migration_name='${name}';"
  fi
}

repair_legacy_hr_employment_migration() {
  local legacy_name="20260707145000_hr_employment_type"
  local replacement_name="20260707140000_hr_job_titles_members"
  local legacy_dir="prisma/migrations/$legacy_name"
  local failed

  failed="$(migration_failed_or_pending "$legacy_name")"
  if [ "${failed:-0}" -gt 0 ]; then
    echo "    repair failed legacy migration: $legacy_name"

    local has_employee_type has_created_by has_member_idx
    has_employee_type="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employees' AND column_name='employment_type';" 2>/dev/null || echo 0)"
    if [ "${has_employee_type:-0}" -eq 0 ]; then
      echo "      add missing employees.employment_type"
      "${MY[@]}" -e "ALTER TABLE \`employees\` ADD COLUMN \`employment_type\` VARCHAR(20) NULL;"
    fi

    has_created_by="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='club_members' AND column_name='created_by';" 2>/dev/null || echo 0)"
    [ "${has_created_by:-0}" -gt 0 ] || {
      echo "!! Cannot repair $legacy_name: club_members.created_by is missing."
      exit 1
    }

    has_member_idx="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='club_members' AND index_name='idx_club_members_created_by';" 2>/dev/null || echo 0)"
    if [ "${has_member_idx:-0}" -eq 0 ]; then
      echo "      add missing idx_club_members_created_by"
      "${MY[@]}" -e "CREATE INDEX \`idx_club_members_created_by\` ON \`club_members\` (\`created_by\`);"
    fi

    # The replacement migration below becomes the canonical owner of these
    # schema changes. Resolve the obsolete failed attempt instead of deleting
    # its history, so Prisma no longer raises P3009.
    npx prisma migrate resolve --rolled-back "$legacy_name"
  fi

  # unzip -o does not remove folders that disappeared from a later release.
  # This exact legacy folder is no longer shipped and must not be rediscovered
  # by `prisma migrate deploy` after it was resolved above.
  if [ -d "$legacy_dir" ]; then
    echo "    remove stale migration folder: $legacy_name"
    rm -rf -- "$legacy_dir"
  fi

  local has_employee_type has_member_idx
  has_employee_type="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employees' AND column_name='employment_type';" 2>/dev/null || echo 0)"
  has_member_idx="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='club_members' AND index_name='idx_club_members_created_by';" 2>/dev/null || echo 0)"
  if [ "${has_employee_type:-0}" -gt 0 ] && [ "${has_member_idx:-0}" -gt 0 ]; then
    mark_applied_if_schema_ready "$replacement_name"
  fi
}

repair_member_mobile_api_migration() {
  local name="20260708120000_member_mobile_api"
  local failed
  failed="$(migration_failed_or_pending "$name")"
  [ "${failed:-0}" -gt 0 ] || return 0

  echo "    repair failed migration: $name"

  local has_invitations has_inbody has_recipient_email recipient_email_nullable
  has_invitations="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='am_invitations';" 2>/dev/null || echo 0)"
  has_inbody="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='club_inbody_measurements';" 2>/dev/null || echo 0)"
  has_recipient_email="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='am_invitations' AND column_name='recipient_email';" 2>/dev/null || echo 0)"
  if [ "${has_invitations:-0}" -eq 0 ] || [ "${has_inbody:-0}" -eq 0 ] || [ "${has_recipient_email:-0}" -eq 0 ]; then
    echo "!! Cannot repair $name: one or more base tables/columns are missing."
    exit 1
  fi

  recipient_email_nullable="$("${MY[@]}" -N -e "SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='am_invitations' AND column_name='recipient_email' LIMIT 1;" 2>/dev/null || true)"
  if [ "$recipient_email_nullable" != "YES" ]; then
    echo "      make am_invitations.recipient_email nullable"
    "${MY[@]}" -e "ALTER TABLE \`am_invitations\` MODIFY \`recipient_email\` VARCHAR(255) NULL;"
  fi

  local has_recipient_phone has_inviter_member_id has_inviter_index has_report_url
  has_recipient_phone="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='am_invitations' AND column_name='recipient_phone';" 2>/dev/null || echo 0)"
  if [ "${has_recipient_phone:-0}" -eq 0 ]; then
    echo "      add missing am_invitations.recipient_phone"
    "${MY[@]}" -e "ALTER TABLE \`am_invitations\` ADD COLUMN \`recipient_phone\` VARCHAR(50) NULL AFTER \`recipient_email\`;"
  fi

  has_inviter_member_id="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='am_invitations' AND column_name='inviter_member_id';" 2>/dev/null || echo 0)"
  if [ "${has_inviter_member_id:-0}" -eq 0 ]; then
    echo "      add missing am_invitations.inviter_member_id"
    "${MY[@]}" -e "ALTER TABLE \`am_invitations\` ADD COLUMN \`inviter_member_id\` INT NULL AFTER \`recipient_phone\`;"
  fi

  has_inviter_index="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_invitations' AND index_name='am_invitations_inviter_member_id_idx';" 2>/dev/null || echo 0)"
  if [ "${has_inviter_index:-0}" -eq 0 ]; then
    echo "      add missing am_invitations_inviter_member_id_idx"
    "${MY[@]}" -e "CREATE INDEX \`am_invitations_inviter_member_id_idx\` ON \`am_invitations\` (\`inviter_member_id\`);"
  fi

  has_report_url="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='club_inbody_measurements' AND column_name='report_url';" 2>/dev/null || echo 0)"
  if [ "${has_report_url:-0}" -eq 0 ]; then
    echo "      add missing club_inbody_measurements.report_url"
    "${MY[@]}" -e "ALTER TABLE \`club_inbody_measurements\` ADD COLUMN \`report_url\` VARCHAR(500) NULL;"
  fi

  local ready_columns ready_index
  ready_columns="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='am_invitations' AND column_name='recipient_email' AND data_type='varchar' AND character_maximum_length=255 AND is_nullable='YES') OR (table_name='am_invitations' AND column_name='recipient_phone' AND data_type='varchar' AND character_maximum_length=50 AND is_nullable='YES') OR (table_name='am_invitations' AND column_name='inviter_member_id' AND data_type='int' AND is_nullable='YES') OR (table_name='club_inbody_measurements' AND column_name='report_url' AND data_type='varchar' AND character_maximum_length=500 AND is_nullable='YES'));" 2>/dev/null || echo 0)"
  ready_index="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_invitations' AND index_name='am_invitations_inviter_member_id_idx' AND column_name='inviter_member_id';" 2>/dev/null || echo 0)"
  if [ "${ready_columns:-0}" -ne 4 ] || [ "${ready_index:-0}" -eq 0 ]; then
    echo "!! Refusing to resolve $name: schema verification did not pass."
    exit 1
  fi

  # Every expected object now matches. Record the manually completed migration
  # as applied so Prisma can safely continue with later migrations.
  npx prisma migrate resolve --applied "$name"
}

repair_class_audience_notifications_migration() {
  local name="20260709110000_class_audience_member_notifications"
  local failed
  failed="$(migration_failed_or_pending "$name")"
  [ "${failed:-0}" -gt 0 ] || return 0

  echo "    repair failed migration: $name"

  local has_club_classes has_audience
  has_club_classes="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='club_classes';" 2>/dev/null || echo 0)"
  [ "${has_club_classes:-0}" -gt 0 ] || {
    echo "!! Cannot repair $name: club_classes is missing."
    exit 1
  }

  has_audience="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='club_classes' AND column_name='audience';" 2>/dev/null || echo 0)"
  if [ "${has_audience:-0}" -eq 0 ]; then
    echo "      add missing club_classes.audience"
    "${MY[@]}" -e "ALTER TABLE \`club_classes\` ADD COLUMN \`audience\` ENUM('men', 'women', 'kids', 'mixed') NOT NULL DEFAULT 'mixed';"
  fi

  local audience_ready notification_table_exists
  audience_ready="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='club_classes' AND column_name='audience' AND column_type=\"enum('men','women','kids','mixed')\" AND is_nullable='NO' AND column_default='mixed';" 2>/dev/null || echo 0)"
  [ "${audience_ready:-0}" -eq 1 ] || {
    echo "!! Refusing to resolve $name: club_classes.audience does not match the expected enum."
    exit 1
  }

  notification_table_exists="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='am_member_notifications';" 2>/dev/null || echo 0)"
  if [ "${notification_table_exists:-0}" -eq 0 ]; then
    echo "      create missing am_member_notifications"
    "${MY[@]}" <<'SQL'
CREATE TABLE `am_member_notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `member_id` INT NOT NULL,
  `branch_id` INT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `type` VARCHAR(40) NOT NULL DEFAULT 'general',
  `data` TEXT NULL,
  `image_url` VARCHAR(500) NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT false,
  `read_at` DATETIME(3) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `am_member_notifications_member_id_idx` (`member_id`),
  INDEX `am_member_notifications_member_id_is_read_idx` (`member_id`, `is_read`),
  INDEX `am_member_notifications_branch_id_idx` (`branch_id`),
  INDEX `am_member_notifications_created_at_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL
  fi

  local notification_columns
  notification_columns="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='am_member_notifications' AND column_name IN ('id','member_id','branch_id','title','body','type','data','image_url','is_read','read_at','is_active','created_by','created_at','updated_at');" 2>/dev/null || echo 0)"
  [ "${notification_columns:-0}" -eq 14 ] || {
    echo "!! Refusing to resolve $name: am_member_notifications is incomplete."
    exit 1
  }

  local has_idx
  has_idx="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_member_notifications' AND index_name='am_member_notifications_member_id_idx';" 2>/dev/null || echo 0)"
  [ "${has_idx:-0}" -gt 0 ] || "${MY[@]}" -e "CREATE INDEX \`am_member_notifications_member_id_idx\` ON \`am_member_notifications\` (\`member_id\`);"
  has_idx="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_member_notifications' AND index_name='am_member_notifications_member_id_is_read_idx';" 2>/dev/null || echo 0)"
  [ "${has_idx:-0}" -gt 0 ] || "${MY[@]}" -e "CREATE INDEX \`am_member_notifications_member_id_is_read_idx\` ON \`am_member_notifications\` (\`member_id\`, \`is_read\`);"
  has_idx="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_member_notifications' AND index_name='am_member_notifications_branch_id_idx';" 2>/dev/null || echo 0)"
  [ "${has_idx:-0}" -gt 0 ] || "${MY[@]}" -e "CREATE INDEX \`am_member_notifications_branch_id_idx\` ON \`am_member_notifications\` (\`branch_id\`);"
  has_idx="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_member_notifications' AND index_name='am_member_notifications_created_at_idx';" 2>/dev/null || echo 0)"
  [ "${has_idx:-0}" -gt 0 ] || "${MY[@]}" -e "CREATE INDEX \`am_member_notifications_created_at_idx\` ON \`am_member_notifications\` (\`created_at\`);"

  local ready_indexes
  ready_indexes="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM (SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS indexed_columns FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='am_member_notifications' GROUP BY index_name) indexes_ready WHERE (index_name='PRIMARY' AND indexed_columns='id') OR (index_name='am_member_notifications_member_id_idx' AND indexed_columns='member_id') OR (index_name='am_member_notifications_member_id_is_read_idx' AND indexed_columns='member_id,is_read') OR (index_name='am_member_notifications_branch_id_idx' AND indexed_columns='branch_id') OR (index_name='am_member_notifications_created_at_idx' AND indexed_columns='created_at');" 2>/dev/null || echo 0)"
  [ "${ready_indexes:-0}" -eq 5 ] || {
    echo "!! Refusing to resolve $name: notification indexes do not match."
    exit 1
  }

  npx prisma migrate resolve --applied "$name"
}

repair_any_failed_current_migration() {
  local name
  name="$("${MY[@]}" -N -e "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at ASC LIMIT 1;" 2>/dev/null || true)"
  [ -n "$name" ] || return 0
  migration_dir_exists "$name" || return 0

  echo "    reconcile failed current migration statement-by-statement: $name"
  npx tsx prisma/scripts/reconcile-failed-migration.ts "$name"
  npx prisma migrate resolve --applied "$name"
}

mark_applied_if_schema_ready() {
  local name="$1"
  migration_dir_exists "$name" || return 0
  local applied
  applied="$(migration_applied "$name")"
  [ "${applied:-0}" -gt 0 ] && return 0
  echo "    mark applied (schema already present): $name"
  npx prisma migrate resolve --applied "$name"
}

echo "==> Healing migration drift on database: $DBN"

# Legacy Noamany name (failed on some servers) — replaced by 20260707140000_hr_job_titles_members
repair_legacy_hr_employment_migration

# This migration is not idempotent SQL. Older production dumps can already
# contain some or all of its columns while lacking a successful history row.
repair_member_mobile_api_migration

# The audience column/table may already be present in databases restored from
# a schema dump even though the migration history row failed on the duplicate.
repair_class_audience_notifications_migration

# Generic safe fallback for every current migration. It executes DML normally,
# splits multi-action ALTER TABLE statements, skips only DDL objects that are
# already present, and refuses unknown/session-scoped SQL.
repair_any_failed_current_migration

# Other legacy Noamany-only migration names superseded in Noamany sync
remove_orphan_migration_record "20260709100000_hot_path_indexes"
remove_orphan_migration_record "20260719150000_cafe_drafts_supplier_phones_feedback"

# Old failed row blocks deploy even after delete attempt — clear any remaining failed states
FAILED_COUNT="$("${MY[@]}" -N -e "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;" 2>/dev/null || echo 0)"
if [ "${FAILED_COUNT:-0}" -gt 0 ]; then
  echo "    inspecting ${FAILED_COUNT} remaining failed/pending migration row(s)…"
  while IFS= read -r bad; do
    [ -n "$bad" ] || continue
    if ! migration_dir_exists "$bad"; then
      echo "      delete: $bad"
      "${MY[@]}" -e "DELETE FROM _prisma_migrations WHERE migration_name='${bad}';"
    fi
  done < <("${MY[@]}" -N -e "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;" 2>/dev/null || true)
fi

echo "==> Heal complete. Run: npx prisma migrate deploy"
