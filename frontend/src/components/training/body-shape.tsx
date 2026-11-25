import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/store/locale";
import { hasBodyShape, type BodyMeasurements } from "./body-model";

export function BodyShapeComparison({ current, target, compact = false }: { current: BodyMeasurements; target?: BodyMeasurements; compact?: boolean }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const iframe = useRef<HTMLIFrameElement>(null);
  const [frame, setFrame] = useState("neutral");
  const [error, setError] = useState(false);
  const send = () => iframe.current?.contentWindow?.postMessage({ type: "swat-body", config: { current, target, frame, locale, dark: document.documentElement.classList.contains("dark") } }, location.origin);
  useEffect(() => {
    send();
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === "swat-body-ready") send();
      if (event.data?.type === "swat-body-error") setError(true);
      if (event.data?.type === "swat-body-loaded") setError(false);
    };
    window.addEventListener("message", receive);
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { window.removeEventListener("message", receive); observer.disconnect(); };
  }, [current, target, frame, locale]);
  if (!hasBodyShape(current)) return <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{ar ? "أكمل الطول ومحيطات الصدر والوسط والأرداف والذراع والفخذ والسمانة في قياس واحد لإظهار الموديل. الوزن وحده لا يحدد شكل الجسم." : "Complete height and all six circumferences in one check-in to show the avatar. Weight alone does not determine body shape."}</p>;
  return <div className="space-y-3">
    <label className="flex flex-wrap items-center gap-3 text-sm">
      {ar ? "قالب الجسم التوضيحي" : "Illustrative body frame"}
      <select className="min-h-11 rounded-lg border bg-background px-3" value={frame} onChange={e => setFrame(e.target.value)}>
        <option value="neutral">{ar ? "محايد" : "Neutral"}</option>
        <option value="masculine">{ar ? "رجالي" : "Masculine"}</option>
        <option value="feminine">{ar ? "نسائي" : "Feminine"}</option>
      </select>
    </label>
    <iframe ref={iframe} src="/body3d/index.html" title={ar ? "مقارنة الجسم بالمقاسات الحالية والهدف — ثلاثي الأبعاد" : "3D current and target body comparison"} className={compact ? "h-[clamp(230px,34dvh,310px)] w-full border-0 md:h-[430px]" : "h-[510px] w-full border-0"} onLoad={send} />
    {error && <p role="status" className="text-sm text-muted-foreground">{ar ? "تعذر عرض الموديل على هذا الجهاز؛ المقاسات والهدف متاحان بالجدول." : "The avatar is unavailable on this device; measurements and targets remain in the table."}</p>}
  </div>;
}
