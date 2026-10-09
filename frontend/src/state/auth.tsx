import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { User } from '../domain/types';

interface Auth {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile change. */
  setUser: (u: User) => void;
}

const AuthContext = createContext<Auth | null>(null);

// who was signed in on this browser: pages open at once, the server confirms it after
const USER_KEY = 'eduschedule:user';
function readUser(): User | null {
  try {
    return localStorage.getItem('eduschedule:token') ? JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') : null;
  } catch {
    return null;
  }
}
function rememberUser(u: User | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(readUser);
  const [ready, setReady] = useState(() => readUser() !== null);
  const setUser = useCallback((u: User | null) => {
    rememberUser(u);
    setUserState(u);
  }, []);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [setUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      const session = await api.login(username, password);
      setUser(session.user);
      return session.user;
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, [setUser]);

  const value = useMemo(() => ({ user, ready, login, logout, setUser }), [user, ready, login, logout, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
