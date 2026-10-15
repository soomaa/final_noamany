import axios, { AxiosError } from 'axios';
import { uiStatic } from '@/lib/ui-static';

/** Single axios instance. Vite proxies /api → http://localhost:4000 in dev. */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        refreshing =
          refreshing ??
          api.post('/auth/refresh').then(() => undefined);
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
      }
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
