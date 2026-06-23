import { createContext, useState, useCallback, useEffect, useRef } from 'react';

const SESSION_MS = 10 * 60 * 60 * 1000; // 10 hours
const WARN_BEFORE_MS = 30 * 60 * 1000;  // warn 30 mins before expiry

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken]         = useState(null);
  const [user, setUser]           = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [sessionWarn, setWarn]    = useState(false);
  const [mustChange, setMustChange] = useState(false);

  const logoutTimer = useRef(null);
  const warnTimer   = useRef(null);

  const clearTimers = () => {
    clearTimeout(logoutTimer.current);
    clearTimeout(warnTimer.current);
  };

  const logout = useCallback(() => {
    clearTimers();
    setToken(null);
    setUser(null);
    setExpiresAt(null);
    setWarn(false);
    setMustChange(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await window.cqpm.auth.login({ username, password });
    if (result.error) return { error: result.error };

    const exp = Date.now() + SESSION_MS;
    setToken(result.token);
    setUser(result.user);
    setExpiresAt(exp);
    setWarn(false);

    clearTimers();
    logoutTimer.current = setTimeout(logout, SESSION_MS);
    warnTimer.current   = setTimeout(() => setWarn(true), SESSION_MS - WARN_BEFORE_MS);

    setMustChange(!!result.mustChangePassword);
    return { success: true, mustChangePassword: result.mustChangePassword };
  }, [logout]);

  // Change the signed-in user's password. Clears the must-change gate on success.
  const changePassword = useCallback(async (oldPassword, newPassword) => {
    const res = await window.cqpm.auth.changePassword({ token, oldPassword, newPassword });
    if (res?.success) setMustChange(false);
    return res ?? { error: 'Unexpected error.' };
  }, [token]);

  const dismissWarn = useCallback(() => setWarn(false), []);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  return (
    <AuthContext.Provider value={{
      token,
      user,
      expiresAt,
      sessionWarn,
      isAuthenticated: !!token,
      isAdmin: user?.role === 'admin',
      mustChangePassword: mustChange,
      login,
      logout,
      changePassword,
      dismissWarn,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
