import { useState, useEffect, useRef } from 'react';
import {
  X, CheckCircle2, XCircle, Loader2, AlertTriangle,
  CalendarDays, RefreshCw, Hash, CheckSquare, Type, Clock, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

const DEPT_NAMES = {
  serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology',
};

function fmtWhen(ts) {
  if (!ts) return '';
  return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function SpecRow({ label, children }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-28 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-xs text-foreground flex-1">{children}</span>
    </div>
  );
}

function ScheduleSummary({ req }) {
  if (req.schedule_type === 'specific') {
    const dates = (req.specific_dates || '').split(',').filter(Boolean);
    return <>{dates.length} specific date{dates.length !== 1 ? 's' : ''}</>;
  }
  const freq = req.frequency ?? '—';
  if (req.days_of_week) {
    const dow = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    const days = req.days_of_week.split(',').map(d => dow[Number(d)] ?? d).join(', ');
    return <>{freq} · {days}</>;
  }
  if (req.day_of_month) return <>{freq} · day {req.day_of_month}</>;
  return <>{freq}</>;
}

function EntryTypeSummary({ req }) {
  const icons = { checkbox: CheckSquare, numeric: Hash, text: Type };
  const Icon = icons[req.entry_type] ?? CheckSquare;
  const label = req.entry_type ?? 'checkbox';
  const parts = [label.charAt(0).toUpperCase() + label.slice(1)];
  if (req.entry_type === 'numeric') {
    if (req.unit) parts.push(req.unit);
    if (req.min_value != null || req.max_value != null) {
      const range =
        req.min_value != null && req.max_value != null ? `${req.min_value}–${req.max_value}`
        : req.min_value != null ? `≥ ${req.min_value}`
        : `≤ ${req.max_value}`;
      parts.push(range);
    }
  }
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      {parts.join(' · ')}
    </span>
  );
}

export default function ParamRequestReviewModal({ request, onDone, onClose }) {
  const { token } = useAuth();
  const toast      = useToast();
  const noteRef    = useRef(null);

  const [action,  setAction]  = useState(null);  // 'approved' | 'rejected'
  const [note,    setNote]    = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus the note field when switching to reject mode
  useEffect(() => {
    if (action === 'rejected') setTimeout(() => noteRef.current?.focus(), 50);
  }, [action]);

  async function handleSubmit() {
    setError('');
    if (action === 'rejected' && !note.trim()) {
      setError('Please enter a reason for rejection.');
      noteRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await window.cqpm.paramreq.review(token, request.id, action, note.trim() || null);
      if (res?.error) { setError(res.error); return; }
      toast(
        action === 'approved'
          ? `"${request.name}" approved — parameter is now live.`
          : `Request rejected.`,
        action === 'approved' ? 'success' : 'info',
      );
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Review Parameter Request</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <User className="w-3 h-3" />
              {request.requested_by_name}
              <span className="text-muted-foreground/50">·</span>
              <Clock className="w-3 h-3" />
              {fmtWhen(request.requested_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Spec — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-1">

          {/* Parameter name (prominent) */}
          <div className="mb-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex items-start gap-2">
              {request.critical === 1 && (
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-semibold leading-tight">{request.name}</p>
                {request.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{request.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 font-semibold uppercase tracking-wide">
                    {DEPT_NAMES[request.department] ?? request.department}
                  </span>
                  {request.critical === 1 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20 font-semibold">
                      CRITICAL
                    </span>
                  )}
                  {request.requires_review === 1 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 font-semibold">
                      REQUIRES REVIEW
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Spec table */}
          <div className="rounded-lg border bg-muted/10 px-3 divide-y divide-border/40">
            <SpecRow label="Schedule">
              <span className="flex items-center gap-1.5">
                {request.schedule_type === 'specific'
                  ? <CalendarDays className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  : <RefreshCw className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                <ScheduleSummary req={request} />
              </span>
            </SpecRow>
            <SpecRow label="Entry Type">
              <EntryTypeSummary req={request} />
            </SpecRow>
          </div>

          {/* Action choice */}
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Your decision</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAction('approved')}
                className={cn(
                  'flex items-center justify-center gap-2 h-10 rounded-lg border text-xs font-medium transition-all',
                  action === 'approved'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-sm'
                    : 'hover:bg-emerald-500/5 hover:border-emerald-500/20 hover:text-emerald-400 text-muted-foreground'
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve
              </button>
              <button
                onClick={() => setAction('rejected')}
                className={cn(
                  'flex items-center justify-center gap-2 h-10 rounded-lg border text-xs font-medium transition-all',
                  action === 'rejected'
                    ? 'bg-red-500/15 border-red-500/50 text-red-400 shadow-sm'
                    : 'hover:bg-red-500/5 hover:border-red-500/20 hover:text-red-400 text-muted-foreground'
                )}
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>

            {/* Rejection note */}
            {action === 'rejected' && (
              <div className="flex flex-col gap-1.5 mt-1">
                <label className="text-xs font-medium text-red-400">
                  Reason for rejection <span className="text-muted-foreground">(required)</span>
                </label>
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Already covered by another parameter, scope too broad…"
                  rows={3}
                  className="w-full rounded-md border border-red-500/30 bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
                />
              </div>
            )}

            {/* Approval note (optional) */}
            {action === 'approved' && (
              <div className="flex flex-col gap-1.5 mt-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Note for staff <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Approved — starts from next month"
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5 mt-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t flex-shrink-0">
          <button onClick={onClose} disabled={busy}
            className="h-8 px-3 text-xs rounded-md border hover:bg-muted transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!action || busy}
            className={cn(
              'h-8 px-4 text-xs rounded-md font-medium flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed',
              action === 'approved'
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : action === 'rejected'
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {busy
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Processing…</>
              : action === 'approved'
                ? <><CheckCircle2 className="w-3.5 h-3.5" /> Approve</>
                : action === 'rejected'
                  ? <><XCircle className="w-3.5 h-3.5" /> Reject</>
                  : 'Select a decision'}
          </button>
        </div>
      </div>
    </div>
  );
}
