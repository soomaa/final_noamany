import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AutomationTriggerType, Prisma, StaffTaskPriority, StaffTaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { MessagingProviderService } from './messaging-provider.service';
import { automationKey, markHandled, wasHandled } from '../../common/automation/cron-dedup.util';

export interface AutomationEventPayload {
  memberId?: number;
  subscriptionId?: number;
  branchId?: number;
  memberName?: string;
  subscriptionNumber?: string;
  daysOffset?: number;
  metadata?: Record<string, unknown>;
}

type WorkflowAction = {
  type: 'create_task' | 'close_task' | 'send_notification' | 'send_sms' | 'send_email' | 'log_only';
  taskType?: string;
  title?: string;
  titleAr?: string;
  priority?: StaffTaskPriority;
  dueDays?: number;
  assignToRole?: string;
  notificationTitle?: string;
  notificationBody?: string;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
};

const DEFAULT_WORKFLOWS: Array<{
  key: string;
  name_ar: string;
  name_en: string;
  trigger_type: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  actions: WorkflowAction[];
}> = [
  {
    key: 'expiring_soon_sms',
    name_ar: 'رسالة SMS قبل انتهاء الاشتراك',
    name_en: 'SMS reminder before subscription expiry',
    trigger_type: 'subscription_expiring_soon',
    actions: [
      {
        type: 'send_sms',
        smsBody: 'عزيزي {memberName}، اشتراكك {subscriptionNumber} ينتهي قريباً. تواصل معنا للتجديد.',
      },
    ],
  },
  {
    key: 'expiring_soon_reminder',
    name_ar: 'تذكير قبل انتهاء الاشتراك',
    name_en: 'Expiring soon reminder task',
    trigger_type: 'subscription_expiring_soon',
    actions: [
      {
        type: 'create_task',
        taskType: 'renewal_reminder',
        titleAr: 'تذكير تجديد — {memberName}',
        priority: 'medium',
        dueDays: 3,
      },
    ],
  },
  {
    key: 'expired_notify_task',
    name_ar: 'مهمة متابعة عند انتهاء الاشتراك',
    name_en: 'Follow-up task on subscription expiry',
    trigger_type: 'subscription_expired',
    actions: [
      {
        type: 'create_task',
        taskType: 'renewal_followup',
        titleAr: 'متابعة تجديد — {memberName}',
        priority: 'high',
        dueDays: 2,
      },
    ],
  },
  {
    key: 'expired_2d_sales_task',
    name_ar: 'مهمة مبيعات بعد يومين من الانتهاء',
    name_en: 'Sales task 2 days after expiry',
    trigger_type: 'subscription_expired',
    trigger_config: { daysSinceExpiry: 2 },
    actions: [
      {
        type: 'create_task',
        taskType: 'sales_followup',
        titleAr: 'عرض تجديد — {memberName}',
        priority: 'medium',
        dueDays: 1,
      },
    ],
  },
  {
    key: 'renewal_close_tasks',
    name_ar: 'إغلاق مهام التجديد عند التجديد',
    name_en: 'Close renewal tasks on renew',
    trigger_type: 'subscription_renewed',
    actions: [{ type: 'close_task', taskType: 'renewal_followup' }, { type: 'close_task', taskType: 'sales_followup' }],
  },
  {
    key: 'outstanding_balance_task',
    name_ar: 'مهمة تحصيل رصيد مستحق',
    name_en: 'Outstanding balance collection task',
    trigger_type: 'payment_outstanding',
    actions: [
      {
        type: 'create_task',
        taskType: 'payment_collection',
        titleAr: 'تحصيل مستحقات — {memberName}',
        priority: 'high',
        dueDays: 3,
      },
    ],
  },
  {
    key: 'checkin_welcome',
    name_ar: 'تسجيل دخول ناجح',
    name_en: 'Successful check-in log',
    trigger_type: 'member_checked_in',
    actions: [{ type: 'log_only' }],
  },
];

@Injectable()
export class AutomationEngineService implements OnModuleInit {
  private readonly log = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingProviderService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultWorkflows();
  }

  async seedDefaultWorkflows() {
    for (const wf of DEFAULT_WORKFLOWS) {
      const exists = await this.prisma.automation_workflows.findUnique({ where: { key: wf.key } });
      if (exists) continue;
      await this.prisma.automation_workflows.create({
        data: {
          key: wf.key,
          name_ar: wf.name_ar,
          name_en: wf.name_en,
          trigger_type: wf.trigger_type,
          trigger_config: (wf.trigger_config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          conditions: (wf.conditions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          actions: wf.actions as unknown as Prisma.InputJsonValue,
          is_active: true,
        },
      });
      this.log.log(`Seeded workflow: ${wf.key}`);
    }
  }

  private interpolate(template: string, payload: AutomationEventPayload): string {
    return template
      .replace(/\{memberName\}/g, payload.memberName ?? '—')
      .replace(/\{subscriptionNumber\}/g, payload.subscriptionNumber ?? '—');
  }

  private async runAction(
    action: WorkflowAction,
    payload: AutomationEventPayload,
    runId: number,
  ): Promise<void> {
    switch (action.type) {
      case 'create_task': {
        const existing = await this.prisma.staff_tasks.findFirst({
          where: {
            member_id: payload.memberId ?? undefined,
            task_type: action.taskType ?? 'general',
            status: { in: ['open', 'in_progress'] },
          },
        });
        if (existing) return;

        const dueDate = action.dueDays
          ? addDays(localDateString(), action.dueDays)
          : null;

        await this.prisma.staff_tasks.create({
          data: {
            task_type: action.taskType ?? 'general',
            title: this.interpolate(action.titleAr ?? action.title ?? 'مهمة', payload),
            description: payload.subscriptionNumber
              ? `اشتراك: ${payload.subscriptionNumber}`
              : null,
            member_id: payload.memberId ?? null,
            subscription_id: payload.subscriptionId ?? null,
            branch_id: payload.branchId ?? null,
            priority: action.priority ?? StaffTaskPriority.medium,
            status: StaffTaskStatus.open,
            due_date: dueDate,
            workflow_run_id: runId,
          },
        });
        break;
      }
      case 'close_task': {
        await this.prisma.staff_tasks.updateMany({
          where: {
            member_id: payload.memberId ?? undefined,
            task_type: action.taskType ?? 'renewal_followup',
            status: { in: ['open', 'in_progress'] },
          },
          data: {
            status: StaffTaskStatus.completed,
            closed_at: new Date(),
            closed_reason: 'automation:subscription_renewed',
          },
        });
        break;
      }
      case 'send_notification': {
        if (payload.memberId) {
          await this.prisma.tbl_notifications.create({
            data: {
              to_user: null,
              from_user: null,
              date_ar: localDateString(),
              time_ar: new Date().toTimeString().slice(0, 5),
              seen: 0,
            },
          });
        }
        this.log.log(
          `[automation notify stub] ${action.notificationTitle ?? 'تنبيه'} — ${payload.memberName}`,
        );
        break;
      }
      case 'send_sms':
      case 'send_email': {
        const phone = payload.metadata?.phone as string | undefined;
        const email = payload.metadata?.email as string | undefined;
        const body = this.interpolate(
          action.smsBody ?? action.emailBody ?? action.notificationBody ?? '',
          payload,
        );
        if (action.type === 'send_sms' && phone) {
          const dedupKey = automationKey(
            'sms',
            payload.subscriptionId ?? payload.memberId ?? 0,
            localDateString(),
          );
          if (wasHandled(dedupKey)) {
            this.log.debug(`SMS dedup skip ${dedupKey}`);
            break;
          }
          await this.messaging.send({
            channel: 'sms',
            to: phone,
            body,
            memberId: payload.memberId,
          });
          markHandled(dedupKey);
        } else if (action.type === 'send_email' && email) {
          await this.messaging.send({
            channel: 'email',
            to: email,
            subject: this.interpolate(action.emailSubject ?? 'تنبيه من النادي', payload),
            body,
            memberId: payload.memberId,
          });
        } else {
          this.log.log(`[automation ${action.type}] skipped — no contact for member ${payload.memberId ?? '—'}`);
        }
        break;
      }
      case 'log_only':
        this.log.debug(`Automation log: ${JSON.stringify(payload)}`);
        break;
      default:
        break;
    }
  }

  async emit(trigger: AutomationTriggerType, payload: AutomationEventPayload): Promise<number> {
    const workflows = await this.prisma.automation_workflows.findMany({
      where: { trigger_type: trigger, is_active: true },
    });

    let ran = 0;
    for (const wf of workflows) {
      const config = (wf.trigger_config as Record<string, unknown> | null) ?? {};
      if (config.daysSinceExpiry != null && payload.daysOffset !== config.daysSinceExpiry) {
        continue;
      }
      if (wf.branch_id != null && payload.branchId != null && wf.branch_id !== payload.branchId) {
        continue;
      }

      const run = await this.prisma.automation_runs.create({
        data: {
          workflow_id: wf.id,
          trigger_type: trigger,
          entity_type: payload.subscriptionId ? 'club_subscription' : payload.memberId ? 'club_member' : null,
          entity_id: payload.subscriptionId
            ? String(payload.subscriptionId)
            : payload.memberId
              ? String(payload.memberId)
              : null,
          status: 'running',
        },
      });

      try {
        const actions = wf.actions as unknown as WorkflowAction[];
        for (const action of actions) {
          await this.runAction(action, payload, run.id);
        }
        await this.prisma.automation_runs.update({
          where: { id: run.id },
          data: { status: 'success', detail: { actions: actions.length } },
        });
        ran += 1;
      } catch (e) {
        await this.prisma.automation_runs.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            error_message: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }
    return ran;
  }

  /** Cron: expiring soon, expired follow-ups, outstanding balances. */
  async processScheduledTriggers(): Promise<{ expired: number; expiring: number; outstanding: number }> {
    const today = localDateString();
    let expired = 0;
    let expiring = 0;
    let outstanding = 0;

    // deriveSubStatus keeps the end date itself an active day, so the first expired day is the
    // one AFTER the end date — select end date == yesterday, not today (fired a day early).
    const expiredToday = await this.prisma.club_subscriptions.findMany({
      where: { subscription_end_date: addDays(today, -1) },
      include: { member: { select: { id: true, name: true, phone: true, email: true } } },
    });
    for (const sub of expiredToday) {
      if (!sub.member_id) continue;
      await this.emit('subscription_expired', {
        memberId: sub.member_id,
        subscriptionId: sub.id,
        branchId: sub.branch_id,
        memberName: sub.member?.name ?? sub.customer_name ?? '—',
        subscriptionNumber: sub.subscription_number,
        daysOffset: 0,
        metadata: { phone: sub.member?.phone, email: sub.member?.email },
      });
      expired += 1;
    }

    const twoDaysAgo = addDays(today, -2);
    const expired2d = await this.prisma.club_subscriptions.findMany({
      where: {
        subscription_end_date: twoDaysAgo,
        status: 'expired',
      },
      include: { member: { select: { id: true, name: true, phone: true, email: true } } },
    });
    for (const sub of expired2d) {
      if (!sub.member_id) continue;
      const renewed = await this.prisma.club_subscriptions.findFirst({
        where: {
          member_id: sub.member_id,
          registration_date: { gt: sub.subscription_end_date },
        },
      });
      if (renewed) continue;

      await this.emit('subscription_expired', {
        memberId: sub.member_id,
        subscriptionId: sub.id,
        branchId: sub.branch_id,
        memberName: sub.member?.name ?? '—',
        subscriptionNumber: sub.subscription_number,
        daysOffset: 2,
        metadata: { phone: sub.member?.phone, email: sub.member?.email },
      });
    }

    const in7 = addDays(today, 7);
    const expiringSoon = await this.prisma.club_subscriptions.findMany({
      where: {
        subscription_end_date: { gte: today, lte: in7 },
      },
      include: { member: { select: { id: true, name: true, phone: true, email: true } } },
    });
    for (const sub of expiringSoon) {
      // Skip legacy open-ended session packages (2099); new ones expire by calendar like memberships.
      if (sub.is_linked_to_sessions && sub.subscription_end_date >= '2099-01-01') continue;
      if (deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date) !== 'active') continue;
      if (!sub.member_id) continue;
      await this.emit('subscription_expiring_soon', {
        memberId: sub.member_id,
        subscriptionId: sub.id,
        branchId: sub.branch_id,
        memberName: sub.member?.name ?? '—',
        subscriptionNumber: sub.subscription_number,
        metadata: { phone: sub.member?.phone, email: sub.member?.email },
      });
      expiring += 1;
    }

    const withBalance = await this.prisma.club_subscriptions.findMany({
      where: {
        remaining_amount: { gt: 0 },
        status: { in: ['active', 'upcoming'] },
      },
      include: { member: { select: { id: true, name: true } } },
    });
    for (const sub of withBalance) {
      if (!sub.member_id || toNum(sub.remaining_amount) <= 0) continue;
      const dedupKey = automationKey('payment_outstanding', sub.id, localDateString());
      if (wasHandled(dedupKey)) continue;
      await this.emit('payment_outstanding', {
        memberId: sub.member_id,
        subscriptionId: sub.id,
        branchId: sub.branch_id,
        memberName: sub.member?.name ?? '—',
        subscriptionNumber: sub.subscription_number,
        metadata: { remaining: toNum(sub.remaining_amount) },
      });
      markHandled(dedupKey);
      outstanding += 1;
    }

    return { expired, expiring, outstanding };
  }
}
