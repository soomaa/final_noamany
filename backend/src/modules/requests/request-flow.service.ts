import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import { legacyBusinessIsoDate } from '../../common/utils/legacy-date.util';
import { PendingStage } from '../../common/hr-approval/approval-chain';
import {
  FLOW_STATUS_LABEL_AR,
  FlowStatus,
  ReturnInfo,
  STAGE_FLOW_STATUS,
  stageLabel,
} from '../../common/hr-approval/request-flow';
import { LeavesService } from '../leaves/leaves.service';
import { PermissionsService } from '../permissions/permissions.service';
import { OvertimeRequestsService } from '../overtime-requests/overtime-requests.service';
import { FlowActionDto, FlowKind, FlowResubmitDto, InboxQueryDto } from './dto/inbox.dto';

export interface InboxItem {
  key: string;
  kind: FlowKind;
  kindLabel: string;
  id: number;
  empId: number | null;
  employeeName: string | null;
  branchId: number | null;
  branchName: string | null;
  summary: string;
  stage: string | null;
  stageLabel: string | null;
  flowStatus: FlowStatus;
  flowStatusLabel: string;
  currentTo: string | null;
  currentToUserId: number | null;
  returned: boolean;
  returnComment: string | null;
  createdAt: string | null;
  routedToMe: boolean;
  /** HR / admin acting instead of the routed approver (logged as an override). */
  override: boolean;
  canAction: boolean;
}

const KIND_LABEL: Record<FlowKind, string> = {
  leave: 'إجازة',
  permission: 'إذن',
  overtime: 'ساعات / شيفت إضافي',
};

const STAGE_FILTER: Record<string, FlowStatus> = {
  manager: 'pending_manager',
  hr: 'pending_hr',
  dept: 'pending_dept',
  gm: 'pending_gm',
  returned: 'returned',
};

/**
 * «بانتظار الموافقة» — one inbox for leaves, permissions and overtime requests, plus the unified
 * request card (detail / action / resubmit) the web pages share.
 *
 * HR (job-title code 44, hr:approve) and admins see EVERY open request, not only the ones routed
 * to them, and may act on any of them (recorded as an override in the timeline). Everyone else
 * sees what is routed to them and what was returned to them for changes.
 */
@Injectable()
export class RequestFlowService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly leaves?: LeavesService,
    @Optional() private readonly permissions?: PermissionsService,
    @Optional() private readonly overtime?: OvertimeRequestsService,
  ) {}

  async isHr(user: JwtUser): Promise<boolean> {
    if (isSystemAdmin(user)) return true;
    if (this.leaves && (await this.leaves.isHrOrAdmin(user))) return true;
    if (this.overtime && (await this.overtime.isHrOrAdmin(user))) return true;
    return false;
  }

  private chainItem(
    kind: 'leave' | 'permission',
    input: {
      id: number;
      empId: number | null;
      employeeName: string | null;
      summary: string;
      stage: PendingStage;
      ret: ReturnInfo | null;
      currentTo: string | null;
      currentToUserId: number | null;
      publisher: number | null;
      createdAt: string | null;
    },
    user: JwtUser,
    hr: boolean,
  ): InboxItem {
    const flowStatus: FlowStatus = input.ret ? 'returned' : STAGE_FLOW_STATUS[input.stage];
    const routedToMe = input.currentToUserId === user.sub;
    const canAction = !input.ret && (routedToMe || hr) && input.publisher !== user.sub;
    return {
      key: `${kind}:${input.id}`,
      kind,
      kindLabel: KIND_LABEL[kind],
      id: input.id,
      empId: input.empId,
      employeeName: input.employeeName,
      branchId: null,
      branchName: null,
      summary: input.summary,
      stage: input.stage,
      stageLabel: stageLabel(input.stage),
      flowStatus,
      flowStatusLabel: FLOW_STATUS_LABEL_AR[flowStatus],
      currentTo: input.currentTo,
      currentToUserId: input.currentToUserId,
      returned: input.ret != null,
      returnComment: input.ret?.comment ?? null,
      createdAt: input.createdAt,
      routedToMe,
      override: canAction && !routedToMe,
      canAction,
    };
  }

  private async collect(q: InboxQueryDto, user: JwtUser, hr: boolean): Promise<InboxItem[]> {
    const type = q.type && q.type !== 'all' ? q.type : null;
    const items: InboxItem[] = [];

    if (this.leaves && (!type || type === 'leave')) {
      const rows = await this.leaves.openRows();
      const typeIds = [...new Set(rows.map((r) => r.row.no3_agaza).filter((v): v is number => v != null))];
      const types = typeIds.length ? await this.prisma.holiday_setting.findMany({ where: { id: { in: typeIds } } }) : [];
      const typeName = new Map(types.map((t) => [t.id, t.name]));
      for (const { row, stage, ret } of rows) {
        items.push(
          this.chainItem(
            'leave',
            {
              id: row.id,
              empId: row.emp_id_fk,
              employeeName: row.current_from_user_name ?? null,
              summary: `${(row.no3_agaza != null ? typeName.get(row.no3_agaza) : null) ?? 'إجازة'}: ${row.agaza_from_date_m ?? ''} → ${row.agaza_to_date_m ?? ''}${row.num_days != null ? ` (${Math.round(row.num_days)} يوم)` : ''}`,
              stage,
              ret,
              currentTo: row.current_to_user_name,
              currentToUserId: row.current_to_user_id,
              publisher: row.publisher,
              createdAt: legacyBusinessIsoDate(row.agaza_date) ?? null,
            },
            user,
            hr,
          ),
        );
      }
    }

    if (this.permissions && (!type || type === 'permission')) {
      for (const { row, stage, ret } of await this.permissions.openRows()) {
        items.push(
          this.chainItem(
            'permission',
            {
              id: row.id,
              empId: row.emp_id_fk,
              employeeName: row.emp_name,
              summary: `${row.no3_ezn === 2 ? 'استئذان للعمل' : 'استئذان شخصي'}: ${row.ezn_date_ar ?? row.ezn_date ?? ''} ${row.from_hour ?? ''}–${row.to_hour ?? ''}`,
              stage,
              ret,
              currentTo: row.current_to_user_name,
              currentToUserId: row.current_to_user_id,
              publisher: row.publisher,
              createdAt: row.date_ar ?? row.date ?? null,
            },
            user,
            hr,
          ),
        );
      }
    }

    if (this.overtime && (!type || type === 'overtime')) {
      for (const row of await this.overtime.openRows()) {
        const mapped = this.overtime.map(row, user.sub, { isHr: hr });
        items.push({
          key: `overtime:${row.id}`,
          kind: 'overtime',
          kindLabel: mapped.kindLabel,
          id: row.id,
          empId: row.emp_id_fk,
          employeeName: row.emp_name,
          branchId: row.branch_id_fk,
          branchName: null,
          summary: `${mapped.kindLabel}: ${row.request_date}${row.kind === 'shift' ? '' : ` (${row.hours} ساعة)`} — ${mapped.sourceLabel}`,
          stage: row.status === 'returned' ? row.returned_stage ?? null : row.stage,
          stageLabel: stageLabel(row.status === 'returned' ? row.returned_stage : row.stage),
          flowStatus: mapped.flowStatus,
          flowStatusLabel: mapped.flowStatusLabel,
          currentTo: row.current_to_user_name,
          currentToUserId: row.current_to_user_id,
          returned: mapped.returned,
          returnComment: mapped.returnComment,
          createdAt: mapped.createdAt ?? null,
          routedToMe: row.current_to_user_id === user.sub,
          override: mapped.canAction && row.current_to_user_id !== user.sub,
          canAction: mapped.canAction,
        });
      }
    }

    // Branch of each employee (leave / permission rows carry the employee id only).
    const empIds = [...new Set(items.map((i) => i.empId).filter((v): v is number => v != null))];
    const emps = empIds.length
      ? await this.prisma.employees.findMany({ where: { id: { in: empIds } }, select: { id: true, employee: true, branch_id_fk: true } })
      : [];
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const branchIds = new Set<number>();
    for (const item of items) {
      const emp = item.empId != null ? empMap.get(item.empId) : undefined;
      if (item.branchId == null) item.branchId = emp?.branch_id_fk ?? null;
      if (!item.employeeName) item.employeeName = emp?.employee ?? null;
      if (item.branchId != null) branchIds.add(item.branchId);
    }
    const branches = branchIds.size
      ? await this.prisma.tbl_branches.findMany({ where: { branch_id: { in: [...branchIds] } }, select: { branch_id: true, branch_name: true } })
      : [];
    const branchName = new Map(branches.map((b) => [b.branch_id, b.branch_name]));
    for (const item of items) item.branchName = item.branchId != null ? branchName.get(item.branchId) ?? null : null;
    return items;
  }

  async inbox(q: InboxQueryDto, user: JwtUser) {
    const hr = await this.isHr(user);
    const everyone = hr && q.scope !== 'mine';
    const all = await this.collect(q, user, hr);
    // Non-HR: what waits for me, and what was returned to me for changes.
    const visible = everyone ? all : all.filter((i) => i.routedToMe);

    const counts = {
      total: visible.length,
      byType: { leave: 0, permission: 0, overtime: 0 } as Record<FlowKind, number>,
      byStage: { manager: 0, hr: 0, dept: 0, gm: 0, returned: 0 } as Record<string, number>,
    };
    for (const item of visible) {
      counts.byType[item.kind] += 1;
      const stageKey = Object.entries(STAGE_FILTER).find(([, status]) => status === item.flowStatus)?.[0];
      if (stageKey) counts.byStage[stageKey] += 1;
    }

    let filtered = visible;
    if (q.branchId != null) filtered = filtered.filter((i) => i.branchId === q.branchId);
    if (q.stage && q.stage !== 'all') filtered = filtered.filter((i) => i.flowStatus === STAGE_FILTER[q.stage!]);
    const s = q.search?.trim();
    if (s) filtered = filtered.filter((i) => `${i.employeeName ?? ''} ${i.summary} ${i.currentTo ?? ''}`.includes(s));
    filtered.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || b.id - a.id);

    const page = paginated(filtered.slice(q.skip, q.skip + q.take), filtered.length, q.page, q.pageSize);
    return { ...page, isHr: hr, scope: everyone ? 'all' : 'mine', counts };
  }

  // ---- unified request card ----------------------------------------------------------------

  private need<T>(svc: T | undefined): T {
    if (!svc) throw new BadRequestException('الخدمة غير متاحة');
    return svc;
  }

  async detail(kind: FlowKind, id: number, user: JwtUser) {
    if (kind === 'leave') return this.need(this.leaves).flow(id, user);
    if (kind === 'permission') return this.need(this.permissions).flow(id, user);
    if (kind === 'overtime') {
      const o = await this.need(this.overtime).findOne(id, user);
      return {
        kind: 'overtime' as const,
        id: o.id,
        employeeName: o.employeeName,
        branchId: o.branchId,
        title: o.kindLabel,
        createdAt: o.createdAt,
        stage: o.status === 'returned' ? o.returnedStage : o.stage,
        currentTo: o.currentTo,
        flowStatus: o.flowStatus,
        flowStatusLabel: o.flowStatusLabel,
        returned: o.returned,
        returnComment: o.returnComment,
        returnedStage: o.returnedStage,
        canResubmit: o.canResubmit,
        canAction: o.canAction,
        canReturn: o.canReturn,
        canPartial: false,
        override: o.canAction && o.currentToUserId !== user.sub,
        fields: [
          { key: 'kind', label: 'النوع', value: o.kindLabel },
          { key: 'source', label: 'المصدر', value: o.publisherName ? `${o.sourceLabel} — ${o.publisherName}` : o.sourceLabel },
          { key: 'date', label: 'التاريخ', value: o.date },
          ...(o.kind === 'shift' ? [] : [{ key: 'hours', label: 'الساعات المطلوبة', value: String(o.hours) }]),
          { key: 'reason', label: 'السبب', value: o.reason },
          ...(o.resultMessage ? [{ key: 'result', label: 'نتيجة التسجيل (البصمة)', value: o.resultMessage }] : []),
        ],
        editable: { date: o.date, kind: o.kind, hours: o.hours, shiftId: o.shiftId, reason: o.reason, empId: o.empId },
        timeline: o.timeline,
      };
    }
    throw new BadRequestException('نوع طلب غير معروف');
  }

  async action(kind: FlowKind, id: number, dto: FlowActionDto, user: JwtUser) {
    const comment = dto.comment?.trim() || undefined;
    if (kind === 'leave') {
      return this.need(this.leaves).action(
        id,
        { action: dto.action, reason: comment, comment, startDate: dto.startDate, endDate: dto.endDate },
        user.sub,
        user.name ?? undefined,
        user,
      );
    }
    if (kind === 'permission') {
      return this.need(this.permissions).action(id, { action: dto.action, reason: comment, comment }, user.sub, user.name ?? undefined, user);
    }
    if (kind === 'overtime') return this.need(this.overtime).action(id, { action: dto.action, reason: comment }, user);
    throw new ForbiddenException('نوع طلب غير معروف');
  }

  async resubmit(kind: FlowKind, id: number, dto: FlowResubmitDto, user: JwtUser) {
    if (kind === 'leave') {
      return this.need(this.leaves).resubmit(
        id,
        { startDate: dto.startDate, endDate: dto.endDate, returnToWorkDate: dto.returnToWorkDate, reason: dto.reason, comment: dto.comment },
        user,
      );
    }
    if (kind === 'permission') {
      return this.need(this.permissions).resubmit(
        id,
        {
          no3Ezn: dto.no3Ezn,
          eznDate: dto.eznDate,
          fromHour: dto.fromHour,
          toHour: dto.toHour,
          reason: dto.reason,
          fatraFk: dto.fatraFk,
          comment: dto.comment,
        },
        user,
      );
    }
    if (kind === 'overtime') {
      return this.need(this.overtime).resubmit(
        id,
        { date: dto.date, kind: dto.kind, hours: dto.hours, shiftId: dto.shiftId, reason: dto.reason, comment: dto.comment },
        user,
      );
    }
    throw new BadRequestException('نوع طلب غير معروف');
  }
}
