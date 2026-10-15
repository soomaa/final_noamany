import { activeNavPath, activeSectionId } from '@/lib/nav';

const STORAGE_KEY = 'one80_nav_visits';
export const MAX_QUICK_ACCESS = 4;
export const NAV_VISIT_EVENT = 'one80:nav-visit';

interface VisitEntry {
  count: number;
  lastAt: number;
}

type VisitStore = Record<string, Record<string, VisitEntry>>;

function readStore(): VisitStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VisitStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: VisitStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(NAV_VISIT_EVENT));
}

/** Record a page visit for quick-access ranking (per section). */
export function recordNavVisit(pathname: string) {
  if (pathname.startsWith('/hub/') || pathname === '/dashboard' || pathname === '/login') return;

  const sectionId = activeSectionId(pathname);
  const path = activeNavPath(pathname);
  if (!sectionId || !path) return;

  const store = readStore();
  const section = store[sectionId] ?? {};
  const cur = section[path] ?? { count: 0, lastAt: 0 };
  section[path] = { count: cur.count + 1, lastAt: Date.now() };
  store[sectionId] = section;
  writeStore(store);
}

/** Top N most-visited routes in a section, filled from fallbacks when needed. */
export function getTopSectionRoutes(
  sectionId: string,
  allowed: string[],
  fallback: string[],
  limit = MAX_QUICK_ACCESS,
): string[] {
  const allowedSet = new Set(allowed);
  const store = readStore()[sectionId] ?? {};

  const ranked = Object.entries(store)
    .filter(([path]) => allowedSet.has(path))
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt)
    .map(([path]) => path);

  const out: string[] = [];
  for (const path of ranked) {
    if (out.length >= limit) break;
    if (!out.includes(path)) out.push(path);
  }

  for (const path of fallback) {
    if (out.length >= limit) break;
    if (allowedSet.has(path) && !out.includes(path)) out.push(path);
  }

  for (const path of allowed) {
    if (out.length >= limit) break;
    if (!out.includes(path)) out.push(path);
  }

  return out.slice(0, limit);
}

export function readSectionVisits(sectionId: string): Record<string, VisitEntry> {
  return readStore()[sectionId] ?? {};
}
