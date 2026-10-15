import { formatDisplayNumber } from '@/lib/number-display';
import { useState } from "react";
import { useLocale } from "@/store/locale";
import { Button } from "@/components/ui/button";
import { MuscleMap } from "./muscle-map";
import type {
  Exercise,
  Muscle,
  Plan,
} from "@/pages/club/fitness/training/model";

export function MuscleLegend({
  exercise,
  muscles,
}: {
  exercise: Pick<Exercise, "primary" | "secondary">;
  muscles: Muscle[];
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const names = (ids: string[]) =>
    ids
      .map((id) => {
        const muscle = muscles.find((m) => m.id === id);
        return (ar ? muscle?.ar : muscle?.en) ?? id;
      })
      .join(" · ");
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="font-medium">
          {ar ? "عضلات أساسية" : "Primary muscles"}
        </dt>
        <dd className="mt-1 text-muted-foreground">
          {names(exercise.primary) ||
            (ar ? "لم تحدد بعد" : "Not configured yet")}
        </dd>
      </div>
      <div>
        <dt className="font-medium">
          {ar ? "عضلات مساعدة" : "Assisting muscles"}
        </dt>
        <dd className="mt-1 text-muted-foreground">
          {names(exercise.secondary) ||
            (ar ? "لا توجد عضلات مساعدة محددة" : "None specified")}
        </dd>
      </div>
    </dl>
  );
}

export function MemberMuscleOverview({
  plan,
  counts,
  muscles,
}: {
  plan?: Plan;
  counts: Record<string, number>;
  muscles: Muscle[];
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [mode, setMode] = useState<"planned" | "recorded">(
    plan ? "planned" : "recorded",
  );
  const recorded = mode === "recorded" || !plan;
  const exercises = plan?.days.flatMap((day) => day.exercises) ?? [];
  const primary = [...new Set(exercises.flatMap((e) => e.primary))];
  const secondary = [...new Set(exercises.flatMap((e) => e.secondary))].filter(
    (id) => !primary.includes(id),
  );
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">
        {ar ? "خريطة عضلات العميل" : "Member muscle map"}
      </h2>
      {plan && (
        <div
          className="my-4 flex flex-wrap gap-2"
          role="group"
          aria-label={ar ? "بيانات الخريطة" : "Map data"}
        >
          <Button
            permissionAction={null}
            variant={recorded ? "outline" : "brand"}
            aria-pressed={!recorded}
            onClick={() => setMode("planned")}
          >
            {ar ? "البرنامج المخطّط" : "Planned program"}
          </Button>
          <Button
            permissionAction={null}
            variant={recorded ? "brand" : "outline"}
            aria-pressed={recorded}
            onClick={() => setMode("recorded")}
          >
            {ar ? "التدريب المنفّذ" : "Recorded training"}
          </Button>
        </div>
      )}
      <MuscleMap
        muscles={muscles}
        primary={recorded ? [] : primary}
        secondary={recorded ? [] : secondary}
        counts={recorded ? counts : undefined}
      />
      <p className="my-4 text-sm text-muted-foreground">
        {recorded
          ? ar
            ? "شدة اللون تعبر عن المجموعات المكتملة التي تستهدف العضلة كأساسية، ضمن آخر ٢٠٠ حصة."
            : "Color intensity represents completed primary-muscle sets within the latest 200 sessions."
          : ar
            ? "الأحمر للعضلات الأساسية، والأحمر الفاتح للمساعدة، حسب نسخة البرنامج المسندة للعميل."
            : "Red marks primary muscles and lighter red marks assisting muscles in the assigned program snapshot."}
      </p>
      {recorded ? (
        Object.keys(counts).length ? (
          <dl className="space-y-2 text-sm">
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(([id, count]) => (
                <div key={id} className="flex justify-between gap-3">
                  <dt>
                    {(ar
                      ? muscles.find((m) => m.id === id)?.ar
                      : muscles.find((m) => m.id === id)?.en) ?? id}
                  </dt>
                  <dd className="tabular-nums">
                    {formatDisplayNumber(count)} {ar ? "مجموعة" : "sets"}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ar
              ? "لم تُسجّل مجموعات مكتملة بعضلات محددة بعد."
              : "No completed sets with configured muscles recorded yet."}
          </p>
        )
      ) : (
        <MuscleLegend exercise={{ primary, secondary }} muscles={muscles} />
      )}
    </section>
  );
}
