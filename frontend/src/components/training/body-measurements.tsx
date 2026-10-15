import { formatDisplayNumber } from "@/lib/number-display";
import { ReportActions } from "@/pages/club/fitness/training/history";
import {
  measurementReportHtml,
  openTrainingReport,
} from "@/pages/club/fitness/training/history-report";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/store/locale";
import { useTrainingAccess } from "@/pages/club/fitness/training/access";
import { api, apiError } from "@/lib/api";
import { localToday } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BodyShapeComparison } from "./body-shape";
import {
  bodyFields,
  hasBodyShape,
  shapeKeys,
  normalizeBodyNumber,
  type BodyJourney,
  type BodyKey,
  type BodyMeasurements,
} from "./body-model";

export function BodyMeasurementsPanel({
  body,
  memberId,
  memberName = "",
  onReload,
  endpoint,
  canCreate,
  canUpdate,
  canPrint = true,
}: {
  body?: BodyJourney;
  memberId: number;
  memberName?: string;
  onReload: () => Promise<BodyJourney | undefined>;
  endpoint?: string;
  canCreate?: boolean;
  canUpdate?: boolean;
  canPrint?: boolean;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const tr = (a: string, e: string) => (ar ? a : e);
  const { can, base, trainerPortal } = useTrainingAccess();
  const latest = body?.checkins[0];
  const [mode, setMode] = useState<"checkin" | "target" | null>(null);
  const [draft, setDraft] = useState<Partial<Record<BodyKey, string>>>({});
  const [recordId, setRecordId] = useState("");
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState(localToday());
  const [note, setNote] = useState("");
  const saving = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (mode)
      document
        .getElementById(`body-editor-${memberId}`)
        ?.scrollIntoView({ block: "start" });
  }, [mode, memberId]);
  const lastValidPreview = useRef<BodyMeasurements>(latest?.measurements ?? {});
  function open(next: "checkin" | "target", fresh = body) {
    setMode(next);
    setError(null);
    setConflict(false);
    lastValidPreview.current = fresh?.checkins[0]?.measurements ?? {};
    const values =
      next === "target"
        ? fresh?.target?.measurements
        : fresh?.checkins[0]?.measurements;
    setDraft(
      Object.fromEntries(
        Object.entries(values ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    );
    setDate(
      next === "target" ? (fresh?.target?.target_date ?? "") : localToday(),
    );
    setNote(next === "target" ? (fresh?.target?.note ?? "") : "");
    setRecordId(crypto.randomUUID());
    setRevision(fresh?.target?.revision ?? 0);
  }
  const values: BodyMeasurements = {};
  for (const field of bodyFields) {
    const raw = draft[field.key];
    if (raw?.trim()) {
      const n = Number(normalizeBodyNumber(raw));
      if (Number.isFinite(n) && n >= field.min && n <= field.max)
        values[field.key] = n;
    }
  }
  const complete = shapeKeys.filter((key) => values[key] !== undefined).length;
  if (mode === "checkin" && hasBodyShape(values))
    lastValidPreview.current = values;
  const previewCurrent =
    mode === "target"
      ? (latest?.measurements ?? {})
      : hasBodyShape(values)
        ? values
        : lastValidPreview.current;
  const usingPrevious =
    mode === "checkin" &&
    !hasBodyShape(values) &&
    hasBodyShape(lastValidPreview.current);
  async function save() {
    if (!mode) return;
    setError(null);
    setConflict(false);
    for (const field of bodyFields.filter(
      (f) => mode !== "target" || f.key !== "height",
    )) {
      if (draft[field.key]?.trim() && values[field.key] === undefined) {
        setError(
          tr(
            `راجع ${field.ar}: من ${field.min} إلى ${field.max} ${field.unit}`,
            `Check ${field.en}: ${field.min}–${field.max} ${field.unit}`,
          ),
        );
        return;
      }
    }
    if (!Object.keys(values).length) {
      setError(
        tr("أدخل مقاسًا واحدًا على الأقل.", "Enter at least one measurement."),
      );
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      if (mode === "checkin")
        await api.post(
          `${endpoint ?? `${base}/members/${memberId}`}/body/checkins`,
          {
            id: recordId,
            date,
            measurements: values,
            note,
          },
        );
      else
        await api.put(
          `${endpoint ?? `${base}/members/${memberId}`}/body/target`,
          {
            revision,
            targetDate: date || null,
            measurements: values,
            note,
          },
        );
      // A successful write stays successful even if refreshing the journey fails.
      setMode(null);
      await onReload();
    } catch (e) {
      setError(apiError(e));
      setConflict(
        (e as { response?: { status?: number } }).response?.status === 409,
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {tr("المقاسات والهدف", "Measurements & target")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr(
              "الوزن بالكيلوجرام، وكل الأطوال والمحيطات بالسنتيمتر. كرر نفس طريقة القياس.",
              "Weight in kg; height and circumferences in cm. Repeat the same measurement method.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {latest && (
            <ReportActions
              showPrint={canPrint}
              label={tr("آخر مقاسات", "Latest measurements")}
              ar={ar}
              onPreview={() =>
                openTrainingReport(
                  measurementReportHtml(
                    latest,
                    body?.target,
                    locale,
                    memberName,
                  ),
                  locale,
                )
              }
              onPrint={() =>
                openTrainingReport(
                  measurementReportHtml(
                    latest,
                    body?.target,
                    locale,
                    memberName,
                  ),
                  locale,
                  true,
                )
              }
            />
          )}
          {(canCreate ?? can("club.fitness.assessments:create")) && (
            <Button
              permissionAction={null}
              disabled={mode !== null}
              onClick={() => open("checkin")}
            >
              {tr("تسجيل مقاسات", "Record measurements")}
            </Button>
          )}
          {(canUpdate ?? can("club.fitness.assessments:update")) && (
            <Button
              permissionAction={null}
              variant="outline"
              disabled={mode !== null}
              onClick={() => open("target")}
            >
              {tr(
                body?.target ? "تعديل الهدف" : "تحديد الهدف",
                body?.target ? "Edit target" : "Set target",
              )}
            </Button>
          )}
        </div>
      </div>
      {mode !== null && (
        <div className="mt-6 border-t pt-6" id={`body-editor-${memberId}`}>
          <div className="mb-5">
            <h3 className="text-lg font-semibold">
              {tr(
                mode === "target"
                  ? "حدد مقاسات الهدف"
                  : "أدخل المقاسات الحالية",
                mode === "target"
                  ? "Set target measurements"
                  : "Enter current measurements",
              )}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {tr(
                mode === "target"
                  ? "غيّر المقاسات المطلوبة وشاهد الهدف مباشرة. الطول ثابت، ولا يتم الحفظ حتى تضغط حفظ."
                  : "الموديل يتغير أثناء إدخال المقاسات الصحيحة. التغييرات معاينة فقط حتى تضغط حفظ.",
                mode === "target"
                  ? "Change your chosen measurements and see the target live. Height stays fixed; nothing is saved until you press Save."
                  : "Valid measurements update the model as you type. Changes remain a preview until you press Save.",
              )}
            </p>
          </div>
          <div className="grid h-[85dvh] grid-rows-[auto_minmax(0,1fr)] items-start gap-4 md:h-auto md:grid-rows-none md:gap-6 md:grid-cols-[minmax(260px,.95fr)_minmax(0,1.05fr)]">
            <form
              className="order-2 h-full min-w-0 overflow-y-auto space-y-5 pb-3 md:order-1 md:h-auto md:overflow-visible"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                {bodyFields
                  .filter((f) => mode !== "target" || f.key !== "height")
                  .map((f) => {
                    const invalid =
                      !!draft[f.key]?.trim() && values[f.key] === undefined;
                    return (
                      <label
                        key={f.key}
                        className="min-w-0 space-y-2 text-sm"
                        htmlFor={`body-${memberId}-${f.key}`}
                      >
                        <span className="block font-medium">
                          {ar ? f.ar : f.en}{" "}
                          <span className="text-muted-foreground">
                            ({f.unit})
                          </span>
                        </span>
                        <Input
                          id={`body-${memberId}-${f.key}`}
                          inputMode="decimal"
                          dir="ltr"
                          disabled={busy}
                          aria-invalid={invalid}
                          aria-describedby={`body-${memberId}-${f.key}-hint`}
                          value={draft[f.key] ?? ""}
                          onChange={(event) =>
                            setDraft((d) => ({
                              ...d,
                              [f.key]: event.target.value,
                            }))
                          }
                        />
                        <span
                          id={`body-${memberId}-${f.key}-hint`}
                          className={`block text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {invalid
                            ? tr(
                                `أدخل رقمًا من ${formatDisplayNumber(f.min)} إلى ${formatDisplayNumber(f.max)}`,
                                `Enter ${formatDisplayNumber(f.min)}–${formatDisplayNumber(f.max)}`,
                              )
                            : ar
                              ? f.hintAr
                              : f.hintEn}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <label
                className="block space-y-2 text-sm"
                htmlFor={`body-${memberId}-date`}
              >
                <span>
                  {tr(
                    mode === "target" ? "موعد الهدف · اختياري" : "تاريخ القياس",
                    mode === "target"
                      ? "Target date · optional"
                      : "Check-in date",
                  )}
                </span>
                <Input
                  id={`body-${memberId}-date`}
                  type="date"
                  disabled={busy}
                  max={mode === "checkin" ? localToday() : undefined}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label
                className="block space-y-2 text-sm"
                htmlFor={`body-${memberId}-note`}
              >
                <span>
                  {tr("ملاحظة وطريقة القياس", "Note & measurement method")}
                </span>
                <Textarea
                  id={`body-${memberId}-note`}
                  rows={2}
                  maxLength={1000}
                  disabled={busy}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {conflict && (
                <Button
                  type="button"
                  permissionAction={null}
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      open("target", await onReload());
                    } catch (e) {
                      setError(apiError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {tr(
                    "تحميل الهدف الحالي بدل مسودتي",
                    "Load current target instead of my draft",
                  )}
                </Button>
              )}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button
                  type="submit"
                  permissionAction={null}
                  disabled={busy || (mode === "checkin" && !date)}
                >
                  {tr(
                    busy ? "حفظ…" : "حفظ المقاسات",
                    busy ? "Saving…" : "Save measurements",
                  )}
                </Button>
                <Button
                  type="button"
                  permissionAction={null}
                  variant="outline"
                  disabled={busy}
                  onClick={() => setMode(null)}
                >
                  {tr("إلغاء التعديل", "Cancel editing")}
                </Button>
              </div>
            </form>
            <aside
              className="order-1 min-w-0 bg-card py-2 md:sticky md:top-6 md:order-2"
              aria-label={tr(
                "معاينة المقاسات أثناء الإدخال",
                "Live measurement preview",
              )}
            >
              <h4 className="mb-3 font-semibold">
                {tr("معاينة مباشرة · غير محفوظة", "Live preview · unsaved")}
              </h4>
              <BodyShapeComparison
                current={previewCurrent}
                target={mode === "target" ? values : undefined}
                compact
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {tr(
                  mode === "target"
                    ? "الهدف يتبع المقاسات التي تدخلها؛ الباقي يتبع آخر قياس محفوظ."
                    : `اكتملت ${formatDisplayNumber(complete)} من 7 مقاسات لازمة للموديل. الوزن يُحفظ في السجل ولا يحدد توزيع الدهون.`,
                  mode === "target"
                    ? "The target follows your entries; other dimensions follow the last saved check-in."
                    : `${formatDisplayNumber(complete)} of 7 model measurements complete. Weight is recorded and does not determine fat distribution.`,
                )}
              </p>
              {usingPrevious && (
                <p role="status" className="mt-2 text-xs text-muted-foreground">
                  {tr(
                    "المعاينة تحتفظ بآخر مقاسات صحيحة حتى تكمل الخانات الناقصة أو تصحح الرقم.",
                    "Preview keeps the last valid measurements until missing or invalid values are completed.",
                  )}
                </p>
              )}
            </aside>
          </div>
        </div>
      )}
      {mode === null &&
        (latest ? (
          <>
            <p className="my-5 text-sm">
              {tr("آخر قياس", "Latest check-in")} · {latest.date}
              {body?.target?.target_date &&
                ` · ${tr("موعد الهدف", "Target date")} ${body.target.target_date}`}
            </p>
            <BodyShapeComparison
              current={latest.measurements}
              target={body?.target?.measurements}
            />
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-start text-sm">
                <caption className="sr-only">
                  {tr(
                    "مقارنة القياسات والهدف",
                    "Measurement and target comparison",
                  )}
                </caption>
                <thead>
                  <tr className="border-b">
                    {[
                      tr("المقاس", "Measurement"),
                      tr("البداية", "Baseline"),
                      tr("الحالي", "Current"),
                      tr("الهدف", "Target"),
                      tr("الفرق للهدف", "Target difference"),
                    ].map((s) => (
                      <th
                        key={s}
                        scope="col"
                        className="p-3 text-start font-medium"
                      >
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyFields.map((f) => {
                    const actual = latest.measurements[f.key],
                      target = body?.target?.measurements[f.key],
                      diff =
                        actual !== undefined && target !== undefined
                          ? target - actual
                          : undefined;
                    return (
                      <tr key={f.key} className="border-b last:border-0">
                        <th scope="row" className="p-3 text-start font-medium">
                          {ar ? f.ar : f.en}{" "}
                          <span className="text-muted-foreground">
                            ({f.unit})
                          </span>
                        </th>
                        <td className="p-3 tabular-nums">
                          {body?.baseline?.measurements[f.key] ?? "—"}
                        </td>
                        <td className="p-3 tabular-nums">{actual ?? "—"}</td>
                        <td className="p-3 tabular-nums">{target ?? "—"}</td>
                        <td className="p-3 tabular-nums" dir="ltr">
                          {diff === undefined
                            ? "—"
                            : `${diff > 0 ? "+" : ""}${formatDisplayNumber(Math.round(diff * 10) / 10)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {latest.note && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {latest.note}
              </p>
            )}
          </>
        ) : (
          <p className="my-6 text-muted-foreground">
            {tr(
              "سجّل أول قياسات للعميل لبدء المقارنة. لا نستنتج مقاسات من الوزن أو صور التقدم.",
              "Record the first member measurements to start comparing. Measurements are not inferred from weight or progress photos.",
            )}
          </p>
        ))}
      {mode === null && body?.target?.note && (
        <p className="mt-4 whitespace-pre-wrap text-sm">
          <strong>{tr("ملاحظة الهدف", "Target note")}: </strong>
          {body.target.note}
        </p>
      )}
      {mode === null && !!body?.checkins.length && (
        <section className="mt-6 border-t pt-5">
          <h3 className="font-semibold">
            {tr("سجل المقاسات", "Measurement history")} ·{" "}
            {formatDisplayNumber(body.checkins.length)}
          </h3>
          <ol className="mt-3 divide-y">
            {body.checkins.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-3">
                <details className="min-w-0 flex-1">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                    {row.date} ·{" "}
                    {formatDisplayNumber(
                      bodyFields.filter(
                        (f) => row.measurements[f.key] !== undefined,
                      ).length,
                    )}{" "}
                    {tr("مقاسات", "measurements")}
                  </summary>
                  <dl className="grid grid-cols-2 gap-3 py-3 text-sm">
                    {bodyFields
                      .filter((f) => row.measurements[f.key] !== undefined)
                      .map((f) => (
                        <div key={f.key}>
                          <dt className="text-muted-foreground">
                            {ar ? f.ar : f.en}
                          </dt>
                          <dd className="font-medium tabular-nums">
                            {formatDisplayNumber(row.measurements[f.key])}{" "}
                            {f.unit}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {row.note && (
                    <p className="whitespace-pre-wrap text-sm">{row.note}</p>
                  )}
                </details>
                <ReportActions
                  showPrint={canPrint}
                  label={row.date}
                  ar={ar}
                  onPreview={() =>
                    openTrainingReport(
                      measurementReportHtml(
                        row,
                        body.target,
                        locale,
                        memberName,
                      ),
                      locale,
                    )
                  }
                  onPrint={() =>
                    openTrainingReport(
                      measurementReportHtml(
                        row,
                        body.target,
                        locale,
                        memberName,
                      ),
                      locale,
                      true,
                    )
                  }
                />
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            {tr(
              "آخر ١٠٠ قياس، مع الاحتفاظ بأول قياس كنقطة بداية.",
              "Latest 100 check-ins; the first check-in remains the baseline.",
            )}
          </p>
        </section>
      )}
    </section>
  );
}
