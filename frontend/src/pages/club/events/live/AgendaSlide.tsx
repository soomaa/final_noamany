import { useEffect, useState } from "react";
import { CalendarClock, Clock, CheckCircle2, Play, ChevronLeft } from "lucide-react";
import { ProgramSegment, SEGMENT_KIND_LABEL } from "./useProgramSegments";
import { useLocale } from '@/store/locale';
import { formatTime } from '@/lib/formatters';

/** Returns minutes since midnight for "HH:MM", or null if invalid. */
const toMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
};

/**
 * Agenda slide — shows the program as an ordered timeline with time priority.
 * Highlights the current segment and the next one based on the wall clock.
 */
export const AgendaSlide = ({ segments }: { segments: ProgramSegment[] }) => {
  const { ui } = useLocale();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sort: timed first (by time asc), then untimed by order_index.
  const sorted = [...segments].sort((a, b) => {
    const ta = toMinutes(a.scheduled_time);
    const tb = toMinutes(b.scheduled_time);
    if (ta != null && tb != null) return ta - tb;
    if (ta != null) return -1;
    if (tb != null) return 1;
    return a.order_index - b.order_index;
  });

  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Index of the "current" item: latest item whose time <= now (only among timed items).
  let currentIdx = -1;
  let nextIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const t = toMinutes(sorted[i].scheduled_time);
    if (t == null) continue;
    if (t <= nowMin) currentIdx = i;
    else { nextIdx = i; break; }
  }
  // If no current yet, the first timed item becomes "next" and nothing is current.
  if (currentIdx === -1 && nextIdx === -1) {
    nextIdx = sorted.findIndex((s) => toMinutes(s.scheduled_time) != null);
  }

  const statusOf = (i: number): "done" | "current" | "next" | "upcoming" => {
    if (i === currentIdx) return "current";
    if (i === nextIdx) return "next";
    if (currentIdx >= 0 && i < currentIdx) return "done";
    return "upcoming";
  };

  return (
    <div className="w-full px-6 sm:px-10 py-6 sm:py-8 space-y-5 sm:space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center justify-center gap-3">
        <span className="h-px w-12 sm:w-20 bg-gradient-to-l from-[#D4A229] to-transparent" />
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white border-2 border-[#D4A229] shadow-md">
          <CalendarClock className="h-5 w-5 text-[#D4A229]" />
          <p className="text-base sm:text-lg font-extrabold text-[#7B5E15] tracking-wide">{ui('جدول فقرات الحفل')}</p>
        </span>
        <span className="h-px w-12 sm:w-20 bg-gradient-to-r from-[#D4A229] to-transparent" />
      </div>

      {/* List */}
      <ol className="max-w-3xl mx-auto space-y-2.5 sm:space-y-3 text-right">
        {sorted.map((s, i) => {
          const st = statusOf(i);
          const time = formatTime(s.scheduled_time);
          const isCurrent = st === "current";
          const isNext = st === "next";
          const isDone = st === "done";
          return (
            <li
              key={s.id}
              className={[
                "relative grid grid-cols-[auto_88px_1fr_auto] items-center gap-3 sm:gap-4 rounded-2xl border-2 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm transition-all",
                isCurrent
                  ? "bg-gradient-to-l from-[#7CB342]/15 to-white border-[#7CB342] shadow-md ring-2 ring-[#7CB342]/30"
                  : isNext
                  ? "bg-gradient-to-l from-[#D4A229]/12 to-white border-[#D4A229]"
                  : isDone
                  ? "bg-white/70 border-[#7CB342]/20 opacity-70"
                  : "bg-white border-[#7CB342]/20",
              ].join(" ")}
            >
              {/* Order badge */}
              <span
                className={[
                  "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-extrabold text-sm shadow-sm",
                  isCurrent
                    ? "bg-gradient-to-br from-[#7CB342] to-[#558B2F] text-white"
                    : isNext
                    ? "bg-gradient-to-br from-[#D4A229] to-[#A8801F] text-white"
                    : isDone
                    ? "bg-[#7CB342]/15 text-[#558B2F]"
                    : "bg-[#FAFBF5] text-[#558B2F] border border-[#7CB342]/30",
                ].join(" ")}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>

              {/* Time pill */}
              <span
                className={[
                  "inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg font-extrabold tabular-nums text-xs sm:text-sm",
                  isCurrent
                    ? "bg-[#558B2F] text-white"
                    : isNext
                    ? "bg-[#D4A229] text-white"
                    : "bg-[#7CB342]/10 text-[#2E4D1F]",
                ].join(" ")}
                dir="ltr"
              >
                <Clock className="h-3.5 w-3.5" />
                {time}
              </span>

              {/* Title + kind */}
              <div className="min-w-0">
                <p
                  className={[
                    "font-extrabold truncate",
                    isCurrent ? "text-base sm:text-lg text-[#2E4D1F]" : "text-sm sm:text-base text-[#2E4D1F]",
                  ].join(" ")}
                >
                  {s.title}
                </p>
                <p className="text-[10px] sm:text-xs text-[#558B2F]/80 font-medium">
                  {SEGMENT_KIND_LABEL[s.kind]}
                </p>
              </div>

              {/* Status chip */}
              <span
                className={[
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-extrabold whitespace-nowrap",
                  isCurrent
                    ? "bg-[#7CB342] text-white"
                    : isNext
                    ? "bg-[#D4A229] text-white"
                    : isDone
                    ? "bg-[#7CB342]/15 text-[#558B2F]"
                    : "bg-[#FAFBF5] text-[#558B2F] border border-[#7CB342]/20",
                ].join(" ")}
              >
                {isCurrent ? (
                  <>
                    <Play className="h-3 w-3" /> {ui('الآن')}
                  </>
                ) : isNext ? (
                  <>
                    <ChevronLeft className="h-3 w-3" /> {ui('التالي')}
                  </>
                ) : isDone ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" /> {ui('منتهية')}
                  </>
                ) : (
                  ui("قادمة")
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default AgendaSlide;
