import { PrismaClient } from '@prisma/client';
import { MEMBER_DEFAULT_PASSWORD } from '../../src/common/constants/member-auth.constants';
import { normalizePhoneForStorage } from '../../src/modules/club-members/club-member.utils';
import { createDefaultMemberAppUser, hashDefaultMemberPassword } from '../../src/modules/club-members/member-app-account';

async function main() {
  const commit = process.argv.includes('--commit');
  const prisma = new PrismaClient();
  try {
    const members = await prisma.club_members.findMany({ where: { is_deleted: false, app_user_id: null }, select: { id: true, name: true, phone: true, email: true, branch_id: true }, orderBy: [{ branch_id: 'asc' }, { id: 'asc' }] });
    const eligible = members.filter((member) => normalizePhoneForStorage(member.phone ?? ''));
    console.log(commit ? '=== COMMIT MODE ===' : '=== DRY RUN (no changes written; pass --commit to apply) ===');
    console.log(`Unlinked non-deleted members scanned: ${members.length}`);
    console.log(`  App accounts to create       : ${eligible.length}`);
    console.log(`  Skipped (no usable phone)    : ${members.length - eligible.length}`);
    console.log(`Default password for all: ${MEMBER_DEFAULT_PASSWORD}`);
    if (!commit) return;
    const passwordHash = await hashDefaultMemberPassword();
    let created = 0;
    for (const member of eligible) {
      let createdId: number | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          const account = await createDefaultMemberAppUser(tx, member, passwordHash);
          if (!account) throw new Error(`Invalid phone for member ${member.id}`);
          createdId = account.appUserId;
          const linked = await tx.club_members.updateMany({ where: { id: member.id, app_user_id: null, is_deleted: false }, data: { app_user_id: account.appUserId } });
          if (linked.count !== 1) throw new Error(`Member ${member.id} changed while provisioning`);
        });
        created++;
      } catch (error) {
        if (createdId != null) await prisma.api_users.delete({ where: { user_id: createdId } }).catch(() => undefined);
        throw error;
      }
    }
    console.log(`COMMITTED — created and linked ${created} app account(s).`);
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
