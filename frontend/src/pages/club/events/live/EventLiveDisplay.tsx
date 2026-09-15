import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, QrCode, Trophy, Star, Heart, TrendingUp, Award, Zap, BarChart3, UserCheck, Timer, WifiOff, GraduationCap, Monitor, CalendarDays, ListChecks } from "lucide-react";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventSettings } from "./useEventSettings";
import { getSourceMeta, SOURCE_META, AttendeeSource, normalizeSource } from "./sourceLabels";
import { useProgramSegments, type ProgramSegment } from "./useProgramSegments";
import { ProgramListSlide } from "./ProgramListSlide";
import { AgendaSlide } from "./AgendaSlide";
import { KioskFullscreenButton } from "./KioskFullscreenButton";
import { EventLiveBackdrop } from "./EventLiveBackdrop";
import { formatNameWithTitle } from "./titleUtils";
import { EventLiveTheme, gradBgStyle } from "./EventLiveTheme";
import { resolveEventLogo, APP_LIVE_THEME } from "./live-brand";
import { EventLiveFloatingNav } from "./EventLiveFloatingNav";
import { useLocale } from '@/store/locale';

interface Attendee {
  id: string;
  name: string;
  phone: string;
  checked_in_at: string;
  source?: string | null;
  title?: string | null;
}

/** Animated count-up number — eases from 0 to target on change. */
const CountUp = ({ value, className }: { value: number; className?: string }) => {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{display}</span>;
};

/** Burst of small colored dots that fall + fade — fires when a new attendee arrives. */
const ConfettiBurst = ({ trigger }: { trigger: number }) => {
  if (!trigger) return null;
  const colors = [APP_LIVE_THEME.accentPrimary, "#1B6FA8", APP_LIVE_THEME.accentGold, "#4DA3D4"];
  const pieces = Array.from({ length: 28 });
  return (
    <div key={trigger} className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Radial flash + expanding gold ring when a new attendee arrives */}
      <span
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 45%, rgba(212,162,41,0.45) 0%, rgba(124,179,66,0.25) 30%, transparent 60%)",
          animation: "burst-flash 1.1s ease-out forwards",
        }}
      />
      <span
        className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[hsl(var(--grad-gold))]"
        style={{ width: 40, height: 40, animation: "burst-ring 1.4s ease-out forwards" }}
      />
      <span
        className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[hsl(var(--grad-green))]"
        style={{ width: 40, height: 40, animation: "burst-ring 1.8s 0.15s ease-out forwards" }}
      />
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const dur = 1.6 + Math.random() * 1.2;
        const size = 6 + Math.random() * 8;
        const color = colors[i % colors.length];
        const rot = Math.random() * 360;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              top: `-10px`,
              width: size,
              height: size * 0.4,
              background: color,
              transform: `rotate(${rot}deg)`,
              animation: `confetti-fall ${dur}s ${delay}s ease-in forwards`,
              borderRadius: 2,
            }}
            className="absolute"
          />
        );
      })}
    </div>
  );
};

/**
 * Ambient stage effects — soft drifting aurora blobs + twinkling gold sparkles.
 * Pure decoration, no interactivity, pointer-events disabled.
 */
const AmbientFX = () => {
  const sparkles = Array.from({ length: 22 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {/* Aurora blobs */}
      <div
        className="absolute -top-32 -right-24 w-[42rem] h-[42rem] rounded-full opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(124,179,66,0.55) 0%, transparent 65%)",
          filter: "blur(40px)",
          animation: "aurora-drift 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -bottom-40 -left-24 w-[44rem] h-[44rem] rounded-full opacity-35"
        style={{
          background: "radial-gradient(circle, rgba(212,162,41,0.55) 0%, transparent 65%)",
          filter: "blur(48px)",
          animation: "aurora-drift 22s 2s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full opacity-25"
        style={{
          background: "radial-gradient(circle, rgba(85,139,47,0.6) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-drift 26s 1s ease-in-out infinite",
        }}
      />
      {/* Twinkling sparkles */}
      {sparkles.map((_, i) => {
        const left = (i * 53) % 100;
        const top = (i * 37) % 100;
        const size = 2 + ((i * 7) % 4);
        const delay = (i % 9) * 0.4;
        const dur = 3 + ((i * 3) % 5);
        const gold = i % 2 === 0;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background: gold ? "#F2C66B" : "#A4D266",
              boxShadow: gold
                ? "0 0 8px rgba(242,198,107,0.9), 0 0 16px rgba(212,162,41,0.6)"
                : "0 0 8px rgba(164,210,102,0.9), 0 0 16px rgba(124,179,66,0.5)",
              animation: `sparkle-twinkle ${dur}s ${delay}s ease-in-out infinite`,
            }}
          />
        );
      })}
    </div>
  );
};

const EventLiveDisplay = () => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const { settings } = useEventSettings({ live: true });
  // Match QR code color: dark variant of brand primary
  const nameColor = (() => {
    const v = settings.primary_color?.trim();
    if (v && /^\d/.test(v)) {
      const parts = v.split(/\s+/);
      if (parts.length >= 3) {
        const l = Math.max(12, parseInt(parts[2]) - 32);
        return `hsl(${parts[0]} ${parts[1]} ${l}%)`;
      }
    }
    return "#558B2F";
  })();
  const showProgramBtn = settings.show_program;
  const { segments } = useProgramSegments(true);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [latest, setLatest] = useState<Attendee | null>(null);
  const [now, setNow] = useState(new Date());
  const [burst, setBurst] = useState(0);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  // Rotation: -1 = welcome, 0 = program list (all segments in one card), 1 = agenda (if any timed)
  const [slotIdx, setSlotIdx] = useState<number>(-1);
  const WELCOME_DURATION = 15; // seconds
  const PROGRAM_DURATION = 20; // seconds
  const AGENDA_DURATION = 18; // seconds

  const showProgram = settings.show_program !== false;
  const hasAgenda = showProgram && segments.some((s: ProgramSegment) => (s.scheduled_time || '').trim().length > 0);
  const hasProgram = showProgram && segments.length > 0;

  // Slots: welcome (-1) → program list (0, if any) → agenda (1, if any timed) → back to welcome
  useEffect(() => {
    const slots: Array<{ kind: "welcome" | "program" | "agenda"; idx: number; dur: number }> = [
      { kind: "welcome", idx: -1, dur: WELCOME_DURATION },
    ];
    if (hasProgram) slots.push({ kind: "program", idx: 0, dur: PROGRAM_DURATION });
    if (hasAgenda) slots.push({ kind: "agenda", idx: 1, dur: AGENDA_DURATION });
    const currentPos = slots.findIndex((s) => s.idx === slotIdx);
    const safePos = currentPos === -1 ? 0 : currentPos;
    const dur = slots[safePos].dur;
    const t = setTimeout(() => {
      const next = slots[(safePos + 1) % slots.length];
      setSlotIdx(next.idx);
    }, dur * 1000);
    return () => clearTimeout(t);
  }, [slotIdx, hasProgram, hasAgenda]);

  // When a new attendee arrives, immediately switch back to welcome slide.
  useEffect(() => {
    if (burst > 0) setSlotIdx(-1);
  }, [burst]);

  const isProgramSlot = slotIdx === 0 && hasProgram;
  const isAgendaSlot = slotIdx === 1 && hasAgenda;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live attendee feed via periodic refetch (no realtime channel). A short interval
  // keeps the welcome screen responsive; new arrivals are detected by diffing the
  // newest row id so the confetti burst + "back to welcome" behavior is preserved.
  const prevTopIdRef = useRef<string | null>(null);
  const { data: feed, isError, isSuccess } = useQuery({
    queryKey: ["grad", "attendees", "display"],
    queryFn: async () =>
      (await liveApi.listAttendees()).data
        .map((a: {
          id: string;
          name: string;
          phone?: string | null;
          checkedInAt?: string;
          checked_in_at?: string;
          source?: string | null;
          title?: string | null;
        }): Attendee => ({
          id: a.id,
          name: a.name,
          phone: a.phone ?? '',
          checked_in_at: a.checkedInAt ?? a.checked_in_at ?? '',
          source: a.source,
          title: a.title,
        }))
        .sort((x: Attendee, y: Attendee) => new Date(y.checked_in_at).getTime() - new Date(x.checked_in_at).getTime()),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!feed) return;
    setAttendees(feed);
    setLatest(feed[0] ?? null);
    const topId = feed[0]?.id ?? null;
    if (prevTopIdRef.current !== null && topId && topId !== prevTopIdRef.current) {
      // A new attendee appeared since the last poll → celebrate.
      setBurst((b) => b + 1);
      setLastEventAt(new Date());
    }
    prevTopIdRef.current = topId;
  }, [feed]);

  useEffect(() => {
    if (isError) setLiveStatus("offline");
    else if (isSuccess) setLiveStatus("live");
    else setLiveStatus("connecting");
  }, [isError, isSuccess]);

  const nowMs = Date.now();
  const lastHourCount = attendees.filter((a) => new Date(a.checked_in_at).getTime() > nowMs - 3600_000).length;
  const last10mCount = attendees.filter((a) => new Date(a.checked_in_at).getTime() > nowMs - 10 * 60_000).length;

  const bySource = attendees.reduce<Record<AttendeeSource, number>>(
    (acc, a) => {
      const k = normalizeSource(a.source);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    { qr: 0, direct: 0 },
  );

  // Peak hour over the event (busiest hour bucket).
  const hourBuckets = attendees.reduce<Record<string, number>>((acc, a) => {
    const d = new Date(a.checked_in_at);
    const key = `${d.getHours()}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const peakEntry = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0];
  const peakHourLabel = peakEntry ? `${peakEntry[0].padStart(2, "0")}:00` : "—";
  const peakHourCount = peakEntry ? peakEntry[1] : 0;

  // Rate per hour since first check-in (rounded).
  const firstAt = attendees[attendees.length - 1]?.checked_in_at;
  const minutesElapsed = firstAt ? Math.max(1, (nowMs - new Date(firstAt).getTime()) / 60000) : 0;
  const ratePerHour = attendees.length > 0 ? Math.round((attendees.length / minutesElapsed) * 60) : 0;

  const withTitleCount = attendees.filter((a) => (a.title || "").trim().length > 0).length;

  // Latest 8 names for marquee ticker
  const tickerNames = attendees.slice(0, 12).map((a) => formatNameWithTitle(a.title, a.name));

  // Frosted-glass cards: low alpha + strong blur lets the backdrop breathe through
  // while keeping data crisp. Floors are intentionally low; readability comes from
  // backdrop-blur + saturation, not opacity.
  // Dark translucent cards keep brand-tinted text (cream/gold/green) legible on any backdrop.
  const topAlpha = Math.min(100, settings.card_top_opacity ?? 0) / 100;
  const botAlpha = Math.min(100, settings.card_bottom_opacity ?? 0) / 100;
  const cardGradient = topAlpha === 0 && botAlpha === 0
    ? "transparent"
    : `linear-gradient(180deg, rgba(10,31,61,${topAlpha}) 0%, rgba(6,19,48,${botAlpha}) 100%)`;
  const heroGradient = topAlpha === 0 && botAlpha === 0
    ? "transparent"
    : `linear-gradient(180deg, rgba(10,31,61,${topAlpha}) 0%, rgba(8,25,55,${(topAlpha + botAlpha) / 2}) 55%, rgba(6,19,48,${botAlpha}) 100%)`;

  return (
    <div
      dir="rtl"
      className="relative flex h-screen min-h-screen flex-col overflow-hidden text-[hsl(var(--grad-cream))]"
      style={gradBgStyle()}
    >
      <EventLiveTheme />
      <EventLiveBackdrop screen="display" live />
      <EventLiveFloatingNav current="display" />
      {/* Keyframes for confetti + marquee + shimmer */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(560px) rotate(720deg); opacity: 0; }
        }
        @keyframes marquee-rtl {
          0% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        @keyframes ring-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer-sweep {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }
        @keyframes float-y {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes rise-in {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes soft-pop {
          0% { opacity: 0; transform: scale(0.92); }
          60% { opacity: 1; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes shine-text {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes sparkle-twinkle {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes aurora-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -30px) scale(1.12); }
        }
        @keyframes burst-flash {
          0% { opacity: 0; }
          25% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes burst-ring {
          0% { width: 40px; height: 40px; opacity: 0.9; }
          100% { width: 720px; height: 720px; opacity: 0; }
        }
        @keyframes medallion-spin {
          to { transform: rotate(360deg); }
        }
        .grad-anim-rise { animation: rise-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .grad-anim-pop { animation: soft-pop 0.8s cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>

      <AmbientFX />

      {/* Top bar — brand identity */}
      <header className="relative z-10 border-b border-[hsl(var(--grad-gold))]/30 bg-transparent shadow-lg shadow-black/40">
        {/* gold hairline accent */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--grad-gold))]/60 to-transparent" />
        <div className="w-full max-w-none px-3 sm:px-6 py-2.5 sm:py-3 grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5">
          {/* RIGHT (start in RTL): logo + title */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-[hsl(var(--grad-gold))]/30 blur-xl rounded-full animate-pulse" />
              <img
                src={resolveEventLogo(settings.logo_url)}
                alt={ui("شعار Noamany")}
                className="relative h-10 sm:h-14 w-auto object-contain"
                style={{ animation: "float-y 4s ease-in-out infinite" }}
              />
            </div>
            <div className="border-r-2 border-[hsl(var(--grad-gold))]/40 pr-2 sm:pr-4 min-w-0">
              <h1 className="text-base sm:text-2xl font-extrabold text-[hsl(var(--grad-cream))] leading-tight truncate">{settings.event_name}</h1>
              <p className="text-[10px] sm:text-xs text-[hsl(var(--grad-gold))] font-medium mt-0.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--grad-green))] animate-pulse" />
                {ui("شاشة الترحيب المباشرة")}
              </p>
            </div>
          </div>

          {/* MIDDLE: live status + clock + date as a premium unified glass console */}
          <div className="hidden sm:flex items-center justify-center min-w-0">
            <div
              className="relative flex items-stretch h-11 lg:h-12 rounded-full overflow-hidden border border-[hsl(var(--grad-gold))]/40 shadow-none max-w-full"
              style={{ background: "transparent" }}
            >
              {/* subtle gold sheen */}
              <span className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(120% 60% at 50% 0%, hsl(var(--grad-gold) / 0.18), transparent 60%)" }} />

              {/* Status */}
              <div className="relative hidden md:flex items-center px-3 lg:px-4">
                <LiveStatusBadge status={liveStatus} lastEventAt={lastEventAt} now={now} />
              </div>

              {/* divider */}
              <span className="hidden md:block w-px my-2 bg-gradient-to-b from-transparent via-[hsl(var(--grad-gold))]/40 to-transparent" />

              {/* Time */}
              <div className="relative flex items-center gap-2 px-3 lg:px-4 whitespace-nowrap">
                <span
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{
                    background: "linear-gradient(110deg, transparent 0%, rgba(212,162,41,0.18) 50%, transparent 100%)",
                    animation: "shimmer-sweep 4s ease-in-out infinite",
                  }}
                />
                <Clock className="relative h-3.5 w-3.5 text-[hsl(var(--grad-gold))]/80" />
                <span className="relative text-base lg:text-lg font-extrabold tabular-nums leading-none text-[hsl(var(--grad-cream))] [text-shadow:0_1px_8px_rgba(212,162,41,0.35)]">
                  {now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </span>
              </div>

              {/* divider */}
              <span className="w-px my-2 bg-gradient-to-b from-transparent via-[hsl(var(--grad-gold))]/40 to-transparent" />

              {/* Date */}
              <div className="relative flex items-center gap-2 px-3 lg:px-4 whitespace-nowrap">
                <CalendarDays className="h-3.5 w-3.5 text-[hsl(var(--grad-gold))]/80" />
                <span className="text-xs lg:text-sm font-bold text-[hsl(var(--grad-cream))]">
                  {now.toLocaleDateString("ar-SA", { weekday: "long" })}
                </span>
                <span className="text-[hsl(var(--grad-gold))]/60">·</span>
                <span className="text-xs lg:text-sm font-medium text-[hsl(var(--grad-cream))]/90 tabular-nums">
                  {now.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>

          {/* LEFT (end in RTL): action toolbar — unified segmented pill */}
          <div className="flex items-center gap-2 justify-end">
            {/* compact status+clock+date on mobile */}
            <div className="sm:hidden flex flex-col items-end leading-tight">
              <div className="flex items-center gap-1.5 text-[hsl(var(--grad-cream))]">
                <Clock className="h-3 w-3 text-[hsl(var(--grad-gold))]" />
                <span className="text-xs font-extrabold tabular-nums">
                  {now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </span>
              </div>
              <span className="text-[9px] text-[hsl(var(--grad-cream))]/80 mt-0.5 tabular-nums">
                {now.toLocaleDateString("ar-SA", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 w-full max-w-none px-3 sm:px-6 2xl:px-10 py-2 sm:py-3 2xl:py-5 flex flex-row gap-3 sm:gap-4 2xl:gap-6 overflow-hidden">
        {/* Left vertical stats sidebar (landscape only, hidden on agenda/program slides) */}
        {!isAgendaSlot && !isProgramSlot && latest && (() => {
          const qrCount = bySource.qr || 0;
          const fmtTime = (t?: string | null): { value: string; suffix?: string } => {
            if (!t) return { value: "—" };
            const [hStr, mStr] = t.split(":");
            let h = parseInt(hStr, 10);
            const m = (mStr ?? "00").padStart(2, "0");
            if (Number.isNaN(h)) return { value: "—" };
            const suffix = h >= 12 ? ui("م") : ui("ص");
            h = h % 12; if (h === 0) h = 12;
            return { value: `${h}:${m}`, suffix };
          };
          const startT = fmtTime(settings.event_start_time);
          return (
            <aside className="hidden landscape:flex flex-col w-[20%] min-w-[260px] 2xl:min-w-[320px] 2xl:max-w-[22%] rounded-2xl border border-white/25 shadow-2xl shadow-black/40 overflow-hidden backdrop-blur-md"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.45) 100%)" }}>
              <div className="grid grid-cols-2 grid-rows-4 h-full divide-x divide-y divide-white/20 [direction:ltr]">
                <div className="col-span-2">
                  <PillStat icon={<CalendarDays />} topLabel={ui("من الساعة")} valueText={startT.value} suffix={startT.suffix} />
                </div>
                <PillStat icon={<Users />} topLabel={ui("إجمالي الحضور")} valueText={`${attendees.length}`} />
                <PillStat icon={<ListChecks />} topLabel={ui("عدد الفقرات")} valueText={`${segments.length}`} />
                <PillStat icon={<Clock />} topLabel={ui("آخر ساعة")} valueText={`${lastHourCount}`} />
                <PillStat icon={<Timer />} topLabel={ui("آخر 10 د")} valueText={`${last10mCount}`} />
                <PillStat icon={<QrCode />} topLabel={ui("عبر QR")} valueText={`${qrCount}`} />
                <PillStat icon={<TrendingUp />} topLabel={ui("معدل/ساعة")} valueText={`${ratePerHour}`} />
              </div>
            </aside>
          );
        })()}
        {/* Welcome hero card — fills the remaining width */}
        <div className="flex-1 min-h-0 flex landscape:w-auto w-[80%] mr-0 ml-auto">
          <Card
            className="group w-full h-full p-0 border border-white/30 shadow-2xl shadow-black/40 flex flex-col items-center justify-center text-center relative overflow-hidden rounded-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_80px_-20px_hsl(var(--grad-gold)/0.45)]"
            style={{ background: "transparent" }}
          >
            <ConfettiBurst trigger={burst} />
            {/* Hover shimmer sweep */}
            <span
              className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform [transition-duration:1400ms] ease-out z-20"
              style={{
                background:
                  "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)",
              }}
              aria-hidden
            />

            {/* Decorative frame removed for cleaner look across all slides */}

            {isAgendaSlot ? (
              <AgendaSlide segments={segments} />
            ) : isProgramSlot ? (
              <ProgramListSlide segments={segments} />
             ) : latest ? (
              <div key={latest.id} className="relative w-full pr-6 sm:pr-10 pl-6 sm:pl-[22%] py-6 sm:py-9 space-y-6 sm:space-y-9 z-10">
                {/* Dual medallion: graduation cap + closing/award — with ribbons */}
                  <div className="group/crest relative flex items-center justify-center gap-4 sm:gap-6 grad-anim-rise select-none" style={{ animationDelay: "120ms" }}>
                    {/* Right ornate ribbon */}
                    <svg width="170" height="22" viewBox="0 0 170 22" className="text-[hsl(var(--grad-gold))] opacity-90 hidden sm:block" aria-hidden>
                      <defs>
                        <linearGradient id="ribR" x1="0" x2="1">
                          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                          <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
                          <stop offset="1" stopColor="currentColor" stopOpacity="0.8" />
                        </linearGradient>
                      </defs>
                      <path d="M0 11 H110" stroke="url(#ribR)" strokeWidth="1.3" />
                      <path d="M115 11 L128 4 L141 11 L128 18 Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                      <circle cx="128" cy="11" r="1.5" fill="currentColor" />
                      <circle cx="155" cy="11" r="2.5" fill="currentColor" />
                      <circle cx="164" cy="11" r="1.2" fill="currentColor" opacity="0.7" />
                    </svg>

                    {/* Closing / Award medallion */}
                    <div className="relative shrink-0 transition-transform duration-500 group-hover/crest:scale-110 hover:!scale-125">
                      {/* rotating conic halo */}
                      <span
                        className="absolute -inset-3 rounded-full opacity-70 blur-md"
                        style={{
                          background:
                            "conic-gradient(from 0deg, hsl(var(--grad-gold)/0.0), hsl(var(--grad-gold)/0.85), hsl(var(--grad-gold)/0.0) 60%)",
                          animation: "medallion-spin 7s linear infinite",
                        }}
                        aria-hidden
                      />
                      <div className="absolute inset-0 rounded-full bg-[hsl(var(--grad-gold))]/45 blur-2xl animate-pulse" aria-hidden />
                      <div className="relative inline-flex items-center justify-center w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-full overflow-hidden bg-gradient-to-br from-[hsl(var(--grad-gold))] via-[#F5C76A] to-[hsl(var(--grad-gold-dark))] shadow-[0_10px_30px_-6px_hsl(var(--grad-gold)/0.7)] ring-2 ring-[hsl(var(--grad-gold))]/80">
                        {/* inner ring */}
                        <span className="absolute inset-1 rounded-full border border-white/40" aria-hidden />
                        {/* gloss highlight */}
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-4 rounded-full bg-white/40 blur-md" aria-hidden />
                        {/* sweeping shine */}
                        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover/crest:translate-x-full transition-transform [transition-duration:1400ms] ease-out" style={{ background: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)" }} aria-hidden />
                        <Award className="relative h-7 w-7 sm:h-8 sm:w-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" strokeWidth={2.4} />
                      </div>
                    </div>

                    {/* Center connector with floating diamond */}
                    <div className="relative flex items-center" aria-hidden>
                      <span className="block w-12 sm:w-16 h-px bg-gradient-to-r from-[hsl(var(--grad-gold))] via-[hsl(var(--grad-green))] to-[hsl(var(--grad-gold))]" />
                      <span
                        className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[hsl(var(--grad-gold))] shadow-[0_0_12px_hsl(var(--grad-gold))]"
                        style={{ animation: "medallion-spin 4s linear infinite" }}
                      />
                    </div>

                    {/* Graduation cap medallion */}
                    <div className="relative shrink-0 transition-transform duration-500 group-hover/crest:scale-110 hover:!scale-125">
                      <span
                        className="absolute -inset-3 rounded-full opacity-70 blur-md"
                        style={{
                          background:
                            "conic-gradient(from 90deg, hsl(var(--grad-green)/0.0), hsl(var(--grad-green)/0.9), hsl(var(--grad-green)/0.0) 60%)",
                          animation: "medallion-spin 9s linear infinite reverse",
                        }}
                        aria-hidden
                      />
                      <div className="absolute inset-0 rounded-full bg-[hsl(var(--grad-green))]/45 blur-2xl animate-pulse" aria-hidden />
                      <div className="relative inline-flex items-center justify-center w-16 h-16 sm:w-[78px] sm:h-[78px] rounded-full overflow-hidden bg-gradient-to-br from-[hsl(var(--grad-green))] via-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-ink))] shadow-[0_12px_36px_-6px_hsl(var(--grad-green-dark)/0.85)] ring-2 ring-[hsl(var(--grad-gold))]/80">
                        <span className="absolute inset-1 rounded-full border border-white/40" aria-hidden />
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 rounded-full bg-white/40 blur-md" aria-hidden />
                        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover/crest:translate-x-full transition-transform [transition-duration:1400ms] ease-out delay-100" style={{ background: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)" }} aria-hidden />
                        <GraduationCap className="relative h-8 w-8 sm:h-10 sm:w-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" strokeWidth={2.4} />
                      </div>
                      {/* orbiting sparkle */}
                      <span
                        className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -mt-0.5 -ml-0.5 rounded-full bg-white shadow-[0_0_10px_white]"
                        style={{
                          transformOrigin: "center",
                          animation: "medallion-spin 5s linear infinite",
                          transform: "translate(38px, 0)",
                        }}
                        aria-hidden
                      />
                    </div>

                    {/* Left ornate ribbon */}
                    <svg width="170" height="22" viewBox="0 0 170 22" className="text-[hsl(var(--grad-gold))] opacity-90 hidden sm:block" aria-hidden>
                      <defs>
                        <linearGradient id="ribL" x1="1" x2="0">
                          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                          <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
                          <stop offset="1" stopColor="currentColor" stopOpacity="0.8" />
                        </linearGradient>
                      </defs>
                      <circle cx="6" cy="11" r="1.2" fill="currentColor" opacity="0.7" />
                      <circle cx="15" cy="11" r="2.5" fill="currentColor" />
                      <circle cx="42" cy="11" r="1.5" fill="currentColor" />
                      <path d="M29 11 L42 4 L55 11 L42 18 Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M60 11 H170" stroke="url(#ribL)" strokeWidth="1.3" />
                    </svg>
                  </div>

                {/* Welcome title — serif feel */}
                <p
                  className="font-extrabold tracking-[0.22em] uppercase grad-anim-rise"
                  style={{
                    animationDelay: "240ms",
                    color: settings.display_welcome_color || "#D4A229",
                    fontSize: `${settings.display_welcome_size_px || 30}px`,
                    fontFamily: `"${settings.display_welcome_font || "Cairo"}", "Cairo", serif`,
                    textShadow: `0 0 12px ${(settings.display_welcome_color || "#D4A229")}c0, 0 0 28px ${(settings.display_welcome_color || "#D4A229")}73, 0 1px 2px rgba(0,0,0,0.4)`,
                  }}
                >
                  {settings.welcome_title}
                </p>

                {/* Graduate name */}
                <h2
                  className="font-extrabold leading-[1.1] py-1 grad-anim-pop whitespace-nowrap text-center px-2 w-full"
                  style={{
                    color: settings.display_name_color || nameColor,
                    textShadow:
                      `0 0 6px rgba(255,255,255,1), 0 0 18px rgba(255,255,255,1), 0 0 36px rgba(255,255,255,0.95), 0 0 60px ${(settings.display_name_glow_color || "#D4A229")}d9, 0 0 100px ${(settings.display_name_glow_color || "#D4A229")}d9, 0 0 140px hsl(var(--grad-green) / 0.7), 0 2px 6px rgba(0,0,0,0.75)`,
                    animationDelay: "340ms",
                    fontSize: (() => {
                      const fullName = formatNameWithTitle(latest.title, latest.name);
                      const len = Math.max(6, fullName.length);
                      // Smooth tapering: short names large, long names auto-fit without overflow
                      const vw = Math.min(9, Math.max(3.2, 110 / len));
                      const maxRem = len > 28 ? 3.8 : len > 22 ? 4.6 : len > 16 ? 5.4 : 6.4;
                      return `clamp(1.6rem, ${vw}vw, ${maxRem}rem)`;
                    })(),
                  }}
                >
                  {formatNameWithTitle(latest.title, latest.name)}
                </h2>

                {/* Decorative under-name flourish */}
                <div className="flex items-center justify-center gap-2 grad-anim-rise" style={{ animationDelay: "480ms" }} aria-hidden>
                  <span className="h-px w-12 sm:w-20 bg-gradient-to-l from-transparent to-[hsl(var(--grad-gold))]" />
                  <span className="w-1.5 h-1.5 rotate-45 bg-[hsl(var(--grad-gold))]" />
                  <span className="w-2.5 h-2.5 rotate-45 border border-[hsl(var(--grad-gold))]" />
                  <span className="w-1.5 h-1.5 rotate-45 bg-[hsl(var(--grad-gold))]" />
                  <span className="h-px w-12 sm:w-20 bg-gradient-to-r from-transparent to-[hsl(var(--grad-gold))]" />
                </div>

                {/* Thank-you message — premium tribute card */}
                <div
                  className="group/tribute relative max-w-3xl mx-auto grad-anim-rise transition-transform duration-500 hover:-translate-y-1"
                  style={{ animationDelay: "580ms" }}
                >
                  {/* Outer gold glow */}
                  <div
                    className="absolute -inset-1 rounded-2xl opacity-60 group-hover/tribute:opacity-100 transition-opacity duration-500 pointer-events-none blur-xl"
                    style={{
                      background:
                        "linear-gradient(120deg, hsl(var(--grad-gold) / 0.35), transparent 40%, hsl(var(--grad-gold) / 0.35))",
                    }}
                    aria-hidden
                  />
                  <div
                    className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40 transition-shadow duration-500 group-hover/tribute:shadow-[0_25px_60px_-15px_hsl(var(--grad-gold)/0.55)]"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(10,18,42,0.62) 0%, rgba(6,12,32,0.78) 100%)",
                      backdropFilter: "blur(30px) saturate(170%)",
                      WebkitBackdropFilter: "blur(30px) saturate(170%)",
                      border: "1px solid hsl(var(--grad-gold) / 0.45)",
                      boxShadow:
                        "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 40px rgba(212,162,41,0.08)",
                    }}
                  >
                    {/* Shimmer sweep */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.10) 50%, transparent 65%)",
                        backgroundSize: "220% 100%",
                        animation: "shimmer-sweep 6s ease-in-out infinite",
                      }}
                      aria-hidden
                    />
                    {/* Hover-triggered fast shimmer */}
                    <span
                      className="pointer-events-none absolute inset-0 -translate-x-full group-hover/tribute:translate-x-full transition-transform [transition-duration:1200ms] ease-out"
                      style={{
                        background:
                          "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%)",
                      }}
                      aria-hidden
                    />

                    {/* Top & bottom gold/white hairlines */}
                    <span className="absolute top-0 inset-x-10 h-px bg-gradient-to-l from-transparent via-[hsl(var(--grad-gold))] to-transparent opacity-90" />
                    <span className="absolute bottom-0 inset-x-10 h-px bg-gradient-to-l from-transparent via-white/60 to-transparent" />

                    {/* Corner ornaments */}
                    {[
                      "top-2 right-2 border-t border-r",
                      "top-2 left-2 border-t border-l",
                      "bottom-2 right-2 border-b border-r",
                      "bottom-2 left-2 border-b border-l",
                    ].map((pos, i) => (
                      <span
                        key={i}
                        className={`absolute ${pos} w-5 h-5 sm:w-6 sm:h-6 border-[hsl(var(--grad-gold))]/80 rounded-[2px] pointer-events-none`}
                        aria-hidden
                      />
                    ))}

                    {/* Decorative quote glyphs */}
                    <span
                      className="absolute top-3 right-5 text-[hsl(var(--grad-gold))]/40 font-serif select-none pointer-events-none"
                      style={{ fontSize: "3.5rem", lineHeight: 1 }}
                      aria-hidden
                    >
                      ”
                    </span>
                    <span
                      className="absolute bottom-1 left-5 text-[hsl(var(--grad-gold))]/40 font-serif select-none pointer-events-none"
                      style={{ fontSize: "3.5rem", lineHeight: 1 }}
                      aria-hidden
                    >
                      „
                    </span>

                    {/* Content */}
                    <div className="relative px-8 sm:px-12 py-4 sm:py-5 text-center">
                      <p
                        className="leading-loose font-bold"
                        style={{
                          color: settings.display_thanks_color || "#FFFDF5",
                          fontSize: `${settings.display_thanks_size_px || 20}px`,
                          fontFamily: `"${settings.display_thanks_font || "Cairo"}", "Cairo", serif`,
                          textShadow:
                            "0 1px 2px rgba(0,0,0,0.5), 0 0 18px rgba(212,162,41,0.18)",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {settings.thank_you_message}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="space-y-5 relative pt-6">
                <div className="relative inline-block w-20 h-20 sm:w-28 sm:h-28">
                  <div className="absolute inset-0 bg-[hsl(var(--grad-gold))]/30 blur-2xl rounded-full animate-pulse" />
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" style={{ animation: "ring-spin 20s linear infinite" }}>
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#D4A229" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.5" />
                  </svg>
                  <div className="absolute inset-3 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--grad-gold))] to-[hsl(var(--grad-gold-dark))] shadow-xl">
                    <Trophy className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
                  </div>
                </div>
                <h2 className="text-xl sm:text-4xl font-extrabold text-[hsl(var(--grad-cream))] drop-shadow-lg">
                  {ui("أهلاً بكم في")} {settings.event_name}
                </h2>
                <p className="text-sm sm:text-lg font-medium text-[hsl(var(--grad-gold))]">
                  {ui("بانتظار تسجيل أول حضور...")}
                </p>
              </div>
            )}

          </Card>
        </div>

      </main>

      {/* Recent attendees — premium ticker strip */}
      {attendees.length > 0 && (
        <div
          className="relative overflow-hidden py-1.5 sm:py-2 mt-2 sm:mt-3 group/ticker"
          style={{
            background: "transparent",
            borderTop: "1px solid hsl(var(--grad-gold) / 0.4)",
          }}
        >
          {/* Gold top hairline accent */}
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[hsl(var(--grad-gold))] to-transparent" />
          {/* Bottom soft shadow line */}
          <span className="absolute bottom-0 inset-x-0 h-px bg-black/25" />

          {/* Shimmer sweep across the bar */}
          <span
            className="absolute inset-y-0 pointer-events-none"
            style={{
              left: "-30%",
              width: "30%",
              background:
                "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
              animation: "ticker-shimmer 5.5s ease-in-out infinite",
            }}
            aria-hidden
          />

          {/* Fade edges (left/right) — transparent fade so backdrop shows */}
          <span
            className="absolute inset-y-0 right-0 w-24 sm:w-40 pointer-events-none z-[5]"
            style={{ background: "linear-gradient(270deg, rgba(0,0,0,0.35) 0%, transparent 100%)" }}
            aria-hidden
          />
          <span
            className="absolute inset-y-0 left-0 w-16 sm:w-24 pointer-events-none z-[5]"
            style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.35) 0%, transparent 100%)" }}
            aria-hidden
          />

          {/* Header pill */}
          <div
            className="absolute top-1/2 -translate-y-1/2 right-3 sm:right-5 z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full"
            style={{
              background: "linear-gradient(135deg, rgba(10,18,42,0.92), rgba(6,12,32,0.92))",
              border: "1px solid hsl(var(--grad-gold) / 0.6)",
              boxShadow:
                "0 6px 18px -6px rgba(0,0,0,0.6), inset 0 0 12px rgba(212,162,41,0.18)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--grad-gold))] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--grad-gold))]" />
            </span>
            <span className="text-[10px] sm:text-xs font-extrabold tracking-wide text-[hsl(var(--grad-cream))]">
              {ui("آخر الحضور")}
            </span>
            <span className="text-[10px] sm:text-xs font-extrabold text-[hsl(var(--grad-gold))] tabular-nums">
              · {attendees.length}
            </span>
          </div>

          {/* Marquee row — pauses on hover for readability */}
          <div
            className="flex gap-6 sm:gap-10 whitespace-nowrap pr-44 sm:pr-56 group-hover/ticker:[animation-play-state:paused]"
            style={{
              // Scale marquee speed with how many chips are visible so short lists
              // don't fly by and long lists don't crawl. ~3.2s per unique chip, clamped.
              animation: `marquee-rtl ${Math.min(60, Math.max(22, (attendees.slice(0, 12).length || 1) * 3.2 + 14))}s linear infinite`,
            }}
          >
            {(() => {
              const seen = new Set<string>();
              const unique = attendees.filter((a) => {
                const k = (a.phone || a.id || `${a.name}-${a.checked_in_at}`).toString();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              }).slice(0, 12);
              // duplicate only enough times to fill marquee loop smoothly
              const loop = unique.length >= 6 ? [...unique, ...unique] : unique;
              return loop;
            })().map((a, i) => {
              const isQr = normalizeSource(a.source) === "qr";
              const time = new Date(a.checked_in_at);
              const minsAgo = Math.max(0, Math.round((Date.now() - time.getTime()) / 60000));
              const relative = minsAgo < 1 ? ui("الآن") : minsAgo < 60 ? `${ui("قبل")} ${minsAgo} ${ui("د")}` : `${ui("قبل")} ${Math.round(minsAgo / 60)} ${ui("س")}`;
              return (
                <span
                  key={i}
                  className="flex items-center gap-2 px-3 py-1 rounded-full transition-transform hover:scale-[1.04]"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(10,18,42,0.45), rgba(6,12,32,0.55))",
                    border: "1px solid rgba(255,255,255,0.18)",
                    boxShadow:
                      "inset 0 0 0 1px hsl(var(--grad-gold) / 0.12), 0 4px 12px -6px rgba(0,0,0,0.4)",
                  }}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ring-1 ring-white/40 ${
                      isQr ? "bg-[hsl(var(--grad-green-dark))]" : "bg-[hsl(var(--grad-gold-dark))]"
                    }`}
                    style={{ boxShadow: "0 0 10px rgba(212,162,41,0.35)" }}
                  >
                    {isQr ? <QrCode className="h-3 w-3 text-white" /> : <UserCheck className="h-3 w-3 text-white" />}
                  </span>
                  <span className="text-sm sm:text-lg font-extrabold text-[hsl(var(--grad-cream))]">
                    {formatNameWithTitle(a.title, a.name)}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-[hsl(var(--grad-gold))]/70" aria-hidden />
                  <span className="text-[10px] sm:text-xs text-[hsl(var(--grad-gold))] font-bold tabular-nums">
                    {relative}
                  </span>
                </span>
              );
            })}
          </div>

          <style>{`
            @keyframes ticker-shimmer {
              0% { left: -30%; }
              60% { left: 110%; }
              100% { left: 110%; }
            }
          `}</style>
        </div>
      )}

      <footer className="py-3 text-center text-xs text-[hsl(var(--grad-cream))] border-t border-[hsl(var(--grad-gold))]/30 bg-transparent">
        <span className="font-bold">{settings.footer_text}</span> © {new Date().getFullYear()}
      </footer>
      <KioskFullscreenButton />
    </div>
  );
};

/** Premium pill-style stat — icon + top label + bold value with optional unit suffix. */
const PillStat = ({
  icon,
  topLabel,
  valueText,
  suffix,
}: {
  icon?: React.ReactNode;
  topLabel: string;
  valueText: string;
  suffix?: string;
}) => {
  return (
    <div
      className="group relative min-w-0 px-1.5 py-2 text-center transition-all hover:-translate-y-1 hover:bg-[hsl(var(--grad-green))]/10"
      style={{ direction: "rtl" }}
    >
      <span
        className="absolute inset-x-2 top-0 h-[2px] opacity-60"
        style={{ background: "linear-gradient(90deg, transparent, hsl(var(--grad-green)), transparent)" }}
      />
      <div className="grid h-full min-h-[96px] grid-rows-[28px_1fr_20px] place-items-center gap-1 overflow-visible">
        <div
          className="inline-flex items-center justify-center text-[hsl(var(--grad-gold))] drop-shadow-[0_0_12px_hsl(var(--grad-gold)/0.55)] transition-transform group-hover:scale-110 [&_svg]:w-6 [&_svg]:h-6 [&_svg]:stroke-[3.25]"
        >
          {icon}
        </div>
        <div className="flex min-w-0 items-baseline justify-center gap-1 leading-none">
          <span
            className="max-w-full truncate text-[clamp(2.1rem,3.7vw,4.4rem)] font-black tabular-nums"
            style={{
              color: "#5B189A",
              WebkitTextStroke: "1.5px #FFFFFF",
              textShadow: "none",
            }}
          >
            {valueText}
          </span>
          {suffix ? (
            <span
              className="text-sm sm:text-lg font-bold"
              style={{
                color: "#5B189A",
                WebkitTextStroke: "1px #FFFFFF",
                textShadow: "none",
              }}
            >
              {suffix}
            </span>
          ) : null}
        </div>
        <div className="w-full truncate text-[10px] sm:text-xs font-bold text-[hsl(var(--grad-cream))] tracking-normal [text-shadow:0_1px_5px_rgba(0,0,0,0.9)]">
          {topLabel}
        </div>
      </div>
    </div>
  );
};

interface BrandStatTileProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  variant: "green" | "gold";
  trend?: boolean;
}

const BrandStatTile = ({ icon, value, label, variant, trend }: BrandStatTileProps) => {
  const isGreen = variant === "green";
  return (
    <Card
      className={`p-3 sm:p-5 shadow-xl shadow-black/30 relative overflow-hidden group transition-all hover:-translate-y-0.5 bg-transparent backdrop-blur-md ${
        isGreen
          ? "border border-[hsl(var(--grad-green))]/50 ring-1 ring-[hsl(var(--grad-green))]/20"
          : "border border-[hsl(var(--grad-gold))]/50 ring-1 ring-[hsl(var(--grad-gold))]/20"
      }`}
    >
      <div className={`absolute -top-6 -left-6 w-24 h-24 rounded-full ${isGreen ? "bg-[hsl(var(--grad-green))]/15" : "bg-[hsl(var(--grad-gold))]/15"}`} />
      <div className={`absolute -bottom-8 -right-4 w-20 h-20 rounded-full ${isGreen ? "bg-[hsl(var(--grad-green))]/10" : "bg-[hsl(var(--grad-gold))]/10"}`} />
      <span
        className="absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/3 pointer-events-none"
        style={{ animation: "shimmer-sweep 4.5s ease-in-out infinite" }}
      />
      <div className="relative">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2 sm:mb-3 backdrop-blur ring-1 ${
          isGreen
            ? "bg-[hsl(var(--grad-green))]/25 text-[hsl(var(--grad-green))] ring-[hsl(var(--grad-green))]/40"
            : "bg-[hsl(var(--grad-gold))]/25 text-[hsl(var(--grad-gold))] ring-[hsl(var(--grad-gold))]/40"
        }`}>
          {icon}
        </div>
        <div className="flex items-end gap-2">
          <CountUp
            value={value}
            className={`text-4xl sm:text-6xl font-black tabular-nums leading-none drop-shadow-[0_3px_12px_rgba(0,0,0,0.85)] ${
              isGreen ? "text-[hsl(var(--grad-green))]" : "text-[hsl(var(--grad-gold))]"
            }`}
          />
          {trend && value > 0 && (
            <TrendingUp className={`h-5 w-5 mb-2 ${isGreen ? "text-[hsl(var(--grad-green))]" : "text-[hsl(var(--grad-gold))]"}`} />
          )}
        </div>
        <div className="text-[10px] sm:text-xs text-[hsl(var(--grad-cream))]/90 mt-1 font-medium [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">{label}</div>
      </div>
    </Card>
  );
};

/** Compact secondary KPI tile — used in the right-rail grid. */
const MiniStat = ({
  icon,
  value,
  label,
  variant = "green",
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  variant?: "green" | "gold" | "olive";
}) => {
  const palette = {
    green: { iconBg: "bg-[hsl(var(--grad-green))]/20", icon: "text-[hsl(var(--grad-green))]", accent: "bg-[hsl(var(--grad-green))]", label: "text-[hsl(var(--grad-green))]" },
    gold: { iconBg: "bg-[hsl(var(--grad-gold))]/20", icon: "text-[hsl(var(--grad-gold))]", accent: "bg-[hsl(var(--grad-gold))]", label: "text-[hsl(var(--grad-gold))]" },
    olive: { iconBg: "bg-[hsl(var(--grad-green-dark))]/20", icon: "text-[hsl(var(--grad-green))]", accent: "bg-[hsl(var(--grad-green-dark))]", label: "text-[hsl(var(--grad-green))]" },
  }[variant];
  return (
    <Card
      className="p-3 shadow-xl shadow-black/30 border border-white/15 rounded-2xl hover:shadow-2xl transition-all bg-transparent backdrop-blur-md"
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg ${palette.iconBg} ${palette.icon} flex items-center justify-center shrink-0 ring-1 ring-white/10`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <CountUp
            value={value}
            className={`text-3xl font-black tabular-nums block leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] ${palette.label}`}
          />
          <div className={`text-[10px] font-bold mt-1.5 truncate flex items-center gap-1 ${palette.label}`}>
            <span className={`w-1 h-3 rounded-full ${palette.accent}`} />
            {label}
          </div>
        </div>
      </div>
    </Card>
  );
};

/** Polished attendee row for the live "latest arrivals" list. */
const AttendeeRow = ({
  attendee: a,
  index: i,
  isNewest,
}: {
  attendee: Attendee;
  index: number;
  isNewest: boolean;
}) => {
  const { ui } = useLocale();
  const meta = getSourceMeta(a.source);
  const isQr = normalizeSource(a.source) === "qr";
  const time = new Date(a.checked_in_at);
  const minsAgo = Math.max(0, Math.round((Date.now() - time.getTime()) / 60000));
  const relative = minsAgo < 1 ? ui("الآن") : minsAgo < 60 ? `${ui("قبل")} ${minsAgo} ${ui("د")}` : `${ui("قبل")} ${Math.round(minsAgo / 60)} ${ui("س")}`;
  return (
    <div
      className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all ${
        isNewest
          ? "bg-gradient-to-l from-[hsl(var(--grad-green))]/30 via-[hsl(var(--grad-green-ink))]/70 to-[hsl(var(--grad-gold))]/25 border-[hsl(var(--grad-gold))]/60 shadow-lg shadow-[hsl(var(--grad-green))]/20 ring-1 ring-[hsl(var(--grad-gold))]/40"
          : "bg-[hsl(var(--grad-green-ink))]/55 border-white/15 hover:bg-[hsl(var(--grad-green-ink))]/70"
      }`}
      style={{ animation: "fade-in 0.4s ease-out both", animationDelay: `${i * 40}ms` }}
    >
      {isNewest && (
        <span className="absolute -top-2 right-3 text-[9px] font-bold bg-gradient-to-l from-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))] text-white px-2 py-0.5 rounded-full shadow z-10">
          {ui("جديد")}
        </span>
      )}
      <div className="relative shrink-0">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-base font-extrabold shadow ${
          isQr ? "bg-gradient-to-br from-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))]" : "bg-gradient-to-br from-[hsl(var(--grad-gold))] to-[hsl(var(--grad-gold-dark))]"
        }`}>
          {isNewest && <span className="absolute inset-0 rounded-xl ring-2 ring-[hsl(var(--grad-gold))] animate-ping opacity-60" />}
          {(a.title || a.name).charAt(0)}
        </div>
        {/* Source corner badge — stronger visual distinction for QR vs Direct */}
        <span
          className={`absolute -bottom-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-white ring-2 ring-white shadow ${
            isQr ? "bg-[hsl(var(--grad-green-dark))]" : "bg-[hsl(var(--grad-gold-dark))]"
          }`}
          title={meta.label}
        >
          {isQr ? <QrCode className="h-2.5 w-2.5" /> : <UserCheck className="h-2.5 w-2.5" />}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-base text-[hsl(var(--grad-cream))] truncate drop-shadow">{formatNameWithTitle(a.title, a.name)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold inline-flex items-center gap-1 ${
            isQr ? "bg-[hsl(var(--grad-green))]/20 text-[hsl(var(--grad-green))] border-[hsl(var(--grad-green))]/40" : "bg-[hsl(var(--grad-gold))]/20 text-[hsl(var(--grad-gold))] border-[hsl(var(--grad-gold))]/40"
          }`}>
            {isQr ? <QrCode className="h-2.5 w-2.5" /> : <UserCheck className="h-2.5 w-2.5" />}
            {meta.label}
          </span>
          <span className="text-[10px] text-[hsl(var(--grad-gold))]/90 font-bold inline-flex items-center gap-1">
            <Timer className="h-2.5 w-2.5" />
            {relative}
          </span>
        </div>
      </div>
      <div className="text-left shrink-0">
        <div className="text-sm text-[hsl(var(--grad-green))] tabular-nums font-extrabold">
          {time.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true })}
        </div>
        <div className="text-[10px] text-[hsl(var(--grad-cream))]/60 tabular-nums mt-0.5 font-bold">#{i + 1}</div>
      </div>
    </div>
  );
};

/** Realtime connection status pill — visible "LIVE" / "OFFLINE" cue with last-update timer. */
function LiveStatusBadge({
  status,
  lastEventAt,
  now,
}: {
  status: "connecting" | "live" | "offline";
  lastEventAt: Date | null;
  now: Date;
}) {
  const { ui } = useLocale();
  const since = lastEventAt
    ? (() => {
        const s = Math.max(0, Math.round((now.getTime() - lastEventAt.getTime()) / 1000));
        if (s < 60) return `${ui("قبل")} ${s} ${ui("ث")}`;
        const m = Math.round(s / 60);
        return m < 60 ? `${ui("قبل")} ${m} ${ui("د")}` : `${ui("قبل")} ${Math.round(m / 60)} ${ui("س")}`;
      })()
    : ui("بانتظار حدث");
  if (status === "offline") {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full bg-red-500/15 border border-red-400/40 text-red-200">
        <WifiOff className="h-3.5 w-3.5" />
        <span className="text-[11px] font-extrabold">{ui("غير متصل")}</span>
      </div>
    );
  }
  const isLive = status === "live";
  const accent = isLive ? "grad-green" : "grad-gold";
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span
          className={`absolute inset-0 rounded-full bg-[hsl(var(--${accent}))] ${isLive ? "animate-ping opacity-75" : ""}`}
        />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full bg-[hsl(var(--${accent}))] shadow-[0_0_10px_hsl(var(--${accent}))]`} />
      </span>
      <span className={`text-[11px] font-extrabold tracking-wide text-[hsl(var(--${accent}))] uppercase`}>
        {isLive ? ui("مباشر") : ui("يتصل…")}
      </span>
      {isLive && (
        <span className="text-[10px] tabular-nums text-[hsl(var(--grad-cream))]/75 pr-2 mr-1 border-r border-[hsl(var(--grad-gold))]/30">
          {since}
        </span>
      )}
    </div>
  );
}

export default EventLiveDisplay;
