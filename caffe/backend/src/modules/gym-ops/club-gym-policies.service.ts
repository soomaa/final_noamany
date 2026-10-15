import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ClubGymPolicies {
  allowCheckInWithOutstanding: boolean;
  outstandingAlertEnabled: boolean;
  outstandingAlertAfterSubscriptionPercent: number;
  allowRefunds: boolean;
}

@Injectable()
export class ClubGymPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private defaults(): ClubGymPolicies {
    return {
      allowCheckInWithOutstanding: true,
      outstandingAlertEnabled: true,
      outstandingAlertAfterSubscriptionPercent: 50,
      allowRefunds: true,
    };
  }

  private map(row: {
    allow_checkin_with_outstanding: boolean;
    outstanding_alert_enabled: boolean;
    outstanding_alert_after_subscription_pct: number;
    allow_refunds: boolean;
  }): ClubGymPolicies {
    return {
      allowCheckInWithOutstanding: row.allow_checkin_with_outstanding,
      outstandingAlertEnabled: row.outstanding_alert_enabled,
      outstandingAlertAfterSubscriptionPercent: row.outstanding_alert_after_subscription_pct,
      allowRefunds: row.allow_refunds,
    };
  }

  async get(): Promise<ClubGymPolicies> {
    let row = await this.prisma.club_gym_policies.findUnique({ where: { id: 1 } });
    if (!row) {
      const d = this.defaults();
      row = await this.prisma.club_gym_policies.create({
        data: {
          id: 1,
          allow_checkin_with_outstanding: d.allowCheckInWithOutstanding,
          outstanding_alert_enabled: d.outstandingAlertEnabled,
          outstanding_alert_after_subscription_pct: d.outstandingAlertAfterSubscriptionPercent,
          allow_refunds: d.allowRefunds,
        },
      });
    }
    return this.map(row);
  }

  async assertRefundsAllowed() {
    const policies = await this.get();
    if (!policies.allowRefunds) {
      throw new BadRequestException('الاسترداد غير مفعّل — فعّله من سياسات الجيم');
    }
    return policies;
  }

  async update(
    body: Partial<ClubGymPolicies> & { updatedBy?: number },
  ): Promise<ClubGymPolicies> {
    await this.get();
    const pct = body.outstandingAlertAfterSubscriptionPercent;
    const row = await this.prisma.club_gym_policies.update({
      where: { id: 1 },
      data: {
        ...(body.allowCheckInWithOutstanding !== undefined
          ? { allow_checkin_with_outstanding: Boolean(body.allowCheckInWithOutstanding) }
          : {}),
        ...(body.outstandingAlertEnabled !== undefined
          ? { outstanding_alert_enabled: Boolean(body.outstandingAlertEnabled) }
          : {}),
        ...(body.allowRefunds !== undefined ? { allow_refunds: Boolean(body.allowRefunds) } : {}),
        ...(pct !== undefined
          ? {
              outstanding_alert_after_subscription_pct: Math.min(
                100,
                Math.max(0, Math.round(Number(pct) || 0)),
              ),
            }
          : {}),
        ...(body.updatedBy != null ? { updated_by: body.updatedBy } : {}),
      },
    });
    return this.map(row);
  }
}
