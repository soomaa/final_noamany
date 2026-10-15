import { Search } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { ClubStatCard } from '@/components/club/stat-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerDetails, ClubTrainerRow } from '@/types/fitness';

export function FitnessTrainerSearchPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data } = usePaginatedList<ClubTrainerRow>('club-trainers', params);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: details } = useQuery({
    queryKey: ['club-trainers', selectedId, 'details'],
    queryFn: async () => {
      const { data: d } = await api.get<ClubTrainerDetails>(`/club-trainers/${selectedId}/details`);
      return d;
    },
    enabled: selectedId != null,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={ft('trainerSearch.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
          <Label>{ft('common.search')}</Label>
          <Input
            placeholder={ft('common.search')}
            value={params.search}
            onChange={(e) => setParams({ search: e.target.value, page: 1 })}
          />
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {(data?.data ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-start transition-colors hover:bg-muted/50 ${selectedId === t.id ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-muted-foreground nums">{toArabicDigits(t.ratingAvg)} ★</span>
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
              <h4 className="font-medium">{ft('trainerSearch.stats')}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <ClubStatCard label={ft('classes.statsTotal')} value={details.statistics.totalClasses} />
                <ClubStatCard label={ft('common.enrolled')} value={details.statistics.totalEnrollments} />
                <ClubStatCard label={ft('common.member')} value={details.statistics.uniqueMembers} />
                <ClubStatCard label={ft('common.price')} value={details.statistics.totalClassRevenue} />
              </div>
              {details.activeSalary && (
                <div className="rounded-lg border p-3 text-sm">
                  <p>{ft('trainerPayments.baseSalary')}: <span className="nums">{toArabicDigits(details.activeSalary.baseSalary)}</span></p>
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-start">{ft('classes.className')}</th>
                      <th className="p-2 text-start">{ft('common.date')}</th>
                      <th className="p-2 text-start">{ft('common.enrolled')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.classes.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="p-2">{c.className}</td>
                        <td className="p-2 nums">{toArabicDigits(c.classDate)}</td>
                        <td className="p-2 nums">{toArabicDigits(c.enrollmentCount)}</td>
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
