import { PrismaClient } from '@prisma/client';
import { MEMBER_DEFAULT_PASSWORD } from '../../src/common/constants/member-auth.constants';
import { hashDefaultMemberPassword, linkedMemberAppUserIds, resetMemberAppPasswords, sharedEmployeeAppUserIds } from '../../src/modules/club-members/member-app-account';

const confirmation = () => process.argv.find((value) => value.startsWith('--confirm='))?.slice(10);
async function main() {
  const commit = process.argv.includes('--commit');
  const prisma = new PrismaClient();
  try {
    const links = await prisma.club_members.findMany({ where: { is_deleted: false, app_user_id: { not: null } }, select: { app_user_id: true } });
    const ids = linkedMemberAppUserIds(links);
    const existing = ids.length ? await prisma.api_users.findMany({ where: { user_id: { in: ids } }, select: { user_id: true } }) : [];
    const existingIds = existing.map((row) => row.user_id);
    const employeeLinks = ids.length ? await prisma.employees.findMany({ where: { app_user_id: { in: ids } }, select: { app_user_id: true } }) : [];
    const shared = sharedEmployeeAppUserIds(ids, employeeLinks);
    console.log(commit ? '=== COMMIT MODE ===' : '=== DRY RUN (no changes written) ===');
    console.log(`Linked member app accounts : ${ids.length}`);
    console.log(`Existing accounts to reset : ${existingIds.length}`);
    console.log(`Broken account references   : ${ids.length - existingIds.length}`);
    console.log(`Shared with employee account: ${shared.length}`);
    console.log(`New password                : ${MEMBER_DEFAULT_PASSWORD}`);
    if (!commit) { console.log('Re-run with --commit --confirm=RESET-ALL-MEMBER-PASSWORDS to apply.'); return; }
    if (confirmation() !== 'RESET-ALL-MEMBER-PASSWORDS') throw new Error('Commit cancelled: missing confirmation');
    if (ids.length !== existingIds.length) throw new Error('Commit cancelled: broken member account references exist');
    if (shared.length) throw new Error(`Commit cancelled: accounts shared with employees: ${shared.join(', ')}`);
    const result = await resetMemberAppPasswords(prisma, existingIds, await hashDefaultMemberPassword());
    console.log(`COMMITTED — reset and verified ${result.updated} member app account(s).`);
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
