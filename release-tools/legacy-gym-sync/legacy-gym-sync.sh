#!/usr/bin/env bash
# One-way sync of the gym data: old system (noamanycenter_noamany, still used at the reception)
# -> new system (noamanycenter_nest), so subscriptions, members, payments, freezes, refunds,
# transfers, check-ins, lockers and InBody match the old system. Runs ON THE SERVER as root:
#   bash legacy-gym-sync.sh            # dry run: everything runs inside a transaction that is
#                                      # rolled back, then prints what would be added/changed
#   APPLY=1 bash legacy-gym-sync.sh    # same, committed
#   SECTIONS=points-discounts bash legacy-gym-sync.sh   # only section 11 (discount codes + points)
# install-legacy-gym-sync.sh puts it in cron every 5 minutes (APPLY=1).
# Section 11 copies discount codes, captain code allocations, member code grants, coupon uses,
# earned/redeemed points and the member-profile points ledger; see its own rules below.
#
# Rules
# - Only rows that came from the old system are touched: they are found through
#   legacy_record_mappings (the old-id -> new-id ledger the import wrote). Rows created in the
#   new system are never changed.
# - New old rows are added with fresh ids after the current maximum and recorded in the ledger.
# - Old rows that changed since the last run overwrite their copy in the new system (old wins),
#   for the columns listed in each UPDATE below. Columns a production fix corrected on purpose
#   are left alone (plan branches, member branch, stopped plans: a plan is active only when the
#   old one is active and approved).
# - Nothing is deleted. Old rows that disappeared are only counted in the report.
# - A failure rolls the whole run back; the next run starts again from the same point.
# Not covered: accounting journal entries / fin_revenues for new subscriptions (the subscription,
# receipt and payment-method lines are created, so subscription reports and cash reports match).
set -euo pipefail

O="${OLD_DB:-noamanycenter_noamany}"
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
LOG="${SYNC_LOG:-$APP/tmp/legacy-gym-sync.log}"
LOCK="${SYNC_LOCK:-/run/lock/legacy-gym-sync.lock}"
MYSQL=(mysql --batch --default-character-set=utf8mb4 ${MYSQL_ARGS:-})

# Birth date of a new member, same parser as release-tools/member-dob-fix-20261119 (old birth_date is
# varchar: yyyy-mm-dd, dd-mm-yyyy / dd/mm/yyyy also in Arabic digits, or Unix seconds, negative before
# 1970, saved at UTC or Cairo midnight). Out-of-range or placeholder dates stay empty.
BD="TRIM(s.birth_date)"
BD_ASCII="REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE($BD,'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9')"
BD_PARSED="CASE
  WHEN $BD REGEXP '^-?[0-9]{5,}\$' THEN
    CASE WHEN MOD(CAST($BD AS SIGNED),86400)=0 THEN DATE(DATE_ADD('1970-01-01',INTERVAL CAST($BD AS SIGNED) SECOND))
         ELSE DATE(DATE_ADD('1970-01-01',INTERVAL CAST($BD AS SIGNED)+10800 SECOND)) END
  WHEN $BD_ASCII REGEXP '^[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}\$' THEN STR_TO_DATE(REPLACE($BD_ASCII,'/','-'),'%d-%m-%Y')
  WHEN $BD_ASCII REGEXP '^[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}\$' THEN STR_TO_DATE(REPLACE($BD_ASCII,'/','-'),'%Y-%m-%d')
END"
DOB_SQL="CASE WHEN ($BD_PARSED) BETWEEN '1925-01-01' AND '2024-12-31' AND ($BD_PARSED)<>'1970-01-01'
  THEN DATE_FORMAT(($BD_PARSED),'%Y-%m-%d') END"

[ "$(id -u)" = 0 ] || [ "${LOCAL_TEST:-0}" = 1 ] || { echo "run as root"; exit 1; }
for db in "$O" "$N"; do [[ "$db" =~ ^[A-Za-z0-9_]+$ ]] || { echo "bad database name: $db"; exit 1; }; done
mkdir -p "$(dirname "$LOG")"
if command -v flock >/dev/null; then
  exec 9>"$LOCK"
  flock -n 9 || { echo "another sync is running"; exit 0; }
elif [ "${LOCAL_TEST:-0}" != 1 ]; then
  echo "flock is missing"; exit 1
fi

# The import's ledger key: the source key that mapped the most old subscriptions.
KEY="${SOURCE_KEY:-$("${MYSQL[@]}" --skip-column-names "$N" -e "
  SELECT source_key FROM legacy_record_mappings
  WHERE legacy_table='tbl_subscription_members' AND target_table='club_subscriptions'
  GROUP BY source_key ORDER BY COUNT(*) DESC LIMIT 1")}"
[ -n "$KEY" ] || { echo "no legacy_record_mappings for old subscriptions in $N"; exit 1; }
[[ "$KEY" =~ ^[A-Za-z0-9_:.-]+$ ]] || { echo "unexpected source key: $KEY"; exit 1; }

if [ "${APPLY:-0}" = 1 ]; then END=COMMIT; MODE=apply; else END=ROLLBACK; MODE=dry-run; fi

read -r -d '' SQL <<SQL || true
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION time_zone='+00:00';
SET SESSION group_concat_max_len=1048576;
SET SESSION sql_mode=REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY','');
SET SESSION innodb_lock_wait_timeout=60;
-- Never use ALTER/CREATE INDEX/TRUNCATE below: they commit implicitly and would turn a dry run into a
-- real run. autocommit=0 keeps anything after such a statement uncommitted as a second safety net.
SET SESSION autocommit=0;
START TRANSACTION;

-- One run row for every live sync (legacy_record_mappings.run_id must point at a run).
INSERT INTO legacy_import_runs (source_key,source_database,dump_sha256,status,started_at,notes)
VALUES ('$KEY','$O',SHA2('legacy-gym-sync',256),'live',CURRENT_TIMESTAMP(3),'legacy-gym-sync.sh: continuous old -> new gym sync')
ON DUPLICATE KEY UPDATE completed_at=CURRENT_TIMESTAMP(3);
SET @run=(SELECT id FROM legacy_import_runs WHERE source_key='$KEY' AND dump_sha256=SHA2('legacy-gym-sync',256));
SET @default_branch=(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key='$KEY');
-- The old system saves dates as Cairo midnight (unix seconds); +3h reads them as the Cairo calendar day
-- in summer and winter time. Status is decided against today's date in Cairo.
SET @today_d=DATE_FORMAT(COALESCE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','Africa/Cairo'),UTC_TIMESTAMP()+INTERVAL 2 HOUR),'%Y-%m-%d');

-- Compact copies of the ledger for the joins below.
CREATE TEMPORARY TABLE m_member (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO m_member SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_members' AND target_table='club_members';
CREATE TEMPORARY TABLE m_orphan (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO m_orphan SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='legacy_orphan_members' AND target_table='club_members';
CREATE TEMPORARY TABLE m_type (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO m_type SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_subscription_settings' AND target_table='club_subscription_types';
CREATE TEMPORARY TABLE m_sub (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO m_sub SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_subscription_members' AND target_table='club_subscriptions';
CREATE TEMPORARY TABLE m_receipt (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
-- club_receipts was renumbered after the import (ids now start at 33105), so the ledger's receipt ids
-- point nowhere; the receipt number LEG-SUB-<old id> is the reliable link.
INSERT IGNORE INTO m_receipt SELECT CAST(SUBSTRING(receipt_number,9) AS SIGNED),id FROM club_receipts
  WHERE receipt_number REGEXP '^LEG-SUB-[0-9]+\$';
INSERT IGNORE INTO m_receipt SELECT CAST(l.legacy_id AS SIGNED),l.target_id FROM legacy_record_mappings l
  JOIN club_receipts r ON r.id=l.target_id
  WHERE l.source_key='$KEY' AND l.legacy_table='tbl_subscription_members' AND l.target_table='club_receipts';
-- A record deleted in the new system (merged duplicate member, removed plan or subscription) stays
-- "already synced" (so it is never added back) but is never pointed at or updated again.
UPDATE m_member m LEFT JOIN club_members c ON c.id=m.target_id SET m.target_id=NULL WHERE c.id IS NULL;
UPDATE m_orphan m LEFT JOIN club_members c ON c.id=m.target_id SET m.target_id=NULL WHERE c.id IS NULL;
UPDATE m_type m LEFT JOIN club_subscription_types c ON c.id=m.target_id SET m.target_id=NULL WHERE c.id IS NULL;
UPDATE m_sub m LEFT JOIN club_subscriptions c ON c.id=m.target_id SET m.target_id=NULL WHERE c.id IS NULL;
SQL

read -r -d '' SQL_GYM <<SQL || true
-- ===== 1. Subscription types (tbl_subscription_settings) =====
CREATE TEMPORARY TABLE n_type (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_type (legacy_id) SELECT s.type_id FROM \`$O\`.tbl_subscription_settings s
  LEFT JOIN m_type m ON m.legacy_id=s.type_id WHERE m.legacy_id IS NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_subscription_types);
UPDATE n_type SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_subscription_types
  (id,name,branch_id,apply_to_all_branches,price,days,is_part_of_target,
   invitations_count,inbody_count,is_special_offer,is_for_students,show_in_app,
   notify_customers,notify_on_expiry,wallet_points,offer_validity,
   is_linked_to_sessions,sessions_count,allow_multiple_daily_entries,
   is_linked_to_freeze,freeze_days,includes_spa,spa_count,is_active,created_at,updated_at)
SELECT t.new_id,
  LEFT(COALESCE(NULLIF(TRIM(s.title),''),CONCAT('Legacy package ',s.type_id)),150),
  bm.new_branch_id,IF(s.branch_id_fk IS NULL,1,0),COALESCE(s.price,0),GREATEST(COALESCE(s.num_days,0),1),
  s.target=1,s.invitations_count,s.inbody_count,s.special_offer=1,s.student=1,
  s.app_display=1,s.app_notify=1,s.end_notify=1,s.points,
  IF(s.expire_num_days>0,CAST(s.expire_num_days AS CHAR),NULL),
  s.related_to_hesas=1,s.hesas_nums_days_num,0,s.stopped=1,s.stopped_days_num,
  s.spa=1,s.spa_days_num,s.active='yes' AND s.approved<>2,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
FROM n_type t JOIN \`$O\`.tbl_subscription_settings s ON s.type_id=t.legacy_id
LEFT JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=s.branch_id_fk;
SET @types_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_subscription_settings',CAST(legacy_id AS CHAR),'club_subscription_types',new_id,'mapped' FROM n_type;
INSERT INTO m_type SELECT legacy_id,new_id FROM n_type;

UPDATE club_subscription_types n
JOIN m_type m ON m.target_id=n.id
JOIN \`$O\`.tbl_subscription_settings s ON s.type_id=m.legacy_id
SET n.name=LEFT(COALESCE(NULLIF(TRIM(s.title),''),CONCAT('Legacy package ',s.type_id)),150),
    n.price=COALESCE(s.price,0),
    n.days=GREATEST(COALESCE(s.num_days,0),1),
    n.is_for_students=(s.student=1),
    n.is_special_offer=(s.special_offer=1),
    n.is_linked_to_sessions=(s.related_to_hesas=1),
    n.sessions_count=s.hesas_nums_days_num,
    n.is_linked_to_freeze=(s.stopped=1),
    n.freeze_days=s.stopped_days_num,
    n.includes_spa=(s.spa=1),
    n.spa_count=s.spa_days_num,
    n.invitations_count=s.invitations_count,
    n.inbody_count=s.inbody_count,
    n.is_active=(s.active='yes' AND s.approved<>2),
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE NOT (n.name <=> LEFT(COALESCE(NULLIF(TRIM(s.title),''),CONCAT('Legacy package ',s.type_id)),150))
   OR NOT (n.price <=> CAST(COALESCE(s.price,0) AS DECIMAL(10,2)))
   OR NOT (n.days <=> GREATEST(COALESCE(s.num_days,0),1))
   OR NOT (n.is_for_students <=> (s.student=1))
   OR NOT (n.is_special_offer <=> (s.special_offer=1))
   OR NOT (n.is_linked_to_sessions <=> (s.related_to_hesas=1))
   OR NOT (n.sessions_count <=> s.hesas_nums_days_num)
   OR NOT (n.is_linked_to_freeze <=> (s.stopped=1))
   OR NOT (n.freeze_days <=> s.stopped_days_num)
   OR NOT (n.includes_spa <=> (s.spa=1))
   OR NOT (n.spa_count <=> s.spa_days_num)
   OR NOT (n.invitations_count <=> s.invitations_count)
   OR NOT (n.inbody_count <=> s.inbody_count)
   OR NOT (n.is_active <=> (s.active='yes' AND s.approved<>2));
SET @types_changed=ROW_COUNT();

-- ===== 2. Members (tbl_members) =====
-- An old member whose code already belongs to a member created in the new system is skipped
-- (reported as member_code_clash); the import's phone rules are kept (duplicate phone -> NULL).
-- An old member that is already in the new system under the same code AND the same name, but has
-- no ledger entry (581 such members came in on 2-3 Aug outside the import's ledger), is linked to
-- that member instead of being skipped, so its subscriptions and check-ins can follow it.
CREATE TEMPORARY TABLE linked_member (target_id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO linked_member SELECT target_id FROM m_member WHERE target_id IS NOT NULL;
CREATE TEMPORARY TABLE adopt_member (legacy_id INT PRIMARY KEY, target_id INT UNIQUE) ENGINE=InnoDB;
INSERT IGNORE INTO adopt_member
SELECT s.mem_id,c.id FROM \`$O\`.tbl_members s
  LEFT JOIN m_member m ON m.legacy_id=s.mem_id
  JOIN club_members c ON c.member_code=LEFT(s.m_code,30)
  LEFT JOIN linked_member l ON l.target_id=c.id
  WHERE m.legacy_id IS NULL AND l.target_id IS NULL AND NULLIF(TRIM(s.m_code),'') IS NOT NULL
    AND TRIM(c.name)=TRIM(s.name)
  ORDER BY s.mem_id;
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
SELECT @run,'$KEY','tbl_members',CAST(a.legacy_id AS CHAR),'club_members',a.target_id,'mapped',
  JSON_OBJECT('member_code',s.m_code,'linked_by','legacy-gym-sync: same code and name')
FROM adopt_member a JOIN \`$O\`.tbl_members s ON s.mem_id=a.legacy_id;
INSERT INTO m_member SELECT legacy_id,target_id FROM adopt_member;
SET @members_linked=(SELECT COUNT(*) FROM adopt_member);
CREATE TEMPORARY TABLE n_member (legacy_id INT PRIMARY KEY, new_id INT, phone_rank INT) ENGINE=InnoDB;
INSERT INTO n_member (legacy_id,phone_rank)
SELECT x.mem_id,ROW_NUMBER() OVER (PARTITION BY TRIM(x.phone),x.branch_id_fk ORDER BY x.mem_id) FROM (
  SELECT s.mem_id,s.phone,s.branch_id_fk FROM \`$O\`.tbl_members s
  JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=s.branch_id_fk
  LEFT JOIN m_member m ON m.legacy_id=s.mem_id
  LEFT JOIN club_members c ON c.member_code=LEFT(s.m_code,30)
  WHERE m.legacy_id IS NULL AND c.id IS NULL AND NULLIF(TRIM(s.m_code),'') IS NOT NULL) x;
SET @member_code_clash=(SELECT COUNT(*) FROM \`$O\`.tbl_members s
  LEFT JOIN m_member m ON m.legacy_id=s.mem_id
  JOIN club_members c ON c.member_code=LEFT(s.m_code,30) WHERE m.legacy_id IS NULL);
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_members);
UPDATE n_member SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_members
  (id,member_code,name,phone,email,gender,card_number,date_of_birth,address,marital_status,
   job_title,profile_picture,branch_id,notes,is_active,is_deleted,created_by,created_at,updated_at)
SELECT t.new_id,LEFT(s.m_code,30),LEFT(s.name,200),
  CASE
    WHEN LENGTH(TRIM(s.phone))>20 THEN NULL
    WHEN EXISTS(SELECT 1 FROM club_members cm WHERE cm.phone=TRIM(s.phone) AND cm.branch_id=bm.new_branch_id) THEN NULL
    WHEN t.phone_rank>1 THEN NULL
    ELSE NULLIF(TRIM(s.phone),'')
  END,
  LEFT(NULLIF(TRIM(s.email),''),150),IF(s.gender='F','female','male'),
  LEFT(CAST(s.m_card AS CHAR),30),
  $DOB_SQL,
  NULLIF(TRIM(s.address),''),s.marital_status,LEFT(NULLIF(TRIM(s.job_title),''),120),
  LEFT(NULLIF(NULLIF(TRIM(s.image),'default.png'),''),255),bm.new_branch_id,
  JSON_OBJECT('legacy_table','tbl_members','legacy_id',s.mem_id,'original_phone',s.phone,
    'nationality',s.nationality,'company_name',s.company_name,'height',s.m_length,
    'weight',s.m_weight,'fat_percent',s.fat_percent,'membership_file',s.membership_file,
    'synced_by','legacy-gym-sync'),
  s.active='yes' AND s.blocked='no',0,um.new_user_id,
  COALESCE(s.created,CURRENT_TIMESTAMP(3)),COALESCE(s.updated,s.created,CURRENT_TIMESTAMP(3))
FROM n_member t JOIN \`$O\`.tbl_members s ON s.mem_id=t.legacy_id
JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=s.branch_id_fk
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=s.user_id;
SET @members_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
SELECT @run,'$KEY','tbl_members',CAST(t.legacy_id AS CHAR),'club_members',t.new_id,'mapped',JSON_OBJECT('member_code',s.m_code)
FROM n_member t JOIN \`$O\`.tbl_members s ON s.mem_id=t.legacy_id;
INSERT INTO m_member SELECT legacy_id,new_id FROM n_member;

-- Name, gender and active/blocked follow the old system. The phone follows it too unless the
-- new number already belongs to another member of the same branch.
-- A phone is copied only when exactly one old member has it and no other new member uses it
-- (the import left shared numbers empty the same way).
CREATE TEMPORARY TABLE old_phone_ok (mem_id INT PRIMARY KEY, phone VARCHAR(20) COLLATE utf8mb4_unicode_ci) ENGINE=InnoDB;
INSERT INTO old_phone_ok
SELECT MIN(s.mem_id),TRIM(s.phone) FROM \`$O\`.tbl_members s
WHERE NULLIF(TRIM(s.phone),'') IS NOT NULL AND LENGTH(TRIM(s.phone)) BETWEEN 8 AND 20
GROUP BY TRIM(s.phone) HAVING COUNT(*)=1;
CREATE TEMPORARY TABLE new_phone_owner (phone VARCHAR(20) COLLATE utf8mb4_unicode_ci PRIMARY KEY, n INT, member_id INT) ENGINE=InnoDB;
INSERT INTO new_phone_owner SELECT phone,COUNT(*),MIN(id) FROM club_members WHERE phone IS NOT NULL GROUP BY phone;
UPDATE club_members n
JOIN m_member m ON m.target_id=n.id
JOIN \`$O\`.tbl_members s ON s.mem_id=m.legacy_id
LEFT JOIN old_phone_ok ok ON ok.mem_id=s.mem_id
LEFT JOIN new_phone_owner po ON po.phone=ok.phone
SET n.name=LEFT(s.name,200),
    n.gender=IF(s.gender='F','female','male'),
    -- a member blocked in the new system (is_blocked) stays inactive whatever the old system says
    n.is_active=IF(n.is_blocked=1,n.is_active,(s.active='yes' AND s.blocked='no')),
    n.phone=IF(ok.mem_id IS NOT NULL AND (po.phone IS NULL OR (po.n=1 AND po.member_id=n.id)),ok.phone,n.phone),
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE n.is_deleted=0 AND (
      NOT (n.name <=> LEFT(s.name,200))
   OR NOT (n.gender <=> IF(s.gender='F','female','male'))
   OR NOT (n.is_active <=> IF(n.is_blocked=1,n.is_active,(s.active='yes' AND s.blocked='no')))
   OR (ok.mem_id IS NOT NULL AND (po.phone IS NULL OR (po.n=1 AND po.member_id=n.id)) AND NOT (n.phone <=> ok.phone)));
SET @members_changed=ROW_COUNT();

-- Blocks made on the old system (client, 22 Nov): a member blocked there is flagged as blocked here
-- too (searches show it), with the old reason. Lifted there = lifted here, but only for blocks that
-- came from the old system (blocked_by NULL); a block made in the new system stays.
UPDATE club_members n
JOIN m_member m ON m.target_id=n.id
JOIN \`$O\`.tbl_members s ON s.mem_id=m.legacy_id
LEFT JOIN (SELECT mem_id_fk,MAX(id) id FROM \`$O\`.tbl_members_blocked GROUP BY mem_id_fk) lb ON lb.mem_id_fk=s.mem_id
LEFT JOIN \`$O\`.tbl_members_blocked b ON b.id=lb.id
SET n.is_blocked=1,n.is_active=0,
    n.block_reason=LEFT(COALESCE(NULLIF(TRIM(b.reason),''),'محظور من السيستم القديم'),500),
    n.blocked_at=IF(s.block_date>0,FROM_UNIXTIME(s.block_date),CURRENT_TIMESTAMP(3)),
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE n.is_deleted=0 AND n.is_blocked=0 AND s.blocked='yes';
SET @members_blocked=ROW_COUNT();
UPDATE club_members n
JOIN m_member m ON m.target_id=n.id
JOIN \`$O\`.tbl_members s ON s.mem_id=m.legacy_id
SET n.is_blocked=0,n.block_reason=NULL,n.blocked_at=NULL,n.is_active=(s.active='yes'),
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE n.is_deleted=0 AND n.is_blocked=1 AND n.blocked_by IS NULL AND s.blocked='no';
SET @members_unblocked=ROW_COUNT();

-- ===== 3. Subscriptions (tbl_subscription_members) =====
-- A LEG-S-<id> row that exists without a ledger entry is adopted instead of added twice.
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_subscription_members',CAST(s.subs_id AS CHAR),'club_subscriptions',c.id,'mapped'
FROM \`$O\`.tbl_subscription_members s
JOIN club_subscriptions c ON c.subscription_number=CONCAT('LEG-S-',s.subs_id)
LEFT JOIN m_sub m ON m.legacy_id=s.subs_id WHERE m.legacy_id IS NULL;
INSERT IGNORE INTO m_sub SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_subscription_members' AND target_table='club_subscriptions' AND run_id=@run;

CREATE TEMPORARY TABLE n_sub (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_sub (legacy_id) SELECT s.subs_id FROM \`$O\`.tbl_subscription_members s
  LEFT JOIN m_sub m ON m.legacy_id=s.subs_id
  WHERE m.legacy_id IS NULL AND CAST(s.from_date AS SIGNED)>0 AND CAST(s.date_add AS SIGNED)>0;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_subscriptions);
UPDATE n_sub SET new_id=(@n:=@n+1) ORDER BY legacy_id;

-- Values shared by the insert and the update.
CREATE TEMPORARY TABLE v_sub (PRIMARY KEY (legacy_id)) ENGINE=InnoDB AS
SELECT s.subs_id legacy_id,
  DATE_FORMAT(FROM_UNIXTIME(CAST(s.date_add AS SIGNED)+10800),'%Y-%m-%d') registration_date,
  COALESCE(bm.new_branch_id,@default_branch) branch_id,
  COALESCE(mm.target_id,om.target_id) member_id,
  LEFT(COALESCE(m.name,CONCAT('Legacy member ',s.mem_id_fk)),200) customer_name,
  tm.target_id subscription_type_id,LEFT(st.title,150) subscription_type,
  DATE_FORMAT(FROM_UNIXTIME(CAST(s.from_date AS SIGNED)+10800),'%Y-%m-%d') start_date,
  CASE WHEN CAST(s.to_date AS SIGNED)>0 THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.to_date AS SIGNED)+10800),'%Y-%m-%d')
       ELSE DATE_FORMAT(FROM_UNIXTIME(CAST(s.from_date AS SIGNED)+10800),'%Y-%m-%d') END end_date,
  CAST(COALESCE(s.price,0) AS DECIMAL(10,2)) value,
  (COALESCE(s.discount_value,0)>0 OR COALESCE(s.discount_percent,0)>0) discount_enabled,
  CAST(COALESCE(s.discount_value,0) AS DECIMAL(10,2)) discount_value,
  CAST(COALESCE(s.paid,0) AS DECIMAL(10,2)) paid,
  CAST(COALESCE(s.remain,0) AS DECIMAL(10,2)) remain,
  em.new_employee_id employee_id,
  IF(s.pay_method=2,'card','cash') payment_method,
  LEFT(CAST(s.rkm_esal AS CHAR),30) receipt_number,
  CASE WHEN s.stopped_subscription=1 THEN 'frozen'
       WHEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.from_date AS SIGNED)+10800),'%Y-%m-%d')>@today_d THEN 'upcoming'
       WHEN (CASE WHEN CAST(s.to_date AS SIGNED)>0 THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.to_date AS SIGNED)+10800),'%Y-%m-%d')
                  ELSE DATE_FORMAT(FROM_UNIXTIME(CAST(s.from_date AS SIGNED)+10800),'%Y-%m-%d') END)<@today_d THEN 'expired'
       ELSE 'active' END status,
  s.private=1 is_special,COALESCE(st.related_to_hesas,0)=1 linked,st.hesas_nums_days_num sessions,
  um.new_user_id created_by,
  COALESCE(s.created_at,CURRENT_TIMESTAMP(3)) created_at,
  COALESCE(s.updated_at,s.created_at,CURRENT_TIMESTAMP(3)) updated_at,
  s.rkm_esal legacy_receipt,s.pay_method legacy_pay
FROM \`$O\`.tbl_subscription_members s
LEFT JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=s.branch_id_fk
LEFT JOIN \`$O\`.tbl_members m ON m.mem_id=s.mem_id_fk
LEFT JOIN \`$O\`.tbl_subscription_settings st ON st.type_id=s.subscription_type_fk
LEFT JOIN m_member mm ON mm.legacy_id=s.mem_id_fk
LEFT JOIN m_orphan om ON om.legacy_id=s.mem_id_fk
LEFT JOIN m_type tm ON tm.legacy_id=s.subscription_type_fk
LEFT JOIN legacy_employee_mappings em ON em.source_key='$KEY' AND em.legacy_id=s.emp_id_fk
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=s.user_id
WHERE CAST(s.from_date AS SIGNED)>0 AND CAST(s.date_add AS SIGNED)>0;
-- A ledger member that was deleted in the new system (duplicates merged, 26 orphan placeholders)
-- is not a member any more: the subscription keeps the member it has in the new system.
UPDATE v_sub v LEFT JOIN club_members c ON c.id=v.member_id SET v.member_id=NULL
WHERE v.member_id IS NOT NULL AND c.id IS NULL;

INSERT INTO club_subscriptions
  (id,subscription_number,registration_date,branch_id,member_id,customer_name,
   subscription_type_id,subscription_type,subscription_start_date,subscription_end_date,
   subscription_value,discount_enabled,discount_value,paid_amount,remaining_amount,
   employee_id,payment_method,receipt_number,status,is_special,is_linked_to_sessions,
   sessions_count,created_by,created_at,updated_at)
SELECT t.new_id,CONCAT('LEG-S-',v.legacy_id),v.registration_date,v.branch_id,v.member_id,v.customer_name,
  v.subscription_type_id,v.subscription_type,v.start_date,v.end_date,v.value,v.discount_enabled,
  v.discount_value,v.paid,v.remain,v.employee_id,v.payment_method,v.receipt_number,v.status,
  v.is_special,v.linked,v.sessions,v.created_by,v.created_at,v.updated_at
FROM n_sub t JOIN v_sub v ON v.legacy_id=t.legacy_id;
SET @subs_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_subscription_members',CAST(legacy_id AS CHAR),'club_subscriptions',new_id,'mapped' FROM n_sub;
INSERT INTO m_sub SELECT legacy_id,new_id FROM n_sub;

UPDATE club_subscriptions n
JOIN m_sub m ON m.target_id=n.id
JOIN v_sub v ON v.legacy_id=m.legacy_id
SET n.registration_date=v.registration_date,
    n.member_id=COALESCE(v.member_id,n.member_id),
    n.customer_name=v.customer_name,
    n.subscription_type_id=COALESCE(v.subscription_type_id,n.subscription_type_id),
    n.subscription_type=COALESCE(v.subscription_type,n.subscription_type),
    n.subscription_start_date=v.start_date,
    n.subscription_end_date=v.end_date,
    n.subscription_value=v.value,
    n.discount_enabled=v.discount_enabled,
    n.discount_value=v.discount_value,
    n.paid_amount=v.paid,
    n.remaining_amount=v.remain,
    n.employee_id=COALESCE(v.employee_id,n.employee_id),
    n.payment_method=v.payment_method,
    n.status=v.status,
    n.is_special=v.is_special,
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE NOT (n.registration_date <=> v.registration_date)
   OR NOT (n.member_id <=> COALESCE(v.member_id,n.member_id))
   OR NOT (n.customer_name <=> v.customer_name)
   OR NOT (n.subscription_type_id <=> COALESCE(v.subscription_type_id,n.subscription_type_id))
   OR NOT (n.subscription_type <=> COALESCE(v.subscription_type,n.subscription_type))
   OR NOT (n.subscription_start_date <=> v.start_date)
   OR NOT (n.subscription_end_date <=> v.end_date)
   OR NOT (n.subscription_value <=> v.value)
   OR NOT (n.discount_enabled <=> v.discount_enabled)
   OR NOT (n.discount_value <=> v.discount_value)
   OR NOT (n.paid_amount <=> v.paid)
   OR NOT (n.remaining_amount <=> v.remain)
   OR NOT (n.employee_id <=> COALESCE(v.employee_id,n.employee_id))
   OR NOT (n.payment_method <=> v.payment_method)
   OR NOT (n.status <=> v.status)
   OR NOT (n.is_special <=> v.is_special);
SET @subs_changed=ROW_COUNT();

-- ===== 4. Subscription receipts: one LEG-SUB-<id> receipt per old subscription with paid > 0 =====
CREATE TEMPORARY TABLE n_receipt (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_receipt (legacy_id) SELECT v.legacy_id FROM v_sub v
  JOIN m_sub ms ON ms.legacy_id=v.legacy_id
  LEFT JOIN m_receipt mr ON mr.legacy_id=v.legacy_id
  LEFT JOIN club_receipts r ON r.receipt_number=CONCAT('LEG-SUB-',v.legacy_id)
  WHERE v.paid>0 AND mr.legacy_id IS NULL AND r.id IS NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_receipts);
UPDATE n_receipt SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_receipts
  (id,receipt_number,subscription_id,member_id,member_name,branch_id,amount,type,
   payment_method,receipt_date,status,description,created_by,created_at,updated_at)
SELECT t.new_id,CONCAT('LEG-SUB-',v.legacy_id),cs.id,cs.member_id,
  LEFT(COALESCE(NULLIF(cs.customer_name,''),CONCAT('Legacy member ',v.legacy_id)),200),
  cs.branch_id,v.paid,'اشتراك',v.payment_method,cs.registration_date,'مدفوعة',
  JSON_OBJECT('legacy_table','tbl_subscription_members','legacy_subscription_id',v.legacy_id,
    'legacy_receipt_number',v.legacy_receipt,'legacy_pay_method',v.legacy_pay,'synced_by','legacy-gym-sync'),
  cs.created_by,v.created_at,v.updated_at
FROM n_receipt t JOIN v_sub v ON v.legacy_id=t.legacy_id
JOIN m_sub ms ON ms.legacy_id=v.legacy_id JOIN club_subscriptions cs ON cs.id=ms.target_id;
SET @receipts_added=ROW_COUNT();
INSERT INTO club_receipt_payments (receipt_id,method,amount,created_at)
SELECT t.new_id,v.payment_method,v.paid,v.created_at FROM n_receipt t JOIN v_sub v ON v.legacy_id=t.legacy_id;
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_subscription_members',CAST(legacy_id AS CHAR),'club_receipts',new_id,'mapped' FROM n_receipt;
INSERT INTO m_receipt SELECT legacy_id,new_id FROM n_receipt;

-- Paid amount or method changed in the old system: the receipt and its single payment line follow.
-- A receipt whose old subscription is now unpaid is marked ملغاة (reports count paid receipts only).
UPDATE club_receipts r
JOIN m_receipt mr ON mr.target_id=r.id
JOIN v_sub v ON v.legacy_id=mr.legacy_id
SET r.amount=IF(v.paid>0,v.paid,r.amount),
    r.payment_method=v.payment_method,
    r.status=IF(v.paid>0,'مدفوعة','ملغاة'),
    -- the import wrote every old date one day early (UTC instead of Cairo); the receipt keeps the
    -- subscription's registration day, as in the old system
    r.receipt_date=v.registration_date,
    r.updated_at=CURRENT_TIMESTAMP(3)
WHERE (v.paid>0 AND (NOT (r.amount <=> v.paid) OR NOT (r.payment_method <=> v.payment_method) OR r.status<>'مدفوعة'))
   OR (v.paid<=0 AND r.status<>'ملغاة')
   OR NOT (r.receipt_date <=> v.registration_date);
SET @receipts_changed=ROW_COUNT();
CREATE TEMPORARY TABLE single_line (receipt_id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO single_line SELECT p.receipt_id FROM club_receipt_payments p
  JOIN m_receipt mr ON mr.target_id=p.receipt_id GROUP BY p.receipt_id HAVING COUNT(*)=1;
UPDATE club_receipt_payments p
JOIN single_line sl ON sl.receipt_id=p.receipt_id
JOIN m_receipt mr ON mr.target_id=p.receipt_id
JOIN v_sub v ON v.legacy_id=mr.legacy_id
SET p.amount=v.paid,p.method=v.payment_method
WHERE v.paid>0 AND (NOT (p.amount <=> v.paid) OR NOT (p.method <=> v.payment_method));

-- ===== 5. Freezes (tbl_stopped_subscription) =====
CREATE TEMPORARY TABLE m_freeze (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO m_freeze SELECT CAST(legacy_id AS SIGNED),COALESCE(target_id,0) FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_stopped_subscription';
CREATE TEMPORARY TABLE n_freeze (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_freeze (legacy_id) SELECT f.stop_id FROM \`$O\`.tbl_stopped_subscription f
  JOIN m_sub ms ON ms.legacy_id=f.subscription_id_fk
  LEFT JOIN m_freeze m ON m.legacy_id=f.stop_id WHERE m.legacy_id IS NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_subscription_freezes);
UPDATE n_freeze SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_subscription_freezes
  (id,subscription_id,freeze_start_date,freeze_end_date,planned_days,actual_days,
   original_end_date,reason,is_active,branch_id,created_by,created_at,updated_at)
SELECT t.new_id,cs.id,
  DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_from AS SIGNED)+10800),'%Y-%m-%d'),
  DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_to AS SIGNED)+10800),'%Y-%m-%d'),
  GREATEST(COALESCE(f.stoped_days_writen,0),0),GREATEST(COALESCE(f.stoped_days_writen,0),0),
  cs.subscription_end_date,NULLIF(TRIM(f.stopped_reason),''),
  s.stopped_subscription=1 AND f.stop_id=(SELECT MAX(f2.stop_id) FROM \`$O\`.tbl_stopped_subscription f2 WHERE f2.subscription_id_fk=f.subscription_id_fk),
  cs.branch_id,um.new_user_id,
  COALESCE(FROM_UNIXTIME(CAST(f.date_added AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3)),
  COALESCE(FROM_UNIXTIME(CAST(f.date_added AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3))
FROM n_freeze t JOIN \`$O\`.tbl_stopped_subscription f ON f.stop_id=t.legacy_id
JOIN \`$O\`.tbl_subscription_members s ON s.subs_id=f.subscription_id_fk
JOIN m_sub ms ON ms.legacy_id=f.subscription_id_fk JOIN club_subscriptions cs ON cs.id=ms.target_id
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=f.user_id;
SET @freezes_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_stopped_subscription',CAST(legacy_id AS CHAR),'club_subscription_freezes',new_id,'mapped' FROM n_freeze;
INSERT INTO m_freeze SELECT legacy_id,new_id FROM n_freeze;

UPDATE club_subscription_freezes n
JOIN m_freeze m ON m.target_id=n.id
JOIN \`$O\`.tbl_stopped_subscription f ON f.stop_id=m.legacy_id
JOIN \`$O\`.tbl_subscription_members s ON s.subs_id=f.subscription_id_fk
SET n.freeze_start_date=DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_from AS SIGNED)+10800),'%Y-%m-%d'),
    n.freeze_end_date=DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_to AS SIGNED)+10800),'%Y-%m-%d'),
    n.planned_days=GREATEST(COALESCE(f.stoped_days_writen,0),0),
    n.actual_days=GREATEST(COALESCE(f.stoped_days_writen,0),0),
    n.is_active=(s.stopped_subscription=1 AND f.stop_id=(SELECT MAX(f2.stop_id) FROM \`$O\`.tbl_stopped_subscription f2 WHERE f2.subscription_id_fk=f.subscription_id_fk)),
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE NOT (n.freeze_start_date <=> DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_from AS SIGNED)+10800),'%Y-%m-%d'))
   OR NOT (n.freeze_end_date <=> DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_to AS SIGNED)+10800),'%Y-%m-%d'))
   OR NOT (n.planned_days <=> GREATEST(COALESCE(f.stoped_days_writen,0),0))
   OR NOT (n.is_active <=> (s.stopped_subscription=1 AND f.stop_id=(SELECT MAX(f2.stop_id) FROM \`$O\`.tbl_stopped_subscription f2 WHERE f2.subscription_id_fk=f.subscription_id_fk)));
SET @freezes_changed=ROW_COUNT();

-- ===== 6. Refunds (tbl_subscription_hadback) =====
CREATE TEMPORARY TABLE n_refund (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_refund (legacy_id) SELECT h.id FROM \`$O\`.tbl_subscription_hadback h
  JOIN m_sub ms ON ms.legacy_id=h.subs_id_fk
  LEFT JOIN legacy_record_mappings lm ON lm.source_key='$KEY' AND lm.legacy_table='tbl_subscription_hadback'
   AND lm.legacy_id=CAST(h.id AS CHAR) AND lm.target_table='club_subscription_refunds'
  LEFT JOIN club_subscription_refunds r ON r.invoice_number=CONCAT('LEG-REF-',h.id)
  WHERE lm.id IS NULL AND r.id IS NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_subscription_refunds);
UPDATE n_refund SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_subscription_refunds
  (id,subscription_id,member_id,customer_name,subscription_type,original_start_date,
   original_end_date,stop_date,remaining_days,original_value,daily_rate,refund_amount,
   invoice_number,refund_date,reason,notes,status,branch_id,created_by,created_at)
SELECT t.new_id,cs.id,cs.member_id,cs.customer_name,cs.subscription_type,
  cs.subscription_start_date,cs.subscription_end_date,h.hadback_date,
  GREATEST(DATEDIFF(cs.subscription_end_date,h.hadback_date),0),cs.subscription_value,
  CASE WHEN DATEDIFF(cs.subscription_end_date,cs.subscription_start_date)+1>0
    THEN cs.subscription_value/(DATEDIFF(cs.subscription_end_date,cs.subscription_start_date)+1) ELSE 0 END,
  h.hadback_value,CONCAT('LEG-REF-',h.id),h.hadback_date,NULLIF(TRIM(h.notes),''),
  JSON_OBJECT('legacy_hadback_type',h.hadback_type,'legacy_subscription_id',h.subs_id_fk,'synced_by','legacy-gym-sync'),
  'completed',COALESCE(bm.new_branch_id,cs.branch_id),um.new_user_id,
  COALESCE(FROM_UNIXTIME(CAST(h.date AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3))
FROM n_refund t JOIN \`$O\`.tbl_subscription_hadback h ON h.id=t.legacy_id
JOIN m_sub ms ON ms.legacy_id=h.subs_id_fk JOIN club_subscriptions cs ON cs.id=ms.target_id
LEFT JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=h.branch_id_fk
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=h.publisher;
SET @refunds_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_subscription_hadback',CAST(legacy_id AS CHAR),'club_subscription_refunds',new_id,'mapped' FROM n_refund;

-- ===== 7. Member transfers (tbl_transformation, type subscription) =====
CREATE TEMPORARY TABLE n_transfer (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_transfer (legacy_id) SELECT t.id FROM \`$O\`.tbl_transformation t
  JOIN m_sub ms ON ms.legacy_id=t.subscription_id_fk
  LEFT JOIN legacy_record_mappings lm ON lm.source_key='$KEY' AND lm.legacy_table='tbl_transformation'
   AND lm.legacy_id=CAST(t.id AS CHAR) AND lm.target_table='club_subscription_transfers'
  WHERE t.type='subscription' AND lm.id IS NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_subscription_transfers);
UPDATE n_transfer SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_subscription_transfers
  (id,subscription_id,member_id,customer_name,from_subscription_type,to_subscription_type,
   from_start_date,from_end_date,to_start_date,to_end_date,from_value,to_value,
   transfer_date,reason,branch_id,created_by,created_at)
SELECT x.new_id,cs.id,COALESCE(mm.target_id,cs.member_id),
  LEFT(COALESCE(m.name,t.to_member,cs.customer_name),200),cs.subscription_type,
  LEFT(COALESCE(st.title,cs.subscription_type),150),cs.subscription_start_date,
  cs.subscription_end_date,cs.subscription_start_date,cs.subscription_end_date,
  cs.subscription_value,cs.subscription_value,t.date,
  CONCAT('Legacy member transfer: ',t.from_member,' -> ',t.to_member,
    IF(NULLIF(TRIM(t.tahwel_reason),'') IS NULL,'',CONCAT('; reason=',t.tahwel_reason))),
  COALESCE(bm.new_branch_id,cs.branch_id),um.new_user_id,
  COALESCE(FROM_UNIXTIME(CAST(t.date_s AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3))
FROM n_transfer x JOIN \`$O\`.tbl_transformation t ON t.id=x.legacy_id
JOIN m_sub ms ON ms.legacy_id=t.subscription_id_fk JOIN club_subscriptions cs ON cs.id=ms.target_id
LEFT JOIN \`$O\`.tbl_members m ON BINARY m.m_code=BINARY t.to_member
LEFT JOIN m_member mm ON mm.legacy_id=m.mem_id
LEFT JOIN \`$O\`.tbl_subscription_settings st ON st.type_id=t.eshtrak_type
LEFT JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=t.branch_id_fk
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=t.publisher;
SET @transfers_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_transformation',CAST(legacy_id AS CHAR),'club_subscription_transfers',new_id,'mapped' FROM n_transfer;

-- ===== 8. Check-ins (tbl_hdoor_classes, type eshtrak); other types are recorded as archived =====
-- Check-ins are only ever added, so only ids after the last synced one are looked at
-- (with a margin for rows the old system saved late).
SET @att_from=(SELECT COALESCE(MAX(CAST(legacy_id AS SIGNED)),0)-20000 FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_hdoor_classes');
CREATE TEMPORARY TABLE m_att (legacy_id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO m_att SELECT CAST(legacy_id AS SIGNED) FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_hdoor_classes' AND CAST(legacy_id AS SIGNED)>@att_from;
CREATE TEMPORARY TABLE n_att (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_att (legacy_id) SELECT h.hodoor_id FROM \`$O\`.tbl_hdoor_classes h
  JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=h.branch_id_fk
  LEFT JOIN m_att m ON m.legacy_id=h.hodoor_id
  LEFT JOIN m_member am ON am.legacy_id=h.member_id
  LEFT JOIN m_orphan ao ON ao.legacy_id=h.member_id
  WHERE h.hodoor_id>@att_from AND h.type='eshtrak' AND m.legacy_id IS NULL
    -- a check-in needs its member; one whose member is not in the new system yet waits for a later run
    AND COALESCE(am.target_id,ao.target_id) IS NOT NULL;
SET @checkins_waiting=(SELECT COUNT(*) FROM \`$O\`.tbl_hdoor_classes h
  JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=h.branch_id_fk
  LEFT JOIN m_att m ON m.legacy_id=h.hodoor_id
  LEFT JOIN m_member am ON am.legacy_id=h.member_id
  LEFT JOIN m_orphan ao ON ao.legacy_id=h.member_id
  WHERE h.hodoor_id>@att_from AND h.type='eshtrak' AND m.legacy_id IS NULL
    AND COALESCE(am.target_id,ao.target_id) IS NULL);
-- The old system's check-in time is Cairo wall-clock; the new system stores UTC (the app adds Cairo's
-- offset when it shows it), so it is converted here (client, 25 Nov: synced check-ins showed 2 hours late).
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_attendance);
UPDATE n_att SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_attendance
  (id,member_id,member_code,member_name,subscription_id,subscription_type,branch_id,
   check_in_time,attendance_date,status,notes,created_by,created_at)
SELECT t.new_id,COALESCE(mm.target_id,om.target_id),
  LEFT(COALESCE(m.m_code,h.member_code,CONCAT('ORPH-L',h.member_id)),30),
  LEFT(COALESCE(m.name,CONCAT('Legacy member ',h.member_id)),200),sm.target_id,LEFT(st.title,150),
  bm.new_branch_id,
  COALESCE(CONVERT_TZ(TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)+10800)),COALESCE(h.hdoor_time_24,'00:00:00')),'Africa/Cairo','+00:00'),TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)+10800)),COALESCE(h.hdoor_time_24,'00:00:00')) - INTERVAL 2 HOUR),
  DATE_FORMAT(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)+10800),'%Y-%m-%d'),'checked_in',
  CONCAT('Imported from tbl_hdoor_classes.hodoor_id=',h.hodoor_id),um.new_user_id,
  COALESCE(CONVERT_TZ(TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)+10800)),COALESCE(h.hdoor_time_24,'00:00:00')),'Africa/Cairo','+00:00'),TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)+10800)),COALESCE(h.hdoor_time_24,'00:00:00')) - INTERVAL 2 HOUR)
FROM n_att t JOIN \`$O\`.tbl_hdoor_classes h ON h.hodoor_id=t.legacy_id
LEFT JOIN \`$O\`.tbl_members m ON m.mem_id=h.member_id
JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=h.branch_id_fk
LEFT JOIN m_member mm ON mm.legacy_id=h.member_id
LEFT JOIN m_orphan om ON om.legacy_id=h.member_id
LEFT JOIN m_sub sm ON sm.legacy_id=h.subs_id
LEFT JOIN \`$O\`.tbl_subscription_settings st ON st.type_id=h.subscription_type_fk
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=h.user_id;
SET @checkins_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
SELECT @run,'$KEY','tbl_hdoor_classes',CAST(legacy_id AS CHAR),'club_attendance',new_id,'mapped',JSON_OBJECT('legacy_type','eshtrak') FROM n_att;
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
SELECT @run,'$KEY','tbl_hdoor_classes',CAST(h.hodoor_id AS CHAR),'legacy_archive',NULL,'archived_only',
  JSON_OBJECT('legacy_type',COALESCE(h.type,''),'reason','no faithful canonical attendance target')
FROM \`$O\`.tbl_hdoor_classes h LEFT JOIN m_att m ON m.legacy_id=h.hodoor_id
WHERE h.hodoor_id>@att_from AND COALESCE(h.type,'')<>'eshtrak' AND m.legacy_id IS NULL;

-- ===== 9. Locker subscriptions (tbl_locker_subscription) =====
CREATE TEMPORARY TABLE m_locker_sub (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO m_locker_sub SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_locker_subscription' AND target_table='club_locker_subscriptions';
CREATE TEMPORARY TABLE n_locker_sub (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_locker_sub (legacy_id) SELECT s.id FROM \`$O\`.tbl_locker_subscription s
  JOIN \`$O\`.tbl_members m ON m.m_code=s.member_code
  JOIN m_member mm ON mm.legacy_id=m.mem_id
  JOIN legacy_record_mappings tm ON tm.source_key='$KEY' AND tm.legacy_table='tbl_locker_types' AND tm.legacy_id=CAST(s.subscription_type AS CHAR) AND tm.target_table='club_locker_subscription_types'
  JOIN legacy_record_mappings lk ON lk.source_key='$KEY' AND lk.legacy_table='tbl_locker_number' AND lk.legacy_id=CAST(s.number_locker_id_fk AS CHAR) AND lk.target_table='club_lockers'
  JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=s.sub_branch_id_fk
  -- the locker type, the locker and the member must still exist in the new system (some were deleted there)
  JOIN club_locker_subscription_types ct ON ct.id=tm.target_id
  JOIN club_lockers cl ON cl.id=lk.target_id
  LEFT JOIN m_locker_sub ml ON ml.legacy_id=s.id
  LEFT JOIN club_locker_subscriptions x ON x.subscription_number=CONCAT('LEG-L-',s.id)
  WHERE ml.legacy_id IS NULL AND x.id IS NULL AND mm.target_id IS NOT NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_locker_subscriptions);
UPDATE n_locker_sub SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_locker_subscriptions
  (id,subscription_number,main_branch_id,sub_branch_id,member_id,customer_name,
   subscription_type_id,subscription_days,subscription_start_date,subscription_end_date,
   subscription_value,discount_enabled,discount_value,paid_amount,locker_id,payment_method,
   gender,recommended_employee_id,receipt_number,status,created_by,created_at,updated_at)
SELECT x.new_id,CONCAT('LEG-L-',s.id),bm.new_branch_id,bm.new_branch_id,mm.target_id,
  LEFT(m.name,200),tm.target_id,t.num_days_of_locker,
  LEFT(s.from_date,10),LEFT(s.to_date,10),s.locker_cost,
  COALESCE(s.discount_value,0)>0,COALESCE(s.discount_value,0),COALESCE(s.paid,0),lk.target_id,
  IF(s.pay_method=2,'card','cash'),IF(s.male_or_female=0,'female','male'),
  em.new_employee_id,LEFT(CAST(s.rkm_esal AS CHAR),30),
  CASE WHEN LEFT(s.from_date,10)>@today_d THEN 'upcoming'
       WHEN LEFT(s.to_date,10)<@today_d THEN 'expired' ELSE 'active' END,
  um.new_user_id,TIMESTAMP(DATE(FROM_UNIXTIME(CAST(s.date AS SIGNED)+10800)),COALESCE(s.time,'00:00:00')),
  TIMESTAMP(DATE(FROM_UNIXTIME(CAST(s.date AS SIGNED)+10800)),COALESCE(s.time,'00:00:00'))
FROM n_locker_sub x JOIN \`$O\`.tbl_locker_subscription s ON s.id=x.legacy_id
JOIN \`$O\`.tbl_members m ON m.m_code=s.member_code
JOIN \`$O\`.tbl_locker_types t ON t.id=s.subscription_type
JOIN legacy_branch_mappings bm ON bm.source_key='$KEY' AND bm.legacy_id=s.sub_branch_id_fk
JOIN m_member mm ON mm.legacy_id=m.mem_id
JOIN legacy_record_mappings tm ON tm.source_key='$KEY' AND tm.legacy_table='tbl_locker_types' AND tm.legacy_id=CAST(s.subscription_type AS CHAR) AND tm.target_table='club_locker_subscription_types'
JOIN legacy_record_mappings lk ON lk.source_key='$KEY' AND lk.legacy_table='tbl_locker_number' AND lk.legacy_id=CAST(s.number_locker_id_fk AS CHAR) AND lk.target_table='club_lockers'
LEFT JOIN legacy_employee_mappings em ON em.source_key='$KEY' AND em.legacy_id=s.captain_id
LEFT JOIN legacy_user_mappings um ON um.source_key='$KEY' AND um.legacy_id=s.publisher;
SET @lockers_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_locker_subscription',CAST(legacy_id AS CHAR),'club_locker_subscriptions',new_id,'mapped' FROM n_locker_sub;
INSERT INTO m_locker_sub SELECT legacy_id,new_id FROM n_locker_sub;

UPDATE club_locker_subscriptions n
JOIN m_locker_sub ml ON ml.target_id=n.id
JOIN \`$O\`.tbl_locker_subscription s ON s.id=ml.legacy_id
SET n.subscription_start_date=LEFT(s.from_date,10),
    n.subscription_end_date=LEFT(s.to_date,10),
    n.subscription_value=s.locker_cost,
    n.paid_amount=COALESCE(s.paid,0),
    n.payment_method=IF(s.pay_method=2,'card','cash'),
    n.status=CASE WHEN LEFT(s.from_date,10)>@today_d THEN 'upcoming' WHEN LEFT(s.to_date,10)<@today_d THEN 'expired' ELSE 'active' END,
    n.updated_at=CURRENT_TIMESTAMP(3)
WHERE NOT (n.subscription_start_date <=> LEFT(s.from_date,10))
   OR NOT (n.subscription_end_date <=> LEFT(s.to_date,10))
   OR NOT (n.subscription_value <=> CAST(s.locker_cost AS DECIMAL(10,2)))
   OR NOT (n.paid_amount <=> CAST(COALESCE(s.paid,0) AS DECIMAL(10,2)))
   OR NOT (n.payment_method <=> IF(s.pay_method=2,'card','cash'))
   OR NOT (n.status <=> CASE WHEN LEFT(s.from_date,10)>@today_d THEN 'upcoming' WHEN LEFT(s.to_date,10)<@today_d THEN 'expired' ELSE 'active' END);
SET @lockers_changed=ROW_COUNT();
UPDATE club_lockers l SET is_available=NOT EXISTS(
  SELECT 1 FROM club_locker_subscriptions s WHERE s.locker_id=l.id AND s.status='active')
WHERE EXISTS(SELECT 1 FROM legacy_record_mappings m WHERE m.source_key='$KEY' AND m.target_table='club_lockers' AND m.target_id=l.id);

-- ===== 10. InBody (tbl_inbody) =====
CREATE TEMPORARY TABLE n_inbody (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO n_inbody (legacy_id) SELECT i.id FROM \`$O\`.tbl_inbody i
  LEFT JOIN legacy_record_mappings lm ON lm.source_key='$KEY' AND lm.legacy_table='tbl_inbody'
   AND lm.legacy_id=CAST(i.id AS CHAR) AND lm.target_table='club_inbody_measurements'
  LEFT JOIN m_member mm ON mm.legacy_id=i.mem_id_fk
  LEFT JOIN m_orphan om ON om.legacy_id=COALESCE(i.mem_id_fk,-1)
  WHERE lm.id IS NULL AND COALESCE(mm.target_id,om.target_id) IS NOT NULL;
SET @n=(SELECT COALESCE(MAX(id),0) FROM club_inbody_measurements);
UPDATE n_inbody SET new_id=(@n:=@n+1) ORDER BY legacy_id;
INSERT INTO club_inbody_measurements
  (id,member_id,measurement_date,weight,notes,report_url,file_url,created_at,updated_at)
SELECT t.new_id,COALESCE(mm.target_id,om.target_id),LEFT(i.day_date,10),
  MAX(CASE WHEN d.item_n='الوزن' AND d.from_t REGEXP '^[0-9]+([.][0-9]+)?$' THEN CAST(d.from_t AS DECIMAL(6,2)) END),
  CONCAT('Legacy InBody ',i.id,IF(COUNT(d.id)>0,CONCAT(' | ',GROUP_CONCAT(CONCAT(d.item_n,': ',d.from_t,IF(NULLIF(d.to_t,'') IS NULL,'',CONCAT(' -> ',d.to_t))) ORDER BY d.id SEPARATOR ' | ')),'')),
  LEFT(NULLIF(i.image_path,''),500),LEFT(NULLIF(i.image,''),255),i.created,COALESCE(i.updated,i.created)
FROM n_inbody t JOIN \`$O\`.tbl_inbody i ON i.id=t.legacy_id
LEFT JOIN \`$O\`.tbl_inbody_details d ON d.inbody_id_fk=i.id
LEFT JOIN m_member mm ON mm.legacy_id=i.mem_id_fk
LEFT JOIN m_orphan om ON om.legacy_id=COALESCE(i.mem_id_fk,-1)
GROUP BY t.new_id,i.id,i.day_date,i.image_path,i.image,i.created,i.updated,mm.target_id,om.target_id;
SET @inbody_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_inbody',CAST(legacy_id AS CHAR),'club_inbody_measurements',new_id,'mapped' FROM n_inbody;

-- ===== Report =====
SELECT '$MODE' AS mode,
  @types_added types_added,@types_changed types_changed,
  @members_added members_added,@members_linked members_linked,@members_changed members_changed,@members_blocked members_blocked,@members_unblocked members_unblocked,@member_code_clash member_code_clash,
  @subs_added subscriptions_added,@subs_changed subscriptions_changed,
  @receipts_added receipts_added,@receipts_changed receipts_changed,
  @freezes_added freezes_added,@freezes_changed freezes_changed,
  @refunds_added refunds_added,@transfers_added transfers_added,
  @checkins_added checkins_added,@checkins_waiting checkins_waiting_member,@lockers_added locker_subs_added,@lockers_changed locker_subs_changed,
  @inbody_added inbody_added,
  (SELECT COUNT(*) FROM m_sub m LEFT JOIN \`$O\`.tbl_subscription_members s ON s.subs_id=m.legacy_id WHERE s.subs_id IS NULL) subscriptions_gone_from_old;
SQL

# Helpers for section 11. The old and new tables use different collations (utf8mb3, 0900_ai_ci,
# unicode_ci), so text is compared through u(). d() turns the old Unix-seconds day (Cairo midnight)
# into YYYY-MM-DD the way the import did (+12h, so summer/winter time never shifts the day).
u() { printf 'CONVERT(%s USING utf8mb4) COLLATE utf8mb4_unicode_ci' "$1"; }
d() { printf "CASE WHEN %s REGEXP '^[0-9]{9,10}\$' THEN DATE_FORMAT(DATE_ADD('1970-01-01',INTERVAL CAST(%s AS UNSIGNED)+43200 SECOND),'%%Y-%%m-%%d') ELSE %s END" "$1" "$1" "$1"; }
utc() { printf "IF(%s REGEXP '^[0-9]{9,10}\$',DATE_ADD('1970-01-01',INTERVAL CAST(%s AS UNSIGNED) SECOND),NULL)" "$1" "$1"; }
# mapped <table> <old id expr>: the old row already has its copy in the new system
mapped() { printf "EXISTS (SELECT 1 FROM legacy_record_mappings r WHERE r.source_key='%s' AND r.legacy_table='%s' AND r.legacy_id=CAST(%s AS CHAR) AND r.target_table='%s')" "$KEY" "$1" "$2" "$1"; }
# taken <table> <new id expr>: the new row is already the copy of some old row
taken() { printf "EXISTS (SELECT 1 FROM legacy_record_mappings r WHERE r.target_table='%s' AND r.target_id=%s AND r.legacy_table='%s')" "$1" "$2" "$1"; }
# ledger join for "rows of <table> that came from the old system", as n (new) and o (old)
from_old() { printf "\`%s\` n JOIN legacy_record_mappings r ON r.target_table='%s' AND r.target_id=n.id AND r.source_key='%s' AND r.legacy_table='%s' JOIN \`%s\`.\`%s\` o ON o.id=CAST(r.legacy_id AS SIGNED)" "$1" "$1" "$KEY" "$1" "$O" "$1"; }
LEGS="club_subscriptions s ON s.subscription_number=CONCAT('LEG-S-',o.sub_id_fk) AND o.sub_id_fk>0"

read -r -d '' SQL_POINTS <<SQL || true
-- ===== 11. Discount codes and member points =====
-- Old tables -> the same-named tables the new screens read (tbl_discount_codes, tbl_discount_cobones_employees,
-- tbl_emps_members_dis_codes, tbl_cobon_exhausted_history, tbl_points_history, tbl_points_exhausted_history)
-- plus the member-profile/app ledger club_member_point_transactions.
-- - Identity is legacy_record_mappings (legacy_table = target_table = the tbl_* name). Rows the import copied
--   with their old id are recognised once by same id + same content. Both systems number these tables on
--   their own, so a new-system row that uses an old id is never matched or changed; the old row is added
--   under a free id (its own id when free).
-- - Members are found by member_code (the old system's own lookup; its member_id column is often another
--   member). Rows of members not in the new system yet wait for a later run (*_waiting_member).
-- - Captains: old gym employee -> the new employee with the same emp_code_gym (unique) and name, as the import.
--   Subscriptions: LEG-S-<old id>. Plans: the tbl_subscription_settings ledger (m_type).
-- - Old wins for: code percentage, allocation count, grant used (approved, never back to 0), points
--   active/deleted. Nothing is deleted. Points settings are not synced (the new screens edit them).
SET @pd_matched=0;
CREATE TEMPORARY TABLE pd_member (code VARCHAR(100) COLLATE utf8mb4_unicode_ci PRIMARY KEY, id INT) ENGINE=InnoDB;
INSERT IGNORE INTO pd_member SELECT member_code,id FROM club_members WHERE member_code IS NOT NULL AND member_code<>'' ORDER BY id;
CREATE TEMPORARY TABLE pd_emp (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO pd_emp SELECT g.id,h.id FROM \`$O\`.tbl_employees g
  JOIN employees h ON h.emp_code_gym=g.emp_code
  JOIN (SELECT emp_code_gym FROM employees WHERE emp_code_gym<>0 GROUP BY emp_code_gym HAVING COUNT(*)=1) one ON one.emp_code_gym=h.emp_code_gym
  WHERE $(u "TRIM(REPLACE(h.employee,CHAR(9),''))")=$(u "TRIM(REPLACE(g.employee,CHAR(9),''))");

-- 11a. Discount codes (title is unique in both systems). A code the new system made with the same title as a
-- later old code stays the new system's own; the old one is added as "<title> (<old id>)".
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_discount_codes',CAST(o.id AS CHAR),'tbl_discount_codes',n.id,'matched'
FROM \`$O\`.tbl_discount_codes o JOIN tbl_discount_codes n ON n.id=o.id AND $(u "TRIM(n.title)")=$(u "TRIM(o.title)")
WHERE NOT $(mapped tbl_discount_codes o.id) AND NOT $(taken tbl_discount_codes n.id);
SET @pd_matched=@pd_matched+ROW_COUNT();
CREATE TEMPORARY TABLE pd_new_code (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO pd_new_code (legacy_id) SELECT o.id FROM \`$O\`.tbl_discount_codes o WHERE NOT $(mapped tbl_discount_codes o.id);
UPDATE pd_new_code t SET t.new_id=t.legacy_id WHERE NOT EXISTS (SELECT 1 FROM tbl_discount_codes n WHERE n.id=t.legacy_id);
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM tbl_discount_codes),(SELECT COALESCE(MAX(new_id),0) FROM pd_new_code));
UPDATE pd_new_code SET new_id=(@n:=@n+1) WHERE new_id IS NULL ORDER BY legacy_id;
INSERT INTO tbl_discount_codes (id,title,nesba,publisher)
SELECT t.new_id,
  IF(EXISTS (SELECT 1 FROM tbl_discount_codes x WHERE $(u x.title)=$(u "LEFT(COALESCE(NULLIF(o.title,''),CONCAT('Legacy ',o.id)),100)")),
     LEFT(CONCAT(COALESCE(NULLIF(o.title,''),'Legacy'),' (',o.id,')'),100),
     LEFT(COALESCE(NULLIF(o.title,''),CONCAT('Legacy ',o.id)),100)),
  COALESCE(o.nesba,0),NULL
FROM pd_new_code t JOIN \`$O\`.tbl_discount_codes o ON o.id=t.legacy_id;
SET @pd_codes_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_discount_codes',CAST(legacy_id AS CHAR),'tbl_discount_codes',new_id,'mapped' FROM pd_new_code;
UPDATE $(from_old tbl_discount_codes) SET n.nesba=COALESCE(o.nesba,0) WHERE n.nesba<>COALESCE(o.nesba,0);
SET @pd_codes_changed=ROW_COUNT();
CREATE TEMPORARY TABLE pd_code (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO pd_code SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_discount_codes' AND target_table='tbl_discount_codes';

-- 11b. Captain code allocations (how many grants of each code a captain may give)
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_discount_cobones_employees',CAST(o.id AS CHAR),'tbl_discount_cobones_employees',n.id,'matched'
FROM \`$O\`.tbl_discount_cobones_employees o JOIN tbl_discount_cobones_employees n ON n.id=o.id
LEFT JOIN pd_code c ON c.legacy_id=o.code_id_fk LEFT JOIN pd_emp e ON e.legacy_id=o.emp_id_fk
WHERE n.code_id_fk <=> COALESCE(c.target_id,o.code_id_fk) AND (n.emp_id_fk <=> e.new_id OR n.emp_id_fk IS NULL)
  AND NOT $(mapped tbl_discount_cobones_employees o.id) AND NOT $(taken tbl_discount_cobones_employees n.id);
SET @pd_matched=@pd_matched+ROW_COUNT();
SET @pd_alloc_unmapped=(SELECT COUNT(*) FROM \`$O\`.tbl_discount_cobones_employees o WHERE NOT $(mapped tbl_discount_cobones_employees o.id));
-- A captain who already has this code in the new system keeps the new system's row.
CREATE TEMPORARY TABLE pd_new_alloc (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO pd_new_alloc (legacy_id) SELECT o.id FROM \`$O\`.tbl_discount_cobones_employees o
LEFT JOIN pd_code c ON c.legacy_id=o.code_id_fk LEFT JOIN pd_emp e ON e.legacy_id=o.emp_id_fk
WHERE NOT $(mapped tbl_discount_cobones_employees o.id)
  AND NOT (e.new_id IS NOT NULL AND EXISTS (SELECT 1 FROM tbl_discount_cobones_employees x
           WHERE x.emp_id_fk=e.new_id AND x.code_id_fk <=> COALESCE(c.target_id,o.code_id_fk)));
UPDATE pd_new_alloc t SET t.new_id=t.legacy_id WHERE NOT EXISTS (SELECT 1 FROM tbl_discount_cobones_employees n WHERE n.id=t.legacy_id);
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM tbl_discount_cobones_employees),(SELECT COALESCE(MAX(new_id),0) FROM pd_new_alloc));
UPDATE pd_new_alloc SET new_id=(@n:=@n+1) WHERE new_id IS NULL ORDER BY legacy_id;
INSERT INTO tbl_discount_cobones_employees (id,emp_id_fk,code_id_fk,nesba,num,publisher,date)
SELECT t.new_id,e.new_id,COALESCE(c.target_id,o.code_id_fk),o.nesba,COALESCE(o.num,0),NULL,o.date
FROM pd_new_alloc t JOIN \`$O\`.tbl_discount_cobones_employees o ON o.id=t.legacy_id
LEFT JOIN pd_code c ON c.legacy_id=o.code_id_fk LEFT JOIN pd_emp e ON e.legacy_id=o.emp_id_fk;
SET @pd_alloc_added=ROW_COUNT();
SET @pd_alloc_skipped=@pd_alloc_unmapped-@pd_alloc_added;
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_discount_cobones_employees',CAST(legacy_id AS CHAR),'tbl_discount_cobones_employees',new_id,'mapped' FROM pd_new_alloc;
UPDATE $(from_old tbl_discount_cobones_employees)
SET n.num=COALESCE(o.num,0),n.nesba=o.nesba
WHERE n.num<>COALESCE(o.num,0) OR NOT ($(u n.nesba) <=> $(u o.nesba));
SET @pd_alloc_changed=ROW_COUNT();

-- 11c. Codes granted to members (approved=1: the member used it)
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_emps_members_dis_codes',CAST(o.id AS CHAR),'tbl_emps_members_dis_codes',n.id,'matched'
FROM \`$O\`.tbl_emps_members_dis_codes o JOIN tbl_emps_members_dis_codes n ON n.id=o.id
LEFT JOIN pd_code c ON c.legacy_id=o.code_id_fk
WHERE $(u n.member_code)=$(u o.member_code) AND n.code_id_fk <=> COALESCE(c.target_id,o.code_id_fk)
  AND NOT $(mapped tbl_emps_members_dis_codes o.id) AND NOT $(taken tbl_emps_members_dis_codes n.id);
SET @pd_matched=@pd_matched+ROW_COUNT();
CREATE TEMPORARY TABLE pd_new_grant (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO pd_new_grant (legacy_id) SELECT o.id FROM \`$O\`.tbl_emps_members_dis_codes o
JOIN pd_member m ON m.code=$(u o.member_code)
WHERE NOT $(mapped tbl_emps_members_dis_codes o.id);
UPDATE pd_new_grant t SET t.new_id=t.legacy_id WHERE NOT EXISTS (SELECT 1 FROM tbl_emps_members_dis_codes n WHERE n.id=t.legacy_id);
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM tbl_emps_members_dis_codes),(SELECT COALESCE(MAX(new_id),0) FROM pd_new_grant));
UPDATE pd_new_grant SET new_id=(@n:=@n+1) WHERE new_id IS NULL ORDER BY legacy_id;
INSERT INTO tbl_emps_members_dis_codes
  (id,emp_id_fk,member_code,mem_id_fk,code_id_fk,date,year,month,ended_date_ar,ended_date,approved,publisher)
SELECT t.new_id,e.new_id,LEFT(o.member_code,100),m.id,COALESCE(c.target_id,o.code_id_fk),$(d o.date),
  CAST(o.year AS CHAR),LPAD(CAST(o.month AS CHAR),2,'0'),o.ended_date_ar,$(d o.ended_date),COALESCE(o.approved,0),NULL
FROM pd_new_grant t JOIN \`$O\`.tbl_emps_members_dis_codes o ON o.id=t.legacy_id
JOIN pd_member m ON m.code=$(u o.member_code)
LEFT JOIN pd_code c ON c.legacy_id=o.code_id_fk LEFT JOIN pd_emp e ON e.legacy_id=o.emp_id_fk;
SET @pd_grants_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_emps_members_dis_codes',CAST(legacy_id AS CHAR),'tbl_emps_members_dis_codes',new_id,'mapped' FROM pd_new_grant;
UPDATE $(from_old tbl_emps_members_dis_codes) SET n.approved=1 WHERE o.approved=1 AND n.approved=0;
SET @pd_grants_used=ROW_COUNT();
UPDATE $(from_old tbl_emps_members_dis_codes) JOIN pd_member m ON m.code=$(u o.member_code)
SET n.mem_id_fk=m.id WHERE NOT (n.mem_id_fk <=> m.id);
SET @pd_grants_member_fixed=ROW_COUNT();
SET @pd_grants_waiting=(SELECT COUNT(*) FROM \`$O\`.tbl_emps_members_dis_codes o WHERE NOT $(mapped tbl_emps_members_dis_codes o.id));
CREATE TEMPORARY TABLE pd_grant (legacy_id INT PRIMARY KEY, target_id INT) ENGINE=InnoDB;
INSERT IGNORE INTO pd_grant SELECT CAST(legacy_id AS SIGNED),target_id FROM legacy_record_mappings
  WHERE source_key='$KEY' AND legacy_table='tbl_emps_members_dis_codes' AND target_table='tbl_emps_members_dis_codes';

-- 11d. Coupon uses (discount_code_id_fk points at the member's grant)
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_cobon_exhausted_history',CAST(o.id AS CHAR),'tbl_cobon_exhausted_history',n.id,'matched'
FROM \`$O\`.tbl_cobon_exhausted_history o JOIN tbl_cobon_exhausted_history n ON n.id=o.id
WHERE $(u n.member_code)=$(u o.member_code) AND n.cobon_value=COALESCE(o.cobon_value,0)
  AND NOT $(mapped tbl_cobon_exhausted_history o.id) AND NOT $(taken tbl_cobon_exhausted_history n.id);
SET @pd_matched=@pd_matched+ROW_COUNT();
CREATE TEMPORARY TABLE pd_new_coupon (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO pd_new_coupon (legacy_id) SELECT o.id FROM \`$O\`.tbl_cobon_exhausted_history o
JOIN pd_member m ON m.code=$(u o.member_code)
WHERE NOT $(mapped tbl_cobon_exhausted_history o.id);
UPDATE pd_new_coupon t SET t.new_id=t.legacy_id WHERE NOT EXISTS (SELECT 1 FROM tbl_cobon_exhausted_history n WHERE n.id=t.legacy_id);
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM tbl_cobon_exhausted_history),(SELECT COALESCE(MAX(new_id),0) FROM pd_new_coupon));
UPDATE pd_new_coupon SET new_id=(@n:=@n+1) WHERE new_id IS NULL ORDER BY legacy_id;
INSERT INTO tbl_cobon_exhausted_history
  (id,member_id,member_code,sub_id_fk,discount_code_id_fk,discount_code_nesba,cobon_value,date,time,publisher)
SELECT t.new_id,m.id,o.member_code,s.id,COALESCE(g.target_id,o.discount_code_id_fk),o.discount_code_nesba,COALESCE(o.cobon_value,0),
  $(d o.date),
  CASE WHEN o.time REGEXP '^[0-9]{9,10}\$' THEN DATE_FORMAT(DATE_ADD('1970-01-01',INTERVAL CAST(o.time AS UNSIGNED) SECOND),'%H:%i:%s') ELSE o.time END,
  NULL
FROM pd_new_coupon t JOIN \`$O\`.tbl_cobon_exhausted_history o ON o.id=t.legacy_id
JOIN pd_member m ON m.code=$(u o.member_code)
LEFT JOIN $LEGS
LEFT JOIN pd_grant g ON g.legacy_id=o.discount_code_id_fk;
SET @pd_coupons_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_cobon_exhausted_history',CAST(legacy_id AS CHAR),'tbl_cobon_exhausted_history',new_id,'mapped' FROM pd_new_coupon;
-- a subscription that reached the new system later gets linked
UPDATE $(from_old tbl_cobon_exhausted_history) JOIN $LEGS SET n.sub_id_fk=s.id WHERE n.sub_id_fk IS NULL;
SET @pd_coupons_linked=ROW_COUNT();
SET @pd_coupons_waiting=(SELECT COUNT(*) FROM \`$O\`.tbl_cobon_exhausted_history o WHERE NOT $(mapped tbl_cobon_exhausted_history o.id));

-- 11e. Earned points (tbl_points_history) and the member-profile ledger (same id, transaction_type earn)
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_points_history',CAST(o.id AS CHAR),'tbl_points_history',n.id,'matched'
FROM \`$O\`.tbl_points_history o JOIN tbl_points_history n ON n.id=o.id
WHERE $(u n.member_code)=$(u o.member_code) AND $(u n.time) <=> $(u o.time) AND n.points=o.points
  AND NOT $(mapped tbl_points_history o.id) AND NOT $(taken tbl_points_history n.id);
SET @pd_matched=@pd_matched+ROW_COUNT();
CREATE TEMPORARY TABLE pd_new_points (legacy_id INT PRIMARY KEY, new_id INT) ENGINE=InnoDB;
INSERT INTO pd_new_points (legacy_id) SELECT o.id FROM \`$O\`.tbl_points_history o
JOIN pd_member m ON m.code=$(u o.member_code)
WHERE NOT $(mapped tbl_points_history o.id);
-- the ledger row takes the same id, so the id must be free in both tables (ledger ids from 100000000 are its own)
UPDATE pd_new_points t SET t.new_id=t.legacy_id
WHERE NOT EXISTS (SELECT 1 FROM tbl_points_history n WHERE n.id=t.legacy_id)
  AND NOT EXISTS (SELECT 1 FROM club_member_point_transactions x WHERE x.id=t.legacy_id);
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM tbl_points_history),
                (SELECT COALESCE(MAX(id),0) FROM club_member_point_transactions WHERE id<100000000),
                (SELECT COALESCE(MAX(new_id),0) FROM pd_new_points));
UPDATE pd_new_points SET new_id=(@n:=@n+1) WHERE new_id IS NULL ORDER BY legacy_id;
INSERT INTO tbl_points_history
  (id,type,member_id,member_code,action_type,action_name,subscription_type_id_fk,subscription_type_n,points,
   date_added,deadline_date,deadline_date_string,date,time,publisher,sub_id_fk,deleted,is_active)
SELECT t.new_id,COALESCE(o.type,'increase'),m.id,o.member_code,o.action_type,o.action_name,mt.target_id,o.subscription_type_n,o.points,
  o.date_added,o.deadline_date,o.deadline_date_string,o.date,o.time,NULL,s.id,COALESCE(o.deleted,0),COALESCE(o.is_active,0)
FROM pd_new_points t JOIN \`$O\`.tbl_points_history o ON o.id=t.legacy_id
JOIN pd_member m ON m.code=$(u o.member_code)
LEFT JOIN m_type mt ON mt.legacy_id=o.subscription_type_id_fk
LEFT JOIN $LEGS;
SET @pd_points_added=ROW_COUNT();
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_points_history',CAST(legacy_id AS CHAR),'tbl_points_history',new_id,'mapped' FROM pd_new_points;
UPDATE $(from_old tbl_points_history)
SET n.is_active=COALESCE(o.is_active,0),n.deleted=COALESCE(o.deleted,0)
WHERE n.is_active<>COALESCE(o.is_active,0) OR n.deleted<>COALESCE(o.deleted,0);
SET @pd_points_changed=ROW_COUNT();
UPDATE $(from_old tbl_points_history) JOIN pd_member m ON m.code=$(u o.member_code)
SET n.member_id=m.id WHERE NOT (n.member_id <=> m.id);
SET @pd_points_member_fixed=ROW_COUNT();
UPDATE $(from_old tbl_points_history) JOIN $LEGS SET n.sub_id_fk=s.id WHERE n.sub_id_fk IS NULL;
SET @pd_points_linked=ROW_COUNT();
SET @pd_points_waiting=(SELECT COUNT(*) FROM \`$O\`.tbl_points_history o WHERE NOT $(mapped tbl_points_history o.id));
INSERT INTO club_member_point_transactions
  (id,member_id,source_member_id,member_code,transaction_type,action_type,action_name,subscription_type_id,
   source_subscription_type_id,subscription_id,source_subscription_id,points,occurred_at,expiry_date,expiry_label,
   created_by,is_deleted,is_active,created_at)
SELECT n.id,n.member_id,COALESCE(o.member_id,0),n.member_code,'earn',n.action_type,n.action_name,n.subscription_type_id_fk,
  o.subscription_type_id_fk,n.sub_id_fk,o.sub_id_fk,n.points,$(utc o.time),n.deadline_date,n.deadline_date_string,
  NULL,n.deleted,n.is_active,CURRENT_TIMESTAMP(3)
FROM $(from_old tbl_points_history)
WHERE NOT EXISTS (SELECT 1 FROM club_member_point_transactions x WHERE x.id=n.id)
  AND NOT EXISTS (SELECT 1 FROM legacy_record_mappings lr WHERE lr.source_key='$KEY' AND lr.legacy_table='tbl_points_history'
                  AND lr.legacy_id=r.legacy_id AND lr.target_table='club_member_point_transactions');
SET @pd_ledger_added=ROW_COUNT();
UPDATE $(from_old tbl_points_history) JOIN club_member_point_transactions x ON x.id=n.id AND x.transaction_type='earn'
SET x.member_id=n.member_id,x.is_active=n.is_active,x.is_deleted=n.deleted,x.subscription_id=COALESCE(x.subscription_id,n.sub_id_fk)
WHERE x.points=n.points AND $(u x.member_code) <=> $(u n.member_code)
  AND (NOT (x.member_id <=> n.member_id) OR x.is_active<>n.is_active OR x.is_deleted<>n.deleted
       OR (x.subscription_id IS NULL AND n.sub_id_fk IS NOT NULL));
SET @pd_ledger_changed=ROW_COUNT();

-- 11f. Redeemed points (tbl_points_exhausted_history) + a redeem line in the ledger
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_points_exhausted_history',CAST(o.id AS CHAR),'tbl_points_exhausted_history',n.id,'matched'
FROM \`$O\`.tbl_points_exhausted_history o JOIN tbl_points_exhausted_history n ON n.id=o.id
WHERE $(u n.member_code)=$(u o.member_code) AND n.points=o.points
  AND NOT $(mapped tbl_points_exhausted_history o.id) AND NOT $(taken tbl_points_exhausted_history n.id);
SET @pd_matched=@pd_matched+ROW_COUNT();
CREATE TEMPORARY TABLE pd_new_redeem (legacy_id INT PRIMARY KEY, new_id INT, ledger_id INT, ledger_new TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB;
INSERT INTO pd_new_redeem (legacy_id) SELECT o.id FROM \`$O\`.tbl_points_exhausted_history o
JOIN pd_member m ON m.code=$(u o.member_code)
WHERE NOT $(mapped tbl_points_exhausted_history o.id);
UPDATE pd_new_redeem t SET t.new_id=t.legacy_id WHERE NOT EXISTS (SELECT 1 FROM tbl_points_exhausted_history n WHERE n.id=t.legacy_id);
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM tbl_points_exhausted_history),(SELECT COALESCE(MAX(new_id),0) FROM pd_new_redeem));
UPDATE pd_new_redeem SET new_id=(@n:=@n+1) WHERE new_id IS NULL ORDER BY legacy_id;
-- the first import already wrote a ledger line for some old redemptions: keep it, add none
UPDATE pd_new_redeem t JOIN legacy_record_mappings r ON r.source_key='$KEY' AND r.legacy_table='tbl_points_exhausted_history'
  AND r.legacy_id=CAST(t.legacy_id AS CHAR) AND r.target_table='club_member_point_transactions'
SET t.ledger_id=r.target_id;
SET @n=GREATEST((SELECT COALESCE(MAX(id),0) FROM club_member_point_transactions),100000000);
UPDATE pd_new_redeem SET ledger_id=(@n:=@n+1),ledger_new=1 WHERE ledger_id IS NULL ORDER BY legacy_id;
INSERT INTO tbl_points_exhausted_history
  (id,member_id,member_code,sub_id_fk,sub_type,points,points_value,date,time,publisher,subscription_type_id_fk,subscription_type_n,deleted)
SELECT t.new_id,m.id,o.member_code,s.id,o.sub_type,o.points,COALESCE(o.points_value,0),o.date,o.time,NULL,mt.target_id,o.subscription_type_n,COALESCE(o.deleted,0)
FROM pd_new_redeem t JOIN \`$O\`.tbl_points_exhausted_history o ON o.id=t.legacy_id
JOIN pd_member m ON m.code=$(u o.member_code)
LEFT JOIN m_type mt ON mt.legacy_id=o.subscription_type_id_fk
LEFT JOIN $LEGS;
SET @pd_redeem_added=ROW_COUNT();
INSERT INTO club_member_point_transactions
  (id,member_id,source_member_id,member_code,transaction_type,action_type,action_name,subscription_type_id,
   source_subscription_type_id,subscription_id,source_subscription_id,points,occurred_at,created_by,is_deleted,is_active,created_at)
SELECT t.ledger_id,n.member_id,COALESCE(o.member_id,0),n.member_code,'redeem',NULL,LEFT(CONCAT('استبدال نقاط — ',COALESCE(o.sub_type,'')),100),
  n.subscription_type_id_fk,o.subscription_type_id_fk,n.sub_id_fk,o.sub_id_fk,n.points,$(utc o.time),NULL,n.deleted,1,CURRENT_TIMESTAMP(3)
FROM pd_new_redeem t JOIN tbl_points_exhausted_history n ON n.id=t.new_id JOIN \`$O\`.tbl_points_exhausted_history o ON o.id=t.legacy_id
WHERE t.ledger_new=1;
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_points_exhausted_history',CAST(legacy_id AS CHAR),'tbl_points_exhausted_history',new_id,'mapped' FROM pd_new_redeem;
INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
SELECT @run,'$KEY','tbl_points_exhausted_history',CAST(legacy_id AS CHAR),'club_member_point_transactions',ledger_id,'mapped' FROM pd_new_redeem WHERE ledger_new=1;
UPDATE $(from_old tbl_points_exhausted_history) SET n.deleted=COALESCE(o.deleted,0) WHERE n.deleted<>COALESCE(o.deleted,0);
SET @pd_redeem_changed=ROW_COUNT();

SELECT '$MODE' AS mode,
  @pd_matched points_discounts_rows_recognised,
  @pd_codes_added codes_added,@pd_codes_changed codes_changed,
  @pd_alloc_added captain_allocations_added,@pd_alloc_changed captain_allocations_changed,
  @pd_alloc_skipped captain_allocations_already_in_new,
  @pd_grants_added member_grants_added,@pd_grants_used member_grants_marked_used,
  @pd_grants_member_fixed member_grants_member_fixed,@pd_grants_waiting member_grants_waiting_member,
  @pd_coupons_added coupon_uses_added,@pd_coupons_linked coupon_uses_linked_subscription,
  @pd_coupons_waiting coupon_uses_waiting_member,
  @pd_points_added points_added,@pd_points_changed points_changed,@pd_points_member_fixed points_member_fixed,
  @pd_points_linked points_linked_subscription,@pd_points_waiting points_waiting_member,
  @pd_ledger_added ledger_added,@pd_ledger_changed ledger_changed,
  @pd_redeem_added redeemed_added,@pd_redeem_changed redeemed_changed;
SQL

case "${SECTIONS:-all}" in
  all) SQL="$SQL"$'\n'"$SQL_GYM"$'\n'"$SQL_POINTS" ;;
  gym) SQL="$SQL"$'\n'"$SQL_GYM" ;;
  points-discounts) SQL="$SQL"$'\n'"$SQL_POINTS" ;;
  *) echo "SECTIONS must be all, gym or points-discounts"; exit 1 ;;
esac
SQL="$SQL"$'\n'"$END;"
[ "${SECTIONS:-all}" = all ] || MODE="$MODE[$SECTIONS]"

START=$(date +%s)
if OUT=$(printf '%s\n' "$SQL" | "${MYSQL[@]}" --vertical "$N" 2>&1); then
  SUMMARY=$(printf '%s\n' "$OUT" | grep -E '^ *[a-z_]+: ' | sed 's/^ *//' | tr '\n' ' ')
  printf '%s %s (%ss) %s\n' "$(date '+%F %T')" "$MODE" "$(( $(date +%s) - START ))" "$SUMMARY" >> "$LOG"
  [ "${QUIET:-0}" = 1 ] || printf '%s\n' "$OUT" | grep -E '^ *[a-z_]+: '
else
  printf '%s %s FAILED: %s\n' "$(date '+%F %T')" "$MODE" "$(printf '%s' "$OUT" | tail -3 | tr '\n' ' ')" >> "$LOG"
  printf '%s\n' "$OUT" >&2
  exit 1
fi
