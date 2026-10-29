import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import {
  fromDbRequestType,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_TO_DB,
  toDbRequestType,
} from '../../common/utils/request-types.util';
import { hrRequestStatusToLabel, SUSPEND_APPROVED, SUSPEND_REJECTED, SuspendStatus } from '../../common/utils/suspend-status.util';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { LoansService } from '../loans/loans.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

/** Who may see which requests: `null` employee set = every request (system admin). */
type RequestAudience = { empIds: number[] | null };

export interface RequestRow {
  id: number;
  type: string;
  typeLabel: string;
  employeeName: string | null;
  title: string | null;
  createdAt: string | null;
  status: string;
  source: 'hr_requests' | 'hr_talabat_orders';
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: LoansService,
    private readonly scope: BranchScopeService,
    private readonly engine: PermissionEngineService,
  ) {}

  // ---- visibility -----------------------------------------------------------------------

  /** Reviewers hold approve/reject; everyone else only files and follows their own requests. */
  private async isReviewer(user: JwtUser): Promise<boolean> {
    if (isSystemAdmin(user)) return true;
    return this.engine.canAny(user.sub, ['leaves.requests:approve', 'leaves.requests:reject']);
  }

  /**
   * Employee ids whose requests `user` may see: system admin → all; reviewer → employees of
   * the allowed branches; anyone else → only their own employee row (users.emp_code).
   */
  private async audience(user: JwtUser): Promise<RequestAudience> {
    if (isSystemAdmin(user)) return { empIds: null };
    if (!(await this.isReviewer(user))) return { empIds: user.emp_code != null ? [user.emp_code] : [] };
    const branches = this.scope.allowedBranchIds(user) ?? [];
    const rows = branches.length
      ? await this.prisma.employees.findMany({ where: { branch_id_fk: { in: branches } }, select: { id: true } })
      : [];
    return { empIds: rows.map((r) => r.id) };
  }

  /** The employee a request is about — same resolution routeToDomain uses on approval. */
  private async requestEmployeeBranch(row: {
    emp_id_fk: number | null;
    emp_code_fk?: number | null;
    payload?: string | null;
  }): Promise<{ id: number | null; branch: number | null }> {
    const payload = this.parsePayload(row.payload ?? null);
    const empId = row.emp_id_fk ?? (Number(payload.empId) || null);
    const emp = empId
      ? await this.prisma.employees.findUnique({ where: { id: empId }, select: { id: true, branch_id_fk: true } })
      : row.emp_code_fk
        ? await this.prisma.employees.findFirst({ where: { emp_code: row.emp_code_fk }, select: { id: true, branch_id_fk: true } })
        : null;
    return { id: emp?.id ?? null, branch: emp?.branch_id_fk ?? null };
  }

  /** Own request (any user) or a reviewer whose branch scope covers the request's employee. */
  private async assertCanSee(
    user: JwtUser,
    row: { emp_id_fk: number | null; emp_code_fk?: number | null; payload?: string | null },
    reviewOnly = false,
  ): Promise<void> {
    if (isSystemAdmin(user)) return;
    const emp = await this.requestEmployeeBranch(row);
    const own = user.emp_code != null && emp.id === user.emp_code;
    if (own && !reviewOnly) return;
    if (!(await this.isReviewer(user))) throw new ForbiddenException('لا تملك صلاحية الوصول لهذا الطلب');
    this.scope.assertBranchAllowed(user, emp.branch, 'لا تملك صلاحية الوصول لطلبات هذا الفرع');
  }

  async list(q: ListRequestsDto, user: JwtUser) {
    const audience = await this.audience(user);
    const unified = await this.listHrRequests(q, audience);
    const legacy = await this.listTalabatOrders(q, audience);
    const merged = [...unified, ...legacy].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));

    const total = merged.length;
    const data = merged.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  private async listHrRequests(q: ListRequestsDto, audience: RequestAudience): Promise<RequestRow[]> {
    const and: Prisma.hr_requestsWhereInput[] = [];
    if (audience.empIds) and.push({ emp_id_fk: { in: audience.empIds } });
    if (q.type && q.type !== 'all') and.push({ type: toDbRequestType(q.type) });
    if (q.status === 'approved') and.push({ status: { in: [1, 4] } });
    else if (q.status === 'rejected') and.push({ status: { in: [2, 5] } });
    else if (q.status === 'pending') and.push({ status: { in: [0] } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ emp_name: { contains: s } }, { payload: { contains: s } }] });
    }

    const rows = await this.prisma.hr_requests.findMany({
      where: and.length ? { AND: and } : undefined,
      orderBy: { id: 'desc' },
    });

    return rows.map((row) => {
      const typeKey = fromDbRequestType(row.type);
      let title: string | null = null;
      try {
        const payload = row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : {};
        title =
          (payload.reason as string) ??
          (payload.purpose as string) ??
          (payload.notes as string) ??
          null;
      } catch {
        title = row.reason_action;
      }
      return {
        id: row.id,
        type: typeKey,
        typeLabel: REQUEST_TYPE_LABELS[typeKey] ?? row.type,
        employeeName: row.emp_name,
        title,
        createdAt: row.created_at,
        status: hrRequestStatusToLabel(row.status),
        source: 'hr_requests' as const,
      };
    });
  }

  private async listTalabatOrders(q: ListRequestsDto, audience: RequestAudience): Promise<RequestRow[]> {
    if (q.type && q.type !== 'all') return [];

    const and: Prisma.hr_talabat_ordersWhereInput[] = [];
    if (audience.empIds) and.push({ emp_id_fk: { in: audience.empIds } });
    if (q.status === 'approved') and.push({ suspend: { in: SUSPEND_APPROVED } });
    else if (q.status === 'rejected') and.push({ suspend: { in: SUSPEND_REJECTED } });
    else if (q.status === 'pending') and.push({ suspend: SuspendStatus.INCOMING });
    if (q.search?.trim()) {
      and.push({ notes: { contains: q.search.trim() } });
    }

    const rows = await this.prisma.hr_talabat_orders.findMany({
      where: and.length ? { AND: and } : undefined,
      orderBy: { id: 'desc' },
    });

    const empIds = rows.map((r) => r.emp_id_fk).filter((v): v is number => v != null);
    const employees = empIds.length
      ? await this.prisma.employees.findMany({
          where: { id: { in: empIds } },
          select: { id: true, employee: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e.employee]));

    return rows.map((row) => ({
      id: row.id,
      type: 'legacy',
      typeLabel: 'طلب عام',
      employeeName: row.emp_id_fk != null ? (empMap.get(row.emp_id_fk) ?? row.publisher_name) : row.publisher_name,
      title: row.notes,
      createdAt: row.talab_date_ar ?? row.date_ar,
      status: hrRequestStatusToLabel(row.suspend ?? 0),
      source: 'hr_talabat_orders' as const,
    }));
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.prisma.hr_requests.findUnique({ where: { id } });
    if (!row) {
      const legacy = await this.prisma.hr_talabat_orders.findUnique({ where: { id } });
      if (!legacy) throw new NotFoundException('الطلب غير موجود');
      await this.assertCanSee(user, { emp_id_fk: legacy.emp_id_fk });
      return this.mapLegacyDetail(legacy);
    }
    await this.assertCanSee(user, row);
    return this.mapRequestDetail(row);
  }

  /**
   * The employee a new request is filed for. A staff login files for itself
   * (users.emp_code = employees.id). Only a login with no employee link (e.g. an
   * admin account) may name the employee, and that employee must be in scope.
   * users.user_id is never treated as an employees.id.
   */
  private async resolveRequestEmployee(user: JwtUser, dto: CreateRequestDto) {
    if (user.emp_code != null) return this.prisma.employees.findUnique({ where: { id: user.emp_code } });
    const raw = dto.empId ?? dto.payload?.empId;
    const requested = Number(raw);
    if (raw == null || raw === '' || !Number.isInteger(requested) || requested <= 0) return null;
    const emp = await this.prisma.employees.findUnique({ where: { id: requested } });
    if (!emp) throw new BadRequestException('الموظف غير موجود');
    this.scope.assertBranchAllowed(user, emp.branch_id_fk, 'لا يمكنك تقديم طلب لموظف خارج فرعك');
    return emp;
  }

  async create(dto: CreateRequestDto, user: JwtUser) {
    const userId = user.sub;
    const userName = user.name;
    if (!REQUEST_TYPE_TO_DB[dto.type] && !Object.values(REQUEST_TYPE_TO_DB).includes(dto.type)) {
      throw new BadRequestException('نوع الطلب غير معروف');
    }

    const { type, notes, payload: explicitPayload, ...rest } = dto;
    const emp = await this.resolveRequestEmployee(user, dto);
    // Client-supplied employee ids never reach the stored payload: approval routes on
    // emp_id_fk, and a stale `empId` must not be able to redirect it to someone else.
    const payload: Record<string, unknown> = { ...(explicitPayload ?? {}), ...rest, notes };
    delete payload.empId;

    const maxNo = await this.prisma.hr_requests.aggregate({ _max: { request_no: true } });
    const now = new Date().toISOString();

    const row = await this.prisma.hr_requests.create({
      data: {
        type: toDbRequestType(type),
        request_no: (maxNo._max.request_no ?? 0) + 1,
        emp_id_fk: emp?.id,
        emp_code_fk: emp?.emp_code,
        emp_name: emp?.employee,
        status: 0,
        payload: JSON.stringify(payload),
        created_at: now,
        publisher: userId,
        publisher_name: userName,
      },
    });

    return { id: row.id };
  }

  async approve(id: number, user: JwtUser, dryRun = false) {
    const userId = user.sub;
    const row = await this.prisma.hr_requests.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الطلب غير موجود');
    await this.assertCanSee(user, row, true);
    if ([1, 4].includes(row.status)) throw new BadRequestException('الطلب معتمد مسبقًا');

    const payload = this.parsePayload(row.payload);
    const typeKey = fromDbRequestType(row.type);

    if (dryRun) {
      const rows: { label: string; before?: string; after?: string }[] = [
        { label: 'نوع الطلب', after: REQUEST_TYPE_LABELS[typeKey] ?? typeKey },
        { label: 'الموظف', after: row.emp_name ?? '—' },
      ];
      if (typeKey === 'leave') {
        rows.push({ label: 'من', after: String(payload.date_from ?? '—') });
        rows.push({ label: 'إلى', after: String(payload.date_to ?? '—') });
      }
      if (typeKey === 'loan' || typeKey === 'advance') {
        rows.push({ label: 'المبلغ', after: String(payload.amount ?? '—') });
        if (typeKey === 'loan') rows.push({ label: 'الأقساط', after: String(payload.installments ?? '—') });
      }
      return { dryRun: true, preview: { type: typeKey }, rows, warning: 'سيتم إنشاء سجل في النظام عند الاعتماد' };
    }

    await this.routeToDomain(typeKey, row, payload, userId);

    await this.prisma.hr_requests.update({
      where: { id },
      data: { status: 4, reason_action: 'approved' },
    });

    return { id, status: 'approved' };
  }

  async reject(id: number, user: JwtUser) {
    const row = await this.prisma.hr_requests.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الطلب غير موجود');
    await this.assertCanSee(user, row, true);
    await this.prisma.hr_requests.update({
      where: { id },
      data: { status: 2, reason_action: 'rejected' },
    });
    return { id, status: 'rejected' };
  }

  private async routeToDomain(
    typeKey: string,
    row: { emp_id_fk: number | null; emp_code_fk: number | null; emp_name: string | null },
    payload: Record<string, unknown>,
    userId?: number,
  ) {
    const empId = row.emp_id_fk ?? (payload.empId as number | undefined);
    const emp = empId
      ? await this.prisma.employees.findUnique({ where: { id: empId } })
      : row.emp_code_fk
        ? await this.prisma.employees.findFirst({ where: { emp_code: row.emp_code_fk } })
        : null;

    switch (typeKey) {
      case 'leave':
        await this.createLeaveOrder(emp, payload);
        break;
      case 'permission':
        await this.createPermissionOrder(emp, payload);
        break;
      case 'advance':
      case 'loan':
        await this.createLoanFromRequest(emp, payload, typeKey === 'loan', userId);
        break;
      case 'allowance':
      case 'salary-certificate':
      case 'resignation':
      case 'transfer':
      case 'promotion':
      case 'data-change':
        break;
      default:
        break;
    }
  }

  private async createLeaveOrder(
    emp: { id: number; emp_code: number | null; employee: string | null; edara_id: number | null; edara_n: string | null; qsm_id: number | null; qsm_n: string | null } | null,
    payload: Record<string, unknown>,
  ) {
    if (!emp) return;
    const leaveTypeId = Number(payload.leave_type_id);
    const leaveType = Number.isInteger(leaveTypeId) && leaveTypeId > 0
      ? await this.prisma.holiday_setting.findUnique({ where: { id: leaveTypeId } })
      : null;
    if (!leaveType || leaveType.agaza_ttype !== 0 || leaveType.active !== 'yes') {
      throw new BadRequestException('اختر نوع إجازة نشطًا خاصًا بالموظف');
    }
    const maxRkm = await this.prisma.hr_all_agzat_orders.aggregate({ _max: { agaza_rkm: true } });
    const today = new Date().toISOString().slice(0, 10);
    await this.prisma.hr_all_agzat_orders.create({
      data: {
        agaza_rkm: (maxRkm._max.agaza_rkm ?? 0) + 1,
        agaza_date_ar: today,
        emp_id_fk: emp.id,
        emp_code_fk: emp.emp_code != null ? BigInt(emp.emp_code) : undefined,
        edara_id_fk: emp.edara_id,
        edara_n: emp.edara_n,
        qsm_id_fk: emp.qsm_id,
        qsm_n: emp.qsm_n,
        no3_agaza: leaveTypeId,
        agaza_from_date_m: String(payload.date_from ?? ''),
        agaza_to_date_m: String(payload.date_to ?? ''),
        reason: String(payload.notes ?? payload.reason ?? ''),
        suspend: SuspendStatus.APPROVED,
      },
    });
  }

  private async createPermissionOrder(
    emp: { id: number; emp_code: number | null; employee: string | null; edara_id: number | null; edara_n: string | null; qsm_id: number | null; qsm_n: string | null; mosma_wazefy_n: string | null } | null,
    payload: Record<string, unknown>,
  ) {
    if (!emp) return;
    const maxRkm = await this.prisma.hr_all_ozonat_orders.aggregate({ _max: { ezn_rkm: true } });
    const today = new Date().toISOString().slice(0, 10);
    await this.prisma.hr_all_ozonat_orders.create({
      data: {
        ezn_rkm: (maxRkm._max.ezn_rkm ?? 0) + 1,
        ezn_date_ar: today,
        emp_id_fk: emp.id,
        emp_code_fk: emp.emp_code ?? undefined,
        emp_name: emp.employee,
        edara_id_fk: emp.edara_id,
        edara_n: emp.edara_n,
        qsm_id_fk: emp.qsm_id,
        qsm_n: emp.qsm_n,
        job_title: emp.mosma_wazefy_n,
        date_ar: String(payload.permission_date ?? today),
        from_hour: String(payload.time_from ?? ''),
        to_hour: String(payload.time_to ?? ''),
        reason: String(payload.reason ?? ''),
        suspend: SuspendStatus.APPROVED,
      },
    });
  }

  private async createLoanFromRequest(
    emp: { id: number; emp_code: number | null; employee: string | null; edara_id: number | null; edara_n: string | null; qsm_id: number | null; qsm_n: string | null; mosma_wazefy_n: string | null } | null,
    payload: Record<string, unknown>,
    isLoan: boolean,
    userId?: number,
  ) {
    if (!emp) return;
    const amount = Number(payload.amount ?? 0);
    const installments = Number(payload.installments ?? 1);
    const deductionStart = String(payload.deductionStartDate ?? new Date().toISOString().slice(0, 10));
    if (!amount || !installments) return;

    await this.loans.create(
      {
        empId: emp.id,
        amount,
        installments: isLoan ? installments : Math.max(1, installments),
        sadadSolfa: installments > 1 ? 3 : 2,
        deductionStartDate: deductionStart,
        reason: String(payload.reason ?? (isLoan ? 'قرض' : 'سلفة')),
      },
      userId,
    );
  }

  private mapRequestDetail(row: {
    id: number;
    type: string;
    emp_name: string | null;
    status: number;
    created_at: string | null;
    payload: string | null;
    reason_action: string | null;
  }) {
    const typeKey = fromDbRequestType(row.type);
    const payload = this.parsePayload(row.payload);
    const status = hrRequestStatusToLabel(row.status);
    return {
      id: row.id,
      type: typeKey,
      typeLabel: REQUEST_TYPE_LABELS[typeKey] ?? row.type,
      employeeName: row.emp_name,
      status,
      createdAt: row.created_at,
      payload,
      timeline: this.buildTimeline(row.created_at, status, row.reason_action),
    };
  }

  private mapLegacyDetail(legacy: {
    id: number;
    emp_id_fk: number | null;
    suspend: number | null;
    talab_date_ar: string | null;
    date_ar: string | null;
    notes: string | null;
    publisher_name: string | null;
  }) {
    const status = hrRequestStatusToLabel(legacy.suspend ?? 0);
    return {
      id: legacy.id,
      type: 'legacy' as const,
      typeLabel: 'طلب عام',
      employeeName: legacy.publisher_name,
      status,
      createdAt: legacy.talab_date_ar ?? legacy.date_ar,
      payload: { notes: legacy.notes },
      timeline: this.buildTimeline(legacy.talab_date_ar ?? legacy.date_ar, status, null),
    };
  }

  private buildTimeline(createdAt: string | null, status: string, reason: string | null) {
    const events = [
      { id: '1', status: 'submitted', label: 'تم تقديم الطلب', at: createdAt ?? undefined },
    ];
    if (status === 'approved') {
      events.push({ id: '2', status: 'approved', label: 'تم اعتماد الطلب', at: undefined });
    } else if (status === 'rejected') {
      events.push({ id: '2', status: 'rejected', label: reason ?? 'تم رفض الطلب', at: undefined });
    } else {
      events.push({ id: '2', status: 'pending', label: 'قيد المراجعة', at: undefined });
    }
    return events;
  }

  private parsePayload(raw: string | null): Record<string, unknown> {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
