import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const p=new PrismaClient();
const stage='migration_trial_gym_20261007';
const key='noamanycenter_noamany:06f7dadd2176894a';
const target=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if(target!=='noamany_final_new')throw new Error('Unexpected target database');
const count=async(c,sql)=>Number((await c.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${sql}`))[0].n);
try{
 const n=await count(p,`\`${stage}\`.tbl_store_captain_discounts`);
 if(n!==30)throw new Error(`Expected 30 store captain discounts; got ${n}`);
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({source:'tbl_store_captain_discounts',target:'tbl_store_captain_discounts',count:n,mode:'dry-run'}));process.exit(0)}
 await p.$transaction(async t=>{
  await t.$executeRawUnsafe("SET collation_connection='utf8mb4_unicode_ci'");
  await t.$executeRawUnsafe('DELETE FROM tbl_store_captain_discounts');
  await t.$executeRawUnsafe(`INSERT INTO tbl_store_captain_discounts (id,captain_id,legacy_captain_id,discount_code,discount_rate,status,created_at)
   SELECT s.id,CASE WHEN tally.c=1 THEN em.new_employee_id ELSE NULL END,s.captain_id,s.discount_code,s.discount_rate,s.status,s.created_at
   FROM \`${stage}\`.tbl_store_captain_discounts s
   LEFT JOIN legacy_employee_mappings em ON em.source_key='${key}' AND em.legacy_id=s.captain_id
   LEFT JOIN (SELECT new_employee_id,COUNT(*) c FROM legacy_employee_mappings WHERE source_key='${key}' GROUP BY new_employee_id) tally ON tally.new_employee_id=em.new_employee_id`);
  const actual=await count(t,'tbl_store_captain_discounts');
  if(actual!==30)throw new Error(`Post-import count mismatch ${actual}`);
 },{maxWait:30000,timeout:120000});
 console.log('Store captain discounts imported and counted');
}finally{await p.$disconnect()}
