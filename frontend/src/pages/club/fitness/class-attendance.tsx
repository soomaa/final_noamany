import { PageHeader } from '@/components/common/page-header';
import { BarcodeAttendanceReportPanel } from './barcode-attendance-report';

/** Class attendance report: scanner check-ins and session-package check-ins from reception. */
export function FitnessClassAttendanceReportPanel() {
  return <BarcodeAttendanceReportPanel kind="class" />;
}

export function FitnessClassAttendancePage() {
  return <div className="space-y-6"><PageHeader title="تقرير حضور الحصص" description="حضور الحصص المسجل، مع فلترة حسب التاريخ والفرع." /><FitnessClassAttendanceReportPanel /></div>;
}
