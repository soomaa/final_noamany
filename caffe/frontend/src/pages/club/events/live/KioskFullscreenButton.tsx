import { Maximize2, Minimize2 } from "lucide-react";
import { useKioskMode } from "./useKioskMode";
import { useLocale } from '@/store/locale';

/**
 * Floating fullscreen toggle — premium pill with tooltip, pulse ring and glow.
 */
export const KioskFullscreenButton = () => {
  const { ui } = useLocale();
  const { isFullscreen, enterFullscreen, exitFullscreen } = useKioskMode();
  const label = isFullscreen ? ui("خروج من ملء الشاشة") : ui("ملء الشاشة");
  return (
    <div className="fixed bottom-5 left-5 z-[100] print:hidden group" dir="rtl">
      {/* Tooltip */}
      <span
        className="absolute bottom-1/2 translate-y-1/2 right-full mr-3 whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-[hsl(var(--grad-green-ink))]/95 border border-[hsl(var(--grad-gold))]/50 shadow-xl opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none"
      >
        {label}
        <span className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 rotate-45 bg-[hsl(var(--grad-green-ink))]/95 border-l border-b border-[hsl(var(--grad-gold))]/50" />
      </span>

      <button
        type="button"
        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
        aria-label={label}
        className="relative h-12 w-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--grad-gold))]/40"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--grad-green)) 0%, hsl(var(--grad-green-dark)) 100%)",
          boxShadow:
            "0 10px 30px -8px hsl(var(--grad-green) / 0.7), 0 0 0 2px rgba(255,255,255,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        {/* Outer pulse ring */}
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: "0 0 0 0 hsl(var(--grad-gold) / 0.55)",
            animation: "kiosk-fs-pulse 2.2s ease-out infinite",
          }}
          aria-hidden
        />
        {/* Gold thin ring */}
        <span className="absolute inset-[3px] rounded-full ring-1 ring-[hsl(var(--grad-gold))]/70 pointer-events-none" aria-hidden />

        {isFullscreen ? (
          <Minimize2 className="relative h-5 w-5 text-white drop-shadow" />
        ) : (
          <Maximize2 className="relative h-5 w-5 text-white drop-shadow" />
        )}
      </button>

      <style>{`
        @keyframes kiosk-fs-pulse {
          0% { box-shadow: 0 0 0 0 hsl(var(--grad-gold) / 0.55); }
          70% { box-shadow: 0 0 0 14px hsl(var(--grad-gold) / 0); }
          100% { box-shadow: 0 0 0 0 hsl(var(--grad-gold) / 0); }
        }
      `}</style>
    </div>
  );
};
