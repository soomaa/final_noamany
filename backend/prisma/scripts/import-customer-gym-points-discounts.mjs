import 'dotenv/config';
import { createFastLegacyMaps } from './customer-fast-legacy-maps.mjs';
import { PrismaClient } from '@prisma/client';
const p=new PrismaClient();
const src='migration_trial_gym_20261007';
const key='noamanycenter_noamany:06f7dadd2176894a';
const target=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if(target!=='noamany_final_new') throw new Error('Unexpected target database');
const S=`\`${src}\``;
const K=`'${key}'`;
const tables=['tbl_points_setting','tbl_convert_points_setting','tbl_points_history','tbl_points_exhausted_history','tbl_discount_codes','tbl_discount_cobones_employees','tbl_emps_members_dis_codes','tbl_cobon_exhausted_history'];
const counts=[1,1,11695,2,6,386,1713,1236];
const count=async(c,t)=>Number((await c.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${t}`))[0].n);
try {
  for(let i=0;i<tables.length;i++) {
    const n=await count(p,`${S}.\`${tables[i]}\``);
    if(n!==counts[i]) throw new Error(`Source ${tables[i]} ${n} != ${counts[i]}`);
  }
  if(!process.argv.includes('--apply')) { console.log(JSON.stringify({target,source:src,tables:Object.fromEntries(tables.map((x,i)=>[x,counts[i]])),mode:'dry-run'})); process.exit(0); }
  const mapped=await count(p,`legacy_record_mappings WHERE source_key=${K} AND legacy_table='tbl_members' AND target_table='club_members'`);
  if(mapped<50000) throw new Error(`Core mappings missing: ${mapped}`);
  await p.$transaction(async t=>{
  await t.$executeRawUnsafe("SET collation_connection='utf8mb4_unicode_ci'");
    await createFastLegacyMaps(t,key);
    for(const table of tables.slice().reverse()) await t.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    const sql=[
      `INSERT INTO tbl_points_setting (id,type,points,expire_days,date,time,publisher) SELECT s.id,s.type,s.points,s.expire_days,s.date,s.time,um.new_user_id FROM ${S}.tbl_points_setting s LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)`,
      `INSERT INTO tbl_convert_points_setting (id,points,value,validity_days,date,time,publisher) SELECT s.id,s.points,s.value,s.validity_days,s.date,s.time,um.new_user_id FROM ${S}.tbl_convert_points_setting s LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)`,
      `INSERT INTO tbl_discount_codes (id,title,nesba,publisher) SELECT s.id,COALESCE(s.title,CONCAT('Legacy ',s.id)),COALESCE(s.nesba,0),um.new_user_id FROM ${S}.tbl_discount_codes s LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)`,
      `INSERT INTO tbl_points_history (id,type,member_id,member_code,action_type,action_name,subscription_type_id_fk,subscription_type_n,points,date_added,deadline_date,deadline_date_string,date,time,publisher,sub_id_fk,deleted,is_active)
       SELECT s.id,s.type,COALESCE(mm.target_id,cm.id),s.member_code,s.action_type,s.action_name,tm.target_id,s.subscription_type_n,s.points,s.date_added,s.deadline_date,s.deadline_date_string,s.date,s.time,um.new_user_id,sm.target_id,s.deleted,COALESCE(s.is_active,0)
       FROM ${S}.tbl_points_history s
       LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)
       LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.member_id
       LEFT JOIN club_members cm ON cm.member_code=s.member_code COLLATE utf8mb4_unicode_ci
       LEFT JOIN tmp_customer_type_map tm ON tm.legacy_id=s.subscription_type_id_fk
       LEFT JOIN tmp_customer_sub_map sm ON sm.legacy_id=s.sub_id_fk`,
      `INSERT INTO tbl_points_exhausted_history (id,member_id,member_code,sub_id_fk,sub_type,points,points_value,date,time,publisher,subscription_type_id_fk,subscription_type_n,deleted)
       SELECT s.id,COALESCE(cm.id,mm.target_id),s.member_code,sm.target_id,s.sub_type,s.points,s.points_value,s.date,s.time,um.new_user_id,tm.target_id,s.subscription_type_n,s.deleted
       FROM ${S}.tbl_points_exhausted_history s
       LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)
       LEFT JOIN club_members cm ON cm.member_code=s.member_code COLLATE utf8mb4_unicode_ci
       LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.member_id
       LEFT JOIN tmp_customer_sub_map sm ON sm.legacy_id=NULLIF(s.sub_id_fk,0)
       LEFT JOIN tmp_customer_type_map tm ON tm.legacy_id=s.subscription_type_id_fk`,
      `INSERT INTO tbl_discount_cobones_employees (id,emp_id_fk,code_id_fk,nesba,num,publisher,date)
       SELECT s.id,em.new_employee_id,s.code_id_fk,s.nesba,COALESCE(s.num,0),um.new_user_id,s.date
       FROM ${S}.tbl_discount_cobones_employees s LEFT JOIN legacy_employee_mappings em ON em.source_key=${K} AND em.legacy_id=s.emp_id_fk
       LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)`,
      `INSERT INTO tbl_emps_members_dis_codes (id,emp_id_fk,member_code,mem_id_fk,code_id_fk,date,year,month,ended_date_ar,ended_date,approved,publisher)
       SELECT s.id,em.new_employee_id,LEFT(s.member_code,100),COALESCE(mm.target_id,cm.id),s.code_id_fk,CASE WHEN s.date REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.date AS UNSIGNED)+43200),'%Y-%m-%d') ELSE s.date END,CAST(s.year AS CHAR),LPAD(CAST(s.month AS CHAR),2,'0'),s.ended_date_ar,CASE WHEN s.ended_date REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.ended_date AS UNSIGNED)+43200),'%Y-%m-%d') ELSE s.ended_date END,s.approved,um.new_user_id
       FROM ${S}.tbl_emps_members_dis_codes s
       LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)
       LEFT JOIN legacy_employee_mappings em ON em.source_key=${K} AND em.legacy_id=s.emp_id_fk
       LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.mem_id_fk
       LEFT JOIN club_members cm ON cm.member_code=s.member_code COLLATE utf8mb4_unicode_ci`,
      `INSERT INTO tbl_cobon_exhausted_history (id,member_id,member_code,sub_id_fk,discount_code_id_fk,discount_code_nesba,cobon_value,date,time,publisher)
       SELECT s.id,COALESCE(cm.id,mm.target_id),s.member_code,sm.target_id,s.discount_code_id_fk,s.discount_code_nesba,COALESCE(s.cobon_value,0),CASE WHEN s.date REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.date AS UNSIGNED)+43200),'%Y-%m-%d') ELSE s.date END,CASE WHEN s.time REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.time AS UNSIGNED)),'%H:%i:%s') ELSE s.time END,um.new_user_id
       FROM ${S}.tbl_cobon_exhausted_history s
       LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND s.publisher REGEXP '^[0-9]+$' AND um.legacy_id=CAST(s.publisher AS UNSIGNED)
       LEFT JOIN club_members cm ON cm.member_code=s.member_code COLLATE utf8mb4_unicode_ci
       LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.member_id
       LEFT JOIN tmp_customer_sub_map sm ON sm.legacy_id=s.sub_id_fk`
    ];
    for(let i=0;i<sql.length;i++){ await t.$executeRawUnsafe(sql[i]); console.log(`Imported points/discount step ${i+1}/${sql.length}`); }
    for(let i=0;i<tables.length;i++) { const n=await count(t,`\`${tables[i]}\``); if(n!==counts[i])throw new Error(`${tables[i]} ${n} != ${counts[i]}`); }
  },{maxWait:30000,timeout:3600000});
  console.log('Raw points and discounts imported; exact row counts verified');
} finally { await p.$disconnect(); }
