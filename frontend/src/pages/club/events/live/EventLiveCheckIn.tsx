import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { apiError } from '@/lib/api';
import { Smartphone, ScanLine, UserPlus, CheckCircle2, Sparkles, Star, Heart, QrCode, Printer, ListChecks, User, Phone, BadgeCheck, CalendarDays, Clock, AlertCircle } from "lucide-react";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import {
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useEventSettings } from "./useEventSettings";
import { useViewerRole } from "./useViewerRole";
import { EventLiveBackdrop } from "./EventLiveBackdrop";
import { TitleSelect } from "./TitleSelect";
import { formatNameWithTitle } from "./titleUtils";
import { EventLiveTheme, gradBgStyle } from "./EventLiveTheme";
import { AttendeesManagerDialog } from "./AttendeesManagerDialog";
import { resolveEventLogo, APP_LIVE_THEME } from "./live-brand";
import { EventLiveFloatingNav } from "./EventLiveFloatingNav";
import {
  EGYPT_PHONE_LABEL,
  EGYPT_PHONE_PLACEHOLDER,
  livePhoneValidationError,
  normalizeLivePhone,
} from "./live-phone";
import { useLocale } from '@/store/locale';

const EventLiveCheckIn = () => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const basePath = useEventLiveBasePath();
  const { settings } = useEventSettings({ live: true });
  const { role } = useViewerRole();
    const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastName, setLastName] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const showPrint = role === "staff" ? settings.btn_print_staff : settings.btn_print_guest;

  const guestUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${basePath}/guest`;
  }, []);

  const toCssColor = (v?: string, fallback: string = APP_LIVE_THEME.accentPrimary) => {
    if (!v) return fallback;
    const t = v.trim();
    if (t.startsWith("#") || t.startsWith("rgb") || t.startsWith("hsl")) return t;
    return `hsl(${t})`;
  };
  // Derive a dark variant of the brand primary for QR cells (high contrast on white)
  const qrColor = useMemo(() => {
    const v = settings.primary_color?.trim();
    if (v && /^\d/.test(v)) {
      const parts = v.split(/\s+/);
      if (parts.length >= 3) {
        const h = parts[0];
        const s = parts[1];
        const l = Math.max(12, parseInt(parts[2]) - 32);
        return `hsl(${h} ${s} ${l}%)`;
      }
    }
    return "#1B6FA8";
  }, [settings.primary_color]);
  const ringColor = toCssColor(settings.primary_color, APP_LIVE_THEME.accentPrimary);
  const accentColor = toCssColor(settings.primary_color, APP_LIVE_THEME.accentGold);

  // Auto-size QR based on viewport (capped for screen layout)
  const [qrSize, setQrSize] = useState(260);
  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const base = Math.min(vw * (vw < 768 ? 0.7 : 0.35), vh * 0.55);
      setQrSize(Math.max(200, Math.min(420, Math.round(base))));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const handlePrint = () => window.print();

  // Live clock for header
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const dateStr = now.toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  const resetDialog = () => {
    setName("");
    setPhone("");
    setTitle("");
    setLastName(null);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: { name?: string; phone?: string } = {};
    if (!name.trim()) next.name = ui("الرجاء إدخال الاسم");
    if (livePhoneValidationError(phone)) next.phone = livePhoneValidationError(phone)!;
    setErrors(next);
    if (next.name || next.phone) return;
    setSubmitting(true);
    const normalizedPhone = normalizeLivePhone(phone);
    try {
      const existing = await liveApi.getByPhone(normalizedPhone);
      if (existing) {
        setSubmitting(false);
        const at = existing.checkedInAt ?? existing.checked_in_at ?? existing.createdAt;
        const t = new Date(at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
        toast.error(`${ui("هذا الرقم مسجل باسم")} ${existing.title ? `${existing.title} / ${existing.name}` : existing.name} ${ui("في الساعة")} ${t}`);
        return;
      }
      await liveApi.guestCheckin({
        name: name.trim(),
        phone: normalizedPhone,
        title: title.trim() || null,
        source: 'direct',
      });
      setSubmitting(false);
      setLastName(formatNameWithTitle(title, name.trim()));
      setName("");
      setPhone("");
      setTitle("");
      setTimeout(() => {
        setOpen(false);
        setLastName(null);
      }, 4500);
    } catch (err) {
      setSubmitting(false);
      toast.error(apiError(err, ui('تعذر التسجيل')));
    }
  };

  return (
    <div
      dir="rtl"
      className="relative flex min-h-screen flex-col overflow-hidden text-[hsl(var(--grad-cream))]"
      style={gradBgStyle()}
    >
      <EventLiveTheme />
      <EventLiveBackdrop screen="checkin" live />

      {/* قائمة ثابتة واضحة للتنقل */}
      <EventLiveFloatingNav current="checkin" actionsLabel={ui("إجراءات المحطة")}>
        <DropdownMenuItem
          onSelect={() => setManageOpen(true)}
          className="gap-2 cursor-pointer focus:bg-[hsl(var(--grad-gold))]/15 focus:text-[hsl(var(--grad-cream))]"
        >
          <ListChecks className="h-4 w-4 text-[hsl(var(--grad-gold))]" />
          {ui("سجل الحضور")}
        </DropdownMenuItem>
        {showPrint && (
          <DropdownMenuItem
            onSelect={() => handlePrint()}
            className="gap-2 cursor-pointer focus:bg-[hsl(var(--grad-gold))]/15 focus:text-[hsl(var(--grad-cream))]"
          >
            <Printer className="h-4 w-4 text-[hsl(var(--grad-green))]" />
            {ui("طباعة الملصق")}
          </DropdownMenuItem>
        )}
      </EventLiveFloatingNav>

      <style>{`
        @keyframes ck-ring { to { transform: rotate(360deg); } }
        @keyframes ck-shimmer {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }
        @keyframes ck-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes ck-scan {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(260px); opacity: 0; }
        }
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          html, body { background: #fff !important; }
          .ck-screen { display: none !important; }
          .ck-print { display: block !important; }
        }
        .ck-print { display: none; }
      `}</style>

      {/* Brand ambient background (kept minimal so the backdrop image stays fully visible) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="ckdots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="#558B2F" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ckdots)" />
        </svg>
      </div>

      {/* Header */}
      <header className="ck-screen relative z-20 border-b border-[hsl(var(--grad-gold))]/30 bg-transparent shadow-lg shadow-black/30">
        <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 pl-24 sm:pl-28">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-[hsl(var(--grad-green))]/25 blur-xl rounded-full animate-pulse" />
              <img
                src={resolveEventLogo(settings.logo_url)}
                alt={ui("شعار Noamany")}
                className="relative h-16 sm:h-24 w-auto object-contain"
                style={{ animation: "ck-float 4s ease-in-out infinite" }}
              />
            </div>
            <div className="border-r-2 border-[hsl(var(--grad-gold))]/40 pr-2 sm:pr-4 min-w-0">
              <h1 className="text-sm sm:text-xl lg:text-2xl font-extrabold text-[hsl(var(--grad-cream))] leading-tight break-words [overflow-wrap:anywhere]">{settings.event_name}</h1>
              <p className="text-[10px] sm:text-xs text-[hsl(var(--grad-gold))] font-medium mt-0.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--grad-green))] animate-pulse shrink-0" />
                <span className="truncate">{ui("ملصق التسجيل الذاتي بالـ QR")}</span>
              </p>
            </div>
          </div>
          {/* Date/Time pill */}
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full border border-[hsl(var(--grad-gold))]/40 bg-transparent text-[hsl(var(--grad-cream))] shrink-0">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <CalendarDays className="h-3.5 w-3.5 text-[hsl(var(--grad-gold))]" />
              {dateStr}
            </span>
            <span className="h-3 w-px bg-[hsl(var(--grad-gold))]/40" />
            <span className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
              <Clock className="h-3.5 w-3.5 text-[hsl(var(--grad-gold))]" />
              {timeStr}
            </span>
          </div>
        </div>
      </header>
      <AttendeesManagerDialog open={manageOpen} onOpenChange={setManageOpen} />

      <main className="ck-screen flex-1 flex items-start justify-center p-3 sm:p-6 pt-6 sm:pt-10">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-8 sm:gap-12 items-center">
          {/* Welcome heading — full width on top */}
          <div className="order-1 md:col-span-2 relative text-center">
            <Sparkles className="absolute -top-2 right-4 h-5 w-5 text-[hsl(var(--grad-gold))] animate-pulse" />
            <Sparkles className="absolute -top-2 left-4 h-4 w-4 text-[hsl(var(--grad-gold))]/70 animate-pulse" style={{ animationDelay: "0.8s" }} />
            <h2
              className="pb-4 whitespace-nowrap"
              style={{
                fontFamily: `'${settings.hero_font_family || settings.hero_font || "Mirza"}','Amiri',serif`,
                fontWeight: 700,
                fontStyle: settings.hero_italic ? "italic" : "normal",
                fontSize: `clamp(40px, ${Math.max(40, Math.min(240, settings.hero_size_px || 128)) / 16}vw, ${Math.max(40, Math.min(240, settings.hero_size_px || 128))}px)`,
                color: settings.hero_color || "#F08AB0",
                lineHeight: 1.4,
                letterSpacing: "0.02em",
                textShadow: `0 3px 8px rgba(0,0,0,0.8), 0 0 22px ${settings.hero_color || "#F08AB0"}66`,
              }}
            >
              {settings.hero_text || ui("أهلاً وسهلاً")}
            </h2>
            <div className="mt-1 flex items-center justify-center gap-3">
              <span className="h-px w-16 bg-gradient-to-l to-transparent" style={{ backgroundImage: `linear-gradient(to left, ${settings.hero_color || "#F08AB0"}99, transparent)` }} />
              <p className="text-2xl sm:text-3xl font-bold tracking-[0.25em]" style={{ color: settings.hero_subtitle_color || "#FFFDF5", textShadow: "0 2px 5px rgba(0,0,0,0.7)" }}>{settings.hero_subtitle_text || ui("بضيوفنا الكرام")}</p>
              <Heart className="h-4 w-4" style={{ color: settings.hero_color || "#F08AB0", fill: `${settings.hero_color || "#F08AB0"}66` }} />
              <span className="h-px w-16 bg-gradient-to-r to-transparent" style={{ backgroundImage: `linear-gradient(to right, ${settings.hero_color || "#F08AB0"}99, transparent)` }} />
            </div>
          </div>

          {/* Intro / welcome paragraph — full width, auto-sized to text length */}
          {(() => {
            const len = ((settings.intro_highlight || "") + " " + (settings.intro_text || "")).trim().length;
            // Auto tier: short → large/centered/loose, long → smaller/justified/tight
            const tier = len < 120 ? "lg" : len < 260 ? "md" : len < 420 ? "sm" : "xs";
            const fontSize =
              tier === "lg" ? "clamp(18px, 1.7vw, 26px)"
              : tier === "md" ? "clamp(16px, 1.45vw, 22px)"
              : tier === "sm" ? "clamp(14px, 1.2vw, 19px)"
              : "clamp(13px, 1.05vw, 17px)";
            const leading = tier === "lg" ? 2 : tier === "md" ? 1.85 : tier === "sm" ? 1.7 : 1.6;
            const padY = tier === "lg" ? "py-5" : tier === "md" ? "py-4" : "py-3";
            const padX = tier === "lg" ? "px-6" : "px-5";
            const maxW = tier === "lg" ? "max-w-3xl" : tier === "md" ? "max-w-4xl" : "max-w-5xl";
            const align = tier === "lg" || tier === "md" ? "text-center" : "text-justify";
            return (
              <div className={`order-2 md:col-span-2 relative rounded-2xl bg-[hsl(var(--grad-green-ink))]/20 backdrop-blur-sm border border-[hsl(var(--grad-gold))]/40 ${padX} ${padY} shadow-lg shadow-black/30 ${maxW} mx-auto w-full`}>
                <span aria-hidden className="absolute top-0 right-5 left-5 h-px bg-gradient-to-l from-transparent via-[hsl(var(--grad-gold))]/70 to-transparent" />
                <p
                  className={`text-white font-extrabold tracking-[0.01em] ${align}`}
                  style={{
                    fontSize,
                    lineHeight: leading,
                    textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 14px rgba(0,0,0,0.5)",
                  }}
                >
                  <span className="font-black" style={{ color: "#D4A229", textShadow: "0 0 14px rgba(212,162,41,0.55), 0 2px 6px rgba(0,0,0,0.85)" }}>{settings.intro_highlight}</span>
                  {" "}{settings.intro_text}
                </p>
              </div>
            );
          })()}

          {/* QR card */}
          <div className="relative flex flex-col items-center gap-5 order-3 md:order-4 pt-6">
            <div className="relative">
              {/* Rotating brand rings around QR */}
              <svg className="absolute -inset-6 w-[calc(100%+3rem)] h-[calc(100%+3rem)] pointer-events-none" viewBox="0 0 100 100" style={{ animation: "ck-ring 28s linear infinite" }}>
                <circle cx="50" cy="50" r="48" fill="none" stroke={ringColor} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.4" />
              </svg>

              <div className="relative p-4 sm:p-7 bg-white rounded-[2rem] border-2 border-[hsl(var(--grad-green))]/40 shadow-2xl shadow-black/40 ring-1 ring-white/40">
                <div className="relative overflow-hidden rounded-2xl">
                  {/* Animated scan line */}
                  <div
                    className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[hsl(var(--grad-gold))] to-transparent rounded-full pointer-events-none z-10"
                    style={{ animation: "ck-scan 2.8s ease-in-out infinite", top: "0px" }}
                  />
                  <QRCodeSVG
                    value={guestUrl}
                    size={qrSize}
                    level="H"
                    marginSize={2}
                    fgColor={qrColor}
                    bgColor="#ffffff"
                    className="block"
                    style={{ width: qrSize, height: qrSize }}
                  />
                </div>
                {/* Corner brackets */}
                <span className="absolute top-2 right-2 w-5 h-5 border-t-[3px] border-r-[3px] border-[hsl(var(--grad-green))] rounded-tr-lg" />
                <span className="absolute top-2 left-2 w-5 h-5 border-t-[3px] border-l-[3px] border-[hsl(var(--grad-green))] rounded-tl-lg" />
                <span className="absolute bottom-2 right-2 w-5 h-5 border-b-[3px] border-r-[3px] border-[hsl(var(--grad-green))] rounded-br-lg" />
                <span className="absolute bottom-2 left-2 w-5 h-5 border-b-[3px] border-l-[3px] border-[hsl(var(--grad-green))] rounded-bl-lg" />

                <div
                  className="absolute -top-5 left-1/2 -translate-x-1/2 text-white text-base sm:text-lg font-black px-6 py-2.5 sm:px-8 sm:py-3 rounded-full flex items-center gap-2 shadow-2xl ring-4 ring-white whitespace-nowrap z-20 tracking-wide"
                  style={{ background: accentColor, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  <ScanLine className="h-4 w-4 animate-pulse" />
                  {ui("امسح للتسجيل")}
                </div>
              </div>
            </div>

            <div className="w-full max-w-sm text-center">
              <p className="text-xs sm:text-sm text-[hsl(var(--grad-cream))]/90 mb-2 font-medium flex items-center justify-center gap-2">
                <span className="inline-block h-px w-8 bg-[hsl(var(--grad-gold))]/50" />
                {ui("أو قم بالتسجيل مباشرة من هذه الشاشة")}
                <span className="inline-block h-px w-8 bg-[hsl(var(--grad-gold))]/50" />
              </p>
              <Button
                onClick={() => { resetDialog(); setOpen(true); }}
                className="w-full h-12 hover:opacity-90 text-white font-black text-base shadow-xl rounded-full relative overflow-hidden ring-2 ring-white/40 tracking-wide"
                style={{ background: accentColor, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
              >
                <span
                  className="absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent w-1/4 pointer-events-none"
                  style={{ animation: "ck-shimmer 3.5s ease-in-out infinite" }}
                />
                <UserPlus className="h-4 w-4 ml-2" />
                {ui("تسجيل مباشر (يدوي)")}
              </Button>
            </div>
          </div>

          {/* Steps column */}
          <div className="relative space-y-5 sm:space-y-6 text-center md:text-right order-4 md:order-3">
            <ol className="space-y-2.5">
              {(settings.checkin_steps || []).map((step, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-full bg-[hsl(var(--grad-green-ink))]/20 backdrop-blur-sm border border-[hsl(var(--grad-gold))]/40 px-4 py-2.5 shadow-lg shadow-black/30 group"
                >
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--grad-gold))] to-[hsl(var(--grad-gold-dark))] text-white text-sm font-extrabold flex items-center justify-center shrink-0 shadow-md shadow-[hsl(var(--grad-gold))]/40 ring-2 ring-white/20 group-hover:scale-110 transition-transform">
                    {i + 1}
                  </span>
                  <span className="text-white font-extrabold text-sm sm:text-base flex-1 text-right" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.5)" }}>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Thank-you card — full width across both columns, forced to bottom */}
          <div className="order-4 md:col-span-2 relative overflow-hidden rounded-2xl border border-[hsl(var(--grad-gold))]/40 bg-[hsl(var(--grad-green-ink))]/20 backdrop-blur-sm p-4 sm:p-5 text-center shadow-xl shadow-black/30">
            <Heart className="absolute -top-3 -left-3 h-20 w-20 text-[hsl(var(--grad-gold))]/10" />
            <Heart className="absolute -bottom-3 -right-3 h-20 w-20 text-[hsl(var(--grad-gold))]/10" />
            <div className="relative flex items-center justify-center gap-3 flex-wrap">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(var(--grad-gold))] to-[hsl(var(--grad-gold-dark))] text-white shrink-0 shadow-lg shadow-[hsl(var(--grad-gold))]/40 ring-2 ring-white/20">
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="font-black text-base sm:text-lg" style={{ color: "#D4A229", textShadow: "0 0 14px rgba(212,162,41,0.55), 0 2px 6px rgba(0,0,0,0.85)" }}>{settings.thank_title}</p>
            </div>
            <p className="relative mt-2 text-sm sm:text-base text-white font-bold leading-relaxed max-w-4xl mx-auto" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.5)" }}>
              {settings.thank_body}
            </p>
          </div>
        </div>
      </main>

      <footer
        className="ck-screen py-3 text-center text-base md:text-lg font-extrabold text-white border-t border-[hsl(var(--grad-gold))]/50 bg-transparent tracking-wide"
        style={{
          color: "#FFFDF5",
          WebkitTextStroke: "0.4px rgba(0,0,0,0.55)",
          textShadow: "0 2px 6px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.7), 0 0 22px rgba(212,162,41,0.45)",
        }}
      >
        <span className="font-black">{settings.footer_text}</span>
        <span className="mx-2 text-[hsl(var(--grad-gold))]">©</span>
        <span className="font-black">{new Date().getFullYear()}</span>
      </footer>

      {/* Print-only poster (A4 portrait, museum-grade certificate look) */}
      <div className="ck-print" aria-hidden>
        <div
          dir="rtl"
          style={{
            position: "relative",
            width: "182mm",
            minHeight: "269mm",
            margin: "0 auto",
            padding: "14mm 12mm",
            color: "#2E4D1F",
            background:
              "radial-gradient(ellipse at top, #FFFDF5 0%, #FBF5E4 60%, #F6ECCB 100%)",
            fontFamily: "inherit",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {/* Double gold certificate frame */}
          <div style={{ position: "absolute", inset: "6mm", border: "2.5pt solid #D4A229", borderRadius: 14, pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: "9mm", border: "0.6pt solid #D4A229", borderRadius: 10, pointerEvents: "none" }} />

          {/* Top + bottom green ribbons */}
          <div style={{ position: "absolute", top: "6mm", left: "6mm", right: "6mm", height: 5, background: "linear-gradient(90deg,#558B2F,#7CB342,#558B2F)", borderRadius: "14px 14px 0 0" }} />
          <div style={{ position: "absolute", bottom: "6mm", left: "6mm", right: "6mm", height: 5, background: "linear-gradient(90deg,#558B2F,#7CB342,#558B2F)", borderRadius: "0 0 14px 14px" }} />

          {/* Corner medallions */}
          {[
            { top: "3mm", right: "3mm" },
            { top: "3mm", left: "3mm" },
            { bottom: "3mm", right: "3mm" },
            { bottom: "3mm", left: "3mm" },
          ].map((pos, i) => (
            <svg key={i} viewBox="0 0 40 40" width="22" height="22" style={{ position: "absolute", color: "#D4A229", ...pos }}>
              <path d="M20 4 L24 16 L36 20 L24 24 L20 36 L16 24 L4 20 L16 16 Z" fill="currentColor" />
              <circle cx="20" cy="20" r="3" fill="#558B2F" />
            </svg>
          ))}

          {/* Header */}
          <div style={{ textAlign: "center", paddingTop: 14 }}>
            {resolveEventLogo(settings.logo_url) && (
              <img
                src={resolveEventLogo(settings.logo_url)}
                alt={ui("شعار Noamany")}
                style={{ height: 78, margin: "0 auto 10px", display: "block" }}
              />
            )}
            <div
              style={{
                display: "inline-block",
                fontSize: 11,
                letterSpacing: 6,
                color: "#D4A229",
                fontWeight: 800,
                padding: "4px 14px",
                border: "1px solid #D4A229",
                borderRadius: 999,
                marginBottom: 10,
              }}
            >
              {ui("تسجيل الحضور الذاتي")}
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: "#2E4D1F", margin: 0, lineHeight: 1.15 }}>
              {settings.event_name}
            </h1>

            {/* Decorative divider */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, color: "#D4A229" }}>
              <span style={{ height: 1, width: 70, background: "linear-gradient(90deg,transparent,#D4A229)" }} />
              <span style={{ display: "inline-block", width: 6, height: 6, background: "#D4A229", transform: "rotate(45deg)" }} />
              <span style={{ display: "inline-block", width: 9, height: 9, border: "1px solid #D4A229", transform: "rotate(45deg)" }} />
              <span style={{ display: "inline-block", width: 6, height: 6, background: "#D4A229", transform: "rotate(45deg)" }} />
              <span style={{ height: 1, width: 70, background: "linear-gradient(-90deg,transparent,#D4A229)" }} />
            </div>
          </div>

          {/* QR card */}
          <div style={{ textAlign: "center", marginTop: 22 }}>
            <div
              style={{
                display: "inline-block",
                position: "relative",
                padding: 18,
                background: "#FFFFFF",
                border: "2pt solid #7CB342",
                borderRadius: 22,
                boxShadow: "0 0 0 6px rgba(212,162,41,0.18)",
              }}
            >
              {/* Inner corner ticks */}
              {[
                { top: 6, right: 6, borderTop: "2pt solid #D4A229", borderRight: "2pt solid #D4A229" },
                { top: 6, left: 6, borderTop: "2pt solid #D4A229", borderLeft: "2pt solid #D4A229" },
                { bottom: 6, right: 6, borderBottom: "2pt solid #D4A229", borderRight: "2pt solid #D4A229" },
                { bottom: 6, left: 6, borderBottom: "2pt solid #D4A229", borderLeft: "2pt solid #D4A229" },
              ].map((s, i) => (
                <span key={i} style={{ position: "absolute", width: 14, height: 14, borderRadius: 3, ...s }} />
              ))}
              <QRCodeSVG
                value={guestUrl}
                size={460}
                level="H"
                marginSize={1}
                fgColor="#2E4D1F"
                bgColor="#ffffff"
              />
            </div>

            <div
              style={{
                marginTop: 16,
                display: "inline-block",
                padding: "8px 22px",
                fontSize: 22,
                fontWeight: 900,
                color: "#FFFDF5",
                background: "linear-gradient(90deg,#558B2F,#7CB342)",
                borderRadius: 999,
                boxShadow: "0 2px 0 #2E4D1F",
              }}
            >
              {ui("امسح الرمز لتسجيل حضورك")}
            </div>
          </div>

          {/* Instructions — 3 cards in a row */}
          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            {[
              { n: "١", t: ui("افتح الكاميرا"), d: ui("وجّه كاميرا الجوال نحو الرمز") },
              { n: "٢", t: ui("افتح الرابط"), d: ui("اضغط الرابط الظاهر تلقائياً") },
              { n: "٣", t: ui("أكّد الحضور"), d: ui("أدخل اسمك ورقم جوالك") },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  padding: "12px 10px 10px",
                  background: "#FFFFFF",
                  border: "1pt solid #7CB342",
                  borderRadius: 12,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    margin: "0 auto 6px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#D4A229,#A8801F)",
                    color: "#FFFDF5",
                    fontWeight: 900,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 0 3px rgba(212,162,41,0.18)",
                  }}
                >
                  {s.n}
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#2E4D1F" }}>{s.t}</div>
                <div style={{ fontSize: 10, color: "#558B2F", marginTop: 3, lineHeight: 1.35 }}>{s.d}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              position: "absolute",
              bottom: "10mm",
              left: "12mm",
              right: "12mm",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 10,
              color: "#558B2F",
              paddingTop: 6,
              borderTop: "1px dashed #D4A229",
            }}
          >
            <span style={{ fontWeight: 800 }}>{settings.footer_text}</span>
            <span style={{ color: APP_LIVE_THEME.accentGold, fontWeight: 800, letterSpacing: 2 }}>Noamany</span>
            <span style={{ fontWeight: 800 }}>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
        <DialogContent dir="rtl" className="sm:max-w-lg p-0 overflow-hidden border-0 bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)]">
          {/* Branded header band */}
          <div className="relative px-7 pt-6 pb-5" style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor} 60%, ${toCssColor(settings.secondary_color, "#D4A229")} 100%)` }}>
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.6), transparent 55%)" }} />
            <div className="absolute -bottom-px left-0 right-0 h-px bg-[#D4A229]/70" />
            <DialogHeader className="relative">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md ring-1 ring-white/40 flex items-center justify-center shadow-lg">
                  <BadgeCheck className="h-6 w-6 text-white" />
                </div>
                <div className="text-right">
                  <DialogTitle className="text-white text-xl font-extrabold tracking-tight leading-tight">
                    {ui("تسجيل حضور مباشر")}
                  </DialogTitle>
                  <p className="text-white/85 text-xs font-medium mt-0.5">{ui("يرجى تعبئة بياناتك للترحيب بكم")}</p>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="px-7 py-6 bg-white">
          {!lastName ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-slate-800 font-bold text-sm flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" style={{ color: accentColor }} />
                  {ui("اللقب")}
                </Label>
                <TitleSelect value={title} onChange={setTitle} triggerClassName="h-12 text-base border-2 border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white transition-colors" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m_name" className="text-slate-800 font-bold text-sm flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" style={{ color: accentColor }} />
                  {ui("الاسم الكامل")}
                </Label>
                <Input
                  id="m_name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }}
                  autoFocus
                  placeholder={ui("مثال: محمد بن عبدالله")}
                  className={`h-12 text-base border-2 rounded-xl bg-slate-50/60 focus:bg-white transition-colors placeholder:text-slate-400 ${errors.name ? "border-red-400 focus:border-red-500" : "border-slate-200"}`}
                  style={{ outlineColor: accentColor }}
                />
                <div className="min-h-[22px] mt-1.5">
                  {errors.name && (
                    <p role="alert" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700 bg-red-50/90 border border-red-200 rounded-lg px-2.5 py-1 leading-snug break-words max-w-full animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{errors.name}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m_phone" className="text-slate-800 font-bold text-sm flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" style={{ color: accentColor }} />
                  {EGYPT_PHONE_LABEL}
                </Label>
                <Input
                  id="m_phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors({ ...errors, phone: undefined }); }}
                  placeholder={EGYPT_PHONE_PLACEHOLDER}
                  dir="ltr"
                  className={`h-12 text-base text-center tabular-nums font-bold tracking-wider border-2 rounded-xl bg-slate-50/60 focus:bg-white transition-colors placeholder:text-slate-400 placeholder:font-normal ${errors.phone ? "border-red-400 focus:border-red-500" : "border-slate-200"}`}
                />
                <div className="min-h-[22px] mt-1.5">
                  {errors.phone && (
                    <p role="alert" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700 bg-red-50/90 border border-red-200 rounded-lg px-2.5 py-1 leading-snug break-words max-w-full animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{errors.phone}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2.5 pt-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-12 rounded-xl text-white font-extrabold text-base shadow-lg hover:opacity-95 hover:shadow-xl transition-all relative overflow-hidden ring-1 ring-white/30"
                  style={{ background: accentColor, boxShadow: `0 10px 24px -8px ${accentColor}` }}
                >
                  <span
                    className="absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent w-1/4 pointer-events-none"
                    style={{ animation: "ck-shimmer 3.5s ease-in-out infinite" }}
                  />
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                  {submitting ? ui("جاري التسجيل...") : ui("تأكيد الحضور")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-12 px-5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold">
                  {ui("إلغاء")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-5 py-2 animate-in fade-in zoom-in-95 duration-500">
              <div className="relative inline-block w-28 h-28">
                <div className="absolute inset-0 blur-2xl rounded-full animate-pulse" style={{ background: `${accentColor}50` }} />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" style={{ animation: "ck-ring 16s linear infinite" }}>
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#D4A229" strokeWidth="1.5" strokeDasharray="3 5" opacity="0.65" />
                </svg>
                <div
                  className="absolute inset-3 inline-flex items-center justify-center rounded-full shadow-xl"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${toCssColor(settings.secondary_color, "#D4A229")})`, boxShadow: `0 18px 40px -10px ${accentColor}` }}
                >
                  <CheckCircle2 className="h-12 w-12 text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                  <Sparkles className="h-3 w-3" style={{ color: accentColor }} />
                  {settings.welcome_title}
                </div>
                <h2 className="text-3xl font-extrabold leading-tight" style={{ color: accentColor }}>
                  {lastName}
                </h2>
              </div>
              <div className="relative rounded-2xl p-5 border bg-gradient-to-b from-[#FFFDF5] to-white" style={{ borderColor: "#D4A22955" }}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full bg-white border flex items-center gap-1.5 shadow-sm" style={{ borderColor: "#D4A22988" }}>
                  <Heart className="h-3.5 w-3.5" style={{ color: "#D4A229" }} fill="#D4A229" />
                  <span className="text-xs font-extrabold" style={{ color: "#8a6a18" }}>{ui("شكراً لحضورك")}</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-sm font-medium mt-2">
                  {settings.thank_you_message}
                </p>
              </div>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventLiveCheckIn;
