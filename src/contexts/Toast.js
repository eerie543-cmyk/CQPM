import { createContext } from 'react';

// Provides a `toast(message, type)` function. type: 'success' | 'error' | 'info'.
export const ToastCtx = createContext(null);
