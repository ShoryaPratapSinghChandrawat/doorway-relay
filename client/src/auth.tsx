import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, refreshCsrf } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  registrationOpen: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  updateDisplayName: (displayName: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await refreshCsrf();
      const response = await apiGet<{ user: User | null; registrationOpen: boolean }>('/api/auth/me');
      setUser(response.user);
      setRegistrationOpen(response.registrationOpen);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your session.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiPost<{ user: User }>('/api/auth/login', { email, password });
    await refreshCsrf();
    setUser(response.user);
    setRegistrationOpen(false);
    setError(null);
  }, []);

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const response = await apiPost<{ user: User }>('/api/auth/register', { displayName, email, password });
    await refreshCsrf();
    setUser(response.user);
    setRegistrationOpen(false);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    await apiPost<void>('/api/auth/logout');
    await refreshCsrf();
    setUser(null);
  }, []);
  const updateDisplayName = useCallback((displayName: string) => {
    setUser((current) => current ? { ...current, displayName } : current);
  }, []);

  const value = useMemo(() => ({ user, registrationOpen, loading, error, login, register, logout, reload, updateDisplayName }), [user, registrationOpen, loading, error, login, register, logout, reload, updateDisplayName]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
