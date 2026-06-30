import { useState, useEffect, useCallback } from 'react';
import { ArrowUpCircle, Download, X, CheckCircle, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

function fmtBytes(b) {
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + ' MB';
  if (b >= 1_024)     return (b / 1_024).toFixed(0)     + ' KB';
  return b + ' B';
}

function fmtSpeed(bps) {
  if (bps >= 1_048_576) return (bps / 1_048_576).toFixed(1) + ' MB/s';
  if (bps >= 1_024)     return (bps / 1_024).toFixed(0)     + ' KB/s';
  return bps.toFixed(0) + ' B/s';
}

// Phases:
//   checking    — verifying with server on mount
//   available   — update confirmed; waiting for user to click Install
//   downloading — stream in progress
//   verifying   — SHA-256 check running
//   ready       — staged, waiting for restart
//   error       — something went wrong
//   legacy      — no in-app ASAR; fall back to a browser download link
//   none        — hide (server says we're current)

export default function UpdateBanner({ version, notes, url }) {
  const [phase,    setPhase]    = useState('checking');
  const [info,     setInfo]     = useState({ version: version || '', notes: notes || '' });
  const [progress, setProgress] = useState({ percent: 0, downloaded: 0, total: 0, speed: 0 });
  const [error,    setError]    = useState('');
  const [attempt,  setAttempt]  = useState({ n: 1, max: 3 });

  // Register the push-progress listener once — cleaned up on unmount
  useEffect(() => {
    const cleanup = window.cqpm.update.onProgress(data => {
      if (data.state === 'downloading') {
        setProgress({
          percent:    data.percent    ?? 0,
          downloaded: data.downloaded ?? 0,
          total:      data.total      ?? 0,
          speed:      data.speed      ?? 0,
        });
        setAttempt({ n: data.attempt ?? 1, max: data.maxAttempts ?? 3 });
      }
      if (data.state === 'verifying')  setPhase('verifying');
      if (data.state === 'ready')      setPhase('ready');
      if (data.state === 'cancelled')  setPhase('available');
      if (data.state === 'error') {
        setPhase('error');
        setError(data.error || 'Unknown error');
      }
    });
    return cleanup;
  }, []);

  const runCheck = useCallback(() => {
    setPhase('checking');
    setError('');
    window.cqpm.update.check().then(res => {
      if (res.available) {
        setInfo({ version: res.version, notes: res.notes });
        setPhase('available');
      } else {
        setPhase(url ? 'legacy' : 'none');
      }
    }).catch(() => setPhase(url ? 'legacy' : 'none'));
  }, [url]);

  // On mount: if a staged update is already waiting, go straight to ready.
  // Otherwise check the server for a new ASAR update.
  useEffect(() => {
    window.cqpm.update.hasPending().then(pending => {
      if (pending) { setPhase('ready'); return; }
      runCheck();
    });
  }, []);

  const handleDownload = useCallback(async () => {
    setPhase('downloading');
    setProgress({ percent: 0, downloaded: 0, total: 0, speed: 0 });
    const res = await window.cqpm.update.download();
    // Phase transitions are driven by the onProgress listener above;
    // only handle hard failures or explicit cancellations here.
    if (res?.cancelled) setPhase('available');
    if (res?.error)     { setPhase('error'); setError(res.error); }
  }, []);

  const handleCancel  = useCallback(() => window.cqpm.update.cancel(),        []);
  const handleRestart = useCallback(() => window.cqpm.update.applyRestart(),  []);

  if (phase === 'none') return null;

  const displayVersion = info.version || version || '';
  const displayNotes   = info.notes   || notes   || '';

  // ── Checking ─────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <BannerShell>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Checking for updates…</span>
        </div>
      </BannerShell>
    );
  }

  // ── Legacy fallback (no ASAR URL — open installer in browser) ────
  if (phase === 'legacy') {
    return (
      <BannerShell>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ArrowUpCircle className="h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">
              Update available{displayVersion ? ` — v${displayVersion}` : ''}
            </p>
            {displayNotes && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{displayNotes}</p>
            )}
          </div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </BannerShell>
    );
  }

  // ── Available ─────────────────────────────────────────────────────
  if (phase === 'available') {
    return (
      <BannerShell>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ArrowUpCircle className="h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">
              Update available — v{displayVersion}
            </p>
            {displayNotes && (
              <p className="mt-0.5 text-xs text-muted-foreground">{displayNotes}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Install Update
        </button>
      </BannerShell>
    );
  }

  // ── Downloading ───────────────────────────────────────────────────
  if (phase === 'downloading') {
    const { percent, downloaded, total, speed } = progress;
    const sizeLabel  = total ? `${fmtBytes(downloaded)} / ${fmtBytes(total)}` : fmtBytes(downloaded);
    const retryLabel = attempt.n > 1 ? ` · attempt ${attempt.n}/${attempt.max}` : '';

    return (
      <BannerShell>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-primary">
              Downloading v{displayVersion}{retryLabel}
            </p>
            <span className="text-xs text-muted-foreground flex-shrink-0 ml-3">
              {percent}%{sizeLabel ? ` · ${sizeLabel}` : ''}{speed > 100 ? ` · ${fmtSpeed(speed)}` : ''}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <button
          onClick={handleCancel}
          className="ml-4 flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </BannerShell>
    );
  }

  // ── Verifying ─────────────────────────────────────────────────────
  if (phase === 'verifying') {
    return (
      <BannerShell>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Verifying integrity…</span>
        </div>
      </BannerShell>
    );
  }

  // ── Ready to restart ──────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <BannerShell className="border-emerald-500/40 bg-emerald-500/10">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Update ready — restart to apply
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {displayVersion ? `v${displayVersion} is` : 'New version is'} staged and waiting. Your data is safe.
            </p>
          </div>
        </div>
        <button
          onClick={handleRestart}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          Restart Now
        </button>
      </BannerShell>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <BannerShell className="border-destructive/40 bg-destructive/10">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-destructive">Update failed</p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{error}</p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </button>
      </BannerShell>
    );
  }

  return null;
}

function BannerShell({ children, className }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 animate-slide-up',
      className
    )}>
      {children}
    </div>
  );
}
