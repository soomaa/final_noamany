import { useEffect, useState } from "react";

export type ViewerRole = "staff" | "guest";

/**
 * Viewer role is derived ONLY from the URL `?role=` query param (no persistence).
 * `?role=staff` → staff, anything else (incl. missing) → guest.
 */
const readRole = (): ViewerRole => {
  if (typeof window === "undefined") return "guest";
  try {
    const u = new URL(window.location.href);
    const q = u.searchParams.get("role");
    return q === "staff" ? "staff" : "guest";
  } catch {
    return "guest";
  }
};

export const useViewerRole = () => {
  const [role, setRoleState] = useState<ViewerRole>(readRole);

  // Re-derive on history navigation so role tracks the URL.
  useEffect(() => {
    const onNav = () => setRoleState(readRole());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  /** Updates the role by rewriting the `?role=` query param (URL is the single source of truth). */
  const setRole = (r: ViewerRole) => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("role", r);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      /* no-op */
    }
    setRoleState(r);
  };

  return { role, setRole };
};

export const getViewerRole = readRole;
