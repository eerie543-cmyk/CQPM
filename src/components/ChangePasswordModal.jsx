import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

/**
 * Forced password change on first login. Rendered as a non-dismissable overlay
 * when the signed-in account still has the must_change_password flag set.
 * The only way out is to set a new password (or sign out).
 */
export default function ChangePasswordModal() {
  const { changePassword, logout, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!current)               return setError('Enter your current (temporary) password.');
    if (next.length < 8)        return setError('New password must be at least 8 characters.');
    if (next === current)       return setError('New password must be different from the current one.');
    if (next !== confirm)       return setError('New password and confirmation do not match.');

    setLoading(true);
    setError('');
    try {
      const res = await changePassword(current, next);
      if (res?.error) return setError(res.error);
      // success → AuthContext clears the gate and this modal unmounts.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Set a new password</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Welcome, {user?.displayName}. For security, choose your own password before continuing.
            </p>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Current (temporary) password</label>
            <input type={show ? 'text' : 'password'} value={current} autoFocus
              onChange={e => setCurrent(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">New password (min 8 chars)</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={next}
                onChange={e => setNext(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full" />
              <button type="button" tabIndex={-1} onClick={() => setShow(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Confirm new password</label>
            <input type={show ? 'text' : 'password'} value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button type="submit" disabled={loading}
            className={cn(
              'h-9 mt-1 rounded-md bg-primary text-primary-foreground text-sm font-medium',
              'flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50'
            )}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><KeyRound className="w-4 h-4" /> Set password &amp; continue</>}
          </button>

          <button type="button" onClick={logout}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1">
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}
