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
    void queryClient.removeQueries({ queryKey: ['me'] });
    set({ user: data.user, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    void queryClient.removeQueries({ queryKey: ['me'] });
    set({ user: null, status: 'unauthenticated' });
  },

  bootstrap: async () => {
    // Do not call the protected profile endpoint for an anonymous visitor.
    // Besides avoiding a noisy expected 401 on the login page, this prevents
    // the app from treating a normal logged-out state as an API failure.
    if (!getAccessToken()) {
      set({ user: null, status: 'unauthenticated' });
      return;
    }
    set({ status: 'loading' });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  switchPosUser: async (accessToken, user) => {
    setAccessToken(accessToken);
    set({ user, status: 'authenticated' });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['shift-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['shifts'] }),
    ]);
  },
}));
