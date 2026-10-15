import { useTrainingAccess } from "@/pages/club/fitness/training/access";
import { formatDisplayNumber } from '@/lib/number-display';
import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { useLocale } from "@/store/locale";
import { Button } from "@/components/ui/button";
import type { Photo } from "@/pages/club/fitness/training/model";
export function PhotoComparison({
  photos,
  memberId,
}: {
  photos: Photo[];
  memberId: number;
}) {
  const { locale } = useLocale();
  const { base } = useTrainingAccess();
  const ar = locale === "ar";
  const [angle, setAngle] = useState("front");
  const eligible = photos.filter((p) => p.angle === angle);
  const [before, setBefore] = useState(""),
    [after, setAfter] = useState(""),
    [split, setSplit] = useState(50),
    [urls, setUrls] = useState<string[]>([]),
    [error, setError] = useState("");
  const a = eligible.find((p) => p.id === before) ?? eligible[0],
    b = eligible.find((p) => p.id === after) ?? eligible.at(-1);
  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    setUrls([]);
    setError("");
    if (a && b)
      void Promise.all(
        [a, b].map(async (p) => {
          const r = await api.get(
            `${base}/members/${memberId}/photos/${p.id}/content`,
            { responseType: "blob" },
          );
          const u = URL.createObjectURL(r.data as Blob);
          created.push(u);
          return u;
        }),
      )
        .then((u) => {
          if (alive) setUrls(u);
          else created.forEach(URL.revokeObjectURL);
        })
        .catch((e) => {
          if (alive) setError(apiError(e));
        });
    return () => {
      alive = false;
      created.forEach(URL.revokeObjectURL);
    };
  }, [a?.id, b?.id, memberId, base]);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">
          {ar ? "رحلة التغيير" : "Transformation journey"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ar
            ? "الصور التي سمح العضو بمشاركتها. قارن نفس الزاوية والإضاءة."
            : "Photos the member has shared. Compare matching angles and lighting."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["front", "side", "back"].map((x, i) => (
          <Button
            permissionAction={null}
            key={x}
            size="sm"
            variant={angle === x ? "brand" : "outline"}
            aria-pressed={angle === x}
            onClick={() => {
              setAngle(x);
              setBefore("");
              setAfter("");
            }}
          >
            {ar ? ["أمامي", "جانبي", "خلفي"][i] : x}
          </Button>
        ))}
      </div>
      {!a || !b || eligible.length < 2 ? (
        <p className="rounded-xl bg-muted p-6 text-muted-foreground">
          {ar
            ? "تحتاج صورتين مشتركتين لنفس الزاوية لبدء المقارنة."
            : "Two shared photos of the same angle are needed."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[true, false].map((first) => (
              <label key={String(first)} className="text-sm">
                {first ? (ar ? "قبل" : "Before") : ar ? "بعد" : "After"}
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                  value={first ? a.id : b.id}
                  onChange={(e) =>
                    (first ? setBefore : setAfter)(e.target.value)
                  }
                >
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.date}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {error ? (
            <p role="alert">{error}</p>
          ) : urls.length === 2 ? (
            <div
              className="relative mx-auto aspect-[3/4] max-h-[650px] w-full max-w-lg overflow-hidden rounded-xl bg-muted"
              dir="ltr"
            >
              <img
                src={urls[1]}
                alt={ar ? "الصورة الأحدث" : "Later photo"}
                className="absolute size-full object-contain"
              />
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              >
                <img
                  src={urls[0]}
                  alt={ar ? "الصورة السابقة" : "Earlier photo"}
                  className="size-full object-contain"
                />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-white"
                style={{ left: `${split}%` }}
              />
            </div>
          ) : (
            <div
              role="status"
              className="aspect-[3/4] max-w-lg animate-pulse rounded-xl bg-muted"
            >
              {ar ? "تحميل المقارنة…" : "Loading comparison…"}
            </div>
          )}
          <label className="block text-sm">
            {ar ? "اسحب للمقارنة" : "Slide to compare"}
            <input
              type="range"
              min="0"
              max="100"
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="mt-2 h-11 w-full accent-primary"
            />
          </label>
          <p className="text-sm text-muted-foreground">
            {formatDisplayNumber(Math.abs(
              Math.round((Date.parse(b.date) - Date.parse(a.date)) / 86400000),
            ))}{" "}
            {ar ? "يوم بين الصورتين" : "days between photos"}
          </p>
        </>
      )}
    </section>
  );
}
