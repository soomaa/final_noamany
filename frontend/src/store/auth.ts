import { create } from 'zustand';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query';
import type { AuthUser } from '@/types';

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  switchPosUser: (user: AuthUser) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
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
    queryClient.clear();
    set({ user: null, status: 'unauthenticated' });
  },

  bootstrap: async () => {
    // HttpOnly authentication cookies are intentionally invisible to JavaScript;
    // /auth/me is the authoritative bootstrap check.
    set({ status: 'loading' });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  switchPosUser: async (user) => {
    queryClient.clear();
    set({ user, status: 'authenticated' });
  },
}));
