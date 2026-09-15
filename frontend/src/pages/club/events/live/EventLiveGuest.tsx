import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { apiError } from '@/lib/api';
import { CheckCircle2, Sparkles, AlertCircle } from "lucide-react";
import { useEventSettings } from "./useEventSettings";
import { EventLiveBackdrop } from "./EventLiveBackdrop";
import { TitleSelect } from "./TitleSelect";
import { formatNameWithTitle } from "./titleUtils";
import { EventLiveTheme, gradBgStyle } from "./EventLiveTheme";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import { resolveEventLogo } from './live-brand';
import {
  EGYPT_PHONE_LABEL,
  EGYPT_PHONE_PLACEHOLDER,
  livePhoneValidationError,
  normalizeLivePhone,
} from './live-phone';
import { useLocale } from '@/store/locale';

const EventLiveGuest = () => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const basePath = useEventLiveBasePath();
    const { settings } = useEventSettings();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

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
      // Duplicate check: a check-in is created as an attendee; reject if the phone exists.
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
        source: 'qr',
      });
      setSubmitting(false);
      setDone(formatNameWithTitle(title, name.trim()));
    } catch (err) {
      setSubmitting(false);
      toast.error(apiError(err, ui('تعذر تسجيل الحضور')));
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen relative flex flex-col"
      
    >
      <EventLiveTheme />
      <EventLiveBackdrop screen="guest" />
      <header className="border-b border-[hsl(var(--grad-gold))]/30 bg-transparent">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <img
            src={resolveEventLogo(settings.logo_url)}
            alt={ui("شعار Noamany")}
            className="w-10 h-10 rounded-lg object-contain bg-card border border-border/40 p-1"
          />
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate text-[hsl(var(--grad-cream))]">{settings.event_name}</h1>
            <p className="text-xs text-[hsl(var(--grad-gold))]">{ui("تسجيل الحضور")}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 !bg-[#132238] border border-[#D4A229]/40 shadow-2xl shadow-black/50 text-white">
          {!done ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D4A229]/20 border border-[#D4A229]/50 mb-2">
                  <CheckCircle2 className="h-7 w-7 text-[#D4A229]" />
                </div>
                <h2 className="text-2xl font-extrabold text-[#D4A229]">{ui("تأكيد بياناتك")}</h2>
                <p className="text-sm text-white/80">{ui("يرجى تعبئة بياناتك للترحيب بك في الحفل")}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-white font-bold">{ui("اللقب")}</Label>
                <TitleSelect
                  value={title}
                  onChange={setTitle}
                  triggerClassName="h-12 text-base bg-[#0d1a2d] border-[#D4A229]/35 text-white [&>span]:text-white data-[placeholder]:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white font-bold">{ui("الاسم الكامل")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }}
                  placeholder={ui("الاسم الكامل")}
                  autoFocus
                  className={`h-12 text-lg bg-[#0d1a2d] text-white placeholder:text-white/45 border ${errors.name ? 'border-red-400' : 'border-[#D4A229]/35'}`}
                />
                <div className="min-h-[22px] mt-1.5">
                  {errors.name && (
                    <p role="alert" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-200 bg-red-500/15 border border-red-400/40 rounded-lg px-2.5 py-1 leading-snug break-words max-w-full animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{errors.name}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-white font-bold">{EGYPT_PHONE_LABEL}</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors({ ...errors, phone: undefined }); }}
                  placeholder={EGYPT_PHONE_PLACEHOLDER}
                  dir="ltr"
                  className={`h-12 text-lg text-right bg-[#0d1a2d] text-white placeholder:text-white/45 border ${errors.phone ? 'border-red-400' : 'border-[#D4A229]/35'}`}
                />
                <div className="min-h-[22px] mt-1.5">
                  {errors.phone && (
                    <p role="alert" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-200 bg-red-500/15 border border-red-400/40 rounded-lg px-2.5 py-1 leading-snug break-words max-w-full animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{errors.phone}</span>
                    </p>
                  )}
                </div>
              </div>

              <Button type="submit" disabled={submitting} size="lg" className="w-full bg-[#558B2F] hover:bg-[#466F26] text-white font-extrabold border border-[#D4A229]/40 shadow-lg shadow-black/30">
                {submitting ? ui("جاري التسجيل...") : ui("تأكيد الحضور")}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-5 py-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-[#558B2F] border-2 border-[#D4A229]/60 shadow-2xl shadow-[#D4A229]/30">
                <CheckCircle2 className="h-12 w-12 text-white" />
              </div>
              <div className="space-y-1">
                <p className="text-base text-white/80">{ui("أهلاً وسهلاً")}</p>
                <h2 className="text-3xl font-extrabold text-[#D4A229]">{done}</h2>
              </div>
              <div className="rounded-xl p-5 bg-[#0d1a2d] border border-[#D4A229]/40">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-[#D4A229]" />
                  <span className="font-extrabold text-[#D4A229]">{ui("شكراً لحضورك")}</span>
                  <Sparkles className="h-5 w-5 text-[#D4A229]" />
                </div>
                <p className="text-white/90 leading-relaxed text-sm">{settings.thank_you_message}</p>
              </div>
              <p className="text-xs text-white/70">{ui("يمكنك إغلاق هذه الصفحة الآن")}</p>
            </div>
          )}
        </Card>
      </main>

      <footer className="py-3 text-center text-xs text-[hsl(var(--grad-gold))]/80">
        {settings.footer_text} © {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default EventLiveGuest;
