/**
 * One-time script: set all api_users (member app) passwords to the default 000000.
 * Run: npx ts-node -r tsconfig-paths/register prisma/scripts/reset-member-passwords.ts
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { MEMBER_DEFAULT_PASSWORD } from '../../src/common/constants/member-auth.constants';

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(MEMBER_DEFAULT_PASSWORD, 12);
  const result = await prisma.api_users.updateMany({ data: { user_pass: hash } });
  console.log(`Updated ${result.count} member app account(s) to default password.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
