import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MaskedPhone } from '@/components/club/masked-phone';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';

type CallRow = {
  id: number;
  leadId: number;
  clientName: string;
  phone: string | null;
  calledAt: string;
  answered: boolean | null;
  notes: string | null;
  nextCallAt: string | null;
  nextFollowUpAt: string | null;
};

export function SalesCallsLogPage() {
  const [search, setSearch] = useState('');
  const [answered, setAnswered] = useState<'all' | 'yes' | 'no'>('all');
  const query = useQuery({
    queryKey: ['sales-calls-log', search, answered],
    queryFn: async () => (await api.get<{ data: CallRow[] }>('/club-sales/calls-log', {
      params: { search: search || undefined, answered: answered === 'all' ? undefined : answered },
    })).data,
  });
  const rows = query.data?.data ?? [];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={uiStatic('سجل المكالمات')}
        description={uiStatic('كل مكالمات فريق المبيعات المسجلة على العملاء المحتملين.')}
        actions={<Button asChild variant="outline"><Link to="/sales-portal">{uiStatic('رجوع لمساحة المبيعات')}</Link></Button>}
      />
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={uiStatic('اسم أو رقم')}
          className="max-w-xs"
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={answered}
          onChange={(event) => setAnswered(event.target.value as 'all' | 'yes' | 'no')}
        >
          <option value="all">{uiStatic('كل المكالمات')}</option>
          <option value="yes">{uiStatic('تم الرد')}</option>
          <option value="no">{uiStatic('لم يتم الرد')}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-start">
            <tr>
              <th className="px-3 py-2 text-start">{uiStatic('العميل')}</th>
              <th className="px-3 py-2 text-start">{uiStatic('الرقم')}</th>
              <th className="px-3 py-2 text-start">{uiStatic('وقت المكالمة')}</th>
              <th className="px-3 py-2 text-start">{uiStatic('الرد')}</th>
              <th className="px-3 py-2 text-start">{uiStatic('ملاحظة')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.clientName}</td>
                <td className="px-3 py-2"><MaskedPhone value={row.phone} leadId={row.leadId} /></td>
                <td className="px-3 py-2 nums whitespace-nowrap">{formatDateTime(row.calledAt)}</td>
                <td className="px-3 py-2">{row.answered == null ? '—' : row.answered ? uiStatic('تم الرد') : uiStatic('لم يتم الرد')}</td>
                <td className="px-3 py-2">{row.notes || '—'}</td>
              </tr>
            ))}
            {!query.isLoading && rows.length === 0 ? (
              <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>{uiStatic('لا توجد مكالمات مسجلة')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
