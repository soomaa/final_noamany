import 'dotenv/config';
import { createFastLegacyMaps } from './customer-fast-legacy-maps.mjs';
import { PrismaClient } from '@prisma/client';
const taskDbUrl=new URL(process.env.DATABASE_URL);
taskDbUrl.searchParams.set('connection_limit','1');
taskDbUrl.searchParams.set('pool_timeout','120');
const p=new PrismaClient({datasources:{db:{url:taskDbUrl.toString()}},errorFormat:'minimal'});
const stage='migration_trial_gym_20261007';
const sourceKey='noamanycenter_noamany:06f7dadd2176894a';
const target=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if(target!=='noamany_final_new')throw new Error('Unexpected target database');
const S=`\`${stage}\``;const K=`'${sourceKey}'`;
const sources={tbl_invitations:3438,tbl_offers:3,tbl_offers_favorites:129,tbl_member_contacts_sub:2,tbl_members_blocked:13};
const count=async(c,x)=>Number((await c.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${x}`))[0].n);
try{
 for(const [name,n] of Object.entries(sources)){const actual=await count(p,`${S}.\`${name}\``);if(actual!==n)throw new Error(`${name}: ${actual} != ${n}`)}
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({target,stage,sources,mode:'dry-run'}));process.exit(0)}
 const mapped=await count(p,`legacy_record_mappings WHERE source_key=${K} AND legacy_table='tbl_members' AND target_table='club_members'`);
 if(mapped<50000)throw new Error(`Core member mappings incomplete: ${mapped}`);
 const run=await p.$queryRawUnsafe(`SELECT id FROM legacy_import_runs WHERE source_key=${K} ORDER BY id DESC LIMIT 1`);
 if(!run.length)throw new Error('Core import run missing');
 const runId=Number(run[0].id);
 await p.$transaction(async t=>{
  await t.$executeRawUnsafe("SET collation_connection='utf8mb4_unicode_ci'");
  await createFastLegacyMaps(t,sourceKey);
  await t.$executeRawUnsafe(`DELETE FROM am_invitations`);
  await t.$executeRawUnsafe(`DELETE FROM am_offers`);
  await t.$executeRawUnsafe(`DELETE FROM club_member_contact_logs`);
  await t.$executeRawUnsafe(`DELETE FROM legacy_record_mappings WHERE source_key=${K} AND legacy_table IN ('tbl_invitations','tbl_offers','tbl_offers_favorites','tbl_member_contacts_sub','tbl_members_blocked')`);
  await t.$executeRawUnsafe(`INSERT INTO am_offers (id,title,description,image_url,discount,start_date,end_date,is_active,created_at,updated_at)
   SELECT o.offer_id,LEFT(COALESCE(NULLIF(TRIM(o.offer_name),''),CONCAT('Legacy offer ',o.offer_id)),255),
    CONCAT_WS('\n',NULLIF(TRIM(o.sub_title),''),NULLIF(TRIM(o.offer_details),'')),LEFT(NULLIF(TRIM(o.image),''),500),
    o.offer_value,LEFT(o.from_date,10),LEFT(o.to_date,10),o.status='activ',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
   FROM ${S}.tbl_offers o`);
  await t.$executeRawUnsafe(`INSERT INTO am_invitations
   (id,invitation_code,recipient_name,recipient_phone,inviter_member_id,sent_date,status,accepted_date,rejected_date,attendance_date,branch_id,created_at,updated_at)
   SELECT i.inv_id,CONCAT('LEG-INV-',i.inv_id),LEFT(COALESCE(NULLIF(TRIM(i.person_name),''),CONCAT('Legacy invitee ',i.inv_id)),255),
    LEFT(NULLIF(TRIM(i.phone),''),50),mm.target_id,
    COALESCE(STR_TO_DATE(CONCAT(i.inv_date,' ',UPPER(i.inv_time)),'%Y-%m-%d %h:%i %p'),STR_TO_DATE(i.inv_date,'%Y-%m-%d'),CURRENT_TIMESTAMP(3)),
    CASE WHEN NULLIF(TRIM(i.hdoor_date),'') IS NOT NULL THEN 'attended' WHEN i.inv_action='accepted' THEN 'accepted' WHEN i.inv_action='refused' THEN 'rejected' ELSE 'pending' END,
    CASE WHEN i.inv_action='accepted' THEN COALESCE(STR_TO_DATE(CONCAT(i.act_date,' ',UPPER(i.act_time)),'%Y-%m-%d %h:%i %p'),STR_TO_DATE(i.act_date,'%Y-%m-%d')) END,
    CASE WHEN i.inv_action='refused' THEN COALESCE(STR_TO_DATE(CONCAT(i.act_date,' ',UPPER(i.act_time)),'%Y-%m-%d %h:%i %p'),STR_TO_DATE(i.act_date,'%Y-%m-%d')) END,
    CASE WHEN NULLIF(TRIM(i.hdoor_date),'') IS NOT NULL THEN COALESCE(STR_TO_DATE(CONCAT(i.hdoor_date,' ',UPPER(COALESCE(i.hdoor_time,''))),'%Y-%m-%d %h:%i %p'),STR_TO_DATE(i.hdoor_date,'%Y-%m-%d')) END,
    bm.new_branch_id,
    COALESCE(STR_TO_DATE(CONCAT(i.inv_date,' ',UPPER(i.inv_time)),'%Y-%m-%d %h:%i %p'),STR_TO_DATE(i.inv_date,'%Y-%m-%d'),CURRENT_TIMESTAMP(3)),CURRENT_TIMESTAMP(3)
   FROM ${S}.tbl_invitations i
   LEFT JOIN ${S}.tbl_members m ON m.mem_id=i.mem_id
   LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=i.mem_id
   LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${K} AND bm.legacy_id=m.branch_id_fk`);
  await t.$executeRawUnsafe(`INSERT INTO club_member_contact_logs
   (id,member_id,source_member_code,contact_type,contact_date,source_table,created_at)
   SELECT s.id,cm.id,s.m_code_fk,s.contact_type,s.contact_date,'tbl_member_contacts_sub',COALESCE(s.created_at,CURRENT_TIMESTAMP(3))
   FROM ${S}.tbl_member_contacts_sub s LEFT JOIN club_members cm ON cm.member_code=s.m_code_fk COLLATE utf8mb4_unicode_ci`);
  await t.$executeRawUnsafe(`UPDATE ${S}.tbl_members_blocked b
   JOIN tmp_customer_member_map mm ON mm.legacy_id=b.mem_id_fk
   JOIN club_members cm ON cm.id=mm.target_id
   SET cm.is_active=0,cm.is_blocked=1,cm.block_reason=LEFT(b.reason,500),cm.blocked_by=(SELECT um.new_user_id FROM legacy_user_mappings um WHERE um.source_key=${K} AND um.legacy_id=b.user_id LIMIT 1),cm.notes=CONCAT_WS('\n',NULLIF(cm.notes,''),CONCAT('[legacy-block:',b.id,'] ',COALESCE(b.date_ar,''),' ',COALESCE(b.time_add,''),' — ',COALESCE(b.reason,'')))
   WHERE COALESCE(cm.notes,'') NOT LIKE CONCAT('%[legacy-block:',b.id,']%')`);
  await t.$executeRawUnsafe(`INSERT INTO legacy_record_mappings
   (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
   SELECT ${runId},${K},'tbl_offers',CAST(offer_id AS CHAR),'am_offers',offer_id,'mapped',
    JSON_OBJECT('legacy_sub_title',sub_title,'legacy_offer_details',offer_details,'legacy_status',status)
   FROM ${S}.tbl_offers`);
  await t.$executeRawUnsafe(`INSERT INTO legacy_record_mappings
   (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
   SELECT ${runId},${K},'tbl_invitations',CAST(i.inv_id AS CHAR),'am_invitations',i.inv_id,'mapped',
    JSON_OBJECT('legacy_member_id',i.mem_id,'legacy_action',i.inv_action,'legacy_inv_time',i.inv_time,'legacy_act_time',i.act_time,'legacy_hdoor_time',i.hdoor_time)
   FROM ${S}.tbl_invitations i`);
  await t.$executeRawUnsafe(`INSERT INTO legacy_record_mappings
   (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
   SELECT ${runId},${K},'tbl_member_contacts_sub',CAST(s.id AS CHAR),'club_member_contact_logs',s.id,'mapped',JSON_OBJECT('legacy_member_code',s.m_code_fk)
   FROM ${S}.tbl_member_contacts_sub s`);
  await t.$executeRawUnsafe(`INSERT INTO legacy_record_mappings
   (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
   SELECT ${runId},${K},'tbl_members_blocked',CAST(b.id AS CHAR),
    CASE WHEN mm.target_id IS NULL THEN 'legacy_archive' ELSE 'club_members' END,mm.target_id,
    CASE WHEN mm.target_id IS NULL THEN 'archived_only' ELSE 'merged' END,
    JSON_OBJECT('legacy_member_id',b.mem_id_fk,'legacy_member_code',b.mem_code_fk,'reason',b.reason,'date',b.date_ar,'time',b.time_add,'legacy_user_id',b.user_id)
   FROM ${S}.tbl_members_blocked b LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=b.mem_id_fk`);
  await t.$executeRawUnsafe(`INSERT INTO legacy_record_mappings
   (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
   SELECT ${runId},${K},'tbl_offers_favorites',CAST(f.id AS CHAR),'legacy_archive',NULL,'archived_only',
    JSON_OBJECT('legacy_offer_id',f.offer_id_fk,'new_offer_id',ao.id,'legacy_member_id',f.mem_id,'new_member_id',mm.target_id,'reason',CASE WHEN ao.id IS NULL THEN 'legacy_offer_missing' ELSE 'target_has_no_favorites_table' END)
   FROM ${S}.tbl_offers_favorites f
   LEFT JOIN am_offers ao ON ao.id=f.offer_id_fk
   LEFT JOIN tmp_customer_member_map mm ON mm.legacy_id=f.mem_id`);
  const actual={am_invitations:await count(t,'am_invitations'),am_offers:await count(t,'am_offers'),club_member_contact_logs:await count(t,'club_member_contact_logs'),favorites_archive:await count(t,`legacy_record_mappings WHERE source_key=${K} AND legacy_table='tbl_offers_favorites' AND target_table='legacy_archive'`),blocked_audit:await count(t,`legacy_record_mappings WHERE source_key=${K} AND legacy_table='tbl_members_blocked'`)};
  if(actual.am_invitations!==3438||actual.am_offers!==3||actual.club_member_contact_logs!==2||actual.favorites_archive!==129||actual.blocked_audit!==13)throw new Error(JSON.stringify(actual));
 },{maxWait:30000,timeout:3600000});
 console.log('Invitations, offers, contacts, blocks, and historical favorites imported/reconciled');
}finally{await p.$disconnect()}
