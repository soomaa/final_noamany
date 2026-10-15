import { PrismaClient } from '@prisma/client';
import { seedPortableRbac } from '../src/portable/portable-rbac-seed';

const prisma = new PrismaClient();

seedPortableRbac(prisma)
  .then((result) => console.log(JSON.stringify({ status: 'passed', ...result })))
  .finally(() => prisma.$disconnect());
