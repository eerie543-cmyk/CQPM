import { Lock } from 'lucide-react';

/**
 * Full-screen kill switch — rendered when remote config `locked: true`.
 * Blocks all access regardless of auth state. Admins toggle this from the
 * cqpm-control web panel.
 */
export default function LockScreen({ message }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-7 bg-background px-10 text-center animate-fade-in">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-destructive text-destructive animate-pulse">
        <Lock className="h-7 w-7" />
      </div>

      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-foreground">System Locked</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          {message || 'This system is temporarily unavailable. Please contact your administrator.'}
        </p>
      </div>

      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        CQPM · Access Restricted
      </div>
    </div>
  );
}
