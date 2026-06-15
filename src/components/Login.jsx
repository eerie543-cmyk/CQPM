import { useState } from 'react';
import { Eye, EyeOff, FlaskConical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function Login({ onMustChangePassword }) {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username.trim(), password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.mustChangePassword) {
      onMustChangePassword?.();
    }
  }

  return (
    <div className="h-full bg-background flex items-center justify-center p-4">

      {/* Background radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, hsl(160 84% 39% / 0.08), transparent)',
        }}
      />

      <div
        className={cn(
          'w-full max-w-sm flex flex-col gap-6',
          'animate-slide-up'
        )}
      >
        {/* Logo badge */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
            <FlaskConical className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              CQPM
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Continuous Quality Process Monitoring
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card shadow-xs p-6 flex flex-col gap-5">

          <div>
            <h2 className="text-sm font-semibold text-foreground">Sign in</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Session lasts 10 hours from login
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                className={cn(
                  'h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                  'transition-colors duration-150',
                  error && 'border-destructive focus:ring-destructive'
                )}
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={cn(
                    'h-9 w-full rounded-md border bg-background px-3 pr-10 text-sm text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                    'transition-colors duration-150',
                    error && 'border-destructive focus:ring-destructive'
                  )}
                  disabled={loading}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive animate-fade-in">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className={cn(
                'h-9 w-full rounded-md bg-primary text-primary-foreground text-sm font-medium',
                'flex items-center justify-center gap-2',
                'hover:bg-primary/90 transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
              )}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                : 'Sign in'
              }
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Contact your administrator if you cannot sign in.
        </p>
      </div>
    </div>
  );
}
