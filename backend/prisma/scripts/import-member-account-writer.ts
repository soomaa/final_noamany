import { Prisma, PrismaClient } from '@prisma/client';
import { createDefaultMemberAppUser, hashDefaultMemberPassword } from '../../src/modules/club-members/member-app-account';

export async function persistImportedMembersWithAppAccounts(
  prisma: PrismaClient,
  rows: Prisma.club_membersUncheckedCreateInput[],
): Promise<{ inserted: number; appAccountsCreated: number }> {
  const passwordHash = await hashDefaultMemberPassword();
  let inserted = 0;
  for (const data of rows) {
    let createdId: number | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const member = await tx.club_members.create({ data, select: { id: true, name: true, phone: true, email: true } });
        const account = await createDefaultMemberAppUser(tx, member, passwordHash);
        if (!account) throw new Error(`Imported member ${data.member_code} has no usable phone`);
        createdId = account.appUserId;
        await tx.club_members.update({ where: { id: member.id }, data: { app_user_id: account.appUserId } });
      });
      inserted++;
    } catch (error) {
      if (createdId != null) await prisma.api_users.delete({ where: { user_id: createdId } }).catch(() => undefined);
      throw error;
    }
  }
  return { inserted, appAccountsCreated: inserted };
}
