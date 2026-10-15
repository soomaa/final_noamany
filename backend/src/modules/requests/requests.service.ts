import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  fromDbRequestType,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_TO_DB,
  toDbRequestType,
} from '../../common/utils/request-types.util';
import { hrRequestStatusToLabel, SUSPEND_APPROVED, SUSPEND_REJECTED, SuspendStatus } from '../../common/utils/suspend-status.util';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { RequestEffectService } from './request-effect.service';
import { BusinessAuditService } from '../../common/audit/business-audit.service';
import { allocateDocumentNumber } from '../../common/number-series/document-number-series';

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
    private readonly hrScope: HrDataScopeService,
    private readonly effects: RequestEffectService,
    private readonly audit: BusinessAuditService,
  ) {}

  async list(q: ListRequestsDto, user: JwtUser) {
    const unified = await this.listHrRequests(q, user);
    const legacy = await this.listTalabatOrders(q, user);
    const merged = [...unified, ...legacy].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));

    const total = merged.length;
    const data = merged.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  private async listHrRequests(q: ListRequestsDto, user: JwtUser): Promise<RequestRow[]> {
    const and: Prisma.hr_requestsWhereInput[] = [];
    and.push(await this.hrScope.requestWhere(user));
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

  private async listTalabatOrders(q: ListRequestsDto, user: JwtUser): Promise<RequestRow[]> {
    if (q.type && q.type !== 'all') return [];

    const and: Prisma.hr_talabat_ordersWhereInput[] = [];
    and.push(await this.hrScope.legacyRequestWhere(user));
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
    const row = await this.prisma.hr_requests.findFirst({
      where: { AND: [{ id }, await this.hrScope.requestWhere(user)] },
    });
    if (!row) {
      const legacy = await this.prisma.hr_talabat_orders.findFirst({
        where: { AND: [{ id }, await this.hrScope.legacyRequestWhere(user)] },
      });
      if (!legacy) throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الطلب');
      return this.mapLegacyDetail(legacy);
    }
    const effect = await this.prisma.hr_request_effects.findUnique({
      where: { request_id: row.id },
    });
    return this.mapRequestDetail(row, effect?.snapshot_json);
  }

  async create(dto: CreateRequestDto, userId?: number, userName?: string | null, empId?: number | null) {
    if (!REQUEST_TYPE_TO_DB[dto.type] && !Object.values(REQUEST_TYPE_TO_DB).includes(dto.type)) {
      throw new BadRequestException('نوع الطلب غير معروف');
    }

    const { type, notes, payload: explicitPayload, ...rest } = dto;
    const payload = { ...(explicitPayload ?? {}), ...rest, notes };
    const emp = empId
      ? await this.prisma.employees.findUnique({ where: { id: empId } })
      : userId
        ? await this.prisma.employees.findFirst({ where: { id: userId } })
        : null;

    const now = new Date().toISOString();
    if (!emp) throw new BadRequestException('لا يوجد موظف مرتبط بالمستخدم الحالي');

    const row = await this.prisma.$transaction(async (tx) => {
      const maxNo = await tx.hr_requests.aggregate({ _max: { request_no: true } });
      const requestNumber = await allocateDocumentNumber(
        tx,
        'hr.request',
        (maxNo._max.request_no ?? 0) + 1,
      );
      return tx.hr_requests.create({
        data: {
          type: toDbRequestType(type),
          request_no: requestNumber,
          emp_id_fk: emp.id,
          emp_code_fk: emp.emp_code,
          emp_name: emp.employee,
          status: 0,
          payload: JSON.stringify(payload),
          created_at: now,
          publisher: userId,
          publisher_name: userName,
        },
      });
    });

    return { id: row.id };
  }

  async approve(id: number, user: JwtUser, dryRun = false) {
    const row = await this.prisma.hr_requests.findFirst({
      where: { AND: [{ id }, await this.hrScope.requestWhere(user)] },
    });
    if (!row) throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الطلب');
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

    await this.effects.prepare(typeKey);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM hr_requests WHERE id = ${id} FOR UPDATE`);
      const locked = await tx.hr_requests.findUnique({ where: { id } });
      if (!locked || locked.status !== 0) {
        throw new BadRequestException('لا يمكن اعتماد طلب غير معلق');
      }
      const existingEffect = await tx.hr_request_effects.findUnique({ where: { request_id: id } });
      if (existingEffect) throw new BadRequestException('تم تنفيذ أثر الطلب مسبقًا');
      const effectEmployee = locked.emp_id_fk
        ? await tx.employees.findUnique({ where: { id: locked.emp_id_fk }, select: { id: true } })
        : locked.emp_code_fk
          ? await tx.employees.findFirst({ where: { emp_code: locked.emp_code_fk }, select: { id: true } })
          : null;
      if (!effectEmployee) throw new NotFoundException('الموظف المرتبط بالطلب غير موجود');
      const effect = await this.effects.apply(
        tx,
        typeKey,
        id,
        locked.emp_id_fk,
        locked.emp_code_fk,
        this.parsePayload(locked.payload),
        user.sub,
      );
      const evidence = await tx.hr_request_effects.create({
        data: {
          request_id: id,
          effect_type: typeKey,
          employee_id: effectEmployee.id,
          snapshot_json: effect.snapshot,
          result_json: effect.result,
          applied_by: user.sub,
        },
      });
      await this.audit.log({
        entityType: 'hr_request',
        entityId: id,
        action: 'hr_request.approved',
        actorUserId: user.sub,
        branchId: user.branch || undefined,
        before: { status: locked.status },
        after: {
          status: 4,
          effectType: typeKey,
          effectId: evidence.id,
          employeeId: locked.emp_id_fk,
        },
      }, tx);
      await tx.hr_requests.update({
        where: { id },
        data: { status: 4, reason_action: 'approved' },
      });
      return { effectId: evidence.id, effect: effect.result };
    });

    return { id, status: 'approved', ...result };
  }

  async reject(id: number, user: JwtUser) {
    const row = await this.prisma.hr_requests.findFirst({
      where: { AND: [{ id }, await this.hrScope.requestWhere(user)] },
    });
    if (!row) throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الطلب');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM hr_requests WHERE id = ${id} FOR UPDATE`);
      const locked = await tx.hr_requests.findUnique({ where: { id } });
      if (!locked || locked.status !== 0) {
        throw new BadRequestException('لا يمكن رفض طلب غير معلق');
      }
      await this.audit.log({
        entityType: 'hr_request',
        entityId: id,
        action: 'hr_request.rejected',
        actorUserId: user.sub,
        branchId: user.branch || undefined,
        before: { status: locked.status },
        after: { status: 2, employeeId: locked.emp_id_fk },
      }, tx);
      await tx.hr_requests.update({
        where: { id },
        data: { status: 2, reason_action: 'rejected' },
      });
    });
    return { id, status: 'rejected' };
  }

  private mapRequestDetail(row: {
    id: number;
    type: string;
    emp_name: string | null;
    status: number;
    created_at: string | null;
    payload: string | null;
    reason_action: string | null;
  }, effectSnapshot?: Prisma.JsonValue) {
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
      effectSnapshot: effectSnapshot ?? null,
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
