import { useEffect, useId, useState } from "react";
import type { Muscle } from "@/pages/club/fitness/training/model";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/store/locale";
interface Shape {
  d: string;
  muscle: string | null;
  detail: boolean;
}
interface Anatomy {
  viewBox: string;
  paths: Shape[];
}
const cache = new Map<string, Anatomy>();
export function MuscleMap({
  primary = [],
  secondary = [],
  counts,
  muscles,
  onSelect,
  compact = false,
  initialSide = "front",
}: {
  primary?: string[];
  secondary?: string[];
  counts?: Record<string, number>;
  muscles: Muscle[];
  onSelect?: (id: string) => void;
  compact?: boolean;
  initialSide?: "front" | "back";
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const filter = useId().replace(/:/g, "");
  const [side, setSide] = useState(initialSide);
  const [data, setData] = useState<Anatomy | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setError(false);
    setData(cache.get(side) ?? null);
    if (!cache.has(side))
      void fetch(`/anatomy/${side}.json`)
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json() as Promise<Anatomy>;
        })
        .then((d) => {
          cache.set(side, d);
          if (alive) setData(d);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    return () => {
      alive = false;
    };
  }, [side]);
  const max = Math.max(1, ...Object.values(counts ?? {}));
  const fill = (id: string | null) =>
    !id
      ? "hsl(var(--muted-foreground) / .3)"
      : counts
        ? counts[id]
          ? `hsl(var(--training-muscle) / ${0.3 + 0.7 * (counts[id] / max)})`
          : "hsl(var(--muted-foreground) / .22)"
        : primary.includes(id)
          ? "hsl(var(--training-muscle))"
          : secondary.includes(id)
            ? "hsl(var(--training-muscle) / .4)"
            : "hsl(var(--muted-foreground) / .22)";
  return (
    <div className="training-anatomy">
      <div className="mb-3 flex justify-center gap-2">
        <Button
          permissionAction={null}
          className="min-h-11"
          size="sm"
          variant={side === "front" ? "brand" : "outline"}
          aria-pressed={side === "front"}
          onClick={() => setSide("front")}
        >
          {ar ? "أمامي" : "Front"}
        </Button>
        <Button
          permissionAction={null}
          className="min-h-11"
          size="sm"
          variant={side === "back" ? "brand" : "outline"}
          aria-pressed={side === "back"}
          onClick={() => setSide("back")}
        >
          {ar ? "خلفي" : "Back"}
        </Button>
      </div>
      <div className={compact ? "h-64" : "h-96"} aria-busy={!data && !error}>
        {error ? (
          <p role="alert">
            {ar
              ? "تعذر عرض الخريطة. استخدم أسماء العضلات أدناه."
              : "Map unavailable. Use the muscle names below."}
          </p>
        ) : data ? (
          <svg
            className="h-full w-full"
            viewBox={data.viewBox}
            role="img"
            aria-label={ar ? "خريطة العضلات المستهدفة" : "Target muscle map"}
          >
            <defs>
              <filter id={filter} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" />
                <feComposite in="SourceGraphic" />
              </filter>
            </defs>
            {data.paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill={p.detail ? "none" : fill(p.muscle)}
                stroke="hsl(var(--foreground) / .35)"
                strokeWidth=".8"
                className="training-muscle-path"
                style={{
                  filter:
                    p.muscle && primary.includes(p.muscle)
                      ? `url(#${filter})`
                      : undefined,
                  cursor: onSelect && p.muscle ? "pointer" : undefined,
                }}
                onClick={() => {
                  if (p.muscle) onSelect?.(p.muscle);
                }}
              />
            ))}
          </svg>
        ) : (
          <div className="h-full animate-pulse rounded-xl bg-muted" />
        )}
      </div>
      {onSelect && (
        <div
          className="mt-4 flex flex-wrap justify-center gap-2"
          aria-label={ar ? "اختيار العضلات" : "Select muscles"}
        >
          {muscles.map((m) => (
            <button
              type="button"
              key={m.id}
              aria-pressed={primary.includes(m.id)}
              onClick={() => onSelect(m.id)}
              className={`min-h-11 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${primary.includes(m.id) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
            >
              {ar ? m.ar : m.en}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {ar
          ? "رسم تشريحي: Ryan Graves · CC BY 4.0"
          : "Anatomy artwork: Ryan Graves · CC BY 4.0"}
      </p>
    </div>
  );
}
