import { Sparkles, UsersRound } from 'lucide-react';
import { MemberAttendanceLookup } from '@/components/club/member-attendance-lookup';
import { PageHeader } from '@/components/common/page-header';

/** Reception scanner for the member's normal club entry. Shows the member profile before check-in. */
export function MemberBarcodeCheckInPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        امسح باركود بطاقة العضو لتسجيل الدخول تلقائيًا وعرض بياناته واشتراكاته وأيام الوقف. تظل البيانات ظاهرة حتى اسكان العضو التالي.
      </p>
      <MemberAttendanceLookup autoCheckIn />
    </div>
  );
}

/** Reception scanner for SPA visits; shows the member's SPA balance before check-in. */
export function SpaBarcodeCheckInPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="size-5" />
        <h2 className="font-semibold">دخول السبا بالباركود</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        يظهر رصيد السبا تلقائيًا بعد إدخال كود العضو؛ اضغط «تسجيل زيارة السبا» لتأكيد الدخول.
      </p>
      <MemberAttendanceLookup mode="spa" />
    </div>
  );
}

/** Reception scanner for class attendance; shows the member's remaining sessions before check-in. */
export function ClassBarcodeCheckInPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <UsersRound className="size-5" />
        <h2 className="font-semibold">حضور الحصص بالباركود</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        امسح كود العضو لعرض حصصه المتبقية تلقائيًا؛ يحدد النظام الحصة الجارية الآن في الفرع، ثم أكّد الحضور.
      </p>
      <MemberAttendanceLookup mode="class" />
    </div>
  );
}

/** Kept for older direct links; the sidebar now opens the separate barcode tabs. */
export function FitnessBarcodeCheckInPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="تسجيل الحضور بالباركود" description="يُحتسب الدخول من الاشتراك الفعّال للعضو؛ لا يتم إنشاء حجز للسبا أو الحصص." />
      <div className="grid gap-5 lg:grid-cols-2">
        <SpaBarcodeCheckInPanel />
        <ClassBarcodeCheckInPanel />
      </div>
    </div>
  );
}
