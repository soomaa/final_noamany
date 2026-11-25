import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Ticket } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { CLUB_ROUTES } from '@/lib/club-routes';

/** Copies an invitation code (to send it to the employee, or for the employee to share it). */
export function CopyCodeButton({ code, className = '' }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (event: React.MouseEvent) => {
    // Inside a link or a table row: copying must not open anything.
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`تم نسخ الكود ${code}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('تعذر نسخ الكود');
    }
  };
  return (
    <button
      type="button"
      onClick={(event) => void copy(event)}
      title="نسخ الكود"
      aria-label={`نسخ الكود ${code}`}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
    </button>
  );
}

interface MineSummary {
  code: string | null;
  isActive: boolean;
  quota: number;
  usedThisMonth: number;
  remaining: number;
  totalGuests: number;
  convertedGuests: number;
}

/**
 * The signed-in employee's invitation code on their home page (client, 25 Nov): the code, what is
 * left of this month's allowance, and the visits that came through it. Hidden for an account with
 * no employee or no code; the full list is on «كود الدعوات الخاص بي».
 */
export function MyInvitationCodeCard() {
  const { data } = useQuery({
    queryKey: ['club-staff-invitations', 'me'],
    queryFn: async () => (await api.get<{ linked?: boolean; summary: MineSummary | null }>('/club-staff-invitations/me')).data,
    staleTime: 60_000,
    retry: false,
  });
  const summary = data?.summary;
  if (!summary?.code) return null;
  const stats = [
    { label: 'المتبقي من الشهر', value: `${summary.remaining} / ${summary.quota}` },
    { label: 'زيارات الشهر ده', value: summary.usedThisMonth },
    { label: 'كل الزيارات', value: summary.totalGuests },
    { label: 'اشتركوا', value: summary.convertedGuests },
  ];
  return (
    <Link
      to={CLUB_ROUTES.sales.myInvitationCode}
      className="group flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/[0.05] p-5 transition-all hover:border-primary/45 hover:shadow-md sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Ticket className="size-6" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">كود الدعوات بتاعك {summary.isActive ? '' : '· موقوف'}</p>
          <p className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-wider" dir="ltr">{summary.code}</span>
            <CopyCodeButton code={summary.code} />
          </p>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className="nums text-lg font-bold" dir="ltr">{stat.value}</p>
          </div>
        ))}
      </div>
      <ArrowLeft className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 sm:block" />
    </Link>
  );
}
