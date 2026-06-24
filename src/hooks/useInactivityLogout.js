import { useEffect, useRef } from 'react';

export const INACTIVITY_LS_KEY = 'cqpm:inactivity_timeout_min';
const EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];

/**
 * Auto-logs out the user after a configurable period of inactivity.
 * Reads the timeout from localStorage on every activity reset, so changes
 * made in Settings take effect at the next mouse/key event without a reload.
 * Setting the value to 0 (or leaving it unset) disables the feature.
 */
export function useInactivityLogout(logout, isAuthenticated) {
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let timerId = null;

    function reset() {
      clearTimeout(timerId);
      const mins = parseInt(localStorage.getItem(INACTIVITY_LS_KEY) || '0', 10);
      if (!mins || mins <= 0) return;
      timerId = setTimeout(() => logoutRef.current(), mins * 60 * 1000);
    }

    reset();
    EVENTS.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      clearTimeout(timerId);
      EVENTS.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [isAuthenticated]);
}
