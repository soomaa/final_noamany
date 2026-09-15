import { Injectable } from '@nestjs/common';
import { Prisma, StaffTaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { AutomationEngineService } from './automation-engine.service';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationEngineService,
  ) {}

  async listWorkflows() {
    const rows = await this.prisma.automation_workflows.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { runs: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      triggerType: r.trigger_type,
      triggerConfig: r.trigger_config,
      isActive: r.is_active,
      branchId: r.branch_id,
      runsCount: r._count.runs,
      updatedAt: r.updated_at,
    }));
  }

  async toggleWorkflow(id: number, isActive: boolean) {
    return this.prisma.automation_workflows.update({
      where: { id },
      data: { is_active: isActive },
    });
  }

  async listRuns(workflowId?: number, page = 1, pageSize = 25) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.automation_runsWhereInput = workflowId ? { workflow_id: workflowId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.automation_runs.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
        include: { workflow: { select: { key: true, name_ar: true } } },
      }),
      this.prisma.automation_runs.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        workflowKey: r.workflow.key,
        workflowName: r.workflow.name_ar,
        triggerType: r.trigger_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        status: r.status,
        detail: r.detail,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  async listTasks(query: {
    status?: StaffTaskStatus;
    memberId?: number;
    branchId?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(100, query.pageSize ?? 25);
    const skip = (page - 1) * pageSize;
    const and: Prisma.staff_tasksWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.memberId) and.push({ member_id: query.memberId });
    if (query.branchId) and.push({ branch_id: query.branchId });
    const where = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.staff_tasks.findMany({
        where,
        orderBy: [{ status: 'asc' }, { due_date: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.staff_tasks.count({ where }),
    ]);

    return paginated(
      rows.map((t) => ({
        id: t.id,
        taskType: t.task_type,
        title: t.title,
        description: t.description,
        memberId: t.member_id,
        subscriptionId: t.subscription_id,
        assignedTo: t.assigned_to,
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        branchId: t.branch_id,
        createdAt: t.created_at,
        closedAt: t.closed_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  async updateTaskStatus(id: number, status: StaffTaskStatus, userId?: number) {
    return this.prisma.staff_tasks.update({
      where: { id },
      data: {
        status,
        closed_at: status === 'completed' || status === 'cancelled' ? new Date() : null,
        assigned_to: userId ?? undefined,
      },
    });
  }

  async runScheduled() {
    return this.engine.processScheduledTriggers();
  }
}
