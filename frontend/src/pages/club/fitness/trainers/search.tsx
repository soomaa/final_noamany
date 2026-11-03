import { Search } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { ClubStatCard } from '@/components/club/stat-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api } from '@/lib/api';
import { formatMoneyNumber } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerDetails, ClubTrainerRow } from '@/types/fitness';
import { cairoToday } from './trainer-shared';

const STATUS_LABEL: Record<string, string> = { scheduled: 'مجدولة', ongoing: 'جارية', completed: 'منفذة', cancelled: 'ملغاة' };

export function FitnessTrainerSearchPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data } = usePaginatedList<ClubTrainerRow>('club-trainers', params);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const today = cairoToday();
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(today);

  const { data: details } = useQuery({
    queryKey: ['club-trainers', selectedId, 'details', dateFrom, dateTo],
    queryFn: async () => {
      const { data: d } = await api.get<ClubTrainerDetails>(`/club-trainers/${selectedId}/details`, { params: { dateFrom, dateTo } });
      return d;
    },
    enabled: selectedId != null && Boolean(dateFrom && dateTo) && dateFrom <= dateTo,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={ft('trainerSearch.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
          <Label>اسم المدرب أو التخصص أو الهاتف</Label>
          <Input
            placeholder={ft('common.search')}
            value={params.search}
            onChange={(e) => setParams({ search: e.target.value, page: 1 })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>من</Label><Input type="date" className="nums" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="grid gap-1"><Label>إلى</Label><Input type="date" className="nums" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {(data?.data ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-start transition-colors hover:bg-muted/50 ${selectedId === t.id ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-muted-foreground">{t.specialization ?? (t.employeeId ? 'موظف' : 'كابتن خارجي')}</span>
              </button>
            ))}
            {(data?.data ?? []).length === 0 && (
              <p className="text-center text-sm text-muted-foreground">{ft('common.noData')}</p>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
          {!details ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <Search className="mb-2 size-8 opacity-50" />
              <p>{ft('trainerSearch.details')}</p>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-semibold">{details.trainer.name}</h3>
              <p className="text-sm text-muted-foreground">{details.trainer.specialization ?? '—'}</p>
              <h4 className="font-medium">{ft('trainerSearch.stats')} <span className="text-sm font-normal text-muted-foreground nums">({toArabicDigits(dateFrom)} — {toArabicDigits(dateTo)})</span></h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <ClubStatCard label="الحصص (بدون الملغاة)" value={details.statistics.totalClasses} />
                <ClubStatCard label="الحضور الفعلي" value={details.statistics.totalAttended} />
                <ClubStatCard label="المسجلون في الحصص" value={details.statistics.totalEnrollments} />
                <ClubStatCard label="أعضاء حضروا (حصص + برايفت)" value={details.statistics.uniqueMembers} />
                <ClubStatCard label="إيراد الحصص (الحاضرون)" value={details.statistics.totalClassRevenue} />
                <ClubStatCard label="جلسات برايفت" value={details.statistics.privateSessions} />
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p>المستحق في الفترة: <b className="nums">{formatMoneyNumber(details.statistics.earned)} ج.م</b></p>
                <p className="text-xs text-muted-foreground">
                  عمولة الحصص <span className="nums">{formatMoneyNumber(details.statistics.totalClassCommission)}</span>
                  {' — '}عمولة البرايفت <span className="nums">{formatMoneyNumber(details.statistics.privateCommission)}</span>
                </p>
                {details.activeSalary && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    النسب الحالية: حصص <span className="nums">{toArabicDigits(details.activeSalary.classCommissionPercentage)}٪</span>، برايفت <span className="nums">{toArabicDigits(details.activeSalary.subscriptionCommissionPercentage)}٪</span>
                  </p>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-start">{ft('classes.className')}</th>
                      <th className="p-2 text-start">{ft('common.date')}</th>
                      <th className="p-2 text-start">الحالة</th>
                      <th className="p-2 text-start">المسجلون</th>
                      <th className="p-2 text-start">الحاضرون</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.classes.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="p-2">{c.className}</td>
                        <td className="p-2 nums">{toArabicDigits(c.classDate)}</td>
                        <td className="p-2">{STATUS_LABEL[c.status] ?? c.status}</td>
                        <td className="p-2 nums">{toArabicDigits(c.enrollmentCount)}</td>
                        <td className="p-2 nums">{toArabicDigits(c.attendedCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
