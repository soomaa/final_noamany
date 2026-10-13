import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
const p=new PrismaClient();
const key='noamanycenter_noamany:06f7dadd2176894a';
const stage='migration_trial_gym_20261007';
const target=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if(target!=='noamany_final_new')throw new Error('Unexpected target');
try{
 const branches=[[3,2],[4,3],[5,4],[8,2],[9,5]];
 const names=await p.$queryRawUnsafe(`SELECT branch_id,branch_name FROM \`${stage}\`.tbl_branches`);
 const nameById=new Map(names.map(x=>[x.branch_id,x.branch_name]));
 const clear=await p.$queryRawUnsafe('SELECT (SELECT COUNT(*) FROM club_members) members,(SELECT COUNT(*) FROM club_subscriptions) subs');
 if(Number(clear[0].members)||Number(clear[0].subs))throw new Error('Gym cleanup not finished');
 await p.$transaction(async tx=>{
  for(const [legacy,newId] of branches){
   await tx.$executeRawUnsafe('INSERT INTO legacy_branch_mappings (source_key,legacy_id,new_branch_id,source_name) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE new_branch_id=VALUES(new_branch_id),source_name=VALUES(source_name)',key,legacy,newId,nameById.get(legacy)||`legacy ${legacy}`);
  }
  await tx.$executeRawUnsafe("UPDATE legacy_branch_mappings SET new_branch_id=2 WHERE source_key='noamanycenter_noamany:944504425ff3d955' AND legacy_id=8");
  await tx.$executeRawUnsafe("UPDATE legacy_branch_mappings SET new_branch_id=5 WHERE source_key='noamanycenter_noamany:944504425ff3d955' AND legacy_id=9");
  await tx.$executeRawUnsafe(`INSERT INTO legacy_employee_mappings (source_key,legacy_id,new_employee_id,source_name,source_emp_code)
    SELECT ?,g.id,h.id,LEFT(g.employee,200),g.emp_code
    FROM \`${stage}\`.tbl_employees g JOIN employees h ON h.emp_code_gym=g.emp_code
    JOIN (SELECT emp_code_gym FROM employees WHERE emp_code_gym<>0 GROUP BY emp_code_gym HAVING COUNT(*)=1) unique_hr ON unique_hr.emp_code_gym=h.emp_code_gym
    WHERE TRIM(REPLACE(h.employee,CHAR(9),''))=TRIM(REPLACE(g.employee,CHAR(9),''))
    ON DUPLICATE KEY UPDATE new_employee_id=VALUES(new_employee_id),source_name=VALUES(source_name),source_emp_code=VALUES(source_emp_code)`,key);
 },{maxWait:30000,timeout:120000});
 const b=await p.$queryRawUnsafe('SELECT legacy_id,new_branch_id FROM legacy_branch_mappings WHERE source_key=? ORDER BY legacy_id',key);
 const n=await p.$queryRawUnsafe('SELECT COUNT(*) n FROM legacy_employee_mappings WHERE source_key=?',key);
 console.log(JSON.stringify({sourceKey:key,branchMappings:b,verifiedStaffMappings:Number(n[0].n)}));
}finally{await p.$disconnect()}
