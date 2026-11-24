import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isReceptionEmployee } from '../../common/utils/reception-user.util';
import { assertManagerMayModify } from '../../common/utils/manager-scope.util';
import { REFUND_EXPENSE_CATEGORY } from '../finance/finance.utils';
import { isOpenEndedEndDate } from './club-subscription.utils';

type Db = Prisma.TransactionClient | PrismaService;
type Row = Record<string, unknown>;

/**
 * Every table the purge reads or writes. Optional/legacy tables (points, coupons, commissions,
 * CRM links …) are touched only when the table AND column exist on the running database, so the
 * purge works on a production schema that lags or differs from the local one.
 */
const TRACE_COLUMNS: Record<string, string[]> = {
  club_subscriptions: ['id', 'renewed_from_subscription_id', 'member_id'],
  club_receipts: ['subscription_id'],
  club_receipt_payments: ['receipt_id'],
  club_subscription_refunds: ['subscription_id'],
  acc_journal_entries: ['source_module', 'source_doc_type', 'source_doc_id', 'reverses_id', 'description'],
  acc_journal_entry_lines: ['entry_id'],
  acc_accounting_periods: ['start_date', 'end_date', 'status'],
  fin_revenues: ['source_module', 'source_ref'],
  fin_expenses: ['category', 'invoice_number'],
  club_subscription_freezes: ['subscription_id'],
  club_subscription_waivers: ['subscription_id'],
  club_subscription_transfers: ['subscription_id', 'destination_subscription_id'],
  club_member_subscription_transfers: ['source_subscription_id', 'destination_subscription_id'],
  club_attendance: ['subscription_id'],
  club_private_attendance_commissions: ['subscription_id'],
  tbl_points_history: ['sub_id_fk', 'member_id'],
  tbl_points_exhausted_history: ['sub_id_fk', 'member_id'],
  club_member_point_transactions: ['subscription_id', 'source_subscription_id', 'member_id', 'source_member_id'],
  tbl_cobon_exhausted_history: ['sub_id_fk', 'member_id', 'discount_code_id_fk'],
  tbl_emps_members_dis_codes: ['mem_id_fk', 'code_id_fk', 'approved'],
  club_sales_commission_entries: ['subscription_id', 'receipt_id'],
  club_trainer_receipt_commissions: ['receipt_id'],
  club_inbody_invoices: ['subscription_id', 'covered_by_subscription'],
  club_spa_invoices: ['subscription_id', 'covered_by_subscription'],
  club_spa_attendance: ['subscription_id'],
  club_class_enrollments: ['subscription_id', 'attendance_status'],
  staff_tasks: ['subscription_id'],
  club_customer_service_interactions: ['subscription_id'],
  cs_feedbacks: ['subscription_id'],
  online_subscription_requests: ['promoted_subscription_id', 'club_subscription_id'],
  club_members: ['start_date', 'end_date'],
  business_audit_log: ['entity_type'],
};

export interface PurgeBlocker {
  code: string;
  message: string;
  count?: number;
}

export interface PurgeTrace {
  subscription: Row;
  member: Row | null;
  receipts: Row[];
  receiptPayments: Row[];
  refunds: Row[];
  refundExpenses: Row[];
  journalEntries: Row[];
  journalLines: Row[];
  revenues: Row[];
  freezes: Row[];
  waivers: Row[];
  attendance: Row[];
  privateCommissions: Row[];
  pointsEarned: Row[];
  pointsRedeemed: Row[];
  pointTransactions: Row[];
  couponUses: Row[];
  grantsToRestore: Row[];
  salesCommissions: Row[];
  trainerCommissions: Row[];
  classEnrollments: Row[];
  csFeedbacks: Row[];
  /** Rows kept but detached from the subscription (the link column is set to NULL). */
  unlink: {
    inbodyInvoices: Row[];
    spaInvoices: Row[];
    staffTasks: Row[];
    csInteractions: Row[];
    onlineRequests: Row[];
  };
  /** Rows that make a purge impossible (reported, never deleted). */
  blocking: {
    completedRefunds: Row[];
    planTransfers: Row[];
    memberTransfers: Row[];
    renewals: Row[];
    coveredInbody: Row[];
    coveredSpa: Row[];
    spaAttendance: Row[];
    attendedClasses: Row[];
    closedPeriods: Row[];
  };
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === BigInt(1);

/** JSON-safe copy of a raw MySQL row (Decimal, Date, BigInt, Buffer). */
export function jsonSafeRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value == null) out[key] = null;
    else if (typeof value === 'bigint') out[key] = Number(value);
    else if (value instanceof Date) out[key] = value.toISOString();
    else if (Buffer.isBuffer(value)) out[key] = value.toString('base64');
    else if (typeof value === 'object' && typeof (value as { toFixed?: unknown }).toFixed === 'function') {
      out[key] = String(value);
    } else out[key] = value;
  }
  return out;
}

@Injectable()
export class ClubSubscriptionPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  // ───────────────────────── schema guards ─────────────────────────

  private async schemaColumns(db: Db): Promise<Map<string, Set<string>>> {
    const tables = Object.keys(TRACE_COLUMNS);
    const rows = await db.$queryRaw<Array<Record<string, string>>>(Prisma.sql`
      SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${Prisma.join(tables)})`);
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const t = String(r.t ?? r.TABLE_NAME).toLowerCase();
      const c = String(r.c ?? r.COLUMN_NAME).toLowerCase();
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(c);
    }
    return map;
  }

  private has(schema: Map<string, Set<string>>, table: string, ...cols: string[]) {
    const set = schema.get(table);
    return !!set && cols.every((c) => set.has(c));
  }

  private ident(name: string) {
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`invalid identifier ${name}`);
    return Prisma.raw(`\`${name}\``);
  }

  /** SELECT * FROM table WHERE col IN (values) [AND extra] — empty when the table/column is missing. */
  private async rowsWhereIn(
    db: Db,
    schema: Map<string, Set<string>>,
    table: string,
    col: string,
    values: Array<string | number>,
    extra: { col: string; value: string | number }[] = [],
  ): Promise<Row[]> {
    if (values.length === 0) return [];
    if (!this.has(schema, table, col, ...extra.map((e) => e.col))) return [];
    const conditions = [
      Prisma.sql`${this.ident(col)} IN (${Prisma.join(values)})`,
      ...extra.map((e) => Prisma.sql`${this.ident(e.col)} = ${e.value}`),
    ];
    return db.$queryRaw<Row[]>(Prisma.sql`
      SELECT * FROM ${this.ident(table)} WHERE ${Prisma.join(conditions, ' AND ')}`);
  }

  private ids(rows: Row[], key = 'id'): number[] {
    return [...new Set(rows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v)))];
  }

  // ───────────────────────── trace collection ─────────────────────────

  async collect(db: Db, id: number, schema?: Map<string, Set<string>>): Promise<PurgeTrace> {
    const s = schema ?? (await this.schemaColumns(db));
    const [sub] = await this.rowsWhereIn(db, s, 'club_subscriptions', 'id', [id]);
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    const memberId = sub.member_id == null ? null : Number(sub.member_id);
    const subNumber = String(sub.subscription_number ?? '');

    const member = memberId == null
      ? null
      : (await this.rowsWhereIn(db, s, 'club_members', 'id', [memberId]))[0] ?? null;

    const receipts = await this.rowsWhereIn(db, s, 'club_receipts', 'subscription_id', [id]);
    const receiptIds = this.ids(receipts);
    const receiptNumbers = receipts.map((r) => String(r.receipt_number)).filter(Boolean);
    const receiptPayments = await this.rowsWhereIn(db, s, 'club_receipt_payments', 'receipt_id', receiptIds);

    const allRefunds = await this.rowsWhereIn(db, s, 'club_subscription_refunds', 'subscription_id', [id]);
    const completedRefunds = allRefunds.filter((r) => String(r.status) === 'completed');
    const refunds = allRefunds.filter((r) => String(r.status) !== 'completed');
    const refundInvoices = refunds.map((r) => String(r.invoice_number)).filter(Boolean);
    const refundExpenses = await this.rowsWhereIn(db, s, 'fin_expenses', 'invoice_number', refundInvoices, [
      { col: 'category', value: REFUND_EXPENSE_CATEGORY },
    ]);

    // GL: every club posting keyed by one of this subscription's receipts (initial 'subscription' +
    // later 'receipt'), its refunds, or the subscription number itself (no-receipt fallback). The
    // description carries the subscription number, which guards against a foreign doc id clash.
    let journalEntries: Row[] = [];
    if (this.has(s, 'acc_journal_entries', 'source_module', 'source_doc_type', 'source_doc_id', 'description')) {
      const keyed: Prisma.Sql[] = [
        Prisma.sql`(source_doc_type = 'subscription' AND source_doc_id = ${subNumber})`,
      ];
      if (receiptNumbers.length) {
        keyed.push(Prisma.sql`(source_doc_type IN ('receipt','subscription') AND source_doc_id IN (${Prisma.join(receiptNumbers)}))`);
      }
      if (refundInvoices.length) {
        keyed.push(Prisma.sql`(source_doc_type = 'refund' AND source_doc_id IN (${Prisma.join(refundInvoices)}))`);
      }
      const base = subNumber
        ? await db.$queryRaw<Row[]>(Prisma.sql`
            SELECT * FROM acc_journal_entries
            WHERE source_module = 'club' AND (${Prisma.join(keyed, ' OR ')})
              AND description LIKE ${`%${subNumber}%`}`)
        : [];
      const reversals = await this.rowsWhereIn(db, s, 'acc_journal_entries', 'reverses_id', this.ids(base));
      const seen = new Set<number>();
      journalEntries = [...base, ...reversals].filter((e) => {
        const k = Number(e.id);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    const journalLines = await this.rowsWhereIn(db, s, 'acc_journal_entry_lines', 'entry_id', this.ids(journalEntries));

    const revenues = await this.rowsWhereIn(db, s, 'fin_revenues', 'source_ref', receiptNumbers, [
      { col: 'source_module', value: 'club_receipt' },
    ]);

    const freezes = await this.rowsWhereIn(db, s, 'club_subscription_freezes', 'subscription_id', [id]);
    const waivers = await this.rowsWhereIn(db, s, 'club_subscription_waivers', 'subscription_id', [id]);
    const attendance = await this.rowsWhereIn(db, s, 'club_attendance', 'subscription_id', [id]);
    const privateCommissions = await this.rowsWhereIn(db, s, 'club_private_attendance_commissions', 'subscription_id', [id]);

    // Points/coupons live in legacy tables keyed by sub_id_fk; the member guard keeps a legacy id
    // that happens to share the number from being touched.
    const memberGuard = memberId == null ? null : [{ col: 'member_id', value: memberId }];
    const pointsEarned = memberGuard ? await this.rowsWhereIn(db, s, 'tbl_points_history', 'sub_id_fk', [id], memberGuard) : [];
    const pointsRedeemed = memberGuard ? await this.rowsWhereIn(db, s, 'tbl_points_exhausted_history', 'sub_id_fk', [id], memberGuard) : [];
    let pointTransactions: Row[] = [];
    if (memberId != null && this.has(s, 'club_member_point_transactions', 'subscription_id', 'source_subscription_id', 'member_id', 'source_member_id')) {
      pointTransactions = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM club_member_point_transactions
        WHERE (subscription_id = ${id} OR source_subscription_id = ${id})
          AND (member_id = ${memberId} OR source_member_id = ${memberId})`);
    }
    const couponUses = memberGuard ? await this.rowsWhereIn(db, s, 'tbl_cobon_exhausted_history', 'sub_id_fk', [id], memberGuard) : [];
    const grantsToRestore: Row[] = [];
    if (memberId != null && this.has(s, 'tbl_emps_members_dis_codes', 'mem_id_fk', 'code_id_fk', 'approved')) {
      for (const use of couponUses) {
        if (use.discount_code_id_fk == null) continue;
        const taken = new Set(grantsToRestore.map((g) => Number(g.id)));
        const grants = await db.$queryRaw<Row[]>(Prisma.sql`
          SELECT * FROM tbl_emps_members_dis_codes
          WHERE mem_id_fk = ${memberId} AND code_id_fk = ${Number(use.discount_code_id_fk)} AND approved = 1
          ORDER BY id DESC`);
        const grant = grants.find((g) => !taken.has(Number(g.id)));
        if (grant) grantsToRestore.push(grant);
      }
    }

    let salesCommissions: Row[] = [];
    if (this.has(s, 'club_sales_commission_entries', 'subscription_id', 'receipt_id')) {
      salesCommissions = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM club_sales_commission_entries WHERE subscription_id = ${id}
        ${receiptIds.length ? Prisma.sql`OR receipt_id IN (${Prisma.join(receiptIds)})` : Prisma.empty}`);
    }
    const trainerCommissions = await this.rowsWhereIn(db, s, 'club_trainer_receipt_commissions', 'receipt_id', receiptIds);

    const inbody = await this.rowsWhereIn(db, s, 'club_inbody_invoices', 'subscription_id', [id]);
    const spa = await this.rowsWhereIn(db, s, 'club_spa_invoices', 'subscription_id', [id]);
    const spaAttendance = await this.rowsWhereIn(db, s, 'club_spa_attendance', 'subscription_id', [id]);
    const enrollments = await this.rowsWhereIn(db, s, 'club_class_enrollments', 'subscription_id', [id]);
    const staffTasks = await this.rowsWhereIn(db, s, 'staff_tasks', 'subscription_id', [id]);
    const csInteractions = await this.rowsWhereIn(db, s, 'club_customer_service_interactions', 'subscription_id', [id]);
    const csFeedbacks = await this.rowsWhereIn(db, s, 'cs_feedbacks', 'subscription_id', [id]);
    let onlineRequests: Row[] = [];
    if (this.has(s, 'online_subscription_requests', 'promoted_subscription_id', 'club_subscription_id')) {
      onlineRequests = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM online_subscription_requests
        WHERE promoted_subscription_id = ${id} OR club_subscription_id = ${id}`);
    }

    let planTransfers: Row[] = [];
    if (this.has(s, 'club_subscription_transfers', 'subscription_id', 'destination_subscription_id')) {
      planTransfers = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM club_subscription_transfers WHERE subscription_id = ${id} OR destination_subscription_id = ${id}`);
    }
    let memberTransfers: Row[] = [];
    if (this.has(s, 'club_member_subscription_transfers', 'source_subscription_id', 'destination_subscription_id')) {
      memberTransfers = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM club_member_subscription_transfers WHERE source_subscription_id = ${id} OR destination_subscription_id = ${id}`);
    }
    const renewals = await this.rowsWhereIn(db, s, 'club_subscriptions', 'renewed_from_subscription_id', [id]);

    // The only persisted money lock in this project: a closed/locked accounting period.
    const dates = [...new Set([
      ...receipts.map((r) => String(r.receipt_date ?? '')),
      ...journalEntries.map((e) => String(e.date ?? '')),
      ...refundExpenses.map((e) => String(e.expense_date ?? '')),
    ].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
    let closedPeriods: Row[] = [];
    if (dates.length && this.has(s, 'acc_accounting_periods', 'start_date', 'end_date', 'status')) {
      const conditions = dates.map((d) => Prisma.sql`(start_date <= ${d} AND end_date >= ${d})`);
      closedPeriods = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM acc_accounting_periods
        WHERE status IN ('closed','locked') AND (${Prisma.join(conditions, ' OR ')})`);
    }

    return {
      subscription: sub,
      member,
      receipts,
      receiptPayments,
      refunds,
      refundExpenses,
      journalEntries,
      journalLines,
      revenues,
      freezes,
      waivers,
      attendance,
      privateCommissions,
      pointsEarned,
      pointsRedeemed,
      pointTransactions,
      couponUses,
      grantsToRestore,
      salesCommissions,
      trainerCommissions,
      classEnrollments: enrollments.filter((e) => String(e.attendance_status) !== 'attended'),
      csFeedbacks,
      unlink: {
        inbodyInvoices: inbody.filter((r) => !truthy(r.covered_by_subscription)),
        spaInvoices: spa.filter((r) => !truthy(r.covered_by_subscription)),
        staffTasks,
        csInteractions,
        onlineRequests,
      },
      blocking: {
        completedRefunds,
        planTransfers,
        memberTransfers,
        renewals,
        coveredInbody: inbody.filter((r) => truthy(r.covered_by_subscription)),
        coveredSpa: spa.filter((r) => truthy(r.covered_by_subscription)),
        spaAttendance,
        attendedClasses: enrollments.filter((e) => String(e.attendance_status) === 'attended'),
        closedPeriods,
      },
    };
  }

  blockers(trace: PurgeTrace, opts: { moveAttendance?: boolean } = {}): PurgeBlocker[] {
    const b = trace.blocking;
    const out: PurgeBlocker[] = [];
    if (trace.attendance.length && !opts.moveAttendance) {
      out.push({
        code: 'attendance',
        count: trace.attendance.length,
        message: `الاشتراك عليه حضور (${trace.attendance.length} زيارة) — مينفعش يتمسح كأنه ما حصلش. انقل الحضور لاشتراك تاني للعضو الأول.`,
      });
    }
    if (trace.attendance.length && opts.moveAttendance && trace.privateCommissions.length) {
      out.push({
        code: 'private_commissions',
        count: trace.privateCommissions.length,
        message: 'الحضور ده عليه عمولات مدرب برايفت — مينفعش يتنقل أو يتمسح.',
      });
    }
    if (b.completedRefunds.length) {
      out.push({
        code: 'paid_refund',
        count: b.completedRefunds.length,
        message: 'الاشتراك عليه مرتجع اتصرف — الفلوس رجعت للعضو فعلاً، مينفعش يتمسح.',
      });
    }
    if (b.memberTransfers.length) {
      const asSource = b.memberTransfers.some((t) => Number(t.source_subscription_id) === Number(trace.subscription.id));
      out.push({
        code: 'member_transfer',
        count: b.memberTransfers.length,
        message: asSource
          ? 'الاشتراك ده اتنقل لعضو تاني — مينفعش يتمسح.'
          : 'الاشتراك ده جاي بالنقل من عضو تاني — مينفعش يتمسح.',
      });
    }
    if (b.planTransfers.length) {
      out.push({
        code: 'plan_transfer',
        count: b.planTransfers.length,
        message: 'الاشتراك داخل في عملية تحويل باقة — مينفعش يتمسح.',
      });
    }
    if (b.renewals.length) {
      out.push({
        code: 'renewal',
        count: b.renewals.length,
        message: `الاشتراك ده اتجدد باشتراك تاني (${b.renewals.map((r) => r.subscription_number).join('، ')}) — امسح التجديد الأول.`,
      });
    }
    if (b.coveredInbody.length || b.coveredSpa.length || b.spaAttendance.length) {
      const n = b.coveredInbody.length + b.coveredSpa.length + b.spaAttendance.length;
      out.push({
        code: 'services_used',
        count: n,
        message: `العضو استخدم خدمات من الاشتراك (InBody / SPA: ${n}) — مينفعش يتمسح كأنه ما حصلش.`,
      });
    }
    if (b.attendedClasses.length) {
      out.push({
        code: 'class_attended',
        count: b.attendedClasses.length,
        message: `العضو حضر كلاسات على الاشتراك (${b.attendedClasses.length}) — مينفعش يتمسح.`,
      });
    }
    if (trace.salesCommissions.length) {
      out.push({
        code: 'settled_commission',
        count: trace.salesCommissions.length,
        message: 'عمولة البيع على الاشتراك اتسوّت في المرتبات — مينفعش يتمسح.',
      });
    }
    if (b.closedPeriods.length) {
      out.push({
        code: 'closed_period',
        count: b.closedPeriods.length,
        message: `الفترة المحاسبية (${b.closedPeriods.map((p) => p.name).join('، ')}) مقفولة — لازم تتفتح الأول قبل الحذف.`,
      });
    }
    return out;
  }

  // ───────────────────────── access ─────────────────────────

  private assertAccess(user: JwtUser | undefined, branchId: number) {
    // Reception sheet: subscriptions can be added, never edited or deleted, from the desk.
    if (isReceptionEmployee(user)) throw new ForbiddenException('موظف الاستقبال لا يمكنه تعديل أو حذف الاشتراكات');
    assertManagerMayModify(user);
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private async moveTargets(db: Db, trace: PurgeTrace) {
    const memberId = trace.subscription.member_id;
    if (memberId == null) return [];
    const rows = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT id, subscription_number, subscription_type, subscription_start_date, subscription_end_date, status, branch_id
      FROM club_subscriptions
      WHERE member_id = ${Number(memberId)} AND id <> ${Number(trace.subscription.id)}
      ORDER BY subscription_end_date DESC, id DESC LIMIT 20`);
    return rows.map((r) => ({
      id: Number(r.id),
      subscriptionNumber: String(r.subscription_number ?? ''),
      subscriptionType: (r.subscription_type as string | null) ?? null,
      startDate: String(r.subscription_start_date ?? ''),
      endDate: String(r.subscription_end_date ?? ''),
      status: String(r.status ?? ''),
      branchId: r.branch_id == null ? null : Number(r.branch_id),
    }));
  }

  private summary(trace: PurgeTrace) {
    const sub = trace.subscription;
    const paymentsBy = new Map<number, Row[]>();
    for (const p of trace.receiptPayments) {
      const k = Number(p.receipt_id);
      paymentsBy.set(k, [...(paymentsBy.get(k) ?? []), p]);
    }
    const receipts = trace.receipts.map((r) => ({
      id: Number(r.id),
      receiptNumber: String(r.receipt_number),
      amount: round2(num(r.amount)),
      receiptDate: String(r.receipt_date ?? ''),
      status: String(r.status ?? ''),
      payments: (paymentsBy.get(Number(r.id)) ?? []).map((p) => ({ method: String(p.method), amount: round2(num(p.amount)) })),
    }));
    return {
      subscription: {
        id: Number(sub.id),
        subscriptionNumber: String(sub.subscription_number ?? ''),
        memberId: sub.member_id == null ? null : Number(sub.member_id),
        memberCode: (trace.member?.member_code as string | undefined) ?? null,
        customerName: (sub.customer_name as string | null) ?? (trace.member?.name as string | undefined) ?? null,
        subscriptionType: (sub.subscription_type as string | null) ?? null,
        startDate: String(sub.subscription_start_date ?? ''),
        endDate: String(sub.subscription_end_date ?? ''),
        registrationDate: String(sub.registration_date ?? ''),
        subscriptionValue: round2(num(sub.subscription_value)),
        paidAmount: round2(num(sub.paid_amount)),
        branchId: Number(sub.branch_id),
        createdBy: sub.created_by == null ? null : Number(sub.created_by),
        status: String(sub.status ?? ''),
      },
      receipts,
      totalMoney: round2(receipts.reduce((s, r) => s + r.amount, 0)),
      journalEntries: trace.journalEntries.length,
      journalLines: trace.journalLines.length,
      revenues: trace.revenues.length,
      refunds: trace.refunds.length,
      refundExpenses: trace.refundExpenses.length,
      points: {
        earned: trace.pointsEarned.reduce((s, r) => s + num(r.points), 0),
        redeemed: trace.pointsRedeemed.reduce((s, r) => s + num(r.points), 0),
        rows: trace.pointsEarned.length + trace.pointsRedeemed.length + trace.pointTransactions.length,
      },
      discountGrantsRestored: trace.grantsToRestore.length,
      couponUses: trace.couponUses.length,
      commissions: {
        trainer: trace.trainerCommissions.length,
        sales: trace.salesCommissions.length,
      },
      freezes: trace.freezes.length,
      waivers: trace.waivers.length,
      attendance: trace.attendance.length,
      classBookings: trace.classEnrollments.length,
      csFeedbacks: trace.csFeedbacks.length,
      unlinked: {
        inbodyInvoices: trace.unlink.inbodyInvoices.length,
        spaInvoices: trace.unlink.spaInvoices.length,
        staffTasks: trace.unlink.staffTasks.length,
        csInteractions: trace.unlink.csInteractions.length,
        onlineRequests: trace.unlink.onlineRequests.length,
      },
    };
  }

  // ───────────────────────── preview ─────────────────────────

  async preview(id: number, user?: JwtUser) {
    const trace = await this.collect(this.prisma, id);
    this.assertAccess(user, Number(trace.subscription.branch_id));
    const blockers = this.blockers(trace);
    const moveTargets = trace.attendance.length ? await this.moveTargets(this.prisma, trace) : [];
    return {
      ...this.summary(trace),
      blockers,
      canPurge: blockers.length === 0,
      // Attendance is the only blocker the caller can lift (by moving the visits).
      canPurgeByMovingAttendance:
        trace.attendance.length > 0 &&
        moveTargets.length > 0 &&
        this.blockers(trace, { moveAttendance: true }).length === 0,
      moveTargets,
    };
  }

  // ───────────────────────── purge ─────────────────────────

  async purge(
    id: number,
    body: { reason?: string; moveAttendanceToSubscriptionId?: number | null },
    user?: JwtUser,
  ) {
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 5) throw new BadRequestException('اكتب سبب الحذف (5 حروف على الأقل)');
    const moveTo = body?.moveAttendanceToSubscriptionId != null ? Number(body.moveAttendanceToSubscriptionId) : null;
    if (moveTo != null && (!Number.isInteger(moveTo) || moveTo <= 0 || moveTo === id)) {
      throw new BadRequestException('الاشتراك اللي هيتنقل له الحضور غير صالح');
    }

    // Cheap access check before the write transaction opens.
    const head = await this.prisma.club_subscriptions.findUnique({ where: { id }, select: { id: true, branch_id: true } });
    if (!head) throw new NotFoundException('الاشتراك غير موجود');
    this.assertAccess(user, head.branch_id);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM club_subscriptions WHERE id = ${id} FOR UPDATE`);
      const schema = await this.schemaColumns(tx);
      const trace = await this.collect(tx, id, schema);
      const sub = trace.subscription;
      const memberId = sub.member_id == null ? null : Number(sub.member_id);

      let target: Row | null = null;
      if (trace.attendance.length && moveTo != null) {
        const [t] = await tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT * FROM club_subscriptions WHERE id = ${moveTo} FOR UPDATE`);
        if (!t) throw new BadRequestException('الاشتراك اللي هيتنقل له الحضور مش موجود');
        if (memberId == null || Number(t.member_id) !== memberId) {
          throw new BadRequestException('الحضور يتنقل بس لاشتراك تاني لنفس العضو');
        }
        if (!this.branchScope.isBranchAllowed(user, Number(t.branch_id))) {
          throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات فرع الاشتراك المنقول إليه');
        }
        target = t;
      }

      const blockers = this.blockers(trace, { moveAttendance: target != null });
      if (blockers.length) throw new BadRequestException(blockers.map((b) => b.message).join(' — '));

      const summary = this.summary(trace);
      const exec = (sql: Prisma.Sql) => tx.$executeRaw(sql);
      const del = async (table: string, rows: Row[], key = 'id') => {
        const ids = this.ids(rows, key);
        if (!ids.length) return 0;
        return exec(Prisma.sql`DELETE FROM ${this.ident(table)} WHERE ${this.ident(key)} IN (${Prisma.join(ids)})`);
      };
      const nullify = async (table: string, rows: Row[], col: string) => {
        const ids = this.ids(rows);
        if (!ids.length || !this.has(schema, table, col)) return 0;
        return exec(Prisma.sql`UPDATE ${this.ident(table)} SET ${this.ident(col)} = NULL WHERE id IN (${Prisma.join(ids)}) AND ${this.ident(col)} = ${id}`);
      };

      // 1) Keep the member's visits on another subscription when asked.
      let movedAttendance = 0;
      if (target) {
        movedAttendance = await exec(Prisma.sql`
          UPDATE club_attendance SET subscription_id = ${Number(target.id)}, subscription_type = ${target.subscription_type ?? null}
          WHERE subscription_id = ${id}`);
        if (truthy(target.is_linked_to_sessions)) {
          await exec(Prisma.sql`
            UPDATE club_subscriptions SET sessions_used = sessions_used + ${movedAttendance} WHERE id = ${Number(target.id)}`);
        }
      }

      // 2) GL: lines, then break reversal pointers, then the entries.
      const entryIds = this.ids(trace.journalEntries);
      if (entryIds.length) {
        await exec(Prisma.sql`DELETE FROM acc_journal_entry_lines WHERE entry_id IN (${Prisma.join(entryIds)})`);
        await exec(Prisma.sql`UPDATE acc_journal_entries SET reverses_id = NULL, reversed_by_id = NULL WHERE id IN (${Prisma.join(entryIds)})`);
        await exec(Prisma.sql`DELETE FROM acc_journal_entries WHERE id IN (${Prisma.join(entryIds)})`);
      }

      // 3) Revenue register, refund expenses, commissions.
      await del('fin_revenues', trace.revenues);
      await del('fin_expenses', trace.refundExpenses);
      await del('club_trainer_receipt_commissions', trace.trainerCommissions, 'receipt_id');

      // 4) Receipts (payments first: the FK is not guaranteed to cascade on production).
      await del('club_receipt_payments', trace.receiptPayments);
      await del('club_receipts', trace.receipts);

      // 5) Subscription children.
      await del('club_subscription_refunds', trace.refunds);
      await del('club_subscription_freezes', trace.freezes);
      await del('club_subscription_waivers', trace.waivers);
      await del('club_class_enrollments', trace.classEnrollments);
      await del('cs_feedbacks', trace.csFeedbacks);

      // 6) Points: earned rows vanish, redeemed rows vanish (so the points return to the balance).
      await del('tbl_points_history', trace.pointsEarned);
      await del('tbl_points_exhausted_history', trace.pointsRedeemed);
      await del('club_member_point_transactions', trace.pointTransactions);

      // 7) Discount grants: hand the captain's code back to the member, drop the usage row.
      const grantIds = this.ids(trace.grantsToRestore);
      if (grantIds.length) {
        await exec(Prisma.sql`UPDATE tbl_emps_members_dis_codes SET approved = 0 WHERE id IN (${Prisma.join(grantIds)})`);
      }
      await del('tbl_cobon_exhausted_history', trace.couponUses);

      // 8) Rows that stay but must stop pointing at the subscription.
      await nullify('club_inbody_invoices', trace.unlink.inbodyInvoices, 'subscription_id');
      await nullify('club_spa_invoices', trace.unlink.spaInvoices, 'subscription_id');
      await nullify('staff_tasks', trace.unlink.staffTasks, 'subscription_id');
      await nullify('club_customer_service_interactions', trace.unlink.csInteractions, 'subscription_id');
      await nullify('online_subscription_requests', trace.unlink.onlineRequests, 'promoted_subscription_id');
      await nullify('online_subscription_requests', trace.unlink.onlineRequests, 'club_subscription_id');

      // 9) The subscription itself.
      await exec(Prisma.sql`DELETE FROM club_subscriptions WHERE id = ${id}`);

      // 10) Member profile dates mirrored from this subscription → latest remaining subscription.
      let memberDates: { before: Row; after: Row } | null = null;
      if (memberId != null && trace.member && this.has(schema, 'club_members', 'start_date', 'end_date')) {
        const pointedHere =
          String(trace.member.end_date ?? '') === String(sub.subscription_end_date ?? '') &&
          String(trace.member.start_date ?? '') === String(sub.subscription_start_date ?? '');
        if (pointedHere) {
          const remaining = await tx.$queryRaw<Row[]>(Prisma.sql`
            SELECT subscription_start_date, subscription_end_date FROM club_subscriptions
            WHERE member_id = ${memberId} ORDER BY subscription_end_date DESC, id DESC LIMIT 5`);
          const latest = remaining.find((r) => !isOpenEndedEndDate(String(r.subscription_end_date))) ?? remaining[0];
          if (latest) {
            const after = {
              start_date: String(latest.subscription_start_date),
              ...(isOpenEndedEndDate(String(latest.subscription_end_date)) ? {} : { end_date: String(latest.subscription_end_date) }),
            };
            await tx.club_members.update({ where: { id: memberId }, data: after });
            memberDates = {
              before: { start_date: trace.member.start_date ?? null, end_date: trace.member.end_date ?? null },
              after,
            };
          }
        }
      }

      // 11) One business-audit entry with the full snapshot, in the same transaction.
      const snap = (rows: Row[]) => rows.map(jsonSafeRow);
      const snapshot = {
        subscription: jsonSafeRow(sub),
        receipts: snap(trace.receipts),
        receiptPayments: snap(trace.receiptPayments),
        refunds: snap(trace.refunds),
        refundExpenses: snap(trace.refundExpenses),
        journalEntries: snap(trace.journalEntries),
        journalLines: snap(trace.journalLines),
        revenues: snap(trace.revenues),
        freezes: snap(trace.freezes),
        waivers: snap(trace.waivers),
        attendanceMoved: snap(target ? trace.attendance : []),
        pointsEarned: snap(trace.pointsEarned),
        pointsRedeemed: snap(trace.pointsRedeemed),
        pointTransactions: snap(trace.pointTransactions),
        couponUses: snap(trace.couponUses),
        grantsRestored: snap(trace.grantsToRestore),
        trainerCommissions: snap(trace.trainerCommissions),
        classEnrollments: snap(trace.classEnrollments),
        csFeedbacks: snap(trace.csFeedbacks),
        unlinked: {
          inbodyInvoices: snap(trace.unlink.inbodyInvoices),
          spaInvoices: snap(trace.unlink.spaInvoices),
          staffTasks: snap(trace.unlink.staffTasks),
          csInteractions: snap(trace.unlink.csInteractions),
          onlineRequests: snap(trace.unlink.onlineRequests),
        },
        memberDates,
      };
      const after = {
        purged: true,
        summary,
        movedAttendanceTo: target ? { id: Number(target.id), subscriptionNumber: target.subscription_number, count: movedAttendance } : null,
      };
      const audit = await tx.business_audit_log.create({
        data: {
          entity_type: 'club_subscription',
          entity_id: String(id),
          action: 'purge_mistaken_subscription',
          actor_user_id: user?.sub ?? null,
          actor_name: user?.name ?? null,
          branch_id: Number(sub.branch_id),
          before_json: snapshot as unknown as Prisma.InputJsonValue,
          after_json: after as unknown as Prisma.InputJsonValue,
          changed_fields: Prisma.JsonNull,
          reason,
        },
        select: { id: true },
      });

      return { summary, movedAttendance, auditId: audit.id, memberDates };
    }, { maxWait: 10000, timeout: 30000 });

    return {
      success: true,
      subscriptionId: id,
      subscriptionNumber: result.summary.subscription.subscriptionNumber,
      memberId: result.summary.subscription.memberId,
      removed: {
        receipts: result.summary.receipts.length,
        totalMoney: result.summary.totalMoney,
        journalEntries: result.summary.journalEntries,
        revenues: result.summary.revenues,
        points: result.summary.points,
        freezes: result.summary.freezes,
      },
      movedAttendance: result.movedAttendance,
      auditId: result.auditId,
    };
  }
}
