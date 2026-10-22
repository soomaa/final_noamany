import { PageHeader } from '@/components/common/page-header';
import { BarcodeAttendanceReportPanel } from './barcode-attendance-report';

/** Daily SPA visit report (scanner and reception service check-ins). */
export function FitnessSpaAttendanceReportPanel() {
  return <BarcodeAttendanceReportPanel kind="spa" />;
}

export function FitnessSpaAttendancePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="تقرير حضور السبا" description="زيارات السبا المسجلة، مع فلاتر التاريخ والفرع والبحث." />
      <FitnessSpaAttendanceReportPanel />
    </div>
  );
}
