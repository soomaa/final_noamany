import { Injectable } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';
import { ContactVisibilityService } from '../../common/privacy/contact-visibility.service';
import { maskPhone } from '../../common/privacy/mask';
import type { JwtUser } from '../../common/types/jwt-user';
import { LeadScopeService } from '../../common/lead-scope/lead-scope.service';
import { loginIdsForEmployee } from '../employees/sales-attribution.util';

export interface CallLogRow {
  id: string;
  source: 'lead' | 'manual';
  leadId: number | null;
  clientName: string;
  phone: string | null;
  /** Call date and time as one instant; the screen shows them in a single column. */
  calledAt: string;
  salesRepId: number | null;
  /** The rep the client belongs to. Null when nobody owns them — never a stand-in. */
  salesRepName: string | null;
  /** Who typed the entry. Often the rep, but an office entry is logged by the desk. */
  loggedByName: string | null;
  /** `true`/`false` for a logged sales call, `null` when the source records only text. */
  answered: boolean | null;
  outcome: string | null;
  notes: string | null;
  /** The next call this one scheduled, if any. */
  nextCallAt: string | null;
  nextFollowUpAt: string | null;
}

const PAGE_SIZE_MAX = 200;

/** `2026-09-13` + `14:30` → a Date. A missing/invalid time counts as midnight. */
function combineDateTime(date: string, time: string | null): Date | null {
  if (!date) return null;
  const trimmed = date.trim().slice(0, 10);
  const clock = (time ?? '').trim().slice(0, 8) || '00:00:00';
  const parsed = new Date(`${trimmed}T${clock.length === 5 ? `${clock}:00` : clock}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Every call the club has on record, from both places they get written: the typed call
 * outcomes sales reps log against a lead, and the manual entries the office adds on this
 * screen. One list, because "did anyone call this person?" has one answer.
 */
@Injectable()
export class MosCallsLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: BranchScopeService,
    private readonly employees: EmployeesService,
    private readonly visibility: ContactVisibilityService,
    private readonly leadScope: LeadScopeService,
  ) {}

  /**
   * Sales reps a viewer may filter by, within their branch scope.
   *
   * A rep gets only themselves and `canChoose: false`: the call log is the same pipeline
   * the Potential Members list scopes to its owner, so the rep filter here cannot be a way
   * to read a colleague's calls.
   */
  async reps(user: { [key: string]: unknown }) {
    const scope = await this.leadScope.scopeFor(user as unknown as JwtUser);
    const rows = await this.employees.salesReps();
    if (scope.restricted) {
      const self = rows.find((rep) => rep.id === scope.assignedTo);
      return {
        canChoose: false,
        data: self ? [{ id: self.id, name: self.name }] : [],
      };
    }
    const branches = this.scope.resolveListFilter(user as never, null);
    return {
      canChoose: true,
      data: rows
        .filter((rep) => branches === null || rep.branchId == null || branches.includes(rep.branchId))
        .map((rep) => ({ id: rep.id, name: rep.name })),
    };
  }

  async list(user: { [key: string]: unknown }, query: Record<string, unknown>) {
    const branches = this.scope.resolveListFilter(user as never, null);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(query.pageSize) || 25));
    // A rep is pinned to their own calls whatever `salesId` says: calls on the leads they
    // hold, plus calls they logged themselves on a lead that has since moved on. Ownership
    // is the whole scope for them — the branch filter is not layered on top, because a
    // lead handed to a rep from another branch (or with no branch) is still theirs to
    // ring, and stacking the two is exactly what emptied the page for a rep whose own
    // calls were all there (see `lead-where.ts` in the sales portal for the same rule).
    const scope = await this.leadScope.scopeFor(user as unknown as JwtUser);
    const salesId = scope.restricted
      ? null
      : query.salesId != null && query.salesId !== '' ? Number(query.salesId) : null;
    const search = String(query.search ?? '').trim();
    const dateFrom = String(query.dateFrom ?? '').trim();
    const dateTo = String(query.dateTo ?? '').trim();
    const answeredFilter =
      query.answered === 'yes' ? true : query.answered === 'no' ? false : null;

    // Bound the window server-side so a wide date range cannot pull the whole table.
    const fromAt = dateFrom ? combineDateTime(dateFrom, '00:00:00') : null;
    const toAt = dateTo ? combineDateTime(dateTo, '23:59:59') : null;

    const leadWhere: Record<string, unknown> = { is_deleted: false };
    if (!scope.restricted && branches !== null) leadWhere.branch_id = { in: branches };
    if (salesId != null) leadWhere.assigned_to = salesId;
    if (search) {
      leadWhere.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const followUpWhere: Record<string, unknown> = {
      activity_type: 'call',
      lead: leadWhere,
    };
    if (scope.restricted) {
      // An unresolved rep matches nothing rather than everything (see `leadScopeWhere`).
      const self = scope.assignedTo ?? -1;
      const loginIds = scope.assignedTo != null ? await loginIdsForEmployee(this.prisma, self) : [];
      followUpWhere.OR = [
        { lead: { assigned_to: self } },
        ...(loginIds.length ? [{ created_by: { in: loginIds } }] : []),
      ];
    }
    if (fromAt || toAt) {
      followUpWhere.created_at = { ...(fromAt ? { gte: fromAt } : {}), ...(toAt ? { lte: toAt } : {}) };
    }
    if (answeredFilter !== null) followUpWhere.answered = answeredFilter;

    const [leadCalls, manualCalls, reps, vis] = await Promise.all([
      this.prisma.club_lead_follow_ups.findMany({
        where: followUpWhere,
        orderBy: { created_at: 'desc' },
        // Over-fetch one page's worth from each source, then merge and slice: the two
        // are interleaved by time, so neither can be paged independently.
        take: page * pageSize,
        select: {
          id: true,
          note: true,
          answered: true,
          next_call_at: true,
          next_follow_up_at: true,
          author_name: true,
          created_at: true,
          lead: { select: { id: true, name: true, phone: true, assigned_to: true } },
        },
      }),
      // A rep filter is a lead-assignment concept; manual rows carry only a staff name,
      // so filtering by rep necessarily excludes them.
      // …and a pinned rep has no manual rows: those carry only a staff name, no owner.
      salesId != null || scope.restricted
        ? Promise.resolve([])
        : this.manualCalls(branches, search, dateFrom, dateTo, page * pageSize),
      this.employees.salesReps(),
      this.visibility.forUser(user as unknown as JwtUser),
    ]);

    // Names for every assigned employee on this page, not only those who currently hold a
    // sales job title. Resolving from the sales-rep list alone left an owner unnamed, and
    // the column then fell through to whoever typed the entry — so a row showed one
    // person's id beside another person's name, and the desk read the call as theirs.
    const assignedIds = [
      ...new Set(
        leadCalls
          .map((row) => row.lead?.assigned_to)
          .filter((id): id is number => Number.isInteger(id) && (id as number) > 0),
      ),
    ];
    const assignedRows = assignedIds.length
      ? await this.prisma.employees.findMany({
          where: { id: { in: assignedIds } },
          select: { id: true, employee: true },
        })
      : [];
    const repName = new Map<number, string | null>(reps.map((rep) => [rep.id, rep.name] as const));
    for (const row of assignedRows) {
      if (!repName.get(row.id)) repName.set(row.id, row.employee);
    }

    const rows: CallLogRow[] = [
      ...leadCalls.map((row) => ({
        id: `lead:${row.id}`,
        source: 'lead' as const,
        leadId: row.lead?.id ?? null,
        clientName: row.lead?.name ?? '',
        phone: row.lead?.phone ?? null,
        calledAt: row.created_at.toISOString(),
        salesRepId: row.lead?.assigned_to ?? null,
        // The owner, or nothing. An unowned client has no sales employee, and putting the
        // author's name here made the filter and the column disagree about who a call
        // belonged to.
        salesRepName: row.lead?.assigned_to != null ? repName.get(row.lead.assigned_to) ?? null : null,
        loggedByName: row.author_name ?? null,
        answered: row.answered,
        outcome: null,
        notes: row.note || null,
        nextCallAt: row.next_call_at?.toISOString() ?? null,
        nextFollowUpAt: row.next_follow_up_at?.toISOString() ?? null,
      })),
      ...manualCalls.map((row) => {
        const at = combineDateTime(row.call_date, row.call_time);
        return {
          id: `manual:${row.id}`,
          source: 'manual' as const,
          leadId: null,
          clientName: row.member_name ?? '',
          phone: row.phone ?? null,
          calledAt: (at ?? row.created_at).toISOString(),
          // A manual office entry has no lead, so it has no owning rep — only a logger.
          salesRepId: null,
          salesRepName: null,
          loggedByName: row.staff_name ?? null,
          answered: null,
          outcome: row.outcome ?? row.subject ?? null,
          notes: row.notes || null,
          nextCallAt: null,
          nextFollowUpAt: null,
        };
      }),
    ]
      // A manual row filtered only by date string still has to respect the answered filter.
      .filter((row) => answeredFilter === null || row.answered === answeredFilter)
      .sort((a, b) => b.calledAt.localeCompare(a.calledAt));

    // A call log is a phone list with dates on it. Same grant as every other list: stars
    // for anyone without it, and a lead-backed row can still be revealed one at a time.
    if (!vis.phones) for (const row of rows) row.phone = maskPhone(row.phone);

    const answeredCount = rows.filter((row) => row.answered === true).length;
    const unansweredCount = rows.filter((row) => row.answered === false).length;

    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      // The merge makes an exact count expensive; this is what the window holds.
      total: rows.length,
      summary: { total: rows.length, answered: answeredCount, unanswered: unansweredCount },
    };
  }

  private async manualCalls(
    branches: number[] | null,
    search: string,
    dateFrom: string,
    dateTo: string,
    take: number,
  ) {
    const where: Record<string, unknown> = { is_deleted: false };
    if (branches !== null) where.branch_id = { in: branches };
    if (search) {
      where.OR = [
        { member_name: { contains: search } },
        { phone: { contains: search } },
        { subject: { contains: search } },
        { staff_name: { contains: search } },
      ];
    }
    // `call_date` is a `VARCHAR(20)` holding `YYYY-MM-DD`, which compares correctly as text.
    if (dateFrom || dateTo) {
      where.call_date = { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) };
    }
    return this.prisma.club_calls.findMany({
      where,
      orderBy: [{ call_date: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        member_name: true,
        phone: true,
        call_date: true,
        call_time: true,
        subject: true,
        outcome: true,
        notes: true,
        staff_name: true,
        created_at: true,
      },
    });
  }
}
