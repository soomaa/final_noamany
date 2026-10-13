import 'dotenv/config';
import { createFastLegacyMaps } from './customer-fast-legacy-maps.mjs';
import { PrismaClient } from '@prisma/client';
const p=new PrismaClient();
const src='migration_trial_gym_20261007';
const key='noamanycenter_noamany:06f7dadd2176894a';
const target=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if(target!=='noamany_final_new') throw new Error('Unexpected target database');
const S=`\`${src}\``; const K=`'${key}'`;
const expected={club_member_images:9699,club_member_point_transactions:11697,club_locker_inventory_logs:38796};
const count=async(c,t)=>Number((await c.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${t}`))[0].n);
try{
 const source={
  club_member_images:await count(p,`${S}.tbl_members_imgs`),
  club_member_point_transactions:await count(p,`${S}.tbl_points_history`)+await count(p,`${S}.tbl_points_exhausted_history`),
  club_locker_inventory_logs:await count(p,`${S}.tbl_locker_inventory`)
 };
 for(const [t,n] of Object.entries(expected))if(source[t]!==n)throw new Error(`Source ${t}: ${source[t]} != ${n}`);
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({target,source:src,expected,mode:'dry-run'}));process.exit(0)}
 const mapped=await count(p,`legacy_record_mappings WHERE source_key=${K} AND legacy_table='tbl_members' AND target_table='club_members'`);
 if(mapped<50000)throw new Error(`Core mappings incomplete: ${mapped}`);
 await p.$transaction(async t=>{
  await t.$executeRawUnsafe("SET collation_connection='utf8mb4_unicode_ci'");
  await createFastLegacyMaps(t,key);
  for(const name of Object.keys(expected))await t.$executeRawUnsafe(`DELETE FROM \`${name}\``);
  await t.$executeRawUnsafe(`INSERT INTO club_member_images (id,member_id,source_member_id,image_path,captured_at,uploaded_by,created_at)
   SELECT s.img_id,COALESCE(mm.target_id,om.target_id),s.member_id_fk,s.image,s.created,um.new_user_id,COALESCE(s.created,CURRENT_TIMESTAMP(3))
   FROM ${S}.tbl_members_imgs s
   LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.member_id_fk
   LEFT JOIN tmp_customer_orphan_map om ON om.legacy_id=s.member_id_fk
   LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND um.legacy_id=s.user_id`);
  await t.$executeRawUnsafe(`INSERT INTO club_member_point_transactions
   (id,member_id,source_member_id,member_code,transaction_type,action_type,action_name,subscription_type_id,source_subscription_type_id,subscription_id,source_subscription_id,points,occurred_at,expiry_date,expiry_label,created_by,is_deleted,is_active,created_at)
   SELECT s.id,COALESCE(mm.target_id,cm.id),s.member_id,s.member_code,CASE WHEN s.type='increase' THEN 'earn' ELSE 'redeem' END,s.action_type,s.action_name,tm.target_id,s.subscription_type_id_fk,sm.target_id,s.sub_id_fk,s.points,
    CASE WHEN s.time REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.time AS UNSIGNED)) WHEN s.date_added REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(LEFT(s.date_added,10),'%Y-%m-%d') ELSE NULL END,
    s.deadline_date,s.deadline_date_string,um.new_user_id,s.deleted,COALESCE(s.is_active,0),CURRENT_TIMESTAMP(3)
   FROM ${S}.tbl_points_history s
   LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.member_id
   LEFT JOIN club_members cm ON cm.member_code=s.member_code COLLATE utf8mb4_unicode_ci
   LEFT JOIN tmp_customer_type_map tm ON tm.legacy_id=s.subscription_type_id_fk
   LEFT JOIN tmp_customer_sub_map sm ON sm.legacy_id=s.sub_id_fk
   LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND um.legacy_id=CAST(s.publisher AS UNSIGNED)`);
  await t.$executeRawUnsafe(`INSERT INTO club_member_point_transactions
   (id,member_id,source_member_id,member_code,transaction_type,action_name,subscription_type_id,source_subscription_type_id,subscription_id,source_subscription_id,points,occurred_at,created_by,is_deleted,is_active,created_at)
   SELECT 100000000+s.id,COALESCE(cm.id,mm.target_id),s.member_id,s.member_code,'redeem',LEFT(CONCAT('استبدال نقاط — ',COALESCE(NULLIF(s.sub_type,''),'عملية قديمة')),100),tm.target_id,s.subscription_type_id_fk,sm.target_id,s.sub_id_fk,s.points,
    CASE WHEN s.time REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.time AS UNSIGNED)) ELSE NULL END,um.new_user_id,s.deleted,1,CURRENT_TIMESTAMP(3)
   FROM ${S}.tbl_points_exhausted_history s
   LEFT JOIN club_members cm ON cm.member_code=s.member_code COLLATE utf8mb4_unicode_ci
   LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=s.member_id
   LEFT JOIN tmp_customer_type_map tm ON tm.legacy_id=s.subscription_type_id_fk
   LEFT JOIN tmp_customer_sub_map sm ON sm.legacy_id=NULLIF(s.sub_id_fk,0)
   LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND um.legacy_id=CAST(s.publisher AS UNSIGNED)`);
  await t.$executeRawUnsafe(`INSERT INTO club_locker_inventory_logs
   (id,locker_id,source_locker_id,locker_type,branch_id,inventory_number,inventory_date,employee_id,employee_code,created_by,recorded_at,notes,created_at)
   SELECT s.id,lm.target_id,s.locker_id_fk,s.locker_type,bm.new_branch_id,s.num_invent,s.invent_date,em.new_employee_id,s.emp_code,um.new_user_id,
    CASE WHEN s.date REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.date AS UNSIGNED)) ELSE NULL END,
    CONCAT_WS(' | ',NULLIF(s.notes,''),NULLIF(s.publisher,'')),CURRENT_TIMESTAMP(3)
   FROM ${S}.tbl_locker_inventory s
   LEFT JOIN tmp_customer_locker_map lm ON lm.legacy_id=s.locker_id_fk
   LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${K} AND bm.legacy_id=s.sub_branch_id_fk
   LEFT JOIN legacy_employee_mappings em ON em.source_key=${K} AND em.legacy_id=s.employee_id_fk
   LEFT JOIN legacy_user_mappings um ON um.source_key=${K} AND um.legacy_id=s.user_id`);
  for(const [name,n] of Object.entries(expected)){console.log(`Verifying ${name}`);const actual=await count(t,`\`${name}\``);if(actual!==n)throw new Error(`${name}: ${actual} != ${n}`)}
 },{maxWait:30000,timeout:3600000});
 console.log('Images, point transactions, and locker inventory imported; exact row counts verified');
}finally{await p.$disconnect()}

