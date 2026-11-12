import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => { tokenStore.set(null); setUser(null); }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => tokenStore.set(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.token);
    setUser(r.user);
  }, []);

  const value = useMemo(() => ({
    user, ready, login, logout,
    can: (...roles) => !!user && roles.includes(user.role),
    isStaff: !!user && ['admin', 'coordinator', 'logistics'].includes(user.role),
  }), [user, ready, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
