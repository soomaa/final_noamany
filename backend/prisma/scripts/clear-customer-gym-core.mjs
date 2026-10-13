import 'dotenv/config';
import fs from 'node:fs';
import {PrismaClient} from '@prisma/client';
const p=new PrismaClient();
const target=decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
const source='migration_trial_gym_20261007';
const execute=process.argv.includes('--execute');
if(target!=='noamany_final_new')throw new Error('Unexpected target');
const tables=[
'cs_feedbacks','club_event_checkins','club_event_payments','club_event_registrations',
'club_receipt_payments','club_trainer_receipt_commissions','club_receipts',
'club_subscription_freezes','club_subscription_refunds','club_subscription_transfers','club_subscription_waivers','club_member_subscription_transfers',
'club_attendance','club_class_enrollments','club_class_waitlist','club_customer_service_interactions','club_discount_code_members',
'club_free_benefits','club_hall_bookings','club_inbody_bookings','club_inbody_invoices','club_inbody_measurements',
'club_locker_inventory_report_items','club_locker_inventory_reports','club_locker_inventory_lines','club_locker_inventory_sessions','club_locker_inventory_logs','club_locker_subscriptions','club_lockers','club_locker_subscription_types',
'club_member_images','club_member_point_transactions','club_member_contact_logs','club_member_documents','club_member_group_members','club_member_progress','club_physical_assessments','club_one_pass_sessions','club_reminders','club_spa_attendance','club_spa_bookings','club_spa_invoices','club_survey_responses','club_tickets','club_trainer_ratings','club_training_notes','club_workouts','club_workout_programs','club_branch_visits','club_calls','club_private_attendance_commissions',
'club_subscriptions','club_members','club_subscription_type_branches','club_subscription_types'];
try{
 const existing=new Set((await p.$queryRawUnsafe('SELECT table_name FROM information_schema.tables WHERE table_schema=?',target)).map(x=>x.table_name));
 const missing=tables.filter(x=>!existing.has(x));if(missing.length)throw new Error('Target tables missing: '+missing.join(','));
 const srcMembers=Number((await p.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${source}\`.tbl_members`))[0].n);
 const srcSubs=Number((await p.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${source}\`.tbl_subscription_members`))[0].n);
 const branchIds=(await p.$queryRawUnsafe('SELECT branch_id FROM tbl_branches ORDER BY branch_id')).map(x=>x.branch_id);
 const plan={source,target,clearTables:tables,sourceCounts:{members:srcMembers,subscriptions:srcSubs},branchMapping:{3:2,4:3,5:4,8:2,9:5},publishedBranches:branchIds,retainedUnrelatedTables:['tbl_branches','branch_settings','portal_content_items','sales_quick_sales','staff_tasks']};
 fs.writeFileSync('../tmp/customer-gym-import-plan-20261007.json',JSON.stringify(plan,null,2));
 console.log(JSON.stringify({clearTables:tables.length,sourceCounts:plan.sourceCounts,branchMapping:plan.branchMapping,publishedBranches:branchIds}));
 if(!execute)process.exit(0);
 if(srcMembers!==51043||srcSubs!==38037||branchIds.join(',')!=='2,3,4,5')throw new Error('Source or branch preflight changed');
 const backup='backups/noamany-final-new-before-real-import-20261007.sql.gz';if(!fs.existsSync(backup)||fs.statSync(backup).size<1000000)throw new Error('Backup missing');
 await p.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  for(const name of tables)await tx.$executeRawUnsafe(`DELETE FROM \`${target}\`.\`${name}\``);
  await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
  for(const name of ['club_members','club_subscriptions','club_subscription_types']){const n=Number((await tx.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${name}\``))[0].n);if(n)throw new Error('Not empty: '+name)}
 },{maxWait:30000,timeout:1800000});
 console.log('Gym canonical tables cleared');
}finally{await p.$disconnect()}
