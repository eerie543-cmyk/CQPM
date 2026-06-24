import { useContext } from 'react';
import { ToastCtx } from '@/contexts/Toast';

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx; // toast(message, type)
}
