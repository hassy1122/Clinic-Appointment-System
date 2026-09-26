import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getAccessToken, setAccessToken } from '../lib/api';
import type { Role, User } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    consent: boolean;
  }) => Promise<User>;
  acceptInvite: (input: {
    token: string;
    name: string;
    password: string;
    phone?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionResponse {
  accessToken: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAccessToken()) {
        // Try a silent refresh — the httpOnly cookie may still be valid
        try {
          await api<SessionResponse>('/auth/refresh', { method: 'POST', skipAuthRetry: true });
        } catch {
          /* not signed in */
        }
      }
      if (getAccessToken()) {
        try {
          const res = await api<{ user: User }>('/auth/me');
          if (!cancelled) setUser(res.user);
        } catch {
          setAccessToken(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRetry: true,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const signup = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string; consent: boolean }) => {
      const res = await api<SessionResponse>('/auth/signup', {
        method: 'POST',
        body: input,
        skipAuthRetry: true,
      });
      setAccessToken(res.accessToken);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const acceptInvite = useCallback(
    async (input: { token: string; name: string; password: string; phone?: string }) => {
      const res = await api<SessionResponse>('/auth/accept-invite', {
        method: 'POST',
        body: input,
        skipAuthRetry: true,
      });
      setAccessToken(res.accessToken);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', skipAuthRetry: true });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, acceptInvite, logout }),
    [user, loading, login, signup, acceptInvite, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const HOME_FOR_ROLE: Record<Role, string> = {
  PATIENT: '/patient/appointments',
  DOCTOR: '/doctor',
  ADMIN: '/admin',
};
