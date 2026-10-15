import { useEffect, useRef, useState } from "react";
import { useEventSettings } from "./useEventSettings";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import {
  ListOrdered,
  Sparkles,
  Clock,
  Move,
  BookOpen,
  Mic2,
  Music2,
  Award,
  GraduationCap,
  Camera,
  Coffee,
  PartyPopper,
  Flag,
  Star,
  HandHeart,
  Presentation,
  Theater,
  Trophy,
  Gift,
  type LucideIcon,
} from "lucide-react";
import { ProgramSegment } from "./useProgramSegments";
import { useLocale } from '@/store/locale';

/* Inject keyframes once for shimmer + glow effects */
const STYLE_ID = "program-list-slide-fx";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = `
    @keyframes pls-rise { 0%{opacity:0;transform:translateX(-26px) scale(.97)} 60%{opacity:1} 100%{opacity:1;transform:none} }
    @keyframes pls-slide-enter { 0%{opacity:0;transform:translateY(24px)} 100%{opacity:1;transform:none} }
    @keyframes pls-shimmer { 0%{transform:translateX(-120%)} 100%{transform:translateX(220%)} }
    @keyframes pls-pulse-ring { 0%{box-shadow:0 0 0 0 hsl(var(--grad-gold) / 0.55)} 70%{box-shadow:0 0 0 10px hsl(var(--grad-gold) / 0)} 100%{box-shadow:0 0 0 0 hsl(var(--grad-gold) / 0)} }
    @keyframes pls-sparkle { 0%,100%{opacity:.35;transform:scale(1) rotate(0)} 50%{opacity:1;transform:scale(1.15) rotate(15deg)} }
    @keyframes pls-icon-pop { 0%{transform:scale(1) rotate(0)} 50%{transform:scale(1.18) rotate(-8deg)} 100%{transform:scale(1) rotate(0)} }
    @keyframes pls-active-sweep { 0%{transform:translateX(-110%)} 100%{transform:translateX(110%)} }
    @keyframes pls-desc-in { 0%{opacity:0;max-height:0;transform:translateY(-4px)} 100%{opacity:1;max-height:120px;transform:none} }
    .pls-row { animation: pls-rise .6s cubic-bezier(.22,.61,.36,1) both; transition: transform .35s ease, border-color .35s ease, box-shadow .35s ease, background-color .4s ease; }
    .pls-row:hover { transform: translateX(-8px) scale(1.012); border-color: hsl(var(--grad-gold) / 0.9); box-shadow: 0 10px 32px -10px hsl(var(--grad-gold) / 0.6); }
    .pls-row:hover .pls-ico { animation: pls-icon-pop .55s ease both; color: hsl(var(--grad-gold)); }
    .pls-row.is-active { border-color: hsl(var(--grad-gold) / 0.95); box-shadow: 0 12px 36px -10px hsl(var(--grad-gold) / 0.65); background: linear-gradient(90deg, hsl(var(--grad-gold) / 0.10), transparent 70%); }
    .pls-row.is-active .pls-ico { color: hsl(var(--grad-gold)); animation: pls-icon-pop .8s ease both; }
    .pls-row.is-active::after { content:""; position:absolute; inset:0; pointer-events:none; background: linear-gradient(110deg, transparent 35%, hsl(var(--grad-gold) / 0.18) 50%, transparent 65%); animation: pls-active-sweep 1.6s ease forwards; }
    .pls-row.is-selected { border-color: hsl(var(--grad-gold)); box-shadow: 0 14px 40px -10px hsl(var(--grad-gold) / 0.75), inset 0 0 0 1px hsl(var(--grad-gold) / 0.5); background: linear-gradient(90deg, hsl(var(--grad-gold) / 0.16), hsl(var(--grad-green) / 0.06) 70%, transparent); transform: translateX(-6px) scale(1.02); }
    .pls-row.is-selected .pls-num { transform: scale(1.08); }
    .pls-desc { animation: pls-desc-in .35s ease both; overflow: hidden; }
    .pls-row { cursor: pointer; }
    .pls-row::before { content:""; position:absolute; inset:0; pointer-events:none; background: linear-gradient(110deg, transparent 30%, hsl(var(--grad-gold) / 0.22) 50%, transparent 70%); transform: translateX(-120%); }
    .pls-row:hover::before { animation: pls-shimmer 1.1s ease forwards; }
    .pls-num { animation: pls-pulse-ring 2.4s ease-in-out infinite; }
    .pls-sparkle-1 { animation: pls-sparkle 2.2s ease-in-out infinite; }
    .pls-sparkle-2 { animation: pls-sparkle 2.6s ease-in-out infinite .6s; }
    .pls-slide-enter { animation: pls-slide-enter .65s cubic-bezier(.22,.61,.36,1) both; }
    .pls-ico { transition: color .35s ease, transform .35s ease; }
  `;
  document.head.appendChild(tag);
}

/** Pick a meaningful icon based on Arabic keywords in the segment title. */
const pickIcon = (title: string): LucideIcon => {
  const t = (title || "").toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  if (has("قرآن", "قران", "تلاوة", "آيات")) return BookOpen;
  if (has("سلام", "نشيد", "شيلة", "أنشودة", "انشودة")) return Music2;
  if (has("كلمة", "خطاب", "ترحيب", "افتتاح")) return Mic2;
  if (has("افتتاحية", "بداية", "استهلال")) return Flag;
  if (has("عرض", "فيلم", "تقديم", "مرئي")) return Presentation;
  if (has("مسرح", "مشهد", "تمثيل", "فقرة فنية")) return Theater;
  if (has("تكريم", "جوائز", "جائزة")) return Trophy;
  if (has("شهادات", "شهادة", "تخرج")) return GraduationCap;
  if (has("هدايا", "هدية", "توزيع")) return Gift;
  if (has("صور", "تصوير", "صورة جماعية")) return Camera;
  if (has("ضياف", "بوفيه", "استراحة", "ضيافة", "عشاء", "إفطار")) return Coffee;
  if (has("دعاء", "شكر", "ابتهال")) return HandHeart;
  if (has("ختام", "ختامية", "نهاية", "ختم")) return Award;
  if (has("احتفال", "احتفالي", "حفل")) return PartyPopper;
  return Star;
};

/**
 * Single-card slide listing ALL program segments in order (by order_index).
 * Replaces the per-segment rotation so the audience sees the full program at once.
 */
export const ProgramListSlide = ({ segments }: { segments: ProgramSegment[] }) => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const sorted = [...segments].sort((a, b) => a.order_index - b.order_index);
  const { settings } = useEventSettings();
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const alignRight = (settings.program_align ?? "right") === "right";
  const savedOffset = settings.program_offset_pct ?? 22;
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const offsetPct = dragOffset ?? savedOffset;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startPct: number } | null>(null);

  const persistOffset = async (pct: number) => {
    try {
      await liveApi.update({ program_offset_pct: pct });
    } catch {
      /* best-effort: dragging the program card offset is non-critical */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startPct: offsetPct };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !containerRef.current) return;
    const w = containerRef.current.getBoundingClientRect().width;
    const deltaPx = e.clientX - dragState.current.startX;
    const deltaPct = (deltaPx / w) * 100;
    // RTL: dragging left increases right-side offset when aligned right.
    const sign = alignRight ? -1 : 1;
    const next = Math.min(45, Math.max(0, dragState.current.startPct + sign * deltaPct));
    setDragOffset(next);
  };
  const onPointerUp = () => {
  const liveApi = useClubEventsLiveApi();
  const basePath = useEventLiveBasePath();
    if (dragState.current && dragOffset != null) {
      const rounded = Math.round(dragOffset);
      setDragOffset(rounded);
      persistOffset(rounded);
    }
    dragState.current = null;
  };
  useEffect(() => {
    if (sorted.length === 0) return;
    if (selectedId) return; // pause rotation while user has a selection
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % sorted.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [sorted.length, selectedId]);

  return (
    <div
      ref={containerRef}
      className={`pls-slide-enter relative w-full h-full min-h-0 flex flex-col py-3 sm:py-4 gap-2 sm:gap-3 ${
        alignRight ? "ps-6 sm:ps-10 pe-0" : "pe-6 sm:pe-10 ps-0"
      }`}
    >
      {/* Ambient aura */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[60%] h-40 rounded-full bg-[hsl(var(--grad-gold))]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-40 h-40 rounded-full bg-[hsl(var(--grad-green))]/15 blur-3xl" />
        <Sparkles className="pls-sparkle-1 absolute top-6 right-8 h-4 w-4 text-[hsl(var(--grad-gold))]/70" />
        <Sparkles className="pls-sparkle-2 absolute bottom-8 left-10 h-3 w-3 text-[hsl(var(--grad-gold))]/60" />
      </div>

      {/* Header */}
      <div className="relative shrink-0 flex items-center justify-center gap-3">
        <span className="h-px w-12 sm:w-20 bg-gradient-to-l from-[hsl(var(--grad-gold))] to-transparent" />
        <span
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[hsl(var(--grad-gold))]/60 shadow-[0_8px_24px_-8px_hsl(var(--grad-gold)/0.5)] backdrop-blur-md bg-transparent"
        >
          <Sparkles className="h-4 w-4 text-white" />
          <p className="text-base sm:text-lg font-extrabold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">{ui('فقرات الحفل')}</p>
          <ListOrdered className="h-5 w-5 text-white" />
        </span>
        <span className="h-px w-12 sm:w-20 bg-gradient-to-r from-[hsl(var(--grad-gold))] to-transparent" />
      </div>

      {/* List */}
      <ol
        className={`relative flex-1 min-h-0 w-full max-w-3xl 2xl:max-w-5xl ${alignRight ? "ms-auto" : "me-auto"} flex flex-col justify-center gap-1.5 2xl:gap-2.5 text-right overflow-hidden transition-[margin] duration-300`}
        style={alignRight ? { marginInlineEnd: `${offsetPct}%` } : { marginInlineStart: `${offsetPct}%` }}
      >
        {sorted.map((s, i) => {
          const Icon = pickIcon(s.title);
          const isSelected = selectedId === s.id;
          const isActive = !selectedId && i === activeIdx;
          return (
            <li
              key={s.id}
              role="button"
              tabIndex={0}
              aria-expanded={isSelected}
              onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId((cur) => (cur === s.id ? null : s.id));
                }
              }}
              className={`pls-row ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""} relative overflow-hidden grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 sm:gap-3 rounded-xl border border-[hsl(var(--grad-gold))]/35 bg-transparent px-2.5 sm:px-3 py-1 sm:py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--grad-gold))]/70`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span aria-hidden className="absolute right-0 top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-transparent via-[hsl(var(--grad-gold))]/70 to-transparent" />
              <span className="pls-num relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-extrabold text-sm bg-gradient-to-br from-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))] text-white ring-2 ring-[hsl(var(--grad-gold))]/40">
                {i + 1}
              </span>
              <span aria-hidden className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border border-[hsl(var(--grad-gold))]/30 bg-[hsl(var(--grad-gold))]/5">
                <Icon className="pls-ico h-4 w-4 sm:h-5 sm:w-5 text-[hsl(var(--grad-cream))]" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="font-extrabold text-sm sm:text-base text-white leading-snug line-clamp-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">{s.title}</p>
                {isSelected && s.description && (
                  <p className="pls-desc mt-1 text-[11px] sm:text-xs leading-relaxed text-white/90 line-clamp-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {s.description}
                  </p>
                )}
                {isSelected && !s.description && (
                  <p className="pls-desc mt-1 text-[11px] sm:text-xs italic text-[hsl(var(--grad-gold))]/70">{ui('لا يوجد وصف لهذه الفقرة')}</p>
                )}
              </div>
              {s.show_duration && s.duration_minutes != null && s.duration_minutes > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-extrabold whitespace-nowrap bg-transparent text-[hsl(var(--grad-gold))] border border-[hsl(var(--grad-gold))]/50 tabular-nums backdrop-blur-sm">
                  <Clock className="h-3 w-3" />
                  {s.duration_minutes} {ui('د')}
                </span>
              )}
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="text-center text-[hsl(var(--grad-gold))] text-sm py-8">{ui('لا توجد فقرات مفعّلة')}</li>
        )}
      </ol>
    </div>
  );
};

export default ProgramListSlide;