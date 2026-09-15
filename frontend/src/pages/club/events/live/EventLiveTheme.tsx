import { useEffect } from "react";
import { useEventSettings, applyGradTheme } from "./useEventSettings";
import { APP_LIVE_THEME } from "./live-brand";
import { uiStatic } from "@/lib/ui-static";

export const GRAD_FONTS = [
  "Cairo",
  "Tajawal",
  "Almarai",
  "Amiri",
  "IBM Plex Sans Arabic",
  "Noto Kufi Arabic",
  "Markazi Text",
  "Reem Kufi",
];

export type GradCategory = "feminine" | "masculine" | "neutral" | "kids";

export const GRAD_CATEGORIES: { id: GradCategory | "all"; label: string }[] = [
  { id: "all", label: uiStatic("الكل") },
  { id: "feminine", label: uiStatic("نسائي") },
  { id: "masculine", label: uiStatic("رجالي") },
  { id: "neutral", label: uiStatic("محايد") },
  { id: "kids", label: uiStatic("أطفال") },
];

export const GRAD_PRESETS: {
  id: string;
  label: string;
  category: GradCategory;
  bg_from: string;
  bg_via: string;
  bg_to: string;
  accent_primary: string;
  accent_gold: string;
  accent_ink: string;
}[] = [
  // ===== Noamany default =====
  { id: "one80",     label: "Noamany Fitness Center",            category: "masculine", bg_from: APP_LIVE_THEME.bgFrom, bg_via: APP_LIVE_THEME.bgVia, bg_to: APP_LIVE_THEME.bgTo, accent_primary: APP_LIVE_THEME.accentPrimary, accent_gold: APP_LIVE_THEME.accentGold, accent_ink: APP_LIVE_THEME.accentInk },
  // ===== Masculine =====
  { id: "navy",      label: uiStatic("نيفي أزرق"),        category: "masculine", bg_from: "#0B2545", bg_via: "#0A1F38", bg_to: "#061528", accent_primary: "#2E8BC7", accent_gold: "#E8973A", accent_ink: "#F8FAFC" },
  { id: "emerald",   label: uiStatic("زمردي فاخر"),      category: "masculine", bg_from: "#0F3D2E", bg_via: "#08291E", bg_to: "#031712", accent_primary: "#7CB342", accent_gold: "#E0B548", accent_ink: "#FFFDF5" },
  { id: "midnight",  label: uiStatic("أسود فاخر"),        category: "masculine", bg_from: "#1F1F1F", bg_via: "#0F0F0F", bg_to: "#050505", accent_primary: "#D4A229", accent_gold: "#F2C66B", accent_ink: "#FFFDF5" },
  { id: "steel",     label: uiStatic("رمادي فولاذي"),     category: "masculine", bg_from: "#2D3748", bg_via: "#1A202C", bg_to: "#0E141C", accent_primary: "#7CB342", accent_gold: "#D4A229", accent_ink: "#F7FAFC" },

  // ===== Feminine =====
  { id: "rosegold",  label: uiStatic("وردي ذهبي"),        category: "feminine",  bg_from: "#5C2A3E", bg_via: "#3D1A2A", bg_to: "#20091A", accent_primary: "#F4C2D7", accent_gold: "#E6B17E", accent_ink: "#FFF5F8" },
  { id: "blush",     label: uiStatic("خدّي راقي"),         category: "feminine",  bg_from: "#7A3B4F", bg_via: "#52253A", bg_to: "#2D1224", accent_primary: "#FFB4C6", accent_gold: "#F2C66B", accent_ink: "#FFF5F8" },
  { id: "lavender",  label: uiStatic("لافندر أنثوي"),     category: "feminine",  bg_from: "#5B3A7A", bg_via: "#3E2557", bg_to: "#1F1235", accent_primary: "#D8B4FE", accent_gold: "#F2C66B", accent_ink: "#FBF5FF" },
  { id: "burgundy",  label: uiStatic("عنابي ذهبي"),       category: "feminine",  bg_from: "#4A1020", bg_via: "#2E0A14", bg_to: "#16050A", accent_primary: "#D4A229", accent_gold: "#F2C66B", accent_ink: "#FFF5EC" },
  { id: "mauve",     label: uiStatic("موف فخم"),          category: "feminine",  bg_from: "#4A2E47", bg_via: "#321F30", bg_to: "#1A101A", accent_primary: "#E8B4D8", accent_gold: "#D4A229", accent_ink: "#FFF5F8" },
  { id: "coral",     label: uiStatic("مرجاني دافئ"),      category: "feminine",  bg_from: "#5E2A24", bg_via: "#3F1B16", bg_to: "#1E0A07", accent_primary: "#FF9B85", accent_gold: "#F2C66B", accent_ink: "#FFF5EC" },

  // ===== Neutral =====
  { id: "royal",     label: uiStatic("بنفسجي ملكي"),      category: "neutral",   bg_from: "#2B1A5C", bg_via: "#1A0F3D", bg_to: "#0B0620", accent_primary: "#A78BFA", accent_gold: "#F2C66B", accent_ink: "#FFFDF5" },
  { id: "teal",      label: uiStatic("فيروزي عصري"),      category: "neutral",   bg_from: "#0E3B3F", bg_via: "#08272A", bg_to: "#031416", accent_primary: "#5EEAD4", accent_gold: "#FACC15", accent_ink: "#F0FDFA" },
  { id: "ivory",     label: uiStatic("عاجي فاتح"),         category: "neutral",   bg_from: "#F5EFE6", bg_via: "#E8DEC9", bg_to: "#D4C5A8", accent_primary: "#558B2F", accent_gold: "#A8801F", accent_ink: "#2E2A20" },

  // ===== Kids =====
  { id: "candy",     label: uiStatic("حلوى ملوّنة"),       category: "kids",      bg_from: "#FF6B9D", bg_via: "#C44569", bg_to: "#6C5CE7", accent_primary: "#FDE68A", accent_gold: "#FB923C", accent_ink: "#FFF5F8" },
  { id: "sky",       label: uiStatic("سماوي مرح"),         category: "kids",      bg_from: "#4FC3F7", bg_via: "#29B6F6", bg_to: "#0288D1", accent_primary: "#FFEB3B", accent_gold: "#FF9800", accent_ink: "#FFFFFF" },
];

/**
 * Injects graduation theme CSS variables into :root and ensures the
 * selected Arabic font is loaded from Google Fonts. Drop near the
 * top of any /graduation/* page.
 */
const BASE_STYLE_ID = "grad-base-tokens";

/**
 * Injects the base graduation design tokens + utility classes once.
 * These mirror the originating app's index.css so the ported graduation UI
 * (which uses `hsl(var(--grad-*))`, `bg-grad-primary`, `text-grad-green`, etc.)
 * renders identically without touching the global stylesheet/tailwind config.
 */
const ensureBaseTokens = () => {
  if (typeof document === "undefined" || document.getElementById(BASE_STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = BASE_STYLE_ID;
  tag.textContent = `
    :root {
      --grad-green: 357 85% 52%;
      --grad-green-dark: 45 96% 42%;
      --grad-green-ink: 45 40% 10%;
      --grad-gold: 45 100% 55%;
      --grad-gold-dark: 42 95% 45%;
      --grad-cream: 45 40% 98%;
      --gradient-grad-primary: linear-gradient(135deg, hsl(var(--grad-green)), hsl(var(--grad-green-dark)));
      --gradient-grad-gold: linear-gradient(135deg, hsl(var(--grad-gold)), hsl(var(--grad-gold-dark)));
      --gradient-grad-rtl-primary: linear-gradient(to left, hsl(var(--grad-green)), hsl(var(--grad-green-dark)));
      --gradient-grad-rtl-gold: linear-gradient(to left, hsl(var(--grad-gold)), hsl(var(--grad-gold-dark)));
      --shadow-grad-green: 0 10px 25px -10px hsl(var(--grad-green) / 0.35);
      --shadow-grad-gold: 0 10px 25px -10px hsl(var(--grad-gold) / 0.35);
    }
    .bg-grad-primary { background: var(--gradient-grad-primary); }
    .bg-grad-gold { background: var(--gradient-grad-gold); }
    .bg-grad-primary-rtl { background: var(--gradient-grad-rtl-primary); }
    .bg-grad-gold-rtl { background: var(--gradient-grad-rtl-gold); }
    .bg-gradient-primary { background: var(--gradient-grad-primary); }
    .text-grad-green { color: hsl(var(--grad-green-dark)); }
    .text-grad-ink { color: hsl(var(--grad-green-ink)); }
    .text-grad-gold { color: hsl(var(--grad-gold-dark)); }
    .shadow-grad-green { box-shadow: var(--shadow-grad-green); }
    .shadow-grad-gold { box-shadow: var(--shadow-grad-gold); }
  `;
  document.head.appendChild(tag);
};

export const EventLiveTheme = () => {
  const { settings } = useEventSettings();

  useEffect(() => {
    ensureBaseTokens();
  }, []);

  useEffect(() => {
    applyGradTheme(settings);
  }, [settings]);

  // Inject Google Font link once per font choice
  useEffect(() => {
    const font = (settings.font_family || "Cairo").trim();
    const id = `grad-font-${font.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;700;800;900&display=swap`;
    document.head.appendChild(link);
  }, [settings.font_family]);

  return null;
};

/** Returns the radial gradient string used for the body background of all graduation pages. */
export const gradBgStyle = (): React.CSSProperties => ({
  background:
    "radial-gradient(ellipse at top, var(--grad-bg-from, #1A1608) 0%, var(--grad-bg-via, #121008) 55%, var(--grad-bg-to, #050505) 100%)",
  fontFamily: "var(--grad-font, 'Cairo', system-ui, sans-serif)",
});
