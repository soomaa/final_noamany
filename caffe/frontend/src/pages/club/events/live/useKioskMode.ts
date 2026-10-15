import { useEffect, useState } from "react";

/**
 * Kiosk helpers:
 * - Tracks fullscreen state
 * - Exposes enter() that must be called from a user gesture
 * - Blocks the browser back button by re-pushing history state
 * - Suppresses context menu and pull-to-refresh-style gestures
 */
export function useKioskMode() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );

  // Track fullscreen changes
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Block back button
  useEffect(() => {
    const push = () => window.history.pushState({ kiosk: true }, "");
    push();
    const onPop = () => {
      // Re-push so we stay on the page
      push();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Suppress right-click and warn before close/reload
  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("contextmenu", onContext);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      /* user denied or unsupported */
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  };

  return { isFullscreen, enterFullscreen, exitFullscreen };
}
