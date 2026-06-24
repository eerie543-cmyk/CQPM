import { useContext } from 'react';
import { ThemeCtx } from '@/contexts/Theme';

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
