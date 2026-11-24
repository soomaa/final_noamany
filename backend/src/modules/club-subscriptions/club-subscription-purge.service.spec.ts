import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubSubscriptionPurgeService } from './club-subscription-purge.service';
import { REFUND_EXPENSE_CATEGORY } from '../finance/finance.utils';

type Row = Record<string, unknown>;

/**
 * A tiny fake of the raw-SQL surface the purge uses: SELECTs are routed by table name to fixture
 * rows, writes are recorded so the test can assert exactly what was deleted / updated.
 */
function fakeDb(fixtures: Partial<Record<string, Row[]>>) {
  const columns: Record<string, string[]> = {
    club_subscriptions: ['id', 'subscription_number', 'member_id', 'branch_id', 'renewed_from_subscription_id', 'subscription_start_date', 'subscription_end_date'],
    club_members: ['id', 'start_date', 'end_date', 'member_code'],
    club_receipts: ['id', 'subscription_id', 'receipt_number'],
    club_receipt_payments: ['id', 'receipt_id'],
    club_subscription_refunds: ['id', 'subscription_id'],
    acc_journal_entries: ['id', 'source_module', 'source_doc_type', 'source_doc_id', 'reverses_id', 'description', 'date'],
    acc_journal_entry_lines: ['id', 'entry_id'],
    acc_accounting_periods: ['id', 'start_date', 'end_date', 'status'],
    fin_revenues: ['id', 'source_module', 'source_ref'],
    fin_expenses: ['id', 'category', 'invoice_number'],
    club_subscription_freezes: ['id', 'subscription_id'],
    club_subscription_waivers: ['id', 'subscription_id'],
    club_subscription_transfers: ['id', 'subscription_id', 'destination_subscription_id'],
    club_member_subscription_transfers: ['id', 'source_subscription_id', 'destination_subscription_id'],
    club_attendance: ['id', 'subscription_id'],
    club_private_attendance_commissions: ['id', 'subscription_id'],
    tbl_points_history: ['id', 'sub_id_fk', 'member_id'],
    tbl_points_exhausted_history: ['id', 'sub_id_fk', 'member_id'],
    club_member_point_transactions: ['id', 'subscription_id', 'source_subscription_id', 'member_id', 'source_member_id'],
    tbl_cobon_exhausted_history: ['id', 'sub_id_fk', 'member_id', 'discount_code_id_fk'],
    tbl_emps_members_dis_codes: ['id', 'mem_id_fk', 'code_id_fk', 'approved'],
    club_inbody_invoices: ['id', 'subscription_id', 'covered_by_subscription'],
    club_spa_invoices: ['id', 'subscription_id', 'covered_by_subscription'],
    club_spa_attendance: ['id', 'subscription_id'],
    club_class_enrollments: ['id', 'subscription_id', 'attendance_status'],
    // Tables missing on this "production": the purge must skip them without failing.
  };
  const writes: string[] = [];
  const text = (q: Prisma.Sql) => q.sql.replace(/\s+/g, ' ');
  const tableOf = (sql: string) => /FROM `?([a-z0-9_]+)`?/.exec(sql)?.[1] ?? '';
  const queryRaw = jest.fn(async (q: Prisma.Sql) => {
    const sql = text(q);
    if (sql.includes('information_schema.COLUMNS')) {
      return Object.entries(columns).flatMap(([t, cs]) => cs.map((c) => ({ t, c })));
    }
    if (sql.includes('FOR UPDATE')) return fixtures.lockTarget ?? [{ id: 1 }];
    const table = tableOf(sql);
    if (table === 'acc_journal_entries' && sql.includes('reverses_id')) return fixtures.journalReversals ?? [];
    if (table === 'club_subscriptions' && sql.includes('renewed_from_subscription_id')) return fixtures.renewals ?? [];
    if (table === 'club_subscriptions' && sql.includes('member_id =')) return fixtures.memberSubs ?? [];
    if (table === 'club_class_enrollments') return fixtures.club_class_enrollments ?? [];
    return fixtures[table] ?? [];
  });
  const executeRaw = jest.fn(async (q: Prisma.Sql) => {
    writes.push(text(q));
    return 1;
  });
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    club_members: { update: jest.fn() },
    business_audit_log: { create: jest.fn().mockResolvedValue({ id: 901 }) },
  };
  const prisma = {
    ...tx,
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue({ id: 40014, branch_id: 2 }) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx, writes };
}

const SUB: Row = {
  id: 40014,
  subscription_number: 'B16769',
  member_id: 113751,
  branch_id: 2,
  customer_name: 'عضو تجربة',
  subscription_type: 'شهر',
  subscription_start_date: '2026-10-18',
  subscription_end_date: '2026-11-17',
  registration_date: '2026-10-18',
  subscription_value: '770.00',
  paid_amount: '770.00',
  status: 'active',
  created_by: 374,
};

function baseFixtures(): Partial<Record<string, Row[]>> {
  return {
    club_subscriptions: [SUB],
    club_members: [{ id: 113751, member_code: 'B16769', start_date: '2026-10-18', end_date: '2026-11-17' }],
    club_receipts: [{ id: 77, receipt_number: '6', amount: '770.00', receipt_date: '2026-10-18', status: 'مدفوعة', subscription_id: 40014 }],
    club_receipt_payments: [{ id: 501, receipt_id: 77, method: 'cash', amount: '770.00' }],
    acc_journal_entries: [{ id: 3001, source_module: 'club', source_doc_type: 'subscription', source_doc_id: '6', date: '2026-10-18', description: 'اشتراك نادي — subscription — B16769' }],
    acc_journal_entry_lines: [{ id: 1, entry_id: 3001 }, { id: 2, entry_id: 3001 }],
    fin_revenues: [{ id: 801, source_module: 'club_receipt', source_ref: '6' }],
    club_subscription_freezes: [{ id: 11, subscription_id: 40014 }],
    tbl_points_history: [{ id: 21, sub_id_fk: 40014, member_id: 113751, points: 50 }],
    tbl_points_exhausted_history: [{ id: 22, sub_id_fk: 40014, member_id: 113751, points: 20 }],
    tbl_cobon_exhausted_history: [{ id: 31, sub_id_fk: 40014, member_id: 113751, discount_code_id_fk: 5 }],
    tbl_emps_members_dis_codes: [{ id: 41, mem_id_fk: 113751, code_id_fk: 5, approved: 1 }],
    club_inbody_invoices: [{ id: 61, subscription_id: 40014, covered_by_subscription: 0 }],
    memberSubs: [{ id: 40381, subscription_number: 'L-40381', subscription_start_date: '2026-10-01', subscription_end_date: '2026-12-31', status: 'active' }],
  };
}

function service(prisma: unknown, allowed = true) {
  const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(allowed) };
  return new ClubSubscriptionPurgeService(prisma as PrismaService, branchScope as unknown as BranchScopeService);
}

const admin = { sub: 1, level: 1, branch: 0, name: 'Admin', job_title: null } as never;

describe('ClubSubscriptionPurgeService.preview', () => {
  it('lists receipts, money and every trace that will disappear', async () => {
    const { prisma } = fakeDb(baseFixtures());
    const out = await service(prisma).preview(40014, admin);

    expect(out.subscription.subscriptionNumber).toBe('B16769');
    expect(out.receipts).toEqual([
      expect.objectContaining({ receiptNumber: '6', amount: 770, payments: [{ method: 'cash', amount: 770 }] }),
    ]);
    expect(out.totalMoney).toBe(770);
    expect(out.journalEntries).toBe(1);
    expect(out.revenues).toBe(1);
    expect(out.points).toEqual({ earned: 50, redeemed: 20, rows: 2 });
    expect(out.discountGrantsRestored).toBe(1);
    expect(out.freezes).toBe(1);
    expect(out.attendance).toBe(0);
    expect(out.unlinked.inbodyInvoices).toBe(1);
    expect(out.blockers).toEqual([]);
    expect(out.canPurge).toBe(true);
  });

  it('reports attendance as a blocker and offers the member\'s other subscriptions', async () => {
    const fixtures = { ...baseFixtures(), club_attendance: [{ id: 1, subscription_id: 40014 }, { id: 2, subscription_id: 40014 }] };
    const { prisma } = fakeDb(fixtures);
    const out = await service(prisma).preview(40014, admin);

    expect(out.canPurge).toBe(false);
    expect(out.blockers[0]).toMatchObject({ code: 'attendance', count: 2 });
    expect(out.blockers[0].message).toContain('مينفعش يتمسح كأنه ما حصلش');
    expect(out.canPurgeByMovingAttendance).toBe(true);
    expect(out.moveTargets.map((t) => t.id)).toEqual([40381]);
  });

  it('blocks a paid refund, a member transfer and a closed accounting period', async () => {
    const fixtures = {
      ...baseFixtures(),
      club_subscription_refunds: [{ id: 9, subscription_id: 40014, status: 'completed', invoice_number: 'RF-1' }],
      club_member_subscription_transfers: [{ id: 4, source_subscription_id: 40014, destination_subscription_id: 50000 }],
      acc_accounting_periods: [{ id: 1, name: '2026', status: 'closed' }],
    };
    const { prisma } = fakeDb(fixtures);
    const out = await service(prisma).preview(40014, admin);
    expect(out.blockers.map((b) => b.code)).toEqual(['paid_refund', 'member_transfer', 'closed_period']);
    expect(out.blockers[1].message).toContain('اتنقل لعضو تاني');
  });

  it('refuses reception employees', async () => {
    const { prisma } = fakeDb(baseFixtures());
    const reception = { sub: 5, level: 2, branch: 2, job_title: 'موظف استقبال' } as never;
    await expect(service(prisma).preview(40014, reception)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ClubSubscriptionPurgeService.purge', () => {
  it('deletes every trace in one transaction and writes one audit snapshot', async () => {
    const fixtures = {
      ...baseFixtures(),
      club_subscription_refunds: [{ id: 9, subscription_id: 40014, status: 'cancelled', invoice_number: 'RF-1' }],
      fin_expenses: [{ id: 701, category: REFUND_EXPENSE_CATEGORY, invoice_number: 'RF-1' }],
    };
    const { prisma, tx, writes } = fakeDb(fixtures);
    const out = await service(prisma).purge(40014, { reason: 'اشتراك مكرر بالغلط' }, admin);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const has = (fragment: string) => writes.some((w) => w.includes(fragment));
    expect(has('DELETE FROM acc_journal_entry_lines WHERE entry_id IN (?)')).toBe(true);
    expect(has('DELETE FROM acc_journal_entries WHERE id IN (?)')).toBe(true);
    for (const table of [
      'fin_revenues', 'fin_expenses', 'club_receipt_payments', 'club_receipts', 'club_subscription_refunds',
      'club_subscription_freezes', 'tbl_points_history', 'tbl_points_exhausted_history', 'tbl_cobon_exhausted_history',
    ]) {
      expect(has(`DELETE FROM \`${table}\``)).toBe(true);
    }
    expect(has('UPDATE tbl_emps_members_dis_codes SET approved = 0')).toBe(true);
    expect(has('UPDATE `club_inbody_invoices` SET `subscription_id` = NULL')).toBe(true);
    expect(has('DELETE FROM club_subscriptions WHERE id = ?')).toBe(true);
    // Payments go before their receipt, the receipt before its subscription.
    const at = (f: string) => writes.findIndex((w) => w.includes(f));
    expect(at('`club_receipt_payments`')).toBeLessThan(at('DELETE FROM `club_receipts`'));
    expect(at('DELETE FROM `club_receipts`')).toBeLessThan(at('DELETE FROM club_subscriptions'));

    // The member's profile mirrored this subscription → recomputed from the remaining one.
    expect(tx.club_members.update).toHaveBeenCalledWith({
      where: { id: 113751 },
      data: { start_date: '2026-10-01', end_date: '2026-12-31' },
    });

    expect(tx.business_audit_log.create).toHaveBeenCalledTimes(1);
    const audit = tx.business_audit_log.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'purge_mistaken_subscription', entity_id: '40014', reason: 'اشتراك مكرر بالغلط', actor_user_id: 1 });
    expect(audit.before_json.subscription.subscription_number).toBe('B16769');
    expect(audit.before_json.receipts[0].receipt_number).toBe('6');
    expect(audit.before_json.journalLines).toHaveLength(2);
    expect(audit.before_json.grantsRestored[0].id).toBe(41);
    expect(out).toMatchObject({ success: true, auditId: 901, removed: { receipts: 1, totalMoney: 770, journalEntries: 1 } });
  });

  it('requires a reason of at least 5 characters', async () => {
    const { prisma } = fakeDb(baseFixtures());
    await expect(service(prisma).purge(40014, { reason: ' غلط ' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when blocked and writes nothing', async () => {
    const fixtures = { ...baseFixtures(), club_attendance: [{ id: 1, subscription_id: 40014 }] };
    const { prisma, tx, writes } = fakeDb(fixtures);
    await expect(service(prisma).purge(40014, { reason: 'اشتراك مكرر بالغلط' }, admin))
      .rejects.toThrow('مينفعش يتمسح كأنه ما حصلش');
    expect(writes).toEqual([]);
    expect(tx.business_audit_log.create).not.toHaveBeenCalled();
  });

  it('moves attendance to another subscription of the same member when asked', async () => {
    const fixtures = {
      ...baseFixtures(),
      club_attendance: [{ id: 1, subscription_id: 40014 }],
      lockTarget: [{ id: 40381, member_id: 113751, branch_id: 2, subscription_type: 'سنة', subscription_number: 'L-40381', is_linked_to_sessions: 0 }],
    };
    const { prisma, writes } = fakeDb(fixtures);
    const out = await service(prisma).purge(40014, { reason: 'اشتراك مكرر بالغلط', moveAttendanceToSubscriptionId: 40381 }, admin);
    expect(writes[0]).toContain('UPDATE club_attendance SET subscription_id = ?');
    expect(out.movedAttendance).toBe(1);
  });

  it('refuses moving attendance to another member\'s subscription', async () => {
    const fixtures = {
      ...baseFixtures(),
      club_attendance: [{ id: 1, subscription_id: 40014 }],
      lockTarget: [{ id: 50000, member_id: 999, branch_id: 2 }],
    };
    const { prisma, writes } = fakeDb(fixtures);
    await expect(service(prisma).purge(40014, { reason: 'اشتراك مكرر بالغلط', moveAttendanceToSubscriptionId: 50000 }, admin))
      .rejects.toThrow('لنفس العضو');
    expect(writes).toEqual([]);
  });
});
