import axios, { AxiosError } from 'axios';
import { uiStatic } from '@/lib/ui-static';

/** Single axios instance. Vite proxies /api → http://127.0.0.1:4002 in dev. */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
  // Access tokens stay in memory. Session persistence is provided by the
  // HttpOnly refresh cookie, which JavaScript cannot read after an XSS bug.
  localStorage.removeItem('one80_token');
}
export function getAccessToken(): string | null {
  return accessToken;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** The account id (`sub`) inside an access token, or null when it cannot be read. */
function tokenSubject(token: string | null): number | null {
  try {
    const part = token?.split('.')[1];
    if (!part) return null;
    const sub = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).sub;
    return typeof sub === 'number' ? sub : null;
  } catch {
    return null;
  }
}

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const previousSubject = tokenSubject(getAccessToken());
      try {
        refreshing =
          refreshing ??
          api.post('/auth/refresh').then((r) => {
            const t = r.data?.accessToken ?? null;
            setAccessToken(t);
            return t;
          });
        const newToken = await refreshing;
        refreshing = null;
        // The refresh cookie is shared by every tab. If another tab signed in with a different
        // account meanwhile, reload so this tab's name, sidebar and data all follow that account.
        const nextSubject = tokenSubject(newToken);
        if (previousSubject != null && nextSubject != null && nextSubject !== previousSubject) {
          location.reload();
          return new Promise(() => {});
        }
        if (newToken) {
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch {
        refreshing = null;
      }
      setAccessToken(null);
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Pull the Arabic message the API returns, else a sane default. */
export function apiError(error: unknown, fallback = uiStatic('حدث خطأ ما')): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return uiStatic(String(msg[0] ?? fallback));
    if (typeof msg === 'string') return uiStatic(msg);
    if (msg && typeof msg === 'object' && 'message' in msg) {
      const inner = (msg as { message?: unknown }).message;
      if (typeof inner === 'string') return uiStatic(inner);
    }
  }
  return fallback;
}
