import { useState, useEffect, useCallback } from 'react';
import { ThemeCtx } from './Theme';

const KEY = 'cqpm.theme';

/**
 * Light/dark theme. The index.html ships with class="dark" so the very first
 * paint is dark; this provider then syncs to the saved preference and toggles
 * the `dark` class on <html> (which drives the CSS variables in index.css).
 */
export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(KEY);
    return saved ? saved === 'dark' : true; // default dark
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = useCallback(() => setDark(d => !d), []);

  return (
    <ThemeCtx.Provider value={{ dark, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}
