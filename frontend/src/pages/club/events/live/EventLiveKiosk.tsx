import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { apiError } from '@/lib/api';
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import {
  ArrowRight,
  PartyPopper,
  Phone,
  User,
  Sparkles,
  Heart,
  Star,
  Award,
  CheckCircle2,
  Delete,
  Send,
  RotateCcw,
} from "lucide-react";
import { useEventSettings } from "./useEventSettings";
import { KioskFullscreenButton } from "./KioskFullscreenButton";
import { EventLiveBackdrop } from "./EventLiveBackdrop";
import { TitleSelect } from "./TitleSelect";
import { formatNameWithTitle } from "./titleUtils";
import { EventLiveTheme, gradBgStyle } from "./EventLiveTheme";
import { resolveEventLogo, APP_LIVE_THEME } from "./live-brand";
import {
  EGYPT_PHONE_LABEL,
  EGYPT_PHONE_PLACEHOLDER,
  EGYPT_PHONE_MAX_LEN,
  isValidLivePhone,
  normalizeLivePhone,
} from "./live-phone";
import { EventLiveNavMenu } from "./EventLiveNavMenu";
import { useLocale } from '@/store/locale';

/** Animated confetti burst with brand palette. */
const Confetti = ({ trigger }: { trigger: number }) => {
  if (!trigger) return null;
  const colors = [APP_LIVE_THEME.accentPrimary, "#1B6FA8", APP_LIVE_THEME.accentGold, "#4DA3D4"];
  return (
    <div key={trigger} className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 60 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.4;
        const dur = 2 + Math.random() * 1.8;
        const size = 6 + Math.random() * 10;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              top: -10,
              width: size,
              height: size * 0.45,
              background: colors[i % colors.length],
              transform: `rotate(${Math.random() * 360}deg)`,
              animation: `kiosk-fall ${dur}s ${delay}s ease-in forwards`,
              borderRadius: 2,
            }}
            className="absolute"
          />
        );
      })}
    </div>
  );
};

const EventLiveKiosk = () => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const basePath = useEventLiveBasePath();
  const { settings } = useEventSettings();
    const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [welcomeFor, setWelcomeFor] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [closing, setClosing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // Auto-dismiss welcome after 8s and refocus name
  useEffect(() => {
    if (!welcomeFor) return;
    timerRef.current = window.setTimeout(() => closeWelcome(), 8000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [welcomeFor]);

  /** Smooth-exit welcome overlay then reset form for next guest. */
  const closeWelcome = () => {
    if (closing) return;
    setClosing(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    window.setTimeout(() => {
      setWelcomeFor(null);
      setClosing(false);
      resetForm();
    }, 450);
  };

  /** Clear inputs and refocus name — used by reset button and after welcome. */
  const resetForm = () => {
    setName("");
    setPhone("");
    setTitle("");
    setTimeout(() => nameRef.current?.focus(), 100);
  };

  const pad = (d: string) =>
    setPhone((p) => (p.length < EGYPT_PHONE_MAX_LEN ? p + d : p));
  const backspace = () => setPhone((p) => p.slice(0, -1));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      toast.error(ui('الرجاء إدخال الاسم'));
      return;
    }
    const normalized = normalizeLivePhone(phone);
    if (!isValidLivePhone(normalized)) {
      toast.error(ui('رقم الموبايل غير صحيح — يجب أن يكون 11 رقمًا ويبدأ بـ 01'));
      return;
    }
    setSubmitting(true);
    try {
      const existing = await liveApi.getByPhone(normalized);
      if (existing) {
        setSubmitting(false);
        const at = existing.checkedInAt ?? existing.checked_in_at ?? existing.createdAt;
        toast.error(
          `${existing.title ? `${existing.title} / ${existing.name}` : existing.name} — ${new Date(at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
        );
        return;
      }
      await liveApi.guestCheckin({
        name: name.trim(),
        phone: normalized,
        title: title.trim() || null,
        source: 'direct',
      });
      setSubmitting(false);
      setWelcomeFor(formatNameWithTitle(title, name.trim()));
      setBurst((b) => b + 1);
    } catch (err) {
      setSubmitting(false);
      toast.error(apiError(err, ui('تعذر التسجيل')));
    }
  };

  return (
    <div dir="rtl" className="min-h-screen relative overflow-hidden flex flex-col" >
      <EventLiveTheme />
      <EventLiveBackdrop screen="kiosk" />
      <style>{`
        @keyframes kiosk-fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes kiosk-ring { to { transform: rotate(360deg); } }
        @keyframes kiosk-shimmer {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }
        @keyframes kiosk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes kiosk-overlay-out {
          0% { opacity: 1; transform: scale(1); filter: blur(0); }
          100% { opacity: 0; transform: scale(0.96); filter: blur(8px); }
        }
        @keyframes kiosk-content-out {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-20px) scale(0.92); }
        }
      `}</style>

      {/* Brand ambience */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-[hsl(var(--grad-green))]/15 blur-3xl" />
        <div className="absolute bottom-0 -left-32 w-[28rem] h-[28rem] rounded-full bg-[hsl(var(--grad-gold))]/15 blur-3xl" />
        <div className="absolute top-1/3 right-1/3 w-[20rem] h-[20rem] rounded-full bg-[hsl(var(--grad-green-dark))]/10 blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="kdots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="#558B2F" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#kdots)" />
        </svg>
      </div>

      {/* Header */}
      <header className="border-b border-[hsl(var(--grad-green))]/20 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[hsl(var(--grad-green))]/25 blur-xl rounded-full animate-pulse" />
              <img
                src={resolveEventLogo(settings.logo_url)}
                alt={ui("شعار Noamany")}
                className="relative h-16 w-auto object-contain"
                style={{ animation: "kiosk-float 4s ease-in-out infinite" }}
              />
            </div>
            <div className="border-r-2 border-[hsl(var(--grad-green))]/30 pr-4">
              <h1 className="text-2xl font-extrabold text-[hsl(var(--grad-green-ink))] leading-tight">{settings.event_name}</h1>
              <p className="text-xs text-[hsl(var(--grad-green-dark))] font-medium mt-0.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--grad-green))] animate-pulse" />
                {ui("وضع الكشك التفاعلي")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EventLiveNavMenu variant="light" current="kiosk" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetForm}
              className="border-[hsl(var(--grad-gold))]/50 text-[hsl(var(--grad-gold-dark))] hover:bg-[hsl(var(--grad-gold))]/10 font-bold"
            >
              <RotateCcw className="h-4 w-4 ml-2" />
              {ui("إعادة ضبط")}
            </Button>
            <Button asChild variant="outline" size="sm" className="border-[hsl(var(--grad-green))] text-[hsl(var(--grad-green-dark))] hover:bg-[hsl(var(--grad-green))]/10">
              <Link to={`${basePath}/display`}>
                <ArrowRight className="h-4 w-4 ml-2" />
                {ui("عودة لشاشة العرض")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Kiosk form */}
      <main className="flex-1 container mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
        {/* Left — info panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-8 border-0 shadow-2xl shadow-[hsl(var(--grad-green))]/20 bg-gradient-to-br from-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))] text-white relative overflow-hidden">
            <span
              className="absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/3 pointer-events-none"
              style={{ animation: "kiosk-shimmer 5s ease-in-out infinite" }}
            />
            <Sparkles className="absolute top-4 left-4 h-5 w-5 text-[hsl(var(--grad-gold))] animate-pulse" />
            <div className="relative space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur ring-1 ring-white/30">
                <PartyPopper className="h-7 w-7" />
              </div>
              <h2 className="text-3xl font-extrabold leading-tight">{ui("أهلاً وسهلاً بكم")}</h2>
              <p className="text-white/90 leading-relaxed">
                {ui("سجّل حضورك بسرعة عبر هذه الشاشة وستظهر لك رسالة ترحيب خاصة فور التأكيد.")}
              </p>
            </div>
          </Card>

          <Card className="p-5 border-[hsl(var(--grad-green))]/20 bg-white shadow-md">
            <h3 className="font-bold text-[hsl(var(--grad-green-ink))] flex items-center gap-2 mb-3">
              <span className="w-1 h-4 bg-[hsl(var(--grad-gold))] rounded-full" />
              {ui("اللقب")}
            </h3>
            <TitleSelect value={title} onChange={setTitle} triggerClassName="h-11 border-2 border-[hsl(var(--grad-green))]/30" />
          </Card>
        </div>

        {/* Right — form */}
        <div className="lg:col-span-3">
          <Card className="h-full p-8 border-0 shadow-2xl shadow-[hsl(var(--grad-green))]/20 bg-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-[hsl(var(--grad-green))] to-transparent opacity-10 rounded-bl-full" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-[hsl(var(--grad-gold))] to-transparent opacity-10 rounded-tr-full" />

            <form onSubmit={handleSubmit} className="relative space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[hsl(var(--grad-green-ink))] flex items-center gap-2">
                  <User className="h-4 w-4 text-[hsl(var(--grad-green))]" /> {ui("الاسم الكامل")}
                </label>
                <Input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={ui("مثال: السيد محمد عبدالله")}
                  className="h-14 text-lg border-2 border-[hsl(var(--grad-green))]/30 focus-visible:ring-[hsl(var(--grad-green))] rounded-xl"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[hsl(var(--grad-green-ink))] flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[hsl(var(--grad-green))]" /> {EGYPT_PHONE_LABEL}
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, EGYPT_PHONE_MAX_LEN))}
                  placeholder={EGYPT_PHONE_PLACEHOLDER}
                  dir="ltr"
                  inputMode="numeric"
                  className="h-14 text-xl tabular-nums border-2 border-[hsl(var(--grad-green))]/30 focus-visible:ring-[hsl(var(--grad-green))] rounded-xl text-center font-bold"
                />

                {/* On-screen numpad */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => pad(d)}
                      className="h-14 rounded-xl border-2 border-[hsl(var(--grad-green))]/20 bg-gradient-to-br from-white to-[hsl(var(--grad-green))]/5 hover:from-[hsl(var(--grad-green))]/10 hover:to-[hsl(var(--grad-green))]/15 hover:border-[hsl(var(--grad-green))]/50 active:scale-95 transition-all text-2xl font-extrabold text-[hsl(var(--grad-green-ink))] tabular-nums"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={backspace}
                    className="h-14 rounded-xl border-2 border-[hsl(var(--grad-gold))]/40 bg-[hsl(var(--grad-gold))]/10 hover:bg-[hsl(var(--grad-gold))]/20 active:scale-95 transition-all flex items-center justify-center text-[hsl(var(--grad-gold-dark))]"
                  >
                    <Delete className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => pad("0")}
                    className="h-14 rounded-xl border-2 border-[hsl(var(--grad-green))]/20 bg-gradient-to-br from-white to-[hsl(var(--grad-green))]/5 hover:from-[hsl(var(--grad-green))]/10 hover:to-[hsl(var(--grad-green))]/15 hover:border-[hsl(var(--grad-green))]/50 active:scale-95 transition-all text-2xl font-extrabold text-[hsl(var(--grad-green-ink))] tabular-nums"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhone("")}
                    className="h-14 rounded-xl border-2 border-[hsl(var(--grad-green-dark))]/30 bg-[hsl(var(--grad-green-dark))]/5 hover:bg-[hsl(var(--grad-green-dark))]/15 active:scale-95 transition-all text-sm font-bold text-[hsl(var(--grad-green-dark))]"
                  >
                    {ui("مسح")}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-16 text-xl font-extrabold bg-gradient-to-l from-[hsl(var(--grad-green-dark))] via-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))] hover:opacity-90 shadow-lg shadow-[hsl(var(--grad-green))]/40 rounded-2xl relative overflow-hidden"
              >
                <span
                  className="absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent w-1/4 pointer-events-none"
                  style={{ animation: "kiosk-shimmer 3s ease-in-out infinite" }}
                />
                <Send className="h-6 w-6 ml-3" />
                {submitting ? ui("جاري التسجيل...") : ui("تأكيد الحضور")}
              </Button>
            </form>
          </Card>
        </div>
      </main>

      <footer className="py-3 text-center text-xs text-[hsl(var(--grad-green-dark))] border-t border-[hsl(var(--grad-green))]/20 bg-white/60 backdrop-blur">
        <span className="font-bold">{settings.footer_text}</span> © {new Date().getFullYear()}
      </footer>

      {/* Full-screen welcome overlay */}
      {welcomeFor && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center cursor-pointer ${closing ? "" : "animate-in fade-in duration-300"}`}
          style={closing ? { animation: "kiosk-overlay-out 0.45s ease-in forwards" } : undefined}
          onClick={closeWelcome}
        >
          <Confetti trigger={burst} />

          {/* Ambient orbs */}
          <div className="absolute -top-32 -right-32 w-[32rem] h-[32rem] rounded-full bg-[hsl(var(--grad-green))]/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[32rem] h-[32rem] rounded-full bg-[hsl(var(--grad-gold))]/20 blur-3xl" />

          {/* Floating sparkles */}
          <Star className="absolute top-20 right-32 h-7 w-7 text-[hsl(var(--grad-gold))]/60 animate-pulse" />
          <Heart className="absolute top-32 left-40 h-6 w-6 text-[hsl(var(--grad-green))]/50 animate-pulse" style={{ animationDelay: "0.5s" }} />
          <Star className="absolute bottom-32 right-48 h-6 w-6 text-[hsl(var(--grad-green))]/50 animate-pulse" style={{ animationDelay: "1s" }} />
          <PartyPopper className="absolute bottom-20 left-32 h-7 w-7 text-[hsl(var(--grad-gold))]/60 animate-pulse" style={{ animationDelay: "1.5s" }} />
          <Award className="absolute top-1/2 right-20 h-6 w-6 text-[hsl(var(--grad-green))]/50 animate-pulse" style={{ animationDelay: "2s" }} />

          <div
            className={`relative max-w-3xl text-center space-y-8 px-8 ${closing ? "" : "animate-in zoom-in-95 duration-700"}`}
            style={closing ? { animation: "kiosk-content-out 0.4s ease-in forwards" } : undefined}
          >
            {/* Logo + rings */}
            <div className="relative inline-block w-40 h-40">
              <div className="absolute inset-0 bg-[hsl(var(--grad-green))]/30 blur-2xl rounded-full animate-pulse" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" style={{ animation: "kiosk-ring 18s linear infinite" }}>
                <circle cx="50" cy="50" r="46" fill="none" stroke="#7CB342" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.6" />
              </svg>
              <svg className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)]" viewBox="0 0 100 100" style={{ animation: "kiosk-ring 24s linear infinite reverse" }}>
                <circle cx="50" cy="50" r="46" fill="none" stroke="#D4A229" strokeWidth="1.2" strokeDasharray="2 8" opacity="0.6" />
              </svg>
              <div className="absolute inset-6 rounded-full bg-gradient-to-br from-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))] shadow-2xl shadow-[hsl(var(--grad-green))]/50 flex items-center justify-center">
                <CheckCircle2 className="h-16 w-16 text-white" />
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <span className="h-px w-16 bg-gradient-to-l from-[hsl(var(--grad-green))] to-transparent" />
              <p className="text-2xl text-[hsl(var(--grad-green-dark))] font-bold">{settings.welcome_title}</p>
              <span className="h-px w-16 bg-gradient-to-r from-[hsl(var(--grad-green))] to-transparent" />
            </div>

            <h2 className="text-6xl md:text-7xl font-extrabold leading-tight bg-gradient-to-l from-[hsl(var(--grad-green-dark))] via-[hsl(var(--grad-green))] to-[hsl(var(--grad-gold))] bg-clip-text text-transparent drop-shadow-sm">
              {welcomeFor}
            </h2>

            <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur rounded-3xl p-8 border-2 border-[hsl(var(--grad-green))]/30 shadow-2xl shadow-[hsl(var(--grad-green))]/20 relative overflow-hidden">
              <span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent w-1/3 pointer-events-none"
                style={{ animation: "kiosk-shimmer 5s ease-in-out infinite" }}
              />
              <div className="absolute -top-3 right-8 px-3 text-[hsl(var(--grad-gold))]">
                <Heart className="h-6 w-6 fill-[hsl(var(--grad-gold))]" />
              </div>
              <p className="relative text-xl md:text-2xl text-[hsl(var(--grad-green-ink))] leading-relaxed font-medium">
                {settings.thank_you_message}
              </p>
            </div>

            <Button
              type="button"
              onClick={(e) => { e.stopPropagation(); closeWelcome(); }}
              className="bg-gradient-to-l from-[hsl(var(--grad-green-dark))] to-[hsl(var(--grad-green))] hover:opacity-90 shadow-lg shadow-[hsl(var(--grad-green))]/40 rounded-full px-8 h-12 text-base font-bold"
            >
              <RotateCcw className="h-5 w-5 ml-2" />
              {ui("تسجيل ضيف جديد")}
            </Button>
            <p className="text-xs text-[hsl(var(--grad-green-dark))]/70">{ui("أو انقر في أي مكان")}</p>
          </div>
        </div>
      )}
      <KioskFullscreenButton />
    </div>
  );
};

export default EventLiveKiosk;
