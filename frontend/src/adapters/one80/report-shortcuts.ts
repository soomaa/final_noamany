import {
  BarChart3, CalendarClock, Coins, CreditCard, DollarSign, Dumbbell, Landmark,
  LineChart, Lock, LogIn, PiggyBank, Receipt, Repeat, ShieldAlert, UserPlus, Users,
} from 'lucide-react';
import { registerReportShortcutGroups } from '@/ports/report-shortcut-registry';

export function installOne80ReportShortcuts(): void {
  registerReportShortcutGroups([
    {
      group: 'تقارير النادي',
      items: [
        { href: '/club/members', title: 'الأعضاء خلال فترة', description: 'كل التسجيلات الجديدة', icon: UserPlus },
        { href: '/club/subscriptions/reports', title: 'الاشتراكات خلال فترة', description: 'اشتراكات الفترة كاملة', icon: Receipt },
        { href: '/club/subscriptions/reports', title: 'الاشتراكات المنتهية', description: 'كل الاشتراكات المنتهية', icon: ShieldAlert },
        { href: '/club/subscriptions/reports', title: 'الاشتراكات النشطة', description: 'الاشتراكات السارية', icon: CalendarClock },
        { href: '/club/subscriptions/reports', title: 'اشتراكات ستنتهي قريباً', description: 'تنتهي خلال 7 أيام', icon: CalendarClock },
        { href: '/club/packages/settings', title: 'حصص الاشتراكات', description: 'الاشتراكات المرتبطة بحصص', icon: Repeat },
        { href: '/club/subscriptions/reports', title: 'تقارير الاشتراكات', description: 'الاشتراكات والتحصيل والمبيعات والخدمات', icon: Users },
        { href: '/club/members/attendance', title: 'الحضور والانصراف', description: 'سجلات دخول وخروج الأعضاء', icon: LogIn },
        { href: '/club/fitness/trainers', title: 'المدربين', description: 'قائمة المدربين والتخصصات', icon: Dumbbell },
        { href: '/club/lockers', title: 'اللوكر خلال فترة', description: 'حجوزات اللوكرات', icon: Lock },
      ],
    },
    {
      group: 'التقارير المالية',
      items: [
        { href: '/finance/revenue-reports', title: 'الإيرادات', description: 'إيرادات الفترة حسب المصدر', icon: DollarSign },
        { href: '/finance/expense-reports', title: 'المصروفات', description: 'مصروفات الفترة حسب التصنيف', icon: Coins },
        { href: '/finance/profit-loss', title: 'الأرباح والخسائر', description: 'صافي الربح خلال الفترة', icon: BarChart3 },
        { href: '/accounting/cash-flow', title: 'التدفقات النقدية', description: 'حركة النقد شهرياً', icon: LineChart },
        { href: '/club/unified-treasury', title: 'الخزينة', description: 'الرصيد النقدي المتاح', icon: Landmark },
        { href: '/club/subscriptions/reports', title: 'طرق الدفع', description: 'كاش · فيزا · تحويل', icon: CreditCard },
        { href: '/club/subscriptions/outstanding', title: 'سداد المتبقي', description: 'اشتراكات لها مبلغ متبقٍ', icon: PiggyBank },
      ],
    },
  ]);
}
