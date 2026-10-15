import { Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { starRows } from '@/pages/club/fitness/trainers/trainer-workspace-model';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { TrainerWorkspaceRating } from '@/types/fitness';

export type TrainerRatingDistribution = Record<'1' | '2' | '3' | '4' | '5', number>;

/**
 * Bucket a raw ratings list (the `GET /club-trainers/:id/ratings` shape) into 1–5 counts.
 * `GET :id/workspace` already returns `ratingDistribution`; callers that only have the
 * ratings array compute it here so both surfaces render the same bars.
 */
export function buildRatingDistribution(ratings: TrainerWorkspaceRating[]): TrainerRatingDistribution {
  const distribution: TrainerRatingDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const row of ratings) {
    const value = Math.max(1, Math.min(5, Math.round(Number(row.rating) || 0)));
    distribution[String(value) as keyof TrainerRatingDistribution] += 1;
  }
  return distribution;
}

/** Mean of a ratings list, rounded to one decimal (matches the server's `ratingAvg`). */
export function averageRating(ratings: TrainerWorkspaceRating[]): number {
  if (!ratings.length) return 0;
  const sum = ratings.reduce((total, row) => total + (Number(row.rating) || 0), 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

/** Five glyphs filled up to `value` — members rate with stars, so admins read stars too. */
export function RatingStars({
  value,
  size = 'sm',
  className,
}: {
  value: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { ui } = useLocale();
  const safe = Math.max(0, Math.min(5, Number(value) || 0));
  const filled = Math.round(safe);
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      title={`${toArabicDigits(safe)} ${ui('من 5')}`}
      aria-label={`${ui('التقييم')}: ${toArabicDigits(safe)} ${ui('من 5')}`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden
          className={cn(
            size === 'md' ? 'size-5' : 'size-3.5',
            star <= filled ? 'fill-primary text-primary' : 'text-muted-foreground/35',
          )}
        />
      ))}
    </span>
  );
}

interface TrainerRatingsPanelProps {
  ratings: TrainerWorkspaceRating[];
  ratingAvg: number;
  ratingCount: number;
  distribution: TrainerRatingDistribution;
  className?: string;
}

/**
 * Star distribution + per-member comments for one trainer.
 *
 * Shared by the club trainer profile ("التقييمات" tab, fed from `:id/workspace`) and the
 * app-management trainers table row action (fed from `:id/ratings`) so the owner reads the
 * same view from either entry point.
 */
export function TrainerRatingsPanel({
  ratings,
  ratingAvg,
  ratingCount,
  distribution,
  className,
}: TrainerRatingsPanelProps) {
  const { ui } = useLocale();
  const rows = starRows(distribution);
  return (
    <div className={cn('grid gap-4 lg:grid-cols-[280px_1fr]', className)}>
      <Card>
        <CardHeader>
          <CardTitle>{ui('ملخص التقييم')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <RatingStars value={ratingAvg} size="md" className="justify-center" />
            <p className="nums mt-2 text-4xl font-bold">{toArabicDigits(ratingAvg)}</p>
            <p className="text-sm text-muted-foreground">
              {ui('من')} {toArabicDigits(ratingCount)} {ui('تقييم')}
            </p>
          </div>
          <div className="mt-5 space-y-2">
            {rows.map((row) => (
              <div key={row.stars} className="flex items-center gap-2 text-sm">
                <span className="nums w-8">{toArabicDigits(row.stars)}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${ratingCount ? (row.count / ratingCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="nums w-6 text-end">{toArabicDigits(row.count)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ui('آراء الأعضاء')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!ratings.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{ui('لم تُسجّل تقييمات بعد.')}</p>
          ) : (
            ratings.map((row) => (
              <article key={row.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* The ratings endpoint may only carry `memberId`; never invent a name for it. */}
                  <span className="font-semibold">
                    {row.memberName || `${ui('عضو')} #${formatDigits(row.memberId ?? '')}`}
                  </span>
                  <RatingStars value={row.rating} />
                </div>
                {row.comment ? <p className="mt-2 text-sm leading-relaxed">{row.comment}</p> : null}
                <p className="nums mt-2 text-xs text-muted-foreground">
                  {toArabicDigits(String(row.createdAt).slice(0, 10))}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
