import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PrintView } from '@/components/common/print-view';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useLocale } from '@/store/locale';
import type { AdministrativeDecisionRow } from './administrative-decisions';

export function AdministrativeDecisionPrintPage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hr/administrative-decisions', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<AdministrativeDecisionRow>(`/hr/administrative-decisions/${id}`)).data,
  });
  if (isLoading) return <div className="p-8 text-center">{ui('جارٍ التحميل…')}</div>;
  if (isError || !data) return <div className="p-8 text-center text-destructive">{ui('تعذر تحميل القرار الإداري')}</div>;
  return (
    <PrintView title={ui('قرار تعيين مؤقت')} className="mx-auto max-w-4xl space-y-6 bg-background p-6">
      <PageHeader title={ui('قرار تعيين مؤقت')} description={`${ui('رقم القرار')} ${data.id}`} actions={<Button className="no-print" onClick={() => window.print()}><Printer className="size-4" /> {ui('طباعة')}</Button>} />
      <div className="space-y-5 rounded-2xl border p-8 text-base leading-8">
        <p>{ui('تقرر تعيين السيد/السيدة')} <strong>{data.empName}</strong> {ui('بوظيفة')} <strong>{data.jobTitleName}</strong> {ui('في')} <strong>{data.edaraName}</strong>.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PrintField label={ui('الراتب الأساسي')} value={data.salary} /><PrintField label={ui('بدل السكن')} value={data.housingAllowance} />
          <PrintField label={ui('بدل المواصلات')} value={data.transportAllowance} /><PrintField label={ui('بدلات أخرى')} value={data.otherAllowance} />
          <PrintField label={ui('إجمالي الراتب')} value={data.totalSalary} /><PrintField label={ui('تاريخ مباشرة العمل')} value={data.workDate} />
          <PrintField label={ui('بداية الفترة التجريبية')} value={data.periodFrom} /><PrintField label={ui('نهاية الفترة التجريبية')} value={data.periodTo} />
        </div>
        <div className="pt-12 text-end"><div>{ui('اعتماد')}</div><div className="mt-10 border-t pt-2">{data.publisherName ?? '________________'}</div></div>
      </div>
    </PrintView>
  );
}

function PrintField({ label, value }: { label: string; value: string | number | null }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-bold nums">{value ?? '—'}</div></div>;
}
