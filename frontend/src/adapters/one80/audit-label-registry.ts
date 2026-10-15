import { registerAuditLabelRegistry } from '@/ports/audit-label-registry';

export function installOne80AuditLabels(): void {
  registerAuditLabelRegistry({
    entityLabels: {
      club_member: 'عضو النادي',
      club_attendance: 'حضور عضو',
      club_subscription: 'اشتراك عضو',
      club_subscription_waiver: 'إعفاء من مديونية اشتراك',
      club_event: 'فعالية',
      club_event_session: 'موعد فعالية',
      club_event_registration: 'تسجيل في فعالية',
      club_event_checkin: 'حضور فعالية',
      club_event_display_settings: 'إعدادات شاشة الفعالية',
      club_event_program_segment: 'فقرة في برنامج الفعالية',
    },
    referenceLabels: {
      club_member: 'رقم العضو',
      club_attendance: 'رقم تسجيل الحضور',
      club_subscription: 'رقم الاشتراك',
      club_subscription_waiver: 'رقم الإعفاء',
      club_event: 'رقم الفعالية',
      club_event_session: 'رقم موعد الفعالية',
      club_event_registration: 'رقم تسجيل المشارك',
      club_event_checkin: 'رقم حضور الفعالية',
    },
    actionLabels: {
      check_in: 'تسجيل دخول',
      'check_in.override': 'تسجيل دخول استثنائي',
      check_out: 'تسجيل خروج',
      block: 'حظر عضو',
      unblock: 'إلغاء حظر عضو',
      renew: 'تجديد اشتراك',
      freeze: 'تجميد اشتراك',
      unfreeze: 'إلغاء تجميد اشتراك',
      payment: 'تسجيل دفعة',
      refund: 'استرداد مبلغ',
      member_transfer: 'نقل عضو',
      member_entitlement_transfer: 'نقل رصيد وحقوق عضو',
      plan_transfer: 'نقل الاشتراك إلى باقة أخرى',
      register: 'تسجيل مشارك',
      cancel: 'إلغاء',
      promote_from_waitlist: 'نقل من قائمة الانتظار',
      duplicate: 'نسخ',
      status_change: 'تغيير الحالة',
    },
  });
}
