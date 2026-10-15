import { Prisma, PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Db = PrismaClient | Prisma.TransactionClient;

const REQUIRED_ACK = 'PURGE_A000001_TO_A000005_TEST_DATA_ONLY';
const ROLLBACK_TEST = 'INITIAL_TEST_MEMBER_PURGE_ROLLBACK_TEST';
const TARGETS = [
  { code: 'A000001', name: 'Rodina yahia mohamed' },
  { code: 'A000002', name: 'Mayar Meomen' },
  { code: 'A000003', name: 'abdelrahman hany mohamed' },
  { code: 'A000004', name: 'Shahynour yehia' },
  { code: 'A000005', name: '0mar osama' },
] as const;

const codeSql = TARGETS.map((target) => `'${target.code}'`).join(', ');

function serializable(rows: Array<Record<string, unknown>>) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'bigint' ? value.toString() : value,
      ]),
    ),
  );
}

async function query(db: Db, sql: string) {
  return serializable(
    await db.$queryRawUnsafe<Array<Record<string, unknown>>>(sql),
  );
}

function normalizedName(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

async function targetMembers(db: Db) {
  return query(db, `
    SELECT *
    FROM club_members
    WHERE member_code IN (${codeSql})
    ORDER BY member_code
  `);
}

function validateTargets(rows: Array<Record<string, unknown>>, validateNames = true) {
  if (rows.length === 0) return;
  if (rows.length !== TARGETS.length) {
    throw new Error(
      `Safety check failed: found ${rows.length}/${TARGETS.length} target members. No data was changed.`,
    );
  }
  if (!validateNames) return;
  for (const target of TARGETS) {
    const row = rows.find((candidate) => candidate.member_code === target.code);
    if (!row || normalizedName(row.name) !== normalizedName(target.name)) {
      throw new Error(
        `Safety check failed: ${target.code} does not match expected name "${target.name}". No data was changed.`,
      );
    }
  }
}

async function preview(db: Db, validateNames = true) {
  const members = await targetMembers(db);
  validateTargets(members, validateNames);
  if (!members.length) {
    return {
      alreadyPurged: true,
      members: [],
      subscriptions: [],
      receipts: [],
      refunds: [],
      journalEntries: [],
      financeRevenues: [],
      financeExpenses: [],
    };
  }
  return {
    alreadyPurged: false,
    members: members.map((member) => ({
      id: member.id,
      memberCode: member.member_code,
      name: member.name,
      isDeleted: member.is_deleted,
    })),
    subscriptions: await query(db, `
      SELECT
        subscription.id,
        subscription.subscription_number,
        subscription.member_id,
        subscription.customer_name,
        subscription.subscription_value,
        subscription.paid_amount,
        subscription.remaining_amount,
        subscription.status
      FROM club_subscriptions subscription
      INNER JOIN club_members member ON member.id = subscription.member_id
      WHERE member.member_code IN (${codeSql})
      ORDER BY subscription.id
    `),
    receipts: await query(db, `
      SELECT
        receipt.id,
        receipt.receipt_number,
        receipt.subscription_id,
        receipt.member_id,
        receipt.member_name,
        receipt.amount,
        receipt.receipt_date,
        receipt.status
      FROM club_receipts receipt
      LEFT JOIN club_subscriptions subscription ON subscription.id = receipt.subscription_id
      LEFT JOIN club_members direct_member ON direct_member.id = receipt.member_id
      LEFT JOIN club_members subscription_member ON subscription_member.id = subscription.member_id
      WHERE direct_member.member_code IN (${codeSql})
         OR subscription_member.member_code IN (${codeSql})
      ORDER BY receipt.id
    `),
    refunds: await query(db, `
      SELECT refund.*
      FROM club_subscription_refunds refund
      INNER JOIN club_subscriptions subscription ON subscription.id = refund.subscription_id
      INNER JOIN club_members member ON member.id = subscription.member_id
      WHERE member.member_code IN (${codeSql})
      ORDER BY refund.id
    `),
    journalEntries: await query(db, `
      SELECT DISTINCT entry.*
      FROM acc_journal_entries entry
      LEFT JOIN club_receipts receipt
        ON receipt.receipt_number COLLATE utf8mb4_unicode_ci
          = entry.source_doc_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN club_subscription_refunds refund
        ON refund.invoice_number COLLATE utf8mb4_unicode_ci
          = entry.source_doc_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN club_subscriptions subscription
        ON subscription.subscription_number COLLATE utf8mb4_unicode_ci
          = entry.source_doc_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN club_members receipt_member ON receipt_member.id = receipt.member_id
      LEFT JOIN club_members subscription_member
        ON subscription_member.id = COALESCE(receipt.subscription_id, refund.subscription_id, subscription.id)
      WHERE entry.source_module = 'club'
        AND (
          receipt_member.member_code IN (${codeSql})
          OR EXISTS (
            SELECT 1
            FROM club_subscriptions target_subscription
            INNER JOIN club_members target_member ON target_member.id = target_subscription.member_id
            WHERE target_subscription.id = COALESCE(receipt.subscription_id, refund.subscription_id, subscription.id)
              AND target_member.member_code IN (${codeSql})
          )
        )
      ORDER BY entry.id
    `),
    financeRevenues: await query(db, `
      SELECT revenue.*
      FROM fin_revenues revenue
      INNER JOIN club_receipts receipt
        ON receipt.receipt_number COLLATE utf8mb4_unicode_ci
          = COALESCE(revenue.source_ref, revenue.receipt_number) COLLATE utf8mb4_unicode_ci
      LEFT JOIN club_subscriptions subscription ON subscription.id = receipt.subscription_id
      LEFT JOIN club_members direct_member ON direct_member.id = receipt.member_id
      LEFT JOIN club_members subscription_member ON subscription_member.id = subscription.member_id
      WHERE revenue.source_module = 'club_receipt'
        AND (
          direct_member.member_code IN (${codeSql})
          OR subscription_member.member_code IN (${codeSql})
        )
      ORDER BY revenue.id
    `),
    financeExpenses: await query(db, `
      SELECT expense.*
      FROM fin_expenses expense
      INNER JOIN club_subscription_refunds refund
        ON refund.invoice_number COLLATE utf8mb4_unicode_ci
          = expense.invoice_number COLLATE utf8mb4_unicode_ci
      INNER JOIN club_subscriptions subscription ON subscription.id = refund.subscription_id
      INNER JOIN club_members member ON member.id = subscription.member_id
      WHERE member.member_code IN (${codeSql})
      ORDER BY expense.id
    `),
  };
}

async function createTargetTables(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_members (
      id INT PRIMARY KEY,
      app_user_id INT NULL
    )
    SELECT id, app_user_id
    FROM club_members
    WHERE member_code IN (${codeSql})
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_subscriptions (
      id INT PRIMARY KEY,
      subscription_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    )
    SELECT subscription.id, subscription.subscription_number
    FROM club_subscriptions subscription
    INNER JOIN _purge_test_members member ON member.id = subscription.member_id
  `);
  // MySQL cannot reference the same temporary table twice in one statement.
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_members_copy (
      id INT PRIMARY KEY,
      app_user_id INT NULL
    )
    SELECT id, app_user_id FROM _purge_test_members
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_subscriptions_copy (
      id INT PRIMARY KEY,
      subscription_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    )
    SELECT id, subscription_number FROM _purge_test_subscriptions
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_receipts (
      id INT PRIMARY KEY,
      receipt_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    )
    SELECT DISTINCT receipt.id, receipt.receipt_number
    FROM club_receipts receipt
    LEFT JOIN _purge_test_members member ON member.id = receipt.member_id
    LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = receipt.subscription_id
    WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_refunds (
      id INT PRIMARY KEY,
      invoice_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    )
    SELECT DISTINCT refund.id, refund.invoice_number
    FROM club_subscription_refunds refund
    LEFT JOIN _purge_test_members member ON member.id = refund.member_id
    LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = refund.subscription_id
    WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_event_registrations (
      id INT PRIMARY KEY
    )
    SELECT registration.id
    FROM club_event_registrations registration
    LEFT JOIN _purge_test_members direct_member ON direct_member.id = registration.member_id
    LEFT JOIN _purge_test_members_copy converted_member ON converted_member.id = registration.converted_member_id
    WHERE direct_member.id IS NOT NULL OR converted_member.id IS NOT NULL
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_event_payments (
      id INT PRIMARY KEY,
      payment_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    )
    SELECT payment.id, payment.payment_number
    FROM club_event_payments payment
    INNER JOIN _purge_test_event_registrations registration
      ON registration.id = payment.registration_id
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_wellness_documents (
      document_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
      source_module VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    )
    SELECT invoice.invoice_number AS document_number, 'spa_invoice' AS source_module
    FROM club_spa_invoices invoice
    LEFT JOIN _purge_test_members_copy member ON member.id = invoice.member_id
    LEFT JOIN _purge_test_subscriptions_copy subscription ON subscription.id = invoice.subscription_id
    WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL
    UNION
    SELECT invoice.invoice_number AS document_number, 'inbody_invoice' AS source_module
    FROM club_inbody_invoices invoice
    LEFT JOIN _purge_test_members member ON member.id = invoice.member_id
    LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = invoice.subscription_id
    WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_fin_revenues (
      id INT PRIMARY KEY
    )
    SELECT DISTINCT revenue.id
    FROM fin_revenues revenue
    LEFT JOIN _purge_test_receipts receipt
      ON receipt.receipt_number COLLATE utf8mb4_unicode_ci
        = COALESCE(revenue.source_ref, revenue.receipt_number) COLLATE utf8mb4_unicode_ci
    LEFT JOIN _purge_test_wellness_documents wellness
      ON wellness.document_number COLLATE utf8mb4_unicode_ci
        = revenue.source_ref COLLATE utf8mb4_unicode_ci
      AND wellness.source_module COLLATE utf8mb4_unicode_ci
        = revenue.source_module COLLATE utf8mb4_unicode_ci
    WHERE
      (revenue.source_module = 'club_receipt' AND receipt.id IS NOT NULL)
      OR wellness.document_number IS NOT NULL
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_fin_expenses (
      id INT PRIMARY KEY
    )
    SELECT expense.id
    FROM fin_expenses expense
    INNER JOIN _purge_test_refunds refund
      ON refund.invoice_number COLLATE utf8mb4_unicode_ci
        = expense.invoice_number COLLATE utf8mb4_unicode_ci
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_entries (
      id INT PRIMARY KEY
    )
    SELECT DISTINCT entry.id
    FROM acc_journal_entries entry
    LEFT JOIN _purge_test_receipts receipt
      ON receipt.receipt_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN _purge_test_refunds refund
      ON refund.invoice_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN _purge_test_subscriptions subscription
      ON subscription.subscription_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN _purge_test_event_payments event_payment
      ON event_payment.payment_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN _purge_test_wellness_documents wellness
      ON wellness.document_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    WHERE
      (
        entry.source_module = 'club'
        AND (receipt.id IS NOT NULL OR refund.id IS NOT NULL OR subscription.id IS NOT NULL)
      )
      OR (
        entry.source_module = 'club-events'
        AND event_payment.id IS NOT NULL
      )
      OR (
        entry.source_module = 'club-fitness'
        AND wellness.document_number IS NOT NULL
      )
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_reversal_entries (
      id INT PRIMARY KEY
    )
    SELECT entry.id
    FROM acc_journal_entries entry
    INNER JOIN _purge_test_entries target ON target.id = entry.reverses_id
  `);
  await tx.$executeRawUnsafe(`
    INSERT IGNORE INTO _purge_test_entries (id)
    SELECT id FROM _purge_test_reversal_entries
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_reversed_entries (
      id INT PRIMARY KEY
    )
    SELECT entry.reverses_id AS id
    FROM acc_journal_entries entry
    INNER JOIN _purge_test_entries target ON target.id = entry.id
    WHERE entry.reverses_id IS NOT NULL
  `);
  await tx.$executeRawUnsafe(`
    INSERT IGNORE INTO _purge_test_entries (id)
    SELECT id FROM _purge_test_reversed_entries
  `);
  await tx.$executeRawUnsafe(`
    CREATE TEMPORARY TABLE _purge_test_app_users (
      id INT PRIMARY KEY
    )
    SELECT DISTINCT target.app_user_id AS id
    FROM _purge_test_members target
    WHERE target.app_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM club_members other_member
        LEFT JOIN _purge_test_members_copy selected ON selected.id = other_member.id
        WHERE other_member.app_user_id = target.app_user_id
          AND selected.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM employees employee
        WHERE employee.app_user_id = target.app_user_id
      )
  `);
}

async function protectedFingerprint(db: Db) {
  return {
    core: await query(db, `
      SELECT
        (SELECT COUNT(*) FROM users) users,
        (SELECT COUNT(*) FROM employees) employees,
        (SELECT COUNT(*) FROM club_subscription_types) packages,
        (SELECT COUNT(*) FROM sales_quick_sales) quick_sales,
        (SELECT COUNT(*) FROM cafe_products) cafe_products
    `),
    members: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          member.id, member.member_code, member.name, COALESCE(member.phone, ''),
          member.is_active, member.is_deleted,
          DATE_FORMAT(member.updated_at, '%Y-%m-%d %H:%i:%s.%f')
        ))), 0) checksum
      FROM club_members member
      LEFT JOIN _purge_test_members target ON target.id = member.id
      WHERE target.id IS NULL
    `),
    apiUsers: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          app_user.user_id, COALESCE(app_user.user_phone, ''),
          COALESCE(app_user.user_email, ''), app_user.status
        ))), 0) checksum
      FROM api_users app_user
      LEFT JOIN _purge_test_app_users target ON target.id = app_user.user_id
      WHERE target.id IS NULL
    `),
    subscriptions: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(SUM(subscription.paid_amount), 0) paid,
        COALESCE(SUM(subscription.remaining_amount), 0) remaining,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          subscription.id, subscription.subscription_number,
          COALESCE(subscription.member_id, ''), subscription.paid_amount,
          subscription.remaining_amount, subscription.status
        ))), 0) checksum
      FROM club_subscriptions subscription
      LEFT JOIN _purge_test_subscriptions target ON target.id = subscription.id
      WHERE target.id IS NULL
    `),
    receipts: await query(db, `
      SELECT COUNT(*) total, COALESCE(SUM(receipt.amount), 0) amount,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          receipt.id, receipt.receipt_number, COALESCE(receipt.member_id, ''),
          COALESCE(receipt.subscription_id, ''), receipt.amount, receipt.status
        ))), 0) checksum
      FROM club_receipts receipt
      LEFT JOIN _purge_test_receipts target ON target.id = receipt.id
      WHERE target.id IS NULL
    `),
    journalEntries: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(SUM(entry.total_debit), 0) debit,
        COALESCE(SUM(entry.total_credit), 0) credit,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          entry.id, entry.entry_no, entry.status, COALESCE(entry.source_module, ''),
          COALESCE(entry.source_doc_type, ''), COALESCE(entry.source_doc_id, ''),
          entry.total_debit, entry.total_credit
        ))), 0) checksum
      FROM acc_journal_entries entry
      LEFT JOIN _purge_test_entries target ON target.id = entry.id
      WHERE target.id IS NULL
    `),
    finance: await query(db, `
      SELECT
        (
          SELECT COUNT(*)
          FROM fin_revenues revenue
          LEFT JOIN _purge_test_fin_revenues target ON target.id = revenue.id
          WHERE target.id IS NULL
        ) revenues,
        (
          SELECT COUNT(*)
          FROM fin_expenses expense
          LEFT JOIN _purge_test_fin_expenses target ON target.id = expense.id
          WHERE target.id IS NULL
        ) expenses
    `),
  };
}

async function backupTargets(db: Db) {
  const relatedTables: Record<string, string> = {
    attendance: 'SELECT record.* FROM club_attendance record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    classEnrollments: 'SELECT record.* FROM club_class_enrollments record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    classWaitlist: 'SELECT record.* FROM club_class_waitlist record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    memberGroups: 'SELECT record.* FROM club_member_group_members record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    surveyResponses: 'SELECT record.* FROM club_survey_responses record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    trainerRatings: 'SELECT record.* FROM club_trainer_ratings record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    lockers: 'SELECT record.* FROM club_locker_subscriptions record INNER JOIN _purge_test_members target ON target.id = record.member_id',
    eventRegistrations: 'SELECT record.* FROM club_event_registrations record INNER JOIN _purge_test_event_registrations target ON target.id = record.id',
  };
  const related: Record<string, unknown> = {};
  for (const [key, sql] of Object.entries(relatedTables)) {
    related[key] = await query(db, sql);
  }
  return {
    createdAt: new Date().toISOString(),
    reason: 'Purge the five explicitly identified initial test members only',
    requestedTargets: TARGETS,
    members: await query(db, 'SELECT member.* FROM club_members member INNER JOIN _purge_test_members target ON target.id = member.id ORDER BY member.id'),
    subscriptions: await query(db, 'SELECT subscription.* FROM club_subscriptions subscription INNER JOIN _purge_test_subscriptions target ON target.id = subscription.id ORDER BY subscription.id'),
    receipts: await query(db, 'SELECT receipt.* FROM club_receipts receipt INNER JOIN _purge_test_receipts target ON target.id = receipt.id ORDER BY receipt.id'),
    refunds: await query(db, 'SELECT refund.* FROM club_subscription_refunds refund INNER JOIN _purge_test_refunds target ON target.id = refund.id ORDER BY refund.id'),
    journalEntries: await query(db, 'SELECT entry.* FROM acc_journal_entries entry INNER JOIN _purge_test_entries target ON target.id = entry.id ORDER BY entry.id'),
    journalLines: await query(db, 'SELECT line.* FROM acc_journal_entry_lines line INNER JOIN _purge_test_entries target ON target.id = line.entry_id ORDER BY line.entry_id, line.id'),
    financeRevenues: await query(db, 'SELECT revenue.* FROM fin_revenues revenue INNER JOIN _purge_test_fin_revenues target ON target.id = revenue.id ORDER BY revenue.id'),
    financeExpenses: await query(db, 'SELECT expense.* FROM fin_expenses expense INNER JOIN _purge_test_fin_expenses target ON target.id = expense.id ORDER BY expense.id'),
    eventPayments: await query(db, 'SELECT payment.* FROM club_event_payments payment INNER JOIN _purge_test_event_payments target ON target.id = payment.id ORDER BY payment.id'),
    spaInvoices: await query(db, `
      SELECT invoice.*
      FROM club_spa_invoices invoice
      INNER JOIN _purge_test_wellness_documents target
        ON target.document_number COLLATE utf8mb4_unicode_ci
          = invoice.invoice_number COLLATE utf8mb4_unicode_ci
        AND target.source_module = 'spa_invoice'
    `),
    inbodyInvoices: await query(db, `
      SELECT invoice.*
      FROM club_inbody_invoices invoice
      INNER JOIN _purge_test_wellness_documents target
        ON target.document_number COLLATE utf8mb4_unicode_ci
          = invoice.invoice_number COLLATE utf8mb4_unicode_ci
        AND target.source_module = 'inbody_invoice'
    `),
    related,
  };
}

async function purge(client: PrismaClient, rollbackOnly = false) {
  try {
    return await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
      try {
        await createTargetTables(tx);
        const targetCount = await query(tx, 'SELECT COUNT(*) total FROM _purge_test_members');
        if (Number(targetCount[0]?.total ?? 0) !== TARGETS.length) {
          throw new Error('Safety check failed while resolving the five target members.');
        }

        const protectedBefore = await protectedFingerprint(tx);
        const backup = await backupTargets(tx);
        const backupDir = resolve(process.env.TEST_MEMBER_PURGE_BACKUP_DIR || 'backups');
        mkdirSync(backupDir, { recursive: true });
        const backupPath = resolve(
          backupDir,
          `initial-test-members-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`,
        );
        writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });

        await tx.$executeRawUnsafe(`
          DELETE checkin
          FROM club_event_checkins checkin
          INNER JOIN _purge_test_event_registrations target ON target.id = checkin.registration_id
        `);
        await tx.$executeRawUnsafe(`
          DELETE payment
          FROM club_event_payments payment
          INNER JOIN _purge_test_event_registrations target ON target.id = payment.registration_id
        `);
        await tx.$executeRawUnsafe(`
          DELETE registration
          FROM club_event_registrations registration
          INNER JOIN _purge_test_event_registrations target ON target.id = registration.id
        `);

        await tx.$executeRawUnsafe('DELETE line FROM acc_journal_entry_lines line INNER JOIN _purge_test_entries target ON target.id = line.entry_id');
        await tx.$executeRawUnsafe('UPDATE acc_journal_entries entry INNER JOIN _purge_test_entries target ON target.id = entry.id SET entry.reverses_id = NULL, entry.reversed_by_id = NULL');
        await tx.$executeRawUnsafe('DELETE entry FROM acc_journal_entries entry INNER JOIN _purge_test_entries target ON target.id = entry.id');
        await tx.$executeRawUnsafe('DELETE revenue FROM fin_revenues revenue INNER JOIN _purge_test_fin_revenues target ON target.id = revenue.id');
        await tx.$executeRawUnsafe('DELETE expense FROM fin_expenses expense INNER JOIN _purge_test_fin_expenses target ON target.id = expense.id');

        await tx.$executeRawUnsafe('DELETE record FROM am_member_notifications record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM am_invitations record INNER JOIN _purge_test_members target ON target.id = record.inviter_member_id');
        await tx.$executeRawUnsafe('DELETE record FROM staff_tasks record LEFT JOIN _purge_test_members member ON member.id = record.member_id LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = record.subscription_id WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL');
        await tx.$executeRawUnsafe('DELETE record FROM club_attendance record LEFT JOIN _purge_test_members member ON member.id = record.member_id LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = record.subscription_id WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL');
        await tx.$executeRawUnsafe('DELETE record FROM club_class_enrollments record LEFT JOIN _purge_test_members member ON member.id = record.member_id LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = record.subscription_id WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL');
        await tx.$executeRawUnsafe('DELETE record FROM club_class_waitlist record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_workout_programs record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_member_progress record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_physical_assessments record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_inbody_measurements record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_spa_bookings record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_hall_bookings record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_spa_invoices record LEFT JOIN _purge_test_members member ON member.id = record.member_id LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = record.subscription_id WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL');
        await tx.$executeRawUnsafe('DELETE record FROM club_inbody_invoices record LEFT JOIN _purge_test_members member ON member.id = record.member_id LEFT JOIN _purge_test_subscriptions subscription ON subscription.id = record.subscription_id WHERE member.id IS NOT NULL OR subscription.id IS NOT NULL');

        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _purge_test_groups (id INT PRIMARY KEY)
          SELECT DISTINCT record.group_id AS id
          FROM club_member_group_members record
          INNER JOIN _purge_test_members target ON target.id = record.member_id
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _purge_test_surveys (id INT PRIMARY KEY)
          SELECT DISTINCT record.survey_id AS id
          FROM club_survey_responses record
          INNER JOIN _purge_test_members target ON target.id = record.member_id
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _purge_test_trainers (id INT PRIMARY KEY)
          SELECT DISTINCT record.trainer_id AS id
          FROM club_trainer_ratings record
          INNER JOIN _purge_test_members target ON target.id = record.member_id
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _purge_test_lockers (id INT PRIMARY KEY)
          SELECT DISTINCT record.locker_id AS id
          FROM club_locker_subscriptions record
          INNER JOIN _purge_test_members target ON target.id = record.member_id
        `);
        await tx.$executeRawUnsafe('DELETE record FROM club_member_group_members record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_survey_responses record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_trainer_ratings record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_locker_subscriptions record INNER JOIN _purge_test_members target ON target.id = record.member_id');
        await tx.$executeRawUnsafe('UPDATE club_lockers locker INNER JOIN _purge_test_lockers target ON target.id = locker.id SET locker.is_available = 1');
        await tx.$executeRawUnsafe(`
          UPDATE club_member_groups group_row
          INNER JOIN _purge_test_groups target ON target.id = group_row.id
          SET group_row.current_members = (
            SELECT COUNT(*) FROM club_member_group_members member_row
            WHERE member_row.group_id = group_row.id
          )
        `);
        await tx.$executeRawUnsafe(`
          UPDATE club_surveys survey
          INNER JOIN _purge_test_surveys target ON target.id = survey.id
          SET survey.responses_count = (
            SELECT COUNT(*) FROM club_survey_responses response
            WHERE response.survey_id = survey.id
          )
        `);
        await tx.$executeRawUnsafe(`
          UPDATE club_trainers trainer
          INNER JOIN _purge_test_trainers target ON target.id = trainer.id
          SET trainer.rating_avg = COALESCE((
            SELECT AVG(rating.rating) FROM club_trainer_ratings rating
            WHERE rating.trainer_id = trainer.id
          ), 0)
        `);

        await tx.$executeRawUnsafe('DELETE record FROM club_subscription_waivers record INNER JOIN _purge_test_subscriptions target ON target.id = record.subscription_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_subscription_freezes record INNER JOIN _purge_test_subscriptions target ON target.id = record.subscription_id');
        await tx.$executeRawUnsafe('DELETE record FROM club_subscription_transfers record INNER JOIN _purge_test_subscriptions target ON target.id = record.subscription_id');
        await tx.$executeRawUnsafe('DELETE refund FROM club_subscription_refunds refund INNER JOIN _purge_test_refunds target ON target.id = refund.id');
        await tx.$executeRawUnsafe('DELETE receipt FROM club_receipts receipt INNER JOIN _purge_test_receipts target ON target.id = receipt.id');
        await tx.$executeRawUnsafe('DELETE subscription FROM club_subscriptions subscription INNER JOIN _purge_test_subscriptions target ON target.id = subscription.id');

        await tx.$executeRawUnsafe(`
          DELETE audit_row
          FROM business_audit_log audit_row
          WHERE
            (audit_row.entity_type = 'club_member' AND EXISTS (
              SELECT 1 FROM _purge_test_members target
              WHERE audit_row.entity_id COLLATE utf8mb4_unicode_ci
                = CONVERT(target.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
            ))
            OR
            (audit_row.entity_type = 'club_subscription' AND EXISTS (
              SELECT 1 FROM _purge_test_subscriptions target
              WHERE audit_row.entity_id COLLATE utf8mb4_unicode_ci
                = CONVERT(target.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
            ))
        `);
        await tx.$executeRawUnsafe('DELETE member FROM club_members member INNER JOIN _purge_test_members target ON target.id = member.id');
        await tx.$executeRawUnsafe('DELETE app_user FROM api_users app_user INNER JOIN _purge_test_app_users target ON target.id = app_user.user_id');

        await tx.business_audit_log.create({
          data: {
            entity_type: 'maintenance_cleanup',
            entity_id: 'A000001-A000005',
            action: 'purge_test_data',
            actor_name: 'server-deploy',
            before_json: {
              memberCodes: TARGETS.map((target) => target.code),
            },
            after_json: {
              purged: true,
              financialHistoryDeleted: true,
              backupPath,
            },
            changed_fields: ['members', 'subscriptions', 'receipts', 'accounting'],
            reason: 'Explicitly requested removal of the first five test members and all their data',
          },
        });

        const protectedAfter = await protectedFingerprint(tx);
        if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
          throw new Error('Safety check failed: non-target data changed. Purge rolled back.');
        }
        const remainingTargets = await query(tx, `
          SELECT
            (SELECT COUNT(*) FROM club_members member INNER JOIN _purge_test_members target ON target.id = member.id) members,
            (SELECT COUNT(*) FROM club_subscriptions subscription INNER JOIN _purge_test_subscriptions target ON target.id = subscription.id) subscriptions,
            (SELECT COUNT(*) FROM club_receipts receipt INNER JOIN _purge_test_receipts target ON target.id = receipt.id) receipts,
            (SELECT COUNT(*) FROM acc_journal_entries entry INNER JOIN _purge_test_entries target ON target.id = entry.id) journal_entries
        `);
        if (Object.values(remainingTargets[0] ?? {}).some((value) => Number(value) !== 0)) {
          throw new Error('Safety check failed: some target rows remain. Purge rolled back.');
        }
        if (rollbackOnly) throw new Error(ROLLBACK_TEST);
        return { backupPath, protectedBefore, protectedAfter, remainingTargets };
      } finally {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
      }
    }, { maxWait: 20_000, timeout: 120_000 });
  } catch (error) {
    if (rollbackOnly && error instanceof Error && error.message === ROLLBACK_TEST) {
      return {
        rollbackTest: true,
        afterRollback: await preview(client, false),
      };
    }
    throw error;
  }
}

async function main() {
  const client = new PrismaClient();
  try {
    const rollbackOnly = process.argv.includes('--test-rollback');
    const before = await preview(client, !rollbackOnly);
    console.log(JSON.stringify({ mode: 'preview', before }, null, 2));
    const confirmed = process.argv.includes('--confirm-test-member-purge');
    if (!confirmed) {
      console.log('\nNo data was changed. This was preview mode only.');
      console.log(
        `To execute: INITIAL_TEST_MEMBER_PURGE_ACK=${REQUIRED_ACK} npm run db:purge:test-members -- --confirm-test-member-purge`,
      );
      return;
    }
    if (before.alreadyPurged) {
      console.log('\nThe five target test members are already absent. No data was changed.');
      return;
    }
    if (process.env.INITIAL_TEST_MEMBER_PURGE_ACK !== REQUIRED_ACK) {
      throw new Error(
        `Refusing purge. Set INITIAL_TEST_MEMBER_PURGE_ACK=${REQUIRED_ACK}`,
      );
    }
    console.log('\nConfirmed: purging only A000001 through A000005 and all their test data...');
    console.log(JSON.stringify(
      await purge(client, rollbackOnly),
      null,
      2,
    ));
    console.log(JSON.stringify({ after: await preview(client, !rollbackOnly) }, null, 2));
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
