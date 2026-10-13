import 'dotenv/config';
import fs from 'node:fs';
import {PrismaClient} from '@prisma/client';
const p=new PrismaClient();
const src=process.env.CUSTOMER_HR_SCHEMA||'migration_trial_hr_20261007';
const dst=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
const go=process.argv.includes('--execute');
if(!/^[A-Za-z0-9_]+$/.test(src)||dst!=='noamany_final_new'||src===dst)throw new Error('Unsafe databases');
const q=x=>{if(!/^[A-Za-z0-9_]+$/.test(x))throw new Error('Unsafe identifier');return '`'+x+'`'};
const explicit=new Set(['contract_employe','departments','department_jobs','department_job_relations','employees','employees_branches','holiday_setting','tbl_hdodr_setting','tbl_hdodr_status','tbl_hdoor_emps','tbl_hdoor_emps_history','tbl_hdoor_dawms_emps']);
const noAssignment=new Set(['hr_emp_dwam','hr_emp_dwam_details','tbl_hdoor_dawms_emps']);
const allowedNew=new Set(['always_setting','emp_badlat_discount_details','emp_badlat_discount_settings','emp_custody_transfer_operations','emp_debts','emp_evaluation','emp_evaluation_details','emp_ohad','emp_ohad_devices','emp_ohad_tahwlat']);
const include=t=>t.startsWith('hr_')||t.startsWith('emp_')||explicit.has(t)||allowedNew.has(t);
const branch=c=>`CASE s.${q(c)} WHEN 0 THEN 3 WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 WHEN 5 THEN 5 ELSE s.${q(c)} END`;
async function metadata(schema){const a=await p.$queryRawUnsafe('SELECT table_name,column_name,is_nullable,column_default,extra FROM information_schema.columns WHERE table_schema=? ORDER BY table_name,ordinal_position',schema);const m=new Map();for(const x of a){if(!m.has(x.table_name))m.set(x.table_name,[]);m.get(x.table_name).push(x)}return m}
try{
 const [s,t]=await Promise.all([metadata(src),metadata(dst)]);
 const tables=[...s.keys()].filter(include).sort();
 const create=tables.filter(x=>!t.has(x));
 if(create.some(x=>!allowedNew.has(x)))throw new Error('Unexpected missing tables: '+create.join(','));
 const missing=[];const required=[];
 for(const name of tables.filter(x=>t.has(x))){const sc=new Set(s.get(name).map(x=>x.column_name)),tc=new Set(t.get(name).map(x=>x.column_name));for(const c of sc)if(!tc.has(c))missing.push(name+'.'+c);for(const x of t.get(name))if(!sc.has(x.column_name)&&x.is_nullable==='NO'&&x.column_default==null&&!String(x.extra).includes('auto_increment'))required.push(name+'.'+x.column_name)}
 if(missing.some(x=>x!=='hr_egraat_emp_setting.branch_id_fk')||required.length)throw new Error(JSON.stringify({missing,required}));
 const counts={};for(const name of ['employees','hr_edarat_aqsam','tbl_hdodr_setting','always_setting'])counts[name]=Number((await p.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${q(src)}.${q(name)}`))[0].n);
 const plan={source:src,target:dst,copyTables:tables.filter(x=>!noAssignment.has(x)),clearOnlyTables:[...noAssignment],createTables:create,addColumns:missing,keyCounts:counts};
 fs.writeFileSync('../tmp/customer-hr-import-plan-20261007.json',JSON.stringify(plan,null,2));
 console.log(JSON.stringify({copyTables:plan.copyTables.length,clearOnly:plan.clearOnlyTables,create,missing,keyCounts:counts}));
 if(!go)process.exit(0);
 const backup='backups/noamany-final-new-before-real-import-20261007.sql.gz';if(!fs.existsSync(backup)||fs.statSync(backup).size<1000000)throw new Error('Verified backup missing');
 if(counts.employees!==179||counts.hr_edarat_aqsam!==12||counts.tbl_hdodr_setting!==45)throw new Error('Source changed');
 if(missing.length)await p.$executeRawUnsafe(`ALTER TABLE ${q(dst)}.${q('hr_egraat_emp_setting')} ADD COLUMN ${q('branch_id_fk')} INT NOT NULL DEFAULT 0`);
 for(const name of create)await p.$executeRawUnsafe(`CREATE TABLE ${q(dst)}.${q(name)} LIKE ${q(src)}.${q(name)}`);
 await p.$transaction(async tx=>{
  for(const name of [...tables].reverse())if(t.has(name))await tx.$executeRawUnsafe(`DELETE FROM ${q(dst)}.${q(name)}`);
  for(const name of tables.filter(x=>!noAssignment.has(x))){const cols=s.get(name).map(x=>x.column_name);const select=cols.map(c=>c==='branch_id_fk'&&['employees','employees_branches','tbl_hdoor_emps','always_setting','hr_egraat_emp_setting'].includes(name)?branch(c):`s.${q(c)}`);await tx.$executeRawUnsafe(`INSERT INTO ${q(dst)}.${q(name)} (${cols.map(q).join(',')}) SELECT ${select.join(',')} FROM ${q(src)}.${q(name)} s`)}
  for(const name of ['employees','hr_edarat_aqsam','tbl_hdodr_setting']){const n=Number((await tx.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${q(dst)}.${q(name)}`))[0].n);if(n!==counts[name])throw new Error(name+' count mismatch '+n)}
  const bad=await tx.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${q(dst)}.employees e LEFT JOIN ${q(dst)}.hr_edarat_aqsam a ON a.id=e.edara_id LEFT JOIN ${q(dst)}.hr_edarat_aqsam z ON z.id=e.qsm_id WHERE a.id IS NULL OR z.id IS NULL`);if(Number(bad[0].n))throw new Error('Invalid employee organization links');
  for(const name of noAssignment){const n=Number((await tx.$queryRawUnsafe(`SELECT COUNT(*) n FROM ${q(dst)}.${q(name)}`))[0].n);if(n)throw new Error('Assignment not cleared: '+name)}
 },{maxWait:30000,timeout:1800000});
 console.log('HR import completed');
}finally{await p.$disconnect()}
