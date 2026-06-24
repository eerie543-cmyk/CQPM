import { useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToastCtx } from '@/contexts/Toast';

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONE = {
  success: 'border-emerald-500/30 text-emerald-300',
  error:   'border-destructive/40 text-destructive',
  info:    'border-sky-500/30 text-sky-300',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const toast = useCallback((message, type = 'info', ms = 4000) => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, message, type }]);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2 w-80 max-w-[calc(100vw-2.5rem)]">
        {toasts.map(t => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border bg-card shadow-xl px-3.5 py-3 animate-slide-up',
                TONE[t.type] || TONE.info,
              )}>
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="flex-1 text-xs leading-relaxed text-foreground break-words">{t.message}</p>
              <button onClick={() => dismiss(t.id)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
