import { MemberCell } from '@/components/club/member-cell';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clubEventsApi } from '@/lib/api/club-events';
import { EVENTS_ROUTES } from '@/lib/events-routes';
import { uiStatic, uiOptions } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

const REGISTRANT_BADGE: Record<string, string> = {
  member: 'bg-blue-100 text-blue-700',
  guest: 'bg-purple-100 text-purple-700',
  lead: 'bg-orange-100 text-orange-700',
};

const STATUS_BADGE: Record<string, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  waitlisted: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-slate-100 text-slate-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: uiStatic('بانتظار الدفع'),
  confirmed: uiStatic('مؤكد'),
  waitlisted: uiStatic('قائمة الانتظار'),
  cancelled: uiStatic('ملغى'),
  refunded: uiStatic('مسترد'),
};

const STATUS_OPTIONS = uiOptions([
  { value: 'all', label: 'كل الحالات' },
  { value: 'pending_payment', label: 'بانتظار الدفع' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'waitlisted', label: 'قائمة الانتظار' },
  { value: 'cancelled', label: 'ملغى' },
  { value: 'refunded', label: 'مسترد' },
]);

interface RegistrationRow {
  id: number;
  registrationNumber: string;
  eventId: number;
  registrantType: string;
  status: string;
  price: number;
  paidAmount: number;
  memberId: number | null;
  memberName?: string | null;
  memberCode?: string | null;
  guestName: string | null;
}

export function EventsRegistrationsPage() {
  const { ui, dir } = useLocale();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['club-event-registrations', 'all', status, page],
    queryFn: () => clubEventsApi.listRegistrations({ status, page, pageSize: 20 }),
  });

  const registrations: RegistrationRow[] = data?.data ?? [];
  const total: number = data?.total ?? 0;

  return (
    <div className="p-6 space-y-4" dir={dir}>
      <PageHeader title={ui('التسجيل والمشاركون')} />

      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('جاري التحميل...')}</div>
      ) : isError ? (
        <div className="text-sm text-red-500 py-8 text-center">{ui('حدث خطأ أثناء تحميل البيانات')}</div>
      ) : registrations.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('لا توجد تسجيلات')}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('رقم التسجيل')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الاسم')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('نوع المشارك')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الحالة')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('المدفوع / السعر')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الفعالية')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {registrations.map(reg => (
                <tr key={reg.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{reg.registrationNumber}</td>
                  <td className="px-4 py-3 font-medium">
                    <MemberCell
                      name={reg.memberName}
                      code={reg.memberCode}
                      memberId={reg.memberId}
                      fallback={reg.guestName}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' +
                        (REGISTRANT_BADGE[reg.registrantType] ?? 'bg-gray-100 text-gray-700')
                      }
                    >
                      {reg.registrantType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' +
                        (STATUS_BADGE[reg.status] ?? 'bg-gray-100 text-gray-700')
                      }
                    >
                      {STATUS_LABELS[reg.status] ?? reg.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {reg.paidAmount} / {reg.price}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={EVENTS_ROUTES.detail(reg.eventId)} className="text-primary hover:underline text-sm">
                      {ui('عرض الفعالية')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
          >
            {ui('السابق')}
          </button>
          <span className="text-sm text-muted-foreground">{ui('صفحة')} {page}</span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
          >
            {ui('التالي')}
          </button>
        </div>
      )}
    </div>
  );
}
