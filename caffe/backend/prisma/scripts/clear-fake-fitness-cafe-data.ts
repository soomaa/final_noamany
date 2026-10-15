import { Prisma, PrismaClient } from '@prisma/client';

type SqlClient = PrismaClient | Prisma.TransactionClient;

/**
 * Operational demo tables only. Core member/subscription tables are deliberately absent.
 * Keep child tables before parents so the list also documents the intended dependency order.
 */
const tables = {
  fitness: [
    'club_class_enrollments',
    'club_class_waitlist',
    'club_classes',
    'club_trainer_schedule_slots',
    'club_class_schedule_slots',
    'club_subscription_type_classes',
    'club_class_type_trainers',
    'club_trainer_salaries',
    'club_trainer_earning_payments',
    'club_trainer_ratings',
    'club_trainers',
  ],
  cafe: [
    'sales_pos_payments',
    'sales_quick_sale_items',
    'sales_quick_sales',
    'cafe_product_recipes',
    'cafe_products',
    'cafe_partners',
    'prc_supplier_payments',
    'prc_supplier_invoice_items',
    'prc_supplier_invoices',
    'inv_movements',
    'inv_transaction_items',
    'inv_transactions',
    'inv_count_items',
    'inv_adjustments',
    'inv_count_sessions',
    'inv_opening_stocks',
    'inv_product_branches',
    'inv_stock_balances',
    'inv_product_storages',
    'inv_composite_items',
    'inv_supplier_products',
    'inv_products',
    'inv_categories',
  ],
} as const;

const protectedTables = [
  'club_members',
  'club_subscriptions',
  'club_receipts',
  'club_subscription_waivers',
  'club_subscription_refunds',
  'club_subscription_freezes',
  'club_subscription_transfers',
] as const;

async function count(client: SqlClient, table: string): Promise<number> {
  const rows = await client.$queryRawUnsafe<Array<{ total: bigint }>>(
    `SELECT COUNT(*) AS total FROM \`${table}\``,
  );
  return Number(rows[0]?.total ?? 0);
}

async function counts(client: SqlClient, names: readonly string[]) {
  const result: Record<string, number> = {};
  for (const table of names) result[table] = await count(client, table);
  return result;
}

async function coreFingerprint(client: SqlClient) {
  const memberRows = await client.$queryRawUnsafe<Array<{ total: bigint; checksum: bigint }>>(`
    SELECT COUNT(*) AS total,
      COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, member_code, name,
        COALESCE(phone, ''), COALESCE(start_date, ''), COALESCE(end_date, ''),
        is_active, is_deleted, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s.%f')))), 0) AS checksum
    FROM club_members
  `);
  const subscriptionRows = await client.$queryRawUnsafe<Array<{ total: bigint; checksum: bigint }>>(`
    SELECT COUNT(*) AS total,
      COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, subscription_number,
        COALESCE(member_id, ''), COALESCE(special_class_type_id, ''),
        subscription_start_date, subscription_end_date, subscription_value,
        paid_amount, remaining_amount, COALESCE(sessions_count, ''), sessions_used,
        status, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s.%f')))), 0) AS checksum
    FROM club_subscriptions
  `);
  return {
    members: {
      total: Number(memberRows[0]?.total ?? 0),
      checksum: String(memberRows[0]?.checksum ?? 0),
    },
    subscriptions: {
      total: Number(subscriptionRows[0]?.total ?? 0),
      checksum: String(subscriptionRows[0]?.checksum ?? 0),
    },
    protectedCounts: await counts(client, protectedTables),
  };
}

export async function previewFakeFitnessCafeData(client: PrismaClient) {
  return {
    toDelete: await counts(client, [...tables.fitness, ...tables.cafe]),
    // Class types referenced by a sold subscription must survive cleanup.
    protectedClassTypes: await client.club_class_types.count({
      where: { special_subscriptions: { some: {} } },
    }),
    protected: await coreFingerprint(client),
  };
}

/**
 * One-time operational cleanup used for old demo deployments.
 *
 * Guarantees:
 * - never issues DELETE/UPDATE against members, subscriptions or their financial history;
 * - preserves class types referenced by existing special subscriptions;
 * - verifies core row counts + fingerprints inside the same transaction and rolls back on drift;
 * - leaves employees intact even when their old demo trainer row is removed.
 */
export async function clearFakeFitnessCafeData(client: PrismaClient, verbose = true) {
  const allTargetTables = [...tables.fitness, ...tables.cafe];
  for (const table of protectedTables) {
    if (allTargetTables.includes(table as never)) {
      throw new Error(`Safety violation: protected table ${table} is in the cleanup list`);
    }
  }

  const before = await counts(client, allTargetTables);
  const protectedBefore = await coreFingerprint(client);

  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    try {
      // Event records are retained; only their references to deleted demo trainers are detached.
      await tx.$executeRawUnsafe(
        'UPDATE `club_event_sessions` SET `trainer_id` = NULL WHERE `trainer_id` IS NOT NULL',
      );
      await tx.$executeRawUnsafe(
        'UPDATE `club_event_staff` SET `trainer_id` = NULL WHERE `trainer_id` IS NOT NULL',
      );

      for (const table of tables.fitness) {
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }

      // Delete only unused class definitions. Existing sold subscriptions retain their class link.
      await tx.$executeRawUnsafe(`
        DELETE ct FROM \`club_class_types\` ct
        WHERE NOT EXISTS (
          SELECT 1 FROM \`club_subscriptions\` s
          WHERE s.\`special_class_type_id\` = ct.\`id\`
        )
      `);

      for (const table of tables.cafe) {
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }

      // Suppliers used by spare-parts (outside cafe scope) survive; the rest are cafe demo rows.
      await tx.$executeRawUnsafe(`
        DELETE s FROM \`inv_suppliers\` s
        WHERE NOT EXISTS (
          SELECT 1 FROM \`inv_spare_parts\` p WHERE p.\`supplier_id\` = s.\`id\`
        )
      `);

      const protectedAfter = await coreFingerprint(tx);
      if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
        throw new Error('Safety check failed: member/subscription data changed; cleanup rolled back');
      }
    } finally {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
  }, { timeout: 60_000 });

  const after = await counts(client, allTargetTables);
  const protectedAfter = await coreFingerprint(client);
  const result = { before, after, protectedBefore, protectedAfter };
  if (verbose) console.log(JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const client = new PrismaClient();
  try {
    const preview = await previewFakeFitnessCafeData(client);
    console.log(JSON.stringify({ mode: 'preview', ...preview }, null, 2));
    if (!process.argv.includes('--confirm-cleanup')) {
      console.error('\nNo data was changed. Re-run with --confirm-cleanup after reviewing the preview.');
      return;
    }
    console.log('\nConfirmed: clearing cafe inventory and trainer/scheduling demo data...');
    await clearFakeFitnessCafeData(client);
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
