import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { MEMBER_DEFAULT_PASSWORD } from '../../common/constants/member-auth.constants';
import { normalizeName, normalizePhoneForStorage } from './club-member.utils';

export interface MemberAppAccountInput {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface MemberAppCredentials {
  username: string;
  plaintextPassword: string;
  appUserId: number;
}

type AppUserClient = Pick<Prisma.TransactionClient, 'api_users'>;

export async function hashDefaultMemberPassword(): Promise<string> {
  return bcrypt.hash(MEMBER_DEFAULT_PASSWORD, 12);
}

export async function createDefaultMemberAppUser(
  client: AppUserClient,
  member: MemberAppAccountInput,
  passwordHash?: string,
): Promise<MemberAppCredentials | null> {
  const phone = normalizePhoneForStorage(member.phone ?? '');
  if (!phone) return null;

  const appUser = await client.api_users.create({
    data: {
      user_name: normalizeName(member.name),
      user_phone: phone,
      user_email: member.email?.trim() || null,
      user_pass: passwordHash ?? await hashDefaultMemberPassword(),
      status: 1,
    },
    select: { user_id: true },
  });

  return {
    username: phone,
    plaintextPassword: MEMBER_DEFAULT_PASSWORD,
    appUserId: appUser.user_id,
  };
}

export function linkedMemberAppUserIds(rows: Array<{ app_user_id: number | null }>): number[] {
  return [...new Set(rows.flatMap((row) => row.app_user_id == null ? [] : [row.app_user_id]))];
}

export function sharedEmployeeAppUserIds(
  memberAppUserIds: number[],
  employeeRows: Array<{ app_user_id: number | null }>,
): number[] {
  const memberIds = new Set(memberAppUserIds);
  return linkedMemberAppUserIds(employeeRows).filter((id) => memberIds.has(id));
}

export async function resetMemberAppPasswords(
  client: AppUserClient,
  appUserIds: number[],
  passwordHash: string,
): Promise<{ updated: number }> {
  const ids = [...new Set(appUserIds)];
  if (!ids.length) return { updated: 0 };
  const result = await client.api_users.updateMany({
    where: { user_id: { in: ids } },
    data: { user_pass: passwordHash },
  });
  const saved = await client.api_users.findMany({
    where: { user_id: { in: ids } },
    select: { user_id: true, user_pass: true },
  });
  if (result.count !== ids.length || saved.filter((row) => row.user_pass === passwordHash).length !== ids.length) {
    throw new Error(`Password reset verification failed: requested=${ids.length}, updated=${result.count}`);
  }
  return { updated: result.count };
}
