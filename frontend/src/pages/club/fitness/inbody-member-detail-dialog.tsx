import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import { isImageHref } from '@/components/common/image-preview';
import { uploadUrl } from '@/components/employees/use-uploads';
import { StatusBadge } from '@/components/common/status-badge';
import { MemberAvatar } from '@/components/club/member-avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClubT } from '@/hooks/use-club-t';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { ClubInbodyInvoiceRow, InbodyMeasurementRow } from '@/types/fitness';

interface InbodyMemberDetailDialogProps {
  memberId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function num(v: number | null | undefined) {
  return v != null ? toArabicDigits(v) : '—';
}

/** The measurement's report: an image shows a thumbnail that opens the in-app preview; a PDF opens as a file. */
function ReportFile({ url, label, date }: { url: string | null | undefined; label: string; date: string }) {
  const href = uploadUrl(url);
  if (!href) return <span className="text-muted-foreground">—</span>;
  const image = isImageHref(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`${label} · ${toArabicDigits(date)}`}
      className="inline-flex items-center gap-2 rounded-lg border bg-card p-1 pe-2 text-xs font-medium text-primary hover:border-primary/40 hover:bg-primary/5"
    >
      {image
        ? <img src={href} alt="" loading="lazy" className="size-10 rounded-md object-cover" />
        : <span className="grid size-10 place-items-center rounded-md bg-muted"><FileText className="size-5" /></span>}
      {label}
    </a>
  );
}

export function InbodyMemberDetailDialog({ memberId, open, onOpenChange }: InbodyMemberDetailDialogProps) {
  const ft = useFitnessT();
  const ct = useClubT();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbody-member-detail', memberId],
    enabled: open && memberId != null,
    queryFn: async () => {
      const id = memberId!;
      const [{ data: member }, { data: measurements }, { data: invoices }] = await Promise.all([
        api.get<ClubMemberListItem>(`/club-members/${id}`),
        api.get<{ data: InbodyMeasurementRow[]; total: number }>('/club-inbody-measurements', {
          params: { memberId: id, pageSize: 200 },
        }),
        api.get<{ data: ClubInbodyInvoiceRow[]; total: number }>('/club-inbody-invoices', {
          params: { memberId: id, pageSize: 100 },
        }),
      ]);
      // Newest first, like MetaFit's InBody profile.
      const ordered = measurements.data.slice().sort((a, b) => b.measurementDate.localeCompare(a.measurementDate) || b.id - a.id);
      return { member, measurements: ordered, invoices: invoices.data };
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="form" className="max-h-[90vh] overflow-y-auto p-0" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{ft('inbody.viewDetails')}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}

        {isError && (
          <p className="py-8 text-center text-sm text-destructive">{ft('common.noData')}</p>
        )}

        {data && (
          <div className="space-y-6">
            <section className="rounded-xl border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {ft('inbody.memberProfile')}
              </h3>
              <div className="flex flex-wrap items-start gap-4">
                <MemberAvatar
                  name={data.member.name}
                  profilePicture={data.member.profilePicture}
                  size="lg"
                />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-lg font-bold">{data.member.name}</p>
                  <p className="font-mono text-muted-foreground nums" dir="ltr">{data.member.memberCode}</p>
                  <div className="grid gap-1 pt-2 sm:grid-cols-2">
                    <p>
                      <span className="text-muted-foreground">{ft('inbody.phone')}:</span>{' '}
                      <span className="nums">{data.member.phone ? toArabicDigits(data.member.phone) : '—'}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ft('inbody.nationalId')}:</span>{' '}
                      <span className="nums">{data.member.cardNumber ?? '—'}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ct('members.gender')}:</span>{' '}
                      {data.member.gender === 'male' ? ct('common.male') : ct('common.female')}
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ft('inbody.membershipType')}:</span>{' '}
                      {data.member.membershipType?.name ?? '—'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ct('common.branch')}:</span>{' '}
                      <span className="nums">{toArabicDigits(data.member.branchId)}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">{ct('common.status')}:</span>{' '}
                      <StatusBadge status={data.member.isActive ? 'active' : 'suspended'} />
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {ft('inbody.totalMeasurements')}:{' '}
                <span className="nums font-medium text-foreground">{toArabicDigits(data.measurements.length)}</span>
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {ft('inbody.measurementHistory')}
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-start">{ft('common.date')}</th>
                      <th className="p-2 text-start">{ft('progress.weight')}</th>
                      <th className="p-2 text-start">{ft('inbody.height')}</th>
                      <th className="p-2 text-start">{ft('inbody.bmi')}</th>
                      <th className="p-2 text-start">{ft('progress.bodyFat')}</th>
                      <th className="p-2 text-start">{ft('inbody.muscleMass')}</th>
                      <th className="p-2 text-start">{ft('common.notes')}</th>
                      <th className="p-2 text-start">{ft('inbody.fileLabel')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.measurements.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-muted-foreground">
                          {ft('common.noData')}
                        </td>
                      </tr>
                    )}
                    {data.measurements.map((m) => (
                      <tr key={m.id} className="border-t align-middle">
                        <td className="p-2 nums">{toArabicDigits(m.measurementDate)}</td>
                        <td className="p-2 nums">{num(m.weight)}</td>
                        <td className="p-2 nums">{num(m.heightCm)}</td>
                        <td className="p-2 nums">{num(m.bmi)}</td>
                        <td className="p-2 nums">{num(m.bodyFat)}</td>
                        <td className="p-2 nums">{num(m.muscleMass)}</td>
                        <td className="max-w-[140px] truncate p-2">{m.notes ?? '—'}</td>
                        <td className="p-2"><ReportFile url={m.reportUrl} label={ft('inbody.viewFile')} date={m.measurementDate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {ft('inbody.invoiceHistory')}
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-start">{ft('inbodyInvoices.title')}</th>
                      <th className="p-2 text-start">{ft('common.date')}</th>
                      <th className="p-2 text-start">{ft('common.price')}</th>
                      <th className="p-2 text-start">{ft('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          {ft('common.noData')}
                        </td>
                      </tr>
                    )}
                    {data.invoices.map((inv) => (
                      <tr key={inv.id} className="border-t">
                        <td className="p-2 font-mono nums">{inv.invoiceNumber}</td>
                        <td className="p-2 nums">{toArabicDigits(inv.invoiceDate)}</td>
                        <td className="p-2 nums">{num(inv.totalAmount)}</td>
                        <td className="p-2">
                          <StatusBadge
                            status={inv.status === 'paid' ? 'active' : inv.status === 'cancelled' ? 'expired' : 'pending'}
                          />
                        </td>
                      </tr>
                    ))}
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
