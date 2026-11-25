import { formatDisplayNumber } from '@/lib/number-display';
import { exerciseLabel } from '@/pages/club/fitness/training/exercise-label';
import { useLocale } from "@/store/locale";
import type { Session } from "@/pages/club/fitness/training/model";
export function ExerciseTrends({ sessions }: { sessions: Session[] }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const grouped = new Map<
    string,
    { name: string; unit: string; points: { date: string; value: number }[] }
  >();
  for (const session of [...sessions].sort((a, b) =>
    a.date.localeCompare(b.date),
  ))
    for (const e of session.entries) {
      if (e.skipped) continue;
      const strength = e.kind === "strength";
      const values = e.sets
        .filter((s) => s.done)
        .map((s) => (strength ? s.weight : s.seconds))
        .filter((v) => v > 0);
      if (!values.length) continue;
      const key = `${e.key}|${e.kind}`,
        trend = grouped.get(key) ?? {
          name: exerciseLabel(e, locale),
          unit: strength ? "kg" : "s",
          points: [],
        };
      trend.points.push({ date: session.date, value: Math.max(...values) });
      grouped.set(key, trend);
    }
  return (
    <div>
      <h2 className="text-xl font-semibold">
        {ar ? "اتجاه القوة والأداء" : "Strength & performance trend"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {ar
          ? "أعلى وزن أو أطول مجموعة مسجلة للتمرين في الحصص المحمّلة."
          : "Peak weight or longest logged set per exercise in loaded sessions."}
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {[...grouped.entries()].map(([key, t]) => {
          const points = t.points.slice(-12),
            first = points[0],
            last = points.at(-1)!,
            max = Math.max(1, ...points.map((p) => p.value));
          return (
            <div key={key}>
              <h3 className="font-medium">{t.name}</h3>
              <div className="my-3 flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {first.date} · {formatDisplayNumber(first.value)} {t.unit}
                </span>
                <strong>
                  {formatDisplayNumber(last.value)} {t.unit} · {last.date}
                </strong>
              </div>
              {points.length > 1 ? (
                <svg
                  viewBox="0 0 300 80"
                  className="h-24 w-full"
                  role="img"
                  aria-label={points
                    .map((p) => `${p.date}: ${formatDisplayNumber(p.value)} ${t.unit}`)
                    .join(", ")}
                >
                  <path d="M 4 76 H 296" stroke="hsl(var(--border))" />
                  <polyline
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    points={points
                      .map(
                        (p, i) =>
                          `${4 + (292 * i) / (points.length - 1)},${76 - (68 * p.value) / max}`,
                      )
                      .join(" ")}
                  />
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={4 + (292 * i) / (points.length - 1)}
                      cy={76 - (68 * p.value) / max}
                      r="3"
                      fill="hsl(var(--primary))"
                    />
                  ))}
                </svg>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? "حصة أخرى هتوضح اتجاه الأداء."
                    : "Another session will reveal the trend."}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!grouped.size && (
        <p className="mt-4 text-muted-foreground">
          {ar
            ? "سجل مجموعات فعلية لظهور تطور الأداء."
            : "Log actual sets to see performance changes."}
        </p>
      )}
    </div>
  );
}
