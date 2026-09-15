/* eslint-disable no-console */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Refusing to update the production admin outside NODE_ENV=production');
  }
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  if (!password || password.length < 14) {
    throw new Error('INITIAL_ADMIN_PASSWORD must contain at least 14 characters');
  }

  const prisma = new PrismaClient();
  try {
    const admin = await prisma.users.findFirst({
      where: { username: 'admin' },
      select: { user_id: true },
    });
    if (!admin) throw new Error('The admin account is missing from the restored snapshot');

    const legacyMapping = await prisma.legacy_user_mappings.findFirst({
      where: { new_user_id: admin.user_id },
      select: { id: true },
    });
    if (legacyMapping) {
      throw new Error('Refusing to overwrite a legacy SQL user password');
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const hash = await bcrypt.hash(password, rounds);
    await prisma.users.update({
      where: { user_id: admin.user_id },
      data: {
        password: hash,
        approved: 1,
        level: 1,
        must_change_password: true,
      },
    });
    console.log('✅ Production admin login prepared (username: admin; password change required).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
