import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  workspace: Workspace | null;
  initializing: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; fullName?: string; workspaceName?: string }) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  setWorkspace: (ws: Workspace) => void;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    const j = (() => { try { return JSON.parse(txt); } catch { return null; } })() as { message?: string | string[] } | null;
    const m = j?.message ?? res.statusText;
    throw new Error(Array.isArray(m) ? m.join('; ') : String(m));
  }
  return res.json();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      workspace: null,
      initializing: false,

      async login(email, password) {
        const r = await call<{ accessToken: string; refreshToken: string; user: AuthUser; workspace: Workspace | null }>(
          '/auth/login',
          { email, password },
        );
        set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, workspace: r.workspace });
      },

      async register(data) {
        const r = await call<{ accessToken: string; refreshToken: string; user: AuthUser; workspace: Workspace | null }>(
          '/auth/register',
          data,
        );
        set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, workspace: r.workspace });
      },

      async refresh() {
        const rt = get().refreshToken;
        if (!rt) return false;
        try {
          const r = await call<{ accessToken: string; refreshToken: string; user: AuthUser; workspace: Workspace | null }>(
            '/auth/refresh',
            { refreshToken: rt },
          );
          set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, workspace: r.workspace });
          return true;
        } catch {
          set({ accessToken: null, refreshToken: null, user: null, workspace: null });
          return false;
        }
      },

      async logout() {
        const rt = get().refreshToken;
        if (rt) {
          await call('/auth/logout', { refreshToken: rt }).catch(() => undefined);
        }
        set({ accessToken: null, refreshToken: null, user: null, workspace: null });
      },

      setWorkspace(ws) {
        set({ workspace: ws });
      },
    }),
    { name: 'flowforge-auth' },
  ),
);
