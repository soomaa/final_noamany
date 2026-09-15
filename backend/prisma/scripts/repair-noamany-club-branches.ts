/* eslint-disable no-console */
/**
 * Restores the canonical Noamany club branches used by legacy member codes
 * and reports. The transaction never updates club_members.member_code.
 *
 * Usage:
 *   npm run db:validate:noamany-club-branches
 *   npm run db:repair:noamany-club-branches
 */
import 'dotenv/config';
import { BrCode, Prisma, PrismaClient } from '@prisma/client';

type ExpectedBranch = {
  legacyId: number;
  branchId: number;
  name: string;
  code: BrCode;
  parentId: number;
};

const EXPECTED_BRANCHES: ExpectedBranch[] = [
  { legacyId: 3, branchId: 2, name: 'فرع طنطا', code: BrCode.C, parentId: 0 },
  {
    legacyId: 4,
    branchId: 3,
    name: 'فرع البر الشرقي- شبين الكوم',
    code: BrCode.A,
    parentId: 1,
  },
  {
    legacyId: 5,
    branchId: 4,
    name: 'فرع الجلاء- شبين الكوم',
    code: BrCode.B,
    parentId: 1,
  },
  { legacyId: 8, branchId: 5, name: 'فرع طنطا Up', code: BrCode.C, parentId: 2 },
  { legacyId: 9, branchId: 6, name: 'فرع طنطا Down', code: BrCode.C, parentId: 2 },
];

class DryRunRollback extends Error {
  constructor(readonly messages: string[]) {
    super('Dry-run rollback requested');
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  try {
    const messages = await prisma.$transaction(
      async (tx) => {
        const mappings = await tx.legacy_branch_mappings.findMany({
          where: { legacy_id: { in: EXPECTED_BRANCHES.map((branch) => branch.legacyId) } },
          select: { legacy_id: true, new_branch_id: true, source_key: true },
        });

        for (const expected of EXPECTED_BRANCHES) {
          const matches = mappings.filter((mapping) => mapping.legacy_id === expected.legacyId);
          if (matches.length !== 1) {
            throw new Error(
              `Expected one legacy mapping for branch ${expected.legacyId}; found ${matches.length}`,
            );
          }
          if (matches[0].new_branch_id !== expected.branchId) {
            throw new Error(
              `Legacy branch ${expected.legacyId} maps to ${matches[0].new_branch_id}, expected ${expected.branchId}`,
            );
          }
        }

        const changes: string[] = [];
        for (const expected of EXPECTED_BRANCHES) {
          const current = await tx.tbl_branches.findUnique({
            where: { branch_id: expected.branchId },
            select: { branch_id: true, branch_name: true, br_code: true, from_id: true },
          });

          if (!current) {
            if (expected.branchId !== 6) {
              throw new Error(`Required branch ${expected.branchId} is missing`);
            }
            await tx.tbl_branches.create({
              data: {
                branch_id: expected.branchId,
                branch_name: expected.name,
                br_code: expected.code,
                from_id: expected.parentId,
              },
            });
            changes.push(
              `created branch ${expected.branchId}: ${expected.name} (${expected.code})`,
            );
            continue;
          }

          if (
            current.branch_name !== expected.name ||
            current.br_code !== expected.code ||
            current.from_id !== expected.parentId
          ) {
            await tx.tbl_branches.update({
              where: { branch_id: expected.branchId },
              data: {
                branch_name: expected.name,
                br_code: expected.code,
                from_id: expected.parentId,
              },
            });
            changes.push(
              `updated branch ${expected.branchId}: ${expected.name} (${expected.code})`,
            );
          }
        }

        if (dryRun) throw new DryRunRollback(changes);
        return changes;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    for (const message of messages) console.log(`[changed] ${message}`);
    console.log(
      messages.length === 0
        ? 'Noamany club branches are already correct.'
        : `Noamany club branch repair completed: ${messages.length} change(s).`,
    );
  } catch (error) {
    if (error instanceof DryRunRollback) {
      for (const message of error.messages) console.log(`[dry-run] ${message}`);
      console.log(
        error.messages.length === 0
          ? 'Validation passed: Noamany club branches are correct.'
          : `Validation found ${error.messages.length} required change(s); transaction rolled back.`,
      );
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
