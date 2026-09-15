import { create } from 'zustand';
import { api, getAccessToken, setAccessToken } from '@/lib/api';
import { queryClient } from '@/lib/query';
import type { AuthUser } from '@/types';

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  switchPosUser: (accessToken: string, user: AuthUser) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    setAccessToken(data.accessToken);
    // API payloads are permission- and creator-scoped. Never reuse the previous account's cache
    // when a different receptionist signs in on the same browser/device.
    queryClient.clear();
    set({ user: data.user, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    queryClient.clear();
    set({ user: null, status: 'unauthenticated' });
  },

  bootstrap: async () => {
    set({ status: 'loading' });
    try {
      if (!getAccessToken()) {
        const { data: refreshed } = await api.post('/auth/refresh');
        setAccessToken(refreshed.accessToken);
      }
      const { data } = await api.get('/auth/me');
      set({ user: data, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  switchPosUser: async (accessToken, user) => {
    setAccessToken(accessToken);
    queryClient.clear();
    set({ user, status: 'authenticated' });
  },
}));
