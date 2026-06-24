import { Clock, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function SessionWarning() {
  const { sessionWarn, dismissWarn, logout, expiresAt } = useAuth();
  if (!sessionWarn) return null;
  if (localStorage.getItem('cqpm:notify_session_warn') === 'false') return null;

  const minsLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))
    : 30;

  return (
    <div
      className={cn(
        'fixed bottom-5 right-5 z-50 w-80',
        'rounded-xl border border-amber-500/30 bg-card shadow-xl',
        'p-4 flex gap-3 items-start animate-slide-up'
      )}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
        <Clock className="w-4 h-4 text-amber-500" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Session expiring soon</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your session ends in ~{minsLeft} minute{minsLeft !== 1 ? 's' : ''}.
          Sign out and back in to extend it.
        </p>
        <button
          onClick={logout}
          className="mt-2 text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors"
        >
          Sign out now →
        </button>
      </div>

      <button
        onClick={dismissWarn}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
