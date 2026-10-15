import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as migrationReconciler from '../../../prisma/scripts/reconcile-failed-migration';

const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../prisma/migrations/20260830100000_sales_crm_targets/migration.sql',
  ),
  'utf8',
);
const salesCrmSessionSql = migrationReconciler
  .splitSqlStatements(migrationSql)
  .filter((statement) =>
    /^(?:SET\s+@|PREPARE\b|EXECUTE\b|DEALLOCATE\s+PREPARE\b)/i.test(statement),
  )
  .join(';\n');
const trainerCommissionMigrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../prisma/migrations/20260909120000_one80_trainer_commission_integrity/migration.sql',
  ),
  'utf8',
);

describe('failed migration reconciliation', () => {
  it('safely replaces the known sales CRM session SQL during partial recovery', async () => {
    const Reconciler = (
      migrationReconciler as typeof migrationReconciler & {
        Reconciler?: new (db: unknown) => { apply(sql: string): Promise<void> };
      }
    ).Reconciler;
    expect(Reconciler).toBeDefined();
    if (!Reconciler) return;

    const executeRawUnsafe = jest.fn().mockResolvedValue(0);
    const queryRawUnsafe = jest.fn().mockImplementation((query: string) => {
      if (query.includes('information_schema.tables')) return [{ count: 1n }];
      return [{ count: 0n }];
    });
    const reconciler = new Reconciler({
      $executeRawUnsafe: executeRawUnsafe,
      $queryRawUnsafe: queryRawUnsafe,
    });

    await reconciler.apply(salesCrmSessionSql);

    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe.mock.calls[0][0]).toContain(
      'ADD COLUMN `creates_sales_lead` BOOLEAN NOT NULL DEFAULT false',
    );
  });

  it('copies compatible legacy leads idempotently during partial recovery', async () => {
    const Reconciler = (
      migrationReconciler as typeof migrationReconciler & {
        Reconciler?: new (db: unknown) => { apply(sql: string): Promise<void> };
      }
    ).Reconciler;
    expect(Reconciler).toBeDefined();
    if (!Reconciler) return;

    const executeRawUnsafe = jest.fn().mockResolvedValue(0);
    const queryRawUnsafe = jest.fn().mockImplementation((query: string) => {
      if (query.includes('information_schema.tables')) return [{ count: 1n }];
      if (query.includes('COUNT(DISTINCT column_name)')) return [{ count: 9n }];
      return [{ count: 0n }];
    });
    const reconciler = new Reconciler({
      $executeRawUnsafe: executeRawUnsafe,
      $queryRawUnsafe: queryRawUnsafe,
    });

    await reconciler.apply(salesCrmSessionSql);

    expect(executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(executeRawUnsafe.mock.calls[1][0]).toContain(
      'INSERT INTO club_sales_crm_leads',
    );
    expect(executeRawUnsafe.mock.calls[1][0]).toContain('NOT EXISTS');
  });

  it('reconciles the trainer refund commission table using MySQL-safe index names', async () => {
    const Reconciler = (
      migrationReconciler as typeof migrationReconciler & {
        Reconciler?: new (db: unknown) => { apply(sql: string): Promise<void> };
      }
    ).Reconciler;
    expect(Reconciler).toBeDefined();
    if (!Reconciler) return;

    const createRefundTable = migrationReconciler
      .splitSqlStatements(trainerCommissionMigrationSql)
      .find((statement) =>
        /^CREATE\s+TABLE\s+`club_trainer_subscription_refund_commissions`/i.test(statement),
      );
    expect(createRefundTable).toBeDefined();
    if (!createRefundTable) return;

    const executeRawUnsafe = jest.fn().mockImplementation(async (query: string) => {
      for (const match of query.matchAll(/(?:UNIQUE\s+)?INDEX\s+`([^`]+)`/gi)) {
        if (match[1].length > 64) {
          throw new Error(`MySQL 1059: identifier too long: ${match[1]}`);
        }
      }
      return 0;
    });
    const reconciler = new Reconciler({
      $executeRawUnsafe: executeRawUnsafe,
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ count: 0n }]),
    });

    await expect(reconciler.apply(createRefundTable)).resolves.toBeUndefined();
  });
});
