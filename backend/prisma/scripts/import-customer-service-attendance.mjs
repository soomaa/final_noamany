import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const source = 'migration_trial_gym_20261007';
const key = 'noamanycenter_noamany:06f7dadd2176894a';
const target = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if (target !== 'noamany_final_new') throw new Error('Unexpected target database');
const S = `\`${source}\``;
const count = async (db, sql, ...args) => Number((await db.$queryRawUnsafe(sql, ...args))[0].n);

try {
  const sourceTotal = await count(p, `SELECT COUNT(*) n FROM ${S}.tbl_hdoor_classes`);
  const sourceGym = await count(p, `SELECT COUNT(*) n FROM ${S}.tbl_hdoor_classes WHERE type='eshtrak'`);
  const sourceOther = sourceTotal - sourceGym;
  if (sourceTotal !== 273565 || sourceGym !== 253499 || sourceOther !== 20066) throw new Error('Attendance source counts changed');
  const canonicalGym = await count(p, 'SELECT COUNT(*) n FROM club_attendance');
  const mappedGym = await count(p, "SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=? AND legacy_table='tbl_hdoor_classes' AND target_table='club_attendance'", key);
  if (canonicalGym !== sourceGym || mappedGym !== sourceGym) throw new Error(`Gym attendance import incomplete: ${canonicalGym}/${mappedGym}`);
  const baseRows = await p.$queryRawUnsafe("SELECT MIN(target_id-CAST(legacy_id AS UNSIGNED)) min_base,MAX(target_id-CAST(legacy_id AS UNSIGNED)) max_base FROM legacy_record_mappings WHERE source_key=? AND legacy_table='tbl_hdoor_classes' AND target_table='club_attendance'", key);
  const base = Number(baseRows[0].min_base);
  if (!Number.isSafeInteger(base) || base !== Number(baseRows[0].max_base)) throw new Error('Attendance ID offset inconsistent');
  const unresolved = await count(p, `SELECT COUNT(*) n FROM ${S}.tbl_hdoor_classes h
    LEFT JOIN legacy_branch_mappings b ON b.source_key=? AND b.legacy_id=h.branch_id_fk
    LEFT JOIN ${S}.tbl_members m ON m.mem_id=h.member_id
    LEFT JOIN legacy_branch_mappings mb ON mb.source_key=? AND mb.legacy_id=m.branch_id_fk
    WHERE h.type<>'eshtrak' AND COALESCE(b.new_branch_id,mb.new_branch_id) IS NULL`, key, key);
  if (unresolved) throw new Error(`${unresolved} service attendance rows have no reliable branch`);
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({sourceTotal,sourceGym,sourceOther,unresolved,table:'club_attendance',mode:'dry-run'}));
    process.exit(0);
  }
  await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS tmp_extra_att_member');
    await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS tmp_extra_att_orphan');
    await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS tmp_extra_att_sub');
    await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE tmp_extra_att_member (legacy_id INT PRIMARY KEY,target_id INT) ENGINE=MEMORY');
    await tx.$executeRawUnsafe("INSERT INTO tmp_extra_att_member SELECT CAST(legacy_id AS UNSIGNED),target_id FROM legacy_record_mappings WHERE source_key=? AND legacy_table='tbl_members' AND target_table='club_members'", key);
    await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE tmp_extra_att_orphan (legacy_id INT PRIMARY KEY,target_id INT) ENGINE=MEMORY');
    await tx.$executeRawUnsafe("INSERT INTO tmp_extra_att_orphan SELECT CAST(legacy_id AS UNSIGNED),target_id FROM legacy_record_mappings WHERE source_key=? AND legacy_table='legacy_orphan_members' AND target_table='club_members'", key);
    await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE tmp_extra_att_sub (legacy_id INT PRIMARY KEY,target_id INT) ENGINE=MEMORY');
    await tx.$executeRawUnsafe("INSERT INTO tmp_extra_att_sub SELECT CAST(legacy_id AS UNSIGNED),target_id FROM legacy_record_mappings WHERE source_key=? AND legacy_table='tbl_subscription_members' AND target_table='club_subscriptions'", key);
    const attendanceInsert=`INSERT INTO club_attendance
      (id,member_id,member_code,member_name,subscription_id,subscription_type,branch_id,check_in_time,attendance_date,status,notes,created_by,created_at)
      SELECT ?+h.hodoor_id,COALESCE(mm.target_id,om.target_id),LEFT(COALESCE(m.m_code,h.member_code,CONCAT('ORPH-L',h.member_id)),30),
        LEFT(COALESCE(m.name,CONCAT('Legacy member ',h.member_id)),200),sm.target_id,
        LEFT(COALESCE(st.title,CONCAT('خدمة: ',COALESCE(NULLIF(h.type,''),'غير محدد'))),150),
        COALESCE(b.new_branch_id,mb.new_branch_id),
        TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED))),COALESCE(h.hdoor_time_24,'00:00:00')),
        DATE_FORMAT(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)),'%Y-%m-%d'),'checked_in',
        CONCAT('Imported from tbl_hdoor_classes.hodoor_id=',h.hodoor_id,'; legacy_type=',COALESCE(h.type,''),'; legacy_branch=',h.branch_id_fk),
        um.new_user_id,TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED))),COALESCE(h.hdoor_time_24,'00:00:00'))
      FROM ${S}.tbl_hdoor_classes h
      LEFT JOIN ${S}.tbl_members m ON m.mem_id=h.member_id
      LEFT JOIN ${S}.tbl_subscription_settings st ON st.type_id=h.subscription_type_fk
      LEFT JOIN legacy_branch_mappings b ON b.source_key=? AND b.legacy_id=h.branch_id_fk
      LEFT JOIN legacy_branch_mappings mb ON mb.source_key=? AND mb.legacy_id=m.branch_id_fk
      LEFT JOIN tmp_extra_att_member mm ON mm.legacy_id=h.member_id
      LEFT JOIN tmp_extra_att_orphan om ON om.legacy_id=h.member_id
      LEFT JOIN tmp_extra_att_sub sm ON sm.legacy_id=h.subs_id
      LEFT JOIN legacy_user_mappings um ON um.source_key=? AND um.legacy_id=h.user_id
      WHERE h.type<>'eshtrak' AND h.hodoor_id BETWEEN ? AND ?`;
    const serviceIds=await tx.$queryRawUnsafe(`SELECT hodoor_id FROM ${S}.tbl_hdoor_classes WHERE type<>'eshtrak' ORDER BY hodoor_id`);
    for(let i=0;i<serviceIds.length;i+=1000){
      const last=Math.min(i+999,serviceIds.length-1);
      await tx.$executeRawUnsafe(attendanceInsert,base,key,key,key,Number(serviceIds[i].hodoor_id),Number(serviceIds[last].hodoor_id));
      console.log(`Service attendance ${last+1}/${serviceIds.length}`);
    }
    const run = await tx.$queryRawUnsafe('SELECT id FROM legacy_import_runs WHERE source_key=? ORDER BY id DESC LIMIT 1', key);
    if (!run.length) throw new Error('Import run missing');
    await tx.$executeRawUnsafe("DELETE FROM legacy_record_mappings WHERE source_key=? AND legacy_table='tbl_hdoor_classes' AND target_table='legacy_archive'", key);
    await tx.$executeRawUnsafe(`INSERT INTO legacy_record_mappings
      (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ?,?,'tbl_hdoor_classes',CAST(h.hodoor_id AS CHAR),'club_attendance',?+h.hodoor_id,'mapped',
        JSON_OBJECT('legacy_type',COALESCE(h.type,''),'legacy_branch',h.branch_id_fk,'service_attendance',1)
      FROM ${S}.tbl_hdoor_classes h WHERE h.type<>'eshtrak'`, Number(run[0].id), key, base);
    const all = await count(tx, 'SELECT COUNT(*) n FROM club_attendance');
    if (all !== sourceTotal) throw new Error(`Attendance count ${all} != ${sourceTotal}`);
  }, {maxWait:30000,timeout:3600000});
  console.log('All 273565 attendance rows now mapped to club_attendance, including service entries');
} finally {
  await p.$disconnect();
}
