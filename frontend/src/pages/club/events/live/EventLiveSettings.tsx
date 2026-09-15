import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from 'sonner';
import { ArrowRight, Palette, Save, Sparkles, Image as ImageIcon, RotateCcw, Link2, Tags, Plus, X, SlidersHorizontal, Type, Paintbrush, Pencil, Trash2, MousePointerClick, Shield, ListOrdered } from "lucide-react";
import { useEventSettings, applyThemeColors, applyGradTheme, DEFAULT_SETTINGS, EventSettings, DEFAULT_TITLES } from "./useEventSettings";
import { useViewerRole } from "./useViewerRole";
import { GRAD_FONTS, GRAD_PRESETS, GRAD_CATEGORIES, EventLiveTheme, gradBgStyle } from "./EventLiveTheme";
import { APP_LIVE_THEME } from "./live-brand";
const bgNavy = APP_LIVE_THEME.displayGradient;
import { resolveBackdropUrl, BackdropChoice, GraduationScreen } from "./EventLiveBackdrop";
import { useBackdrops } from "./useBackdrops";
import { BackdropsManager } from "./BackdropsManager";
import { PerScreenMediaUpload } from "./PerScreenMediaUpload";
import { EventArchiveCard } from "./EventArchiveCard";
import { BrandColorExtractor } from "./BrandColorExtractor";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import { EventLiveBackLink } from './EventLiveBackLink';
import { EventLiveNavMenu } from './EventLiveNavMenu';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

/** Inline editor for the titles list — chips with delete + add row. */
const TitlesManager = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => {
  const { ui } = useLocale();
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary rounded-full px-3 py-1 text-sm font-bold"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="text-[#A8801F] hover:text-red-600"
              aria-label={`${ui('حذف')} ${t}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground">{ui("لا توجد ألقاب — استخدم الحقل أدناه للإضافة.")}</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={ui("أضف لقباً جديداً (مثال: المعالي)")}
        />
        <Button type="button" onClick={add} disabled={!draft.trim()} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 ml-1" />
          {ui("إضافة")}
        </Button>
      </div>
    </div>
  );
};

/** Configure a custom hero font by URL (host the TTF/OTF/WOFF/WOFF2 anywhere and paste the link). */
const CustomHeroFontUploader = ({
  url,
  family,
  onChange,
}: {
  url: string | null;
  family: string | null;
  onChange: (url: string | null, family: string | null) => void;
}) => {
  const { ui } = useLocale();
  const [familyDraft, setFamilyDraft] = useState(family ?? "");
  const [urlDraft, setUrlDraft] = useState(url ?? "");
  useEffect(() => setFamilyDraft(family ?? ""), [family]);
  useEffect(() => setUrlDraft(url ?? ""), [url]);

  const apply = () => {
    const u = urlDraft.trim();
    if (!u) return;
    const inferred = familyDraft.trim()
      || u.split("/").pop()?.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[_-]+/g, " ").trim()
      || "CustomHeroFont";
    setFamilyDraft(inferred);
    onChange(u, inferred);
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-[#F08AB0]/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs font-bold flex items-center gap-2">
          <Type className="h-4 w-4 text-[#F08AB0]" />
          {ui("خط مخصص (TTF / OTF / WOFF / WOFF2)")}
        </div>
        {url && (
          <button
            type="button"
            onClick={() => { onChange(null, null); setFamilyDraft(""); setUrlDraft(""); }}
            className="text-xs font-bold text-red-600 hover:underline inline-flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" /> {ui("إزالة")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          value={familyDraft}
          onChange={(e) => {
            setFamilyDraft(e.target.value);
            if (url) onChange(url, e.target.value.trim() || null);
          }}
          placeholder={ui("اسم عائلة الخط (مثال: MyArabicFont)")}
          className="h-9 text-sm"
        />
        <div className="flex gap-2">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder={ui("رابط ملف الخط (https://...)")}
            dir="ltr"
            className="h-9 text-sm flex-1"
          />
          <Button type="button" variant="outline" className="h-9 shrink-0" disabled={!urlDraft.trim()} onClick={apply}>
            {ui("تطبيق")}
          </Button>
        </div>
      </div>
      {url && family && (
        <div className="text-[11px] text-muted-foreground break-all" dir="ltr">
          ✓ {family} — {url}
        </div>
      )}
    </div>
  );
};

const BACKDROPS: { id: BackdropChoice; label: string; url: string | null }[] = [
  { id: "navy", label: uiStatic("نيفي ذهبي — الهوية الجديدة"), url: bgNavy },
  { id: "01", label: uiStatic("التصميم 01 — الفتاة في الحديقة"), url: bgNavy },
  { id: "02", label: uiStatic("التصميم 02 — البوابة والأزهار"), url: bgNavy },
  { id: "03", label: uiStatic("التصميم 03 — البوابة المفتوحة"), url: bgNavy },
  { id: "custom", label: uiStatic("صورة مخصصة (رابط)"), url: null },
];

const BUTTON_ROWS: { key: "kiosk" | "display" | "settings" | "print"; label: string; hint: string }[] = [
  { key: "kiosk", label: uiStatic("زر وضع الكشك"), hint: uiStatic("يفتح شاشة الكشك التفاعلي") },
  { key: "display", label: uiStatic("زر شاشة العرض"), hint: uiStatic("ينتقل إلى شاشة العرض العامة") },
  { key: "settings", label: uiStatic("زر الإعدادات/الأرشيف"), hint: uiStatic("روابط إدارة الفعالية") },
  { key: "print", label: uiStatic("أزرار الطباعة/تنزيل الملصق"), hint: uiStatic("طباعة ملصق التسجيل") },
];

const ButtonsPermissionsCard = ({
  form,
  update,
}: {
  form: EventSettings;
  update: <K extends keyof EventSettings>(k: K, v: EventSettings[K]) => void;
}) => {
  const { ui } = useLocale();
  const { role, setRole } = useViewerRole();
  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start gap-2">
        <MousePointerClick className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <h2 className="font-bold text-lg">{ui("إظهار الأزرار للموظفين والضيوف")}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {ui("تحكَّم بظهور كل زر على واجهات التسجيل وشاشة العرض حسب نوع المستخدم. يُطبَّق على جميع الصفحات.")}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Shield className="h-4 w-4 text-amber-700 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">{ui("وضع هذا الجهاز")}</p>
            <p className="text-[11px] text-amber-800">{ui("حدِّد ما إذا كان هذا الجهاز مخصصاً للموظفين أم للضيوف.")}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant={role === "staff" ? "default" : "outline"} onClick={() => setRole("staff")} className={role === "staff" ? "bg-primary hover:bg-primary/90" : ""}>{ui("موظفين")}</Button>
          <Button type="button" size="sm" variant={role === "guest" ? "default" : "outline"} onClick={() => setRole("guest")} className={role === "guest" ? "bg-primary hover:bg-primary/90" : ""}>{ui("ضيوف")}</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_auto_auto] bg-muted/50 text-xs font-bold">
          <div className="px-3 py-2">{ui("الزر")}</div>
          <div className="px-4 py-2 text-center w-28">{ui("للموظفين")}</div>
          <div className="px-4 py-2 text-center w-28">{ui("للضيوف")}</div>
        </div>
        {BUTTON_ROWS.map((row) => {
          const staffKey = `btn_${row.key}_staff` as keyof EventSettings;
          const guestKey = `btn_${row.key}_guest` as keyof EventSettings;
          return (
            <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center border-t border-border">
              <div className="px-3 py-3">
                <div className="text-sm font-bold">{row.label}</div>
                <div className="text-[11px] text-muted-foreground">{row.hint}</div>
              </div>
              <div className="px-4 py-3 flex justify-center w-28">
                <Switch checked={!!form[staffKey]} onCheckedChange={(v) => update(staffKey, v as EventSettings[typeof staffKey])} />
              </div>
              <div className="px-4 py-3 flex justify-center w-28">
                <Switch checked={!!form[guestKey]} onCheckedChange={(v) => update(guestKey, v as EventSettings[typeof guestKey])} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {ui("💡 يمكن أيضاً تبديل وضع الجهاز عبر الرابط:")} <code dir="ltr">?role=staff</code> {ui("أو")} <code dir="ltr">?role=guest</code>
      </p>
    </Card>
  );
};

const SCREENS: { id: GraduationScreen; label: string; col: keyof EventSettings }[] = [
  { id: "checkin", label: uiStatic("ملصق التسجيل"), col: "backdrop_checkin" },
  { id: "display", label: uiStatic("شاشة العرض"), col: "backdrop_display" },
  { id: "kiosk", label: uiStatic("وضع الكشك"), col: "backdrop_kiosk" },
  { id: "guest", label: uiStatic("صفحة الضيف"), col: "backdrop_guest" },
];

/** Color presets stored as HSL "H S% L%" strings to match design tokens. */
const PRESETS: { label: string; primary: string; secondary: string }[] = [
  { label: uiStatic("أخضر وذهبي (افتراضي)"), primary: "98 84% 47%", secondary: "45 96% 60%" },
  { label: uiStatic("أزرق ملكي"), primary: "220 85% 50%", secondary: "200 90% 65%" },
  { label: uiStatic("عنابي وذهبي"), primary: "350 70% 40%", secondary: "40 95% 60%" },
  { label: uiStatic("بنفسجي راقي"), primary: "265 70% 50%", secondary: "290 75% 65%" },
  { label: uiStatic("فيروزي عصري"), primary: "180 70% 40%", secondary: "30 95% 60%" },
];

const EventLiveSettings = () => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const basePath = useEventLiveBasePath();
  const { settings, loading } = useEventSettings();
  const { backdrops: customBackdrops } = useBackdrops();
    const [form, setForm] = useState<EventSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);
  const [themeCategory, setThemeCategory] = useState<string>("all");

  useEffect(() => {
    // Hydrate form once from the loaded settings to avoid polled updates wiping in-progress edits.
    if (!loading && !hydrated.current) {
      setForm(settings);
      hydrated.current = true;
    }
  }, [loading, settings]);

  // Live program-position sync to the API so the Display screen picks it up on its next poll.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      liveApi
        .update({
          program_align: form.program_align === "left" ? "left" : "right",
          program_offset_pct: Math.min(45, Math.max(0, form.program_offset_pct ?? 22)),
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [form.program_align, form.program_offset_pct]);

  // Global live auto-save: any field change debounced-pushes to the API so the
  // Check-In and Display screens update on their next poll — no manual save needed.
  useEffect(() => {
    if (!hydrated.current) return;
    if (!form.event_name?.trim() || !form.thank_you_message?.trim()) return;
    const t = setTimeout(() => {
      const payload = {
        event_name: form.event_name.trim(),
        welcome_title: form.welcome_title?.trim() || "",
        thank_you_message: form.thank_you_message.trim(),
        primary_color: form.primary_color?.trim() || "",
        secondary_color: form.secondary_color?.trim() || "",
        logo_url: form.logo_url?.trim() || null,
        footer_text: form.footer_text?.trim() || "",
        backdrop_variant: form.backdrop_variant || "01",
        backdrop_checkin: form.backdrop_checkin || null,
        backdrop_display: form.backdrop_display || null,
        backdrop_kiosk: form.backdrop_kiosk || null,
        backdrop_guest: form.backdrop_guest || null,
        backdrop_custom_url: form.backdrop_custom_url?.trim() || null,
        titles: (form.titles && form.titles.length > 0 ? form.titles : DEFAULT_TITLES),
        vignette_intensity: form.vignette_intensity ?? 18,
        card_top_opacity: form.card_top_opacity ?? 35,
        card_bottom_opacity: form.card_bottom_opacity ?? 75,
        theme_preset: form.theme_preset || "navy",
        bg_from: form.bg_from || APP_LIVE_THEME.bgFrom,
        bg_via: form.bg_via || "#0A1F3D",
        bg_to: form.bg_to || "#061330",
        accent_primary: form.accent_primary || APP_LIVE_THEME.accentPrimary,
        accent_gold: form.accent_gold || APP_LIVE_THEME.accentGold,
        accent_ink: form.accent_ink || "#FFFDF5",
        font_family: form.font_family || "Cairo",
        hidden_default_backdrops: form.hidden_default_backdrops ?? [],
        default_backdrop_labels: form.default_backdrop_labels ?? {},
        show_program: form.show_program ?? true,
        event_start_time: form.event_start_time || null,
        event_end_time: form.event_end_time || null,
        btn_kiosk_staff: form.btn_kiosk_staff ?? true,
        btn_kiosk_guest: form.btn_kiosk_guest ?? false,
        btn_display_staff: form.btn_display_staff ?? true,
        btn_display_guest: form.btn_display_guest ?? false,
        btn_settings_staff: form.btn_settings_staff ?? true,
        btn_settings_guest: form.btn_settings_guest ?? false,
        btn_print_staff: form.btn_print_staff ?? true,
        btn_print_guest: form.btn_print_guest ?? true,
        hero_text: form.hero_text?.trim() || "أهلاً وسهلاً",
        hero_font: form.hero_font || "Mirza",
        hero_color: form.hero_color || "#F08AB0",
        hero_size_px: form.hero_size_px ?? 128,
        hero_italic: form.hero_italic ?? true,
        hero_subtitle_text: form.hero_subtitle_text?.trim() || "بضيوفنا الكرام",
        hero_subtitle_color: form.hero_subtitle_color || "#FFFDF5",
        intro_highlight: form.intro_highlight ?? "",
        intro_text: form.intro_text ?? "",
        checkin_steps: (form.checkin_steps ?? []).filter((s: string) => (s || "").trim().length > 0),
        thank_title: form.thank_title ?? "",
        thank_body: form.thank_body ?? "",
        hero_font_url: form.hero_font_url || null,
        hero_font_family: form.hero_font_family?.trim() || null,
        display_welcome_color: form.display_welcome_color || APP_LIVE_THEME.accentGold,
        display_welcome_size_px: form.display_welcome_size_px ?? 30,
        display_welcome_font: form.display_welcome_font || "Cairo",
        display_name_color: form.display_name_color || "#FFFFFF",
        display_name_glow_color: form.display_name_glow_color || APP_LIVE_THEME.accentGold,
        display_thanks_color: form.display_thanks_color || "#FFFDF5",
        display_thanks_size_px: form.display_thanks_size_px ?? 20,
        display_thanks_font: form.display_thanks_font || "Cairo",
        program_align: form.program_align === "left" ? "left" : "right",
        program_offset_pct: Math.min(45, Math.max(0, form.program_offset_pct ?? 22)),
      };
      liveApi.update(payload).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [form]);

  const update = <K extends keyof EventSettings>(key: K, value: EventSettings[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "primary_color" || key === "secondary_color") {
        applyThemeColors(next.primary_color, next.secondary_color);
      }
      if (
        key === "bg_from" || key === "bg_via" || key === "bg_to" ||
        key === "accent_primary" || key === "accent_gold" || key === "accent_ink" ||
        key === "font_family"
      ) {
        applyGradTheme(next);
      }
      return next;
    });
  };

  const applyPreset = (p: (typeof GRAD_PRESETS)[number]) => {
    // Convert accent hex → HSL "H S% L%" so global design tokens (--primary/--secondary) also follow the chosen theme.
    const hexToHslTuple = (hex: string): string => {
      const m = hex.replace("#", "");
      const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
      const r = parseInt(v.slice(0, 2), 16) / 255;
      const g = parseInt(v.slice(2, 4), 16) / 255;
      const b = parseInt(v.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0; const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };
    const primaryHsl = hexToHslTuple(p.accent_primary);
    const secondaryHsl = hexToHslTuple(p.accent_gold);
    setForm((prev) => {
      const next = {
        ...prev,
        theme_preset: p.id,
        bg_from: p.bg_from,
        bg_via: p.bg_via,
        bg_to: p.bg_to,
        accent_primary: p.accent_primary,
        accent_gold: p.accent_gold,
        accent_ink: p.accent_ink,
        primary_color: primaryHsl,
        secondary_color: secondaryHsl,
      };
      applyGradTheme(next);
      applyThemeColors(primaryHsl, secondaryHsl);
      return next;
    });
    toast.success(`${ui("تم تطبيق ثيم:")} ${p.label} ${ui("— اضغط «حفظ الإعدادات» لتثبيت الثيم")}`);
  };

  const handlePreset = (p: (typeof PRESETS)[number]) => {
    update("primary_color", p.primary);
    update("secondary_color", p.secondary);
  };

  const handleSave = async () => {
    if (!form.event_name.trim() || !form.thank_you_message.trim()) {
      toast.error(ui('الرجاء تعبئة الاسم ورسالة الشكر'));
      return;
    }
    setSaving(true);
    const payload = {
      event_name: form.event_name.trim(),
      welcome_title: form.welcome_title.trim(),
      thank_you_message: form.thank_you_message.trim(),
      primary_color: form.primary_color.trim(),
      secondary_color: form.secondary_color.trim(),
      logo_url: form.logo_url?.trim() || null,
      footer_text: form.footer_text.trim(),
      backdrop_variant: form.backdrop_variant || "01",
      backdrop_checkin: form.backdrop_checkin || null,
      backdrop_display: form.backdrop_display || null,
      backdrop_kiosk: form.backdrop_kiosk || null,
      backdrop_guest: form.backdrop_guest || null,
      backdrop_custom_url: form.backdrop_custom_url?.trim() || null,
      titles: (form.titles && form.titles.length > 0 ? form.titles : DEFAULT_TITLES),
      vignette_intensity: form.vignette_intensity ?? 18,
      card_top_opacity: form.card_top_opacity ?? 35,
      card_bottom_opacity: form.card_bottom_opacity ?? 75,
      theme_preset: form.theme_preset || "navy",
      bg_from: form.bg_from || APP_LIVE_THEME.bgFrom,
      bg_via: form.bg_via || "#0A1F3D",
      bg_to: form.bg_to || "#061330",
      accent_primary: form.accent_primary || APP_LIVE_THEME.accentPrimary,
      accent_gold: form.accent_gold || APP_LIVE_THEME.accentGold,
      accent_ink: form.accent_ink || "#FFFDF5",
      font_family: form.font_family || "Cairo",
      hidden_default_backdrops: form.hidden_default_backdrops ?? [],
      default_backdrop_labels: form.default_backdrop_labels ?? {},
      show_program: form.show_program ?? true,
      event_start_time: form.event_start_time || null,
      event_end_time: form.event_end_time || null,
      btn_kiosk_staff: form.btn_kiosk_staff ?? true,
      btn_kiosk_guest: form.btn_kiosk_guest ?? false,
      btn_display_staff: form.btn_display_staff ?? true,
      btn_display_guest: form.btn_display_guest ?? false,
      btn_settings_staff: form.btn_settings_staff ?? true,
      btn_settings_guest: form.btn_settings_guest ?? false,
      btn_print_staff: form.btn_print_staff ?? true,
      btn_print_guest: form.btn_print_guest ?? true,
      hero_text: form.hero_text?.trim() || "أهلاً وسهلاً",
      hero_font: form.hero_font || "Mirza",
      hero_color: form.hero_color || "#F08AB0",
      hero_size_px: form.hero_size_px ?? 128,
      hero_italic: form.hero_italic ?? true,
      hero_subtitle_text: form.hero_subtitle_text?.trim() || "بضيوفنا الكرام",
      hero_subtitle_color: form.hero_subtitle_color || "#FFFDF5",
      intro_highlight: form.intro_highlight ?? "",
      intro_text: form.intro_text ?? "",
      checkin_steps: (form.checkin_steps ?? []).filter((s: string) => (s || "").trim().length > 0),
      thank_title: form.thank_title ?? "",
      thank_body: form.thank_body ?? "",
      hero_font_url: form.hero_font_url || null,
      hero_font_family: form.hero_font_family?.trim() || null,
      display_welcome_color: form.display_welcome_color || APP_LIVE_THEME.accentGold,
      display_welcome_size_px: form.display_welcome_size_px ?? 30,
      display_welcome_font: form.display_welcome_font || "Cairo",
      display_name_color: form.display_name_color || "#FFFFFF",
      display_name_glow_color: form.display_name_glow_color || APP_LIVE_THEME.accentGold,
      display_thanks_color: form.display_thanks_color || "#FFFDF5",
      display_thanks_size_px: form.display_thanks_size_px ?? 20,
      display_thanks_font: form.display_thanks_font || "Cairo",
      program_align: form.program_align === "left" ? "left" : "right",
      program_offset_pct: Math.min(45, Math.max(0, form.program_offset_pct ?? 22)),
    };
    try {
      await liveApi.update(payload);
      toast.success(ui('تم تحديث الهوية البصرية ورسالة الشكر'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ui('تعذر حفظ الإعدادات'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_SETTINGS, id: form.id });
    applyThemeColors(DEFAULT_SETTINGS.primary_color, DEFAULT_SETTINGS.secondary_color);
    toast.success(ui('تمت استعادة الإعدادات الافتراضية — اضغط حفظ لتثبيتها'));
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <EventLiveTheme />
      <header className="border-b border-border/40 bg-card/60 backdrop-blur">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Palette className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{ui("إعدادات الفعالية")}</h1>
              <p className="text-xs text-muted-foreground">{ui("خصص الهوية البصرية ورسالة الشكر")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleReset} className="text-amber-700 border-amber-300 hover:bg-amber-50">
              <RotateCcw className="h-4 w-4 ml-2" />
              {ui("استعادة الافتراضي")}
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Save className="h-4 w-4 ml-2" />
              {saving ? ui("جاري الحفظ...") : ui("حفظ التغييرات")}
            </Button>
            <EventLiveNavMenu variant="light" current="settings" />
            <EventLiveBackLink />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="content" dir="rtl" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto bg-primary/10 p-1 gap-1">
              <TabsTrigger value="content" className="font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{ui("المحتوى")}</TabsTrigger>
              <TabsTrigger value="checkin" className="font-bold data-[state=active]:bg-primary/80 data-[state=active]:text-primary-foreground">{ui("التسجيل")}</TabsTrigger>
              <TabsTrigger value="display" className="font-bold data-[state=active]:bg-warning data-[state=active]:text-warning-foreground">{ui("العرض")}</TabsTrigger>
              <TabsTrigger value="theme" className="font-bold data-[state=active]:bg-[hsl(213,74%,14%)] data-[state=active]:text-white">{ui("الثيم والخلفيات")}</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-0">
            <Card className="p-6 space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {ui("المحتوى والنصوص")}
            </h2>
            <div className="space-y-2">
              <Label htmlFor="event_name">{ui("اسم الفعالية")}</Label>
              <Input id="event_name" value={form.event_name} onChange={(e) => update("event_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="welcome_title">{ui("عنوان الترحيب القصير")}</Label>
              <Input id="welcome_title" value={form.welcome_title} onChange={(e) => update("welcome_title", e.target.value)} placeholder={ui("مثال: يسعدنا حضور")} />
            </div>
            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
              {ui("نصوص شاشة التسجيل (الترحيب، الفقرة التعريفية، الخطوات، بطاقة الشكر) انتقلت إلى تبويب «شاشة التسجيل».")}
            </p>
            <div className="space-y-2">
              <Label htmlFor="thank_you">{ui("رسالة الشكر")}</Label>
              <Textarea id="thank_you" rows={3} value={form.thank_you_message} onChange={(e) => update("thank_you_message", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer">{ui("التذييل")}</Label>
              <Input id="footer" value={form.footer_text} onChange={(e) => update("footer_text", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="event_start_time">{ui("وقت بداية الحفل")}</Label>
                <Time12Input id="event_start_time" value={form.event_start_time ?? ''} onValueChange={(value) => update('event_start_time', value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event_end_time">{ui("وقت نهاية الحفل")}</Label>
                <Time12Input id="event_end_time" value={form.event_end_time ?? ''} onValueChange={(value) => update('event_end_time', value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="show_program" className="font-bold">{ui("إظهار فقرات الحفل على الشاشة")}</Label>
                <p className="text-xs text-muted-foreground">{ui("عند الإيقاف لن تظهر بطاقة الفقرات في شاشة العرض")}</p>
              </div>
              <Switch
                id="show_program"
                checked={form.show_program ?? true}
                onCheckedChange={(v) => update("show_program", v)}
              />
            </div>
            </Card>
            </TabsContent>

            <TabsContent value="checkin" className="mt-0">
              <Card className="p-6 space-y-5">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Type className="h-5 w-5 text-[#F08AB0]" />
                  {ui("إعدادات شاشة التسجيل — نص الترحيب")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ui("تحكّم في النص الرئيسي «أهلاً وسهلاً» الذي يظهر في شاشة استقبال الضيوف: النص، الخط، اللون، والحجم.")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ck_hero_text" className="text-xs font-bold">{ui("النص الرئيسي")}</Label>
                    <Input id="ck_hero_text" value={form.hero_text ?? ""} onChange={(e) => update("hero_text", e.target.value)} placeholder={ui("أهلاً وسهلاً")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ck_hero_sub" className="text-xs font-bold">{ui("النص الفرعي")}</Label>
                    <Input id="ck_hero_sub" value={form.hero_subtitle_text ?? ""} onChange={(e) => update("hero_subtitle_text", e.target.value)} placeholder={ui("بضيوفنا الكرام")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">{ui("اختر الخط")}</Label>
                  <CustomHeroFontUploader
                    url={form.hero_font_url ?? null}
                    family={form.hero_font_family ?? null}
                    onChange={(u, fam) => {
                      update("hero_font_url", u);
                      update("hero_font_family", fam);
                      if (u && fam) update("hero_font", fam);
                    }}
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      "Aref Ruqaa",
                      "Aref Ruqaa Ink",
                      "Amiri",
                      "Amiri Quran",
                      "Mirza",
                      "Rakkas",
                      "Lemonada",
                      "Marhey",
                      "Lalezar",
                      "Jomhuria",
                      "Reem Kufi",
                      "Lateef",
                      "Scheherazade New",
                      "Cairo",
                    ].map((f) => {
                      const active = (form.hero_font || "Mirza") === f;
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => update("hero_font", f)}
                          style={{ fontFamily: `"${f}", serif` }}
                          className={`rounded-lg border-2 p-2 text-sm font-bold transition-all ${
                            active ? "border-[#F08AB0] bg-[#F08AB0]/10" : "border-border hover:border-[#F08AB0]/50 bg-card"
                          }`}
                        >
                          <div className="text-xs opacity-70">{f}</div>
                          <div className="text-2xl" style={{ fontStyle: form.hero_italic ? "italic" : "normal" }}>{ui("أهلاً وسهلاً")}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">{ui("لون النص الرئيسي")}</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.hero_color || "#F08AB0"} onChange={(e) => update("hero_color", e.target.value)} className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent" />
                      <Input value={form.hero_color ?? ""} onChange={(e) => update("hero_color", e.target.value)} placeholder="#F08AB0" dir="ltr" className="font-mono text-xs h-9" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">{ui("لون النص الفرعي")}</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.hero_subtitle_color || "#FFFDF5"} onChange={(e) => update("hero_subtitle_color", e.target.value)} className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent" />
                      <Input value={form.hero_subtitle_color ?? ""} onChange={(e) => update("hero_subtitle_color", e.target.value)} placeholder="#FFFDF5" dir="ltr" className="font-mono text-xs h-9" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">{ui("حجم النص (px)")}</Label>
                      <span className="text-xs font-bold tabular-nums text-[#558B2F]">{form.hero_size_px ?? 128}</span>
                    </div>
                    <Slider value={[form.hero_size_px ?? 128]} min={40} max={240} step={2} onValueChange={(v) => update("hero_size_px", v[0])} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
                  <Label htmlFor="ck_hero_italic" className="text-sm font-bold">{ui("خط مائل (Italic)")}</Label>
                  <Switch id="ck_hero_italic" checked={form.hero_italic ?? true} onCheckedChange={(v) => update("hero_italic", v)} />
                </div>
                <div className="rounded-xl bg-[#1a1a2e] p-6 text-center overflow-hidden border-2 border-[#F08AB0]/30">
                  <div className="text-xs font-bold text-[#F08AB0] mb-3 tracking-widest">{ui("معاينة")}</div>
                  <div
                    style={{
                      fontFamily: `"${form.hero_font_family || form.hero_font || "Mirza"}", serif`,
                      fontStyle: form.hero_italic ? "italic" : "normal",
                      fontSize: `${Math.min(110, form.hero_size_px ?? 128)}px`,
                      color: form.hero_color || "#F08AB0",
                      lineHeight: 1.5,
                      fontWeight: 700,
                      textShadow: `0 3px 8px rgba(0,0,0,0.8), 0 0 22px ${(form.hero_color || "#F08AB0")}66`,
                    }}
                  >
                    {form.hero_text || ui("أهلاً وسهلاً")}
                  </div>
                  <div className="text-xl font-bold tracking-[0.25em] mt-2" style={{ color: form.hero_subtitle_color || "#FFFDF5" }}>
                    {form.hero_subtitle_text || ui("بضيوفنا الكرام")}
                  </div>
                </div>
              </Card>

              {/* Intro paragraph */}
              <Card className="p-5 space-y-4 border-2 border-[#F08AB0]/30">
                <div className="font-extrabold text-base flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-[#F08AB0] rounded-full" />
                  {ui("فقرة الترحيب التعريفية")}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="intro_highlight" className="text-xs font-bold">{ui("النص المُبرز (ذهبي)")}</Label>
                    <Input id="intro_highlight" value={form.intro_highlight ?? ""} onChange={(e) => update("intro_highlight", e.target.value)} placeholder={ui("أهلاً وسهلاً بكم،")} />
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <Label htmlFor="intro_text" className="text-xs font-bold">{ui("نص الفقرة")}</Label>
                    <Textarea id="intro_text" rows={3} value={form.intro_text ?? ""} onChange={(e) => update("intro_text", e.target.value)} placeholder={ui("يسعدنا تشريفكم...")} />
                  </div>
                </div>
              </Card>

              {/* Steps */}
              <Card className="p-5 space-y-4 border-2 border-[#F08AB0]/30">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-base flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-[#F08AB0] rounded-full" />
                    {ui("خطوات التسجيل")}
                  </div>
                  <button
                    type="button"
                    onClick={() => update("checkin_steps", [...(form.checkin_steps ?? []), ""])}
                    className="text-xs font-bold px-3 py-1.5 rounded-md bg-[#F08AB0] text-white hover:opacity-90"
                  >
                    + {ui("إضافة خطوة")}
                  </button>
                </div>
                <div className="space-y-2">
                  {(form.checkin_steps ?? []).map((step: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-[#F08AB0] text-white text-sm font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                      <Input
                        value={step}
                        onChange={(e) => {
                          const next = [...(form.checkin_steps ?? [])];
                          next[i] = e.target.value;
                          update("checkin_steps", next);
                        }}
                        placeholder={`${ui("الخطوة")} ${i + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(form.checkin_steps ?? [])];
                          next.splice(i, 1);
                          update("checkin_steps", next);
                        }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
                      >
                        {ui("حذف")}
                      </button>
                    </div>
                  ))}
                  {(form.checkin_steps ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">{ui("لا توجد خطوات بعد. اضغط «إضافة خطوة».")}</p>
                  )}
                </div>
              </Card>

              {/* Thank-you card */}
              <Card className="p-5 space-y-4 border-2 border-[#F08AB0]/30">
                <div className="font-extrabold text-base flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-[#F08AB0] rounded-full" />
                  {ui("بطاقة الشكر والامتنان")}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="thank_title" className="text-xs font-bold">{ui("عنوان البطاقة")}</Label>
                    <Input id="thank_title" value={form.thank_title ?? ""} onChange={(e) => update("thank_title", e.target.value)} placeholder={ui("شكراً لتشريفكم حفلنا")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="thank_body" className="text-xs font-bold">{ui("نص الشكر")}</Label>
                    <Textarea id="thank_body" rows={3} value={form.thank_body ?? ""} onChange={(e) => update("thank_body", e.target.value)} placeholder={ui("حضوركم أضفى علينا بهجةً...")} />
                  </div>
                </div>
              </Card>
              <Card className="p-6 space-y-3 mt-4">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <ListOrdered className="h-5 w-5 text-[#7CB342]" />
                    {ui("معاينة فورية")}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ui("معاينة مصغّرة لشاشة العرض تعكس الاتجاه والإزاحة لحظياً.")}
                  </p>
                </div>
                {(() => {
                  const align = (form.program_align || "right") === "left" ? "left" : "right";
                  const offset = Math.min(45, Math.max(0, form.program_offset_pct ?? 22));
                  return (
                    <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-border bg-gradient-to-br from-[#0a1628] via-[#102a43] to-[#0a1628]">
                      <div className="absolute inset-2 rounded-lg border border-white/10" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-[78%] w-[34%] rounded-lg border border-[#D4A229]/60 bg-white/10 backdrop-blur-sm shadow-lg flex items-center justify-center text-[10px] font-bold text-white/90 transition-all duration-300"
                        style={
                          align === "right"
                            ? { right: `${offset}%`, left: "auto" }
                            : { left: `${offset}%`, right: "auto" }
                        }
                      >
                        {ui("فقرات الحفل")}
                      </div>
                      <div className="absolute bottom-1 inset-x-0 text-center text-[9px] text-white/50 font-bold">
                        {align === "right" ? ui("يمين") : ui("يسار")} • {ui("إزاحة")} {offset}%
                      </div>
                    </div>
                  );
                })()}
              </Card>
            </TabsContent>

            <TabsContent value="display" className="mt-0">
              <Card className="p-6 space-y-5">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Type className="h-5 w-5 text-[#D4A229]" />
                  {ui("إعدادات شاشة العرض — الخطوط والألوان")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ui("تحكّم في خطوط وألوان عنوان الترحيب، اسم الخريج (مع توهجه)، ورسالة الشكر في شاشة العرض المباشر.")}
                </p>

                {/* Welcome title */}
                <div className="rounded-lg border-2 border-[#D4A229]/20 p-4 space-y-3 bg-[#D4A229]/5">
                  <h3 className="font-bold text-sm text-[#D4A229]">{ui("عنوان الترحيب")} «{form.welcome_title}»</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{ui("اللون")}</Label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={form.display_welcome_color || "#D4A229"} onChange={(e) => update("display_welcome_color", e.target.value)} className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent" />
                        <Input value={form.display_welcome_color ?? ""} onChange={(e) => update("display_welcome_color", e.target.value)} placeholder="#D4A229" dir="ltr" className="font-mono text-xs h-9" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold">{ui("الحجم (px)")}</Label>
                        <span className="text-xs font-bold tabular-nums text-[#558B2F]">{form.display_welcome_size_px ?? 30}</span>
                      </div>
                      <Slider value={[form.display_welcome_size_px ?? 30]} min={14} max={80} step={1} onValueChange={(v) => update("display_welcome_size_px", v[0])} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{ui("الخط")}</Label>
                      <select
                        value={form.display_welcome_font || "Cairo"}
                        onChange={(e) => update("display_welcome_font", e.target.value)}
                        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm font-bold"
                      >
                        {["Cairo","Tajawal","Almarai","Reem Kufi","Aref Ruqaa","Amiri","Mirza","Lateef","Scheherazade New","Rakkas","Lalezar","Lemonada"].map((f) => (
                          <option key={f} value={f} style={{ fontFamily: `"${f}", serif` }}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Graduate name */}
                <div className="rounded-lg border-2 border-[#7CB342]/20 p-4 space-y-3 bg-[#7CB342]/5">
                  <h3 className="font-bold text-sm text-[#558B2F]">{ui("اسم الخريج")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{ui("لون الاسم")}</Label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={form.display_name_color || "#FFFFFF"} onChange={(e) => update("display_name_color", e.target.value)} className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent" />
                        <Input value={form.display_name_color ?? ""} onChange={(e) => update("display_name_color", e.target.value)} placeholder="#FFFFFF" dir="ltr" className="font-mono text-xs h-9" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{ui("لون التوهج (Glow)")}</Label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={form.display_name_glow_color || "#D4A229"} onChange={(e) => update("display_name_glow_color", e.target.value)} className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent" />
                        <Input value={form.display_name_glow_color ?? ""} onChange={(e) => update("display_name_glow_color", e.target.value)} placeholder="#D4A229" dir="ltr" className="font-mono text-xs h-9" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Thanks message */}
                <div className="rounded-lg border-2 border-[#F08AB0]/20 p-4 space-y-3 bg-[#F08AB0]/5">
                  <h3 className="font-bold text-sm text-[#F08AB0]">{ui("رسالة الشكر")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{ui("اللون")}</Label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={form.display_thanks_color || "#FFFDF5"} onChange={(e) => update("display_thanks_color", e.target.value)} className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent" />
                        <Input value={form.display_thanks_color ?? ""} onChange={(e) => update("display_thanks_color", e.target.value)} placeholder="#FFFDF5" dir="ltr" className="font-mono text-xs h-9" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold">{ui("الحجم (px)")}</Label>
                        <span className="text-xs font-bold tabular-nums text-[#558B2F]">{form.display_thanks_size_px ?? 20}</span>
                      </div>
                      <Slider value={[form.display_thanks_size_px ?? 20]} min={12} max={42} step={1} onValueChange={(v) => update("display_thanks_size_px", v[0])} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{ui("الخط")}</Label>
                      <select
                        value={form.display_thanks_font || "Cairo"}
                        onChange={(e) => update("display_thanks_font", e.target.value)}
                        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm font-bold"
                      >
                        {["Cairo","Tajawal","Almarai","Reem Kufi","Aref Ruqaa","Amiri","Mirza","Lateef","Scheherazade New"].map((f) => (
                          <option key={f} value={f} style={{ fontFamily: `"${f}", serif` }}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="rounded-xl bg-[#0A1F3D] p-6 text-center overflow-hidden border-2 border-[#D4A229]/30 space-y-3">
                  <div className="text-xs font-bold text-[#D4A229] mb-2 tracking-widest">{ui("معاينة")}</div>
                  <p
                    className="font-extrabold tracking-[0.3em] uppercase"
                    style={{
                      color: form.display_welcome_color || "#D4A229",
                      fontSize: `${form.display_welcome_size_px || 30}px`,
                      fontFamily: `"${form.display_welcome_font || "Cairo"}", serif`,
                    }}
                  >
                    {form.welcome_title}
                  </p>
                  <h2
                    className="font-extrabold leading-tight"
                    style={{
                      color: form.display_name_color || "#FFFFFF",
                      fontSize: "48px",
                      textShadow: `0 0 6px rgba(255,255,255,1), 0 0 36px ${form.display_name_glow_color || "#D4A229"}d9, 0 0 80px ${form.display_name_glow_color || "#D4A229"}aa`,
                    }}
                  >
                    {ui("الأستاذ / محمد الخريج")}
                  </h2>
                  <p
                    className="leading-relaxed font-bold max-w-xl mx-auto"
                    style={{
                      color: form.display_thanks_color || "#FFFDF5",
                      fontSize: `${form.display_thanks_size_px || 20}px`,
                      fontFamily: `"${form.display_thanks_font || "Cairo"}", serif`,
                    }}
                  >
                    {form.thank_you_message}
                  </p>
                </div>
              </Card>
              <Card className="p-6 space-y-4 mt-4">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <ListOrdered className="h-5 w-5 text-[#7CB342]" />
                    {ui("موضع بطاقة فقرات الحفل")}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ui("اختر اتجاه البطاقة على شاشة العرض ومقدار إزاحتها. يمكنك أيضاً سحب البطاقة مباشرةً من شاشة العرض لضبط الإزاحة.")}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">{ui("الاتجاه")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { v: "right", label: ui("يمين") },
                        { v: "left", label: ui("يسار") },
                      ] as const).map((o) => {
                        const active = (form.program_align || "right") === o.v;
                        return (
                          <button
                            key={o.v}
                            type="button"
                            onClick={() => update("program_align", o.v)}
                            className={`h-10 rounded-md border font-bold text-sm transition ${
                              active
                                ? "bg-[#7CB342] text-white border-[#558B2F]"
                                : "bg-card border-border hover:border-[#7CB342]"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">{ui("مقدار الإزاحة (%)")}</Label>
                      <span className="text-xs font-bold tabular-nums text-[#558B2F]">
                        {form.program_offset_pct ?? 22}%
                      </span>
                    </div>
                    <Slider
                      value={[form.program_offset_pct ?? 22]}
                      min={0}
                      max={45}
                      step={1}
                      onValueChange={(v) => update("program_offset_pct", v[0])}
                    />
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="archive" className="hidden">
            <EventArchiveCard
            settings={form}
            onEventReset={(name) => update("event_name", name)}
            />
            </TabsContent>

            <TabsContent value="content" className="mt-0">
            <Card className="p-6 space-y-3">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Tags className="h-5 w-5 text-primary" />
              {ui("ألقاب الحضور")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {ui("تظهر هذه القائمة في نماذج التسجيل (الكشك، الملصق، الضيف). يمكنك إضافة أو حذف لقب.")}
            </p>
            <TitlesManager
              value={form.titles ?? DEFAULT_TITLES}
              onChange={(v) => update("titles", v)}
            />
            </Card>
            </TabsContent>

            <TabsContent value="theme" className="mt-0">
            <Card className="p-6 space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              {ui("خلفية الشاشات")}
            </h2>
            <p className="text-xs text-muted-foreground">{ui("يمكنك ضبط خلفية موحّدة لكل الشاشات، أو تخصيص خلفية مختلفة لكل شاشة (تسجيل/عرض/كشك/ضيف).")}</p>

            {/* Custom URL */}
            <div className="space-y-2 rounded-xl border-2 border-dashed border-primary/30 p-3 bg-primary/5">
              <Label htmlFor="custom_bg" className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-primary" />
                {ui("رابط خلفية مخصصة (PNG / JPG)")}
              </Label>
              <Input
                id="custom_bg"
                value={form.backdrop_custom_url ?? ""}
                onChange={(e) => update("backdrop_custom_url", e.target.value)}
                placeholder="https://..."
                dir="ltr"
              />
              <p className="text-[11px] text-muted-foreground">{ui("يُستخدم عند اختيار «صورة مخصصة» في أي شاشة. ارفع الصورة على أي مستضيف صور وألصق الرابط هنا.")}</p>
            </div>

            {/* Default (applies to all unless per-screen override) */}
            <div>
              <Label className="mb-2 block text-sm font-bold">{ui("الخلفية الافتراضية (لجميع الشاشات)")}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ...BACKDROPS.map((b) => ({ ...b, isCustom: false, storage_path: null as string | null })),
                  ...customBackdrops.map((c) => ({ id: c.id as BackdropChoice, label: c.label, url: c.url, isCustom: true, storage_path: c.storage_path })),
                ]
                  .filter((b) => b.id === "custom" || !((form.hidden_default_backdrops ?? []).includes(String(b.id))))
                  .map((b) => {
                  const active = (form.backdrop_variant || "01") === b.id;
                  const previewUrl = b.url ?? form.backdrop_custom_url ?? null;
                  const isBuiltin = !b.isCustom && b.id !== "custom";
                  const displayLabel = isBuiltin
                    ? (form.default_backdrop_labels?.[String(b.id)] ?? b.label)
                    : b.label;
                  const persistSettings = async (patch: Partial<EventSettings>) => {
                    try {
                      await liveApi.update(patch as Record<string, any>);
                      setForm((f) => ({ ...f, ...patch } as EventSettings));
                      return true;
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذّر الحفظ"));
                      return false;
                    }
                  };
                  return (
                    <div
                      key={b.id}
                      onClick={() => update("backdrop_variant", b.id)}
                      role="button"
                      tabIndex={0}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                        active ? "border-primary ring-2 ring-primary/40 shadow" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="aspect-[9/16] bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                        {previewUrl ? <img src={previewUrl} alt="" className="w-full h-full object-cover" /> : "—"}
                      </div>
                      <div className="p-1.5 text-[10px] font-bold bg-card truncate">{displayLabel}</div>
                      {active && <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">✓</span>}
                      {b.isCustom && (
                        <div className="absolute top-1 left-1 flex gap-1">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const v = window.prompt(ui("اسم الخلفية"), b.label);
                              if (!v || !v.trim() || v.trim() === b.label) return;
                              try {
                                /* backdrops disabled */
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : String(err) || ui("تعذّر التعديل"));
                              }
                            }}
                            className="h-6 w-6 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center"
                            aria-label={ui("تعديل")}
                          >
                            <Pencil className="h-3 w-3 text-[#2E4D1F]" />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm(`${ui("حذف")} «${b.label}»؟`)) return;
                              try {
                                /* backdrops disabled */
                                if (active) update("backdrop_variant", "01");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : String(err) || ui("تعذّر الحذف"));
                              }
                            }}
                            className="h-6 w-6 rounded-full bg-white/90 hover:bg-red-50 shadow flex items-center justify-center"
                            aria-label={ui("حذف")}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </button>
                        </div>
                      )}
                      {isBuiltin && (
                        <div className="absolute top-1 left-1 flex gap-1">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const v = window.prompt(ui("اسم الخلفية"), displayLabel);
                              if (!v || !v.trim() || v.trim() === displayLabel) return;
                              const labels = { ...(form.default_backdrop_labels ?? {}), [String(b.id)]: v.trim() };
                              await persistSettings({ default_backdrop_labels: labels });
                            }}
                            className="h-6 w-6 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center"
                            aria-label={ui("تعديل")}
                          >
                            <Pencil className="h-3 w-3 text-[#2E4D1F]" />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm(`${ui("إخفاء «")}${displayLabel}${ui("» من قائمة الخلفيات؟")}`)) return;
                              const hidden = Array.from(new Set([...(form.hidden_default_backdrops ?? []), String(b.id)]));
                              const ok = await persistSettings({ hidden_default_backdrops: hidden });
                              if (ok && active) await persistSettings({ backdrop_variant: "navy", hidden_default_backdrops: hidden });
                            }}
                            className="h-6 w-6 rounded-full bg-white/90 hover:bg-red-50 shadow flex items-center justify-center"
                            aria-label={ui("إخفاء")}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {(form.hidden_default_backdrops ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">{ui("مخفية:")}</span>
                  {(form.hidden_default_backdrops ?? []).map((id) => {
                    const orig = BACKDROPS.find((x) => String(x.id) === id);
                    const lbl = form.default_backdrop_labels?.[id] ?? orig?.label ?? id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={async () => {
                          const hidden = (form.hidden_default_backdrops ?? []).filter((x) => x !== id);
                          try {
                            await liveApi.update({ hidden_default_backdrops: hidden });
                            setForm((f) => ({ ...f, hidden_default_backdrops: hidden }));
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : String(e) || ui("تعذّر الاستعادة"));
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[#7CB342]/40 bg-[#7CB342]/10 px-2 py-0.5 text-[11px] font-bold text-[#2E4D1F] hover:bg-[#7CB342]/20"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Per-screen media upload — image or video, saved immediately */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">{ui("تخصيص لكل شاشة (صورة أو فيديو)")}</Label>
              <div className="rounded-lg border border-[#D4A229]/40 bg-[#D4A229]/10 p-3 text-[12px] leading-6 text-[#5A4416]">
                <div className="font-bold mb-0.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  {ui("ارفع وسائط خاصة بكل شاشة")}
                </div>
                {ui("اختر صورة أو مقطع فيديو لكل شاشة على حدة. الحفظ تلقائي. اضغط «افتراضي» لإلغاء التخصيص والعودة للخلفية العامة.")}
              </div>
              <div className="space-y-2">
                {SCREENS.map((s) => (
                  <PerScreenMediaUpload
                    key={s.id}
                    screen={s.id}
                    label={s.label}
                    column={s.col}
                    settings={form}
                    onSaved={(val) => update(s.col, val as never)}
                  />
                ))}
              </div>
            </div>

            {/* Custom backdrops manager — CRUD */}
            <BackdropsManager />
          </Card>
          </TabsContent>

          <TabsContent value="theme" className="mt-0">
          <Card className="p-6 space-y-5">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              {ui("ضبط مظهر الخلفية والبطاقات")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {ui("تحكّم بشدّة طبقة العمق على صورة الخلفية، ودرجة شفافية البطاقات من الأعلى للأسفل.")}
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{ui("شدّة الفينيت (إطار العمق)")}</Label>
                <span className="text-xs font-bold text-[#558B2F] tabular-nums">{form.vignette_intensity ?? 18}%</span>
              </div>
              <Slider
                value={[form.vignette_intensity ?? 18]}
                min={0}
                max={60}
                step={1}
                onValueChange={(v) => update("vignette_intensity", v[0])}
              />
              <p className="text-[11px] text-muted-foreground">{ui("0% = بدون تأثير · 60% = إطار داكن واضح")}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{ui("شفافية أعلى البطاقات")}</Label>
                <span className="text-xs font-bold text-[#558B2F] tabular-nums">{form.card_top_opacity ?? 35}%</span>
              </div>
              <Slider
                value={[form.card_top_opacity ?? 35]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => update("card_top_opacity", v[0])}
              />
              <p className="text-[11px] text-muted-foreground">{ui("كلما قلّت ظهرت صورة الخلفية أكثر من أعلى البطاقة.")}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{ui("شفافية أسفل البطاقات")}</Label>
                <span className="text-xs font-bold text-[#558B2F] tabular-nums">{form.card_bottom_opacity ?? 75}%</span>
              </div>
              <Slider
                value={[form.card_bottom_opacity ?? 75]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => update("card_bottom_opacity", v[0])}
              />
              <p className="text-[11px] text-muted-foreground">{ui("كلما زادت تحسّنت قراءة النصوص أسفل البطاقة.")}</p>
            </div>

            {/* Mini live preview */}
            <div className="relative h-32 rounded-xl overflow-hidden border border-border">
              <img
                src={resolveBackdropUrl(form, "display")}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse at center, transparent 35%, rgba(46,77,31,${(form.vignette_intensity ?? 18) / 100}) 100%)`,
                }}
              />
              <div
                className="absolute inset-3 rounded-lg border border-white/40 backdrop-blur-md flex items-center justify-center text-[11px] font-bold text-[#2E4D1F]"
                style={{
                  background: `linear-gradient(180deg, rgba(255,255,255,${(form.card_top_opacity ?? 35) / 100}) 0%, rgba(255,255,255,${(form.card_bottom_opacity ?? 75) / 100}) 100%)`,
                }}
              >
                {ui("معاينة البطاقة على الخلفية")}
              </div>
            </div>
          </Card>
          </TabsContent>

          <TabsContent value="theme" className="mt-0">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Paintbrush className="h-5 w-5 text-primary" />
                {ui("الثيم المركزي (لجميع شاشات التخرج)")}
              </h2>
              <span className="text-[10px] bg-[#7CB342]/10 border border-[#7CB342]/30 text-[#558B2F] font-bold px-2 py-1 rounded-full">
                {ui("يطبَّق فوراً")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {ui("اختر قالباً جاهزاً أو خصّص ألوان الخلفية والمميِّزات والخط. يُطبَّق على شاشة العرض، التسجيل، الكشك، وصفحة الضيف معاً.")}
            </p>

            {/* Theme presets */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <Label className="block text-sm font-bold">{ui("قوالب الثيم")}</Label>
                <div className="flex gap-1 flex-wrap">
                  {GRAD_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setThemeCategory(c.id)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                        themeCategory === c.id
                          ? "bg-[#7CB342] text-white border-[#7CB342]"
                          : "bg-card text-muted-foreground border-border hover:border-[#7CB342]/50"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GRAD_PRESETS.filter((p) => themeCategory === "all" || p.category === themeCategory).map((p) => {
                  const active = (form.theme_preset || "navy") === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all text-right ${
                        active ? "border-[#7CB342] ring-2 ring-[#7CB342]/40 shadow" : "border-border hover:border-[#7CB342]/50"
                      }`}
                    >
                      <div
                        className="h-14 flex items-end p-2"
                        style={{ background: `linear-gradient(135deg, ${p.bg_from} 0%, ${p.bg_via} 60%, ${p.bg_to} 100%)` }}
                      >
                        <span className="w-4 h-4 rounded-full border border-white/30 mr-1" style={{ background: p.accent_primary }} />
                        <span className="w-4 h-4 rounded-full border border-white/30" style={{ background: p.accent_gold }} />
                      </div>
                      <div className="px-2 py-1.5 bg-card text-xs font-bold truncate flex items-center justify-between gap-1">
                        <span className="truncate">{p.label}</span>
                        <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                          {GRAD_CATEGORIES.find((c) => c.id === p.category)?.label}
                        </span>
                      </div>
                      {active && (
                        <span className="absolute top-1 right-1 bg-[#7CB342] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom colors */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-border">
              {[
                { key: "bg_from", label: ui("خلفية — أعلى") },
                { key: "bg_via", label: ui("خلفية — وسط") },
                { key: "bg_to", label: ui("خلفية — أسفل") },
                { key: "accent_primary", label: ui("اللون المميّز") },
                { key: "accent_gold", label: ui("اللون الذهبي") },
                { key: "accent_ink", label: ui("لون النص الفاتح") },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={(form[f.key as keyof EventSettings] as string) || "#000000"}
                      onChange={(e) => update(f.key as keyof EventSettings, e.target.value as never)}
                      className="h-9 w-12 rounded-md border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={(form[f.key as keyof EventSettings] as string) || ""}
                      onChange={(e) => update(f.key as keyof EventSettings, e.target.value as never)}
                      placeholder="#000000"
                      dir="ltr"
                      className="font-mono text-xs h-9"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Font selector */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                {ui("الخط")}
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GRAD_FONTS.map((f) => {
                  const active = (form.font_family || "Cairo") === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => update("font_family", f)}
                      style={{ fontFamily: `"${f}", "Cairo", sans-serif` }}
                      className={`rounded-lg border-2 p-3 text-sm font-bold transition-all ${
                        active ? "border-[#7CB342] bg-[#7CB342]/10 text-[#2E4D1F]" : "border-border hover:border-[#7CB342]/50 bg-card"
                      }`}
                    >
                      {f}
                      <div className="text-xs opacity-70 mt-1">{ui("ضيوفنا الكرام")}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live theme preview */}
            <div
              className="rounded-xl p-5 text-center border border-[#D4A229]/30"
              style={{
                background: `radial-gradient(ellipse at top, ${form.bg_from} 0%, ${form.bg_via} 55%, ${form.bg_to} 100%)`,
                fontFamily: `"${form.font_family || "Cairo"}", "Cairo", sans-serif`,
              }}
            >
              <p className="text-xs font-bold" style={{ color: form.accent_gold }}>
                {ui("معاينة الثيم الموحّد")}
              </p>
              <h3 className="text-2xl font-extrabold mt-2" style={{ color: form.accent_ink }}>
                {form.event_name}
              </h3>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold" style={{ background: form.accent_primary, color: form.accent_ink }}>
                  {ui("مرحباً بكم")}
                </span>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold" style={{ background: form.accent_gold, color: "#0A1F3D" }}>
                  {ui("أكاديمية البنين")}
                </span>
              </div>
            </div>
          </Card>
          </TabsContent>

          <TabsContent value="theme" className="mt-0">
          <Card className="p-6 space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              {ui("الهوية البصرية (توكنز النظام العام)")}
            </h2>

            <BrandColorExtractor
              onApply={(patch) => {
                setForm((prev) => {
                  const next = {
                    ...prev,
                    primary_color: patch.primary_color,
                    secondary_color: patch.secondary_color,
                    accent_primary: patch.accent_primary,
                    accent_gold: patch.accent_gold,
                    accent_ink: patch.accent_ink,
                  };
                  applyThemeColors(next.primary_color, next.secondary_color);
                  applyGradTheme(next);
                  return next;
                });
                toast.success(ui('تم استخراج الهوية — اضغط حفظ لتثبيت التغييرات'));
              }}
            />

            <div>
              <Label className="mb-2 block">{ui("قوالب جاهزة")}</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p)}
                    className="border border-border rounded-lg p-3 text-right hover:border-primary transition-colors text-sm"
                  >
                    <div className="flex gap-1 mb-2">
                      <span className="w-5 h-5 rounded-full" style={{ background: `hsl(${p.primary})` }} />
                      <span className="w-5 h-5 rounded-full" style={{ background: `hsl(${p.secondary})` }} />
                    </div>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="primary">{ui("اللون الأساسي (HSL)")}</Label>
                <div className="flex gap-2 items-center">
                  <span className="w-9 h-9 rounded-md border border-border" style={{ background: `hsl(${form.primary_color})` }} />
                  <Input id="primary" value={form.primary_color} onChange={(e) => update("primary_color", e.target.value)} placeholder="98 84% 47%" dir="ltr" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary">{ui("اللون الثانوي (HSL)")}</Label>
                <div className="flex gap-2 items-center">
                  <span className="w-9 h-9 rounded-md border border-border" style={{ background: `hsl(${form.secondary_color})` }} />
                  <Input id="secondary" value={form.secondary_color} onChange={(e) => update("secondary_color", e.target.value)} placeholder="45 96% 60%" dir="ltr" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo">{ui("رابط الشعار (اختياري)")}</Label>
              <div className="flex gap-2 items-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <Input id="logo" value={form.logo_url ?? ""} onChange={(e) => update("logo_url", e.target.value)} placeholder="https://..." dir="ltr" />
              </div>
              <p className="text-xs text-muted-foreground">{ui("سيظهر بجانب اسم الفعالية في الترويسة وشاشة العرض")}</p>
            </div>

            <Button onClick={handleSave} disabled={saving} size="lg" className="w-full bg-gradient-primary">
              <Save className="h-5 w-5 ml-2" />
              {saving ? ui("جاري الحفظ...") : ui("حفظ التغييرات")}
            </Button>
          </Card>
          </TabsContent>

          <TabsContent value="buttons" className="hidden">
            <ButtonsPermissionsCard form={form} update={update} />
          </TabsContent>
          </Tabs>
        </div>

        {/* Live preview */}
        <div className="space-y-4">
          <h3 className="font-bold">{ui("معاينة مباشرة")}</h3>

          {/* Per-screen backdrop preview */}
          <Card className="p-3 space-y-2">
            <h4 className="text-xs font-bold text-muted-foreground">{ui("معاينة خلفيات الشاشات")}</h4>
            <div className="grid grid-cols-2 gap-2">
              {SCREENS.map((s) => {
                const url = resolveBackdropUrl(form, s.id);
                return (
                  <div key={s.id} className="relative rounded-lg overflow-hidden border border-border aspect-video">
                    {url ? <img src={url} alt={s.label} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-muted" />}
                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{s.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-card to-primary/5 border-primary/20 text-center space-y-4">
            {form.logo_url && (
              <img src={form.logo_url} alt={ui("شعار")} className="h-16 mx-auto object-contain" />
            )}
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-primary">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm text-muted-foreground">{form.welcome_title}</p>
            <h4 className="text-2xl font-extrabold bg-gradient-to-l from-primary to-primary-glow bg-clip-text text-transparent">
              {ui("ضيفنا الكريم")}
            </h4>
            <div className="bg-card/80 rounded-xl p-4 border border-border/50 text-sm leading-relaxed">
              {form.thank_you_message}
            </div>
            <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
              {form.event_name}
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default EventLiveSettings;
