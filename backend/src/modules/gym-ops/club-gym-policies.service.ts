import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ClubGymPolicies {
  allowCheckInWithOutstanding: boolean;
  allowGraceSessions: boolean;
  outstandingGraceDays: number;
  outstandingAlertEnabled: boolean;
  outstandingAlertAfterSubscriptionPercent: number;
  allowRefunds: boolean;
  allowSameGuestMultipleInvitations: boolean;
  requireExpenseApproval: boolean;
  restrictEmployeeFinancialVisibility: boolean;
  printSubscriptionReceipts: boolean;
  printSubscriptionPayments: boolean;
  printQuickServiceReceipts: boolean;
  printInbodyReceipts: boolean;
  printSpaReceipts: boolean;
  printLockerReceipts: boolean;
  printEventReceipts: boolean;
  receiptPaperSize: 'thermal' | 'a4';
  receiptA4Copies: 1 | 2;
  receiptLanguage: 'ar' | 'en';
}

@Injectable()
export class ClubGymPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private defaults(): ClubGymPolicies {
    return {
      allowCheckInWithOutstanding: true,
      allowGraceSessions: false,
      outstandingGraceDays: 7,
      outstandingAlertEnabled: true,
      outstandingAlertAfterSubscriptionPercent: 50,
      allowRefunds: true,
      allowSameGuestMultipleInvitations: false,
      requireExpenseApproval: true,
      restrictEmployeeFinancialVisibility: false,
      printSubscriptionReceipts: false,
      printSubscriptionPayments: false,
      printQuickServiceReceipts: false,
      printInbodyReceipts: false,
      printSpaReceipts: false,
      printLockerReceipts: false,
      printEventReceipts: false,
      receiptPaperSize: 'thermal',
      receiptA4Copies: 2,
      receiptLanguage: 'ar',
    };
  }

  private map(row: {
    allow_checkin_with_outstanding: boolean;
    allow_grace_sessions: boolean;
    outstanding_grace_days?: number;
    outstanding_alert_enabled: boolean;
    outstanding_alert_after_subscription_pct: number;
    allow_refunds: boolean;
    allow_same_guest_multiple_invitations: boolean;
    require_expense_approval: boolean;
    restrict_employee_financial_visibility?: boolean;
    print_subscription_receipts: boolean;
    print_subscription_payments: boolean;
    print_quick_service_receipts: boolean;
    print_inbody_receipts: boolean;
    print_spa_receipts: boolean;
    print_locker_receipts: boolean;
    print_event_receipts: boolean;
    receipt_paper_size: string;
    receipt_a4_copies: number;
    receipt_language: string;
  }): ClubGymPolicies {
    return {
      allowCheckInWithOutstanding: row.allow_checkin_with_outstanding,
      allowGraceSessions: row.allow_grace_sessions,
      outstandingGraceDays: row.outstanding_grace_days ?? 7,
      outstandingAlertEnabled: row.outstanding_alert_enabled,
      outstandingAlertAfterSubscriptionPercent: row.outstanding_alert_after_subscription_pct,
      allowRefunds: row.allow_refunds,
      allowSameGuestMultipleInvitations: row.allow_same_guest_multiple_invitations,
      requireExpenseApproval: row.require_expense_approval,
      restrictEmployeeFinancialVisibility: row.restrict_employee_financial_visibility ?? false,
      printSubscriptionReceipts: row.print_subscription_receipts,
      printSubscriptionPayments: row.print_subscription_payments,
      printQuickServiceReceipts: row.print_quick_service_receipts,
      printInbodyReceipts: row.print_inbody_receipts,
      printSpaReceipts: row.print_spa_receipts,
      printLockerReceipts: row.print_locker_receipts,
      printEventReceipts: row.print_event_receipts,
      receiptPaperSize: row.receipt_paper_size === 'a4' ? 'a4' : 'thermal',
      receiptA4Copies: row.receipt_a4_copies === 1 ? 1 : 2,
      receiptLanguage: row.receipt_language === 'en' ? 'en' : 'ar',
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
          allow_grace_sessions: d.allowGraceSessions,
          outstanding_grace_days: d.outstandingGraceDays,
          outstanding_alert_enabled: d.outstandingAlertEnabled,
          outstanding_alert_after_subscription_pct: d.outstandingAlertAfterSubscriptionPercent,
          allow_refunds: d.allowRefunds,
          allow_same_guest_multiple_invitations: d.allowSameGuestMultipleInvitations,
          require_expense_approval: d.requireExpenseApproval,
          restrict_employee_financial_visibility: d.restrictEmployeeFinancialVisibility,
          print_subscription_receipts: d.printSubscriptionReceipts,
          print_subscription_payments: d.printSubscriptionPayments,
          print_quick_service_receipts: d.printQuickServiceReceipts,
          print_inbody_receipts: d.printInbodyReceipts,
          print_spa_receipts: d.printSpaReceipts,
          print_locker_receipts: d.printLockerReceipts,
          print_event_receipts: d.printEventReceipts,
          receipt_paper_size: d.receiptPaperSize,
          receipt_a4_copies: d.receiptA4Copies,
          receipt_language: d.receiptLanguage,
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
    const days = body.outstandingGraceDays;
    if (days !== undefined && (!Number.isInteger(days) || days < 0 || days > 365)) {
      throw new BadRequestException('مهلة سداد المتبقي يجب أن تكون عدد أيام صحيحًا من 0 إلى 365');
    }
    await this.get();
    const pct = body.outstandingAlertAfterSubscriptionPercent;
    const row = await this.prisma.club_gym_policies.update({
      where: { id: 1 },
      data: {
        ...(days !== undefined ? { outstanding_grace_days: days } : {}),
        ...(body.allowCheckInWithOutstanding !== undefined
          ? { allow_checkin_with_outstanding: Boolean(body.allowCheckInWithOutstanding) }
          : {}),
        ...(body.allowGraceSessions !== undefined
          ? { allow_grace_sessions: Boolean(body.allowGraceSessions) }
          : {}),
        ...(body.outstandingAlertEnabled !== undefined
          ? { outstanding_alert_enabled: Boolean(body.outstandingAlertEnabled) }
          : {}),
        ...(body.allowRefunds !== undefined ? { allow_refunds: Boolean(body.allowRefunds) } : {}),
        ...(body.allowSameGuestMultipleInvitations !== undefined
          ? { allow_same_guest_multiple_invitations: Boolean(body.allowSameGuestMultipleInvitations) }
          : {}),
        ...(body.requireExpenseApproval !== undefined ? { require_expense_approval: Boolean(body.requireExpenseApproval) } : {}),
        ...(body.restrictEmployeeFinancialVisibility !== undefined ? { restrict_employee_financial_visibility: body.restrictEmployeeFinancialVisibility } : {}),
        ...(body.printSubscriptionReceipts !== undefined ? { print_subscription_receipts: Boolean(body.printSubscriptionReceipts) } : {}),
        ...(body.printSubscriptionPayments !== undefined ? { print_subscription_payments: Boolean(body.printSubscriptionPayments) } : {}),
        ...(body.printQuickServiceReceipts !== undefined ? { print_quick_service_receipts: Boolean(body.printQuickServiceReceipts) } : {}),
        ...(body.printInbodyReceipts !== undefined ? { print_inbody_receipts: Boolean(body.printInbodyReceipts) } : {}),
        ...(body.printSpaReceipts !== undefined ? { print_spa_receipts: Boolean(body.printSpaReceipts) } : {}),
        ...(body.printLockerReceipts !== undefined ? { print_locker_receipts: Boolean(body.printLockerReceipts) } : {}),
        ...(body.printEventReceipts !== undefined ? { print_event_receipts: Boolean(body.printEventReceipts) } : {}),
        ...(body.receiptPaperSize !== undefined ? { receipt_paper_size: body.receiptPaperSize === 'a4' ? 'a4' : 'thermal' } : {}),
        ...(body.receiptA4Copies !== undefined ? { receipt_a4_copies: body.receiptA4Copies === 1 ? 1 : 2 } : {}),
        ...(body.receiptLanguage !== undefined ? { receipt_language: body.receiptLanguage === 'en' ? 'en' : 'ar' } : {}),
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
