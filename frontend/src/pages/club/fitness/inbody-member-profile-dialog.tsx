import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import { MemberAvatar } from '@/components/club/member-avatar';
import { StatusBadge } from '@/components/common/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { uploadUrl } from '@/components/employees/use-uploads';
import { api } from '@/lib/api';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberListItem } from '@/types/club';
import type { InbodyMeasurementRow } from '@/types/fitness';
import { INBODY_SETTLEMENT_LABELS } from './shared';

interface InbodyMemberProfileDialogProps {
  memberId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function num(v: number | null | undefined) {
  return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
}

export function InbodyMemberProfileDialog({ memberId, open, onOpenChange }: InbodyMemberProfileDialogProps) {
  const { ui } = useLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbody-member-profile', memberId],
    enabled: open && memberId != null,
    queryFn: async () => {
      const id = memberId!;
      const [{ data: member }, { data: measurements }] = await Promise.all([
        api.get<ClubMemberListItem>(`/club-members/${id}`),
        api.get<{ data: InbodyMeasurementRow[]; total: number }>('/club-inbody-measurements', {
          params: { memberId: id, pageSize: 200 },
        }),
      ]);
      return { member, measurements: measurements.data };
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="form" className="max-h-[90vh] overflow-y-auto p-0" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{ui('بروفايل InBody')}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}

        {isError && (
          <p className="py-8 text-center text-sm text-destructive">{ui('تعذّر تحميل البيانات')}</p>
        )}

        {data && (
          <div className="space-y-6">
            <section className="rounded-xl border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {ui('بيانات العضو')}
              </h3>
              <div className="flex flex-wrap items-start gap-4">
                <MemberAvatar name={data.member.name} profilePicture={data.member.profilePicture} size="lg" />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-lg font-bold">{data.member.name}</p>
                  <p className="font-mono text-muted-foreground nums" dir="ltr">{data.member.memberCode}</p>
                  <div className="grid gap-1 pt-2 sm:grid-cols-2">
                    <p>
                      <span className="text-muted-foreground">{ui('الهاتف')}:</span>{' '}
                      <span className="nums">{data.member.phone ? formatDigits(data.member.phone) : '—'}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ui('نوع العضوية')}:</span>{' '}
                      {data.member.membershipType?.name ?? '—'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ui('الفرع')}:</span>{' '}
                      <span className="nums">{formatDigits(data.member.branchId)}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ui('الحالة')}:</span>{' '}
                      <StatusBadge status={data.member.isActive ? 'active' : 'suspended'} />
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {ui('إجمالي القياسات')}:{' '}
                <span className="nums font-medium text-foreground">{toArabicDigits(data.measurements.length)}</span>
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {ui('سجل القياسات')}
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-start">{ui('التاريخ')}</th>
                      <th className="p-2 text-start">{ui('الوزن')}</th>
                      <th className="p-2 text-start">{ui('الطول')}</th>
                      <th className="p-2 text-start">BMI</th>
                      <th className="p-2 text-start">{ui('نسبة الدهون')}</th>
                      <th className="p-2 text-start">{ui('كتلة العضلات')}</th>
                      <th className="p-2 text-start">{ui('طريقة التسوية')}</th>
                      <th className="p-2 text-start">{ui('التقرير')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.measurements.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-muted-foreground">
                          {ui('لا توجد بيانات')}
                        </td>
                      </tr>
                    )}
                    {data.measurements
                      .slice()
                      .sort((a, b) => b.measurementDate.localeCompare(a.measurementDate))
                      .map((m) => {
                        const href = uploadUrl(m.reportUrl);
                        return (
                          <tr key={m.id} className="border-t">
                            <td className="p-2 nums">{toArabicDigits(m.measurementDate)}</td>
                            <td className="p-2">{num(m.weight)}</td>
                            <td className="p-2">{num(m.heightCm)}</td>
                            <td className="p-2">{num(m.bmi)}</td>
                            <td className="p-2">{num(m.bodyFat)}</td>
                            <td className="p-2">{num(m.muscleMass)}</td>
                            <td className="p-2">
                              <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                                {INBODY_SETTLEMENT_LABELS[m.settlementSource] ?? INBODY_SETTLEMENT_LABELS.legacy}
                              </span>
                            </td>
                            <td className="p-2">
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-brand underline underline-offset-4"
                                >
                                  <FileText className="size-3.5" /> {ui('عرض')}
                                </a>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
