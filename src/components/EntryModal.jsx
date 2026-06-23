import { useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { todayStr, isOutOfRange } from '@/lib/schedule';

export default function EntryModal({ param, date, existing, dept, locked, onSave, onClose }) {
  const { token } = useAuth();
  const today  = todayStr();
  const isPast = date < today;

  // 'completed' or 'missed'
  const [result, setResult] = useState(existing?.status === 'missed' ? 'missed' : 'completed');
  const [value,  setValue]  = useState(existing?.value ?? '');
  const [reason, setReason] = useState(existing?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // When "completed", a past date counts as late; today counts as done.
  const computedStatus = result === 'missed' ? 'missed' : (isPast ? 'late' : 'done');
  const outOfRange = result === 'completed' && isOutOfRange(param, { value });

  // A reason is mandatory when the day was late, missed, or the reading is out of range.
  const reasonRequired = result === 'missed' || computedStatus === 'late' || outOfRange;

  const rangeLabel =
    param.min_value != null && param.max_value != null ? `${param.min_value}–${param.max_value}${param.unit ? ' ' + param.unit : ''}`
    : param.min_value != null ? `≥ ${param.min_value}${param.unit ? ' ' + param.unit : ''}`
    : param.max_value != null ? `≤ ${param.max_value}${param.unit ? ' ' + param.unit : ''}`
    : null;

  async function handleSave() {
    if (result === 'completed' && param.entry_type === 'numeric' && value === '')
      return setError('Please enter a value.');
    if (reasonRequired && !reason.trim())
      return setError(
        outOfRange ? 'Value is out of range — a reason is required.'
        : result === 'missed' ? 'Please say why this was missed.'
        : 'This is a late entry — please give a reason.'
      );

    setLoading(true);
    setError('');
    try {
      const res = await window.cqpm.entries.save(token, {
        parameterId: param.id,
        slotDate:    date,
        status:      computedStatus,
        value:       result === 'completed' ? (value || null) : null,
        notes:       reason.trim() || null,
        department:  dept,
      });
      if (res?.error) return setError(res.error);
      onSave();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <div className="flex items-center gap-2">
              {param.critical === 1 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="Critical" />
              )}
              <h2 className="text-sm font-semibold">{param.name}</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{displayDate}</p>
            {param.description && (
              <p className="text-xs text-muted-foreground mt-1 italic">{param.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Locked notice */}
        {locked && (
          <div className="mx-5 mt-4 flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              This day is locked (submitted, approved, or in a closed month). An admin must reopen it before it can be edited. You can still view the record below.
            </p>
          </div>
        )}

        {/* Body */}
        <fieldset disabled={locked} className={cn('p-5 flex flex-col gap-4', locked && 'opacity-70')}>

          {/* Result: completed vs missed */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResult('completed')}
              className={cn(
                'flex items-center gap-2 h-11 px-3 rounded-lg border text-xs font-medium transition-colors',
                result === 'completed'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'hover:bg-muted text-muted-foreground border-border'
              )}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <div className="text-left">
                <div className="font-semibold">Completed</div>
                <div className="text-[9px] opacity-70">{isPast ? 'Logged late' : 'Done on time'}</div>
              </div>
            </button>
            <button type="button" onClick={() => setResult('missed')}
              className={cn(
                'flex items-center gap-2 h-11 px-3 rounded-lg border text-xs font-medium transition-colors',
                result === 'missed'
                  ? 'bg-red-500/10 border-red-500/40 text-red-400'
                  : 'hover:bg-muted text-muted-foreground border-border'
              )}>
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <div className="text-left">
                <div className="font-semibold">Missed / Skipped</div>
                <div className="text-[9px] opacity-70">Could not complete</div>
              </div>
            </button>
          </div>

          {/* Value input — only when completed and not a plain checkbox */}
          {result === 'completed' && param.entry_type === 'numeric' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium flex items-center justify-between">
                <span>Recorded Value {param.unit && <span className="text-muted-foreground">({param.unit})</span>}</span>
                {rangeLabel && (
                  <span className="text-[10px] text-muted-foreground font-normal">Allowed: {rangeLabel}</span>
                )}
              </label>
              <input
                type="number" step="0.1" value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={`Enter value${param.unit ? ` in ${param.unit}` : ''}`}
                autoFocus
                className={cn(
                  'h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2',
                  outOfRange ? 'border-orange-500/60 focus:ring-orange-500/40 text-orange-300' : 'focus:ring-ring'
                )}
              />
              {outOfRange && (
                <p className="flex items-center gap-1 text-[11px] text-orange-400">
                  <AlertTriangle className="w-3 h-3" /> Value is outside the allowed range — flagged and a reason is required.
                </p>
              )}
            </div>
          )}

          {result === 'completed' && param.entry_type === 'text' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Entry</label>
              <input type="text" value={value} onChange={e => setValue(e.target.value)}
                placeholder="Enter value" autoFocus
                className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}

          {result === 'completed' && param.entry_type === 'checkbox' && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <p className="text-sm text-foreground">Mark this task as completed</p>
            </div>
          )}

          {/* Reason / notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {reasonRequired
                ? <span className="text-foreground">Reason <span className="text-destructive">*</span></span>
                : <span className="text-muted-foreground">Notes (optional)</span>}
            </label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder={
                result === 'missed' ? 'Why couldn’t this be done? e.g. machine down, reagent unavailable'
                : computedStatus === 'late' ? 'Why is this being logged late?'
                : outOfRange ? 'Explain the out-of-range reading and any action taken'
                : 'Any observations or remarks…'
              }
              rows={2}
              className={cn(
                'rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2',
                reasonRequired && !reason.trim() ? 'border-amber-500/50 focus:ring-amber-500/40' : 'focus:ring-ring'
              )}
            />
          </div>

          {existing && existing.done_by_name && (
            <p className="text-[10px] text-muted-foreground">
              Last saved by <strong>{existing.done_by_name}</strong>
              {existing.created_at && ` on ${new Date(existing.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN')}`}
              {!locked && ' — saving again will overwrite it.'}
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </fieldset>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="h-8 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
            {locked ? 'Close' : 'Cancel'}
          </button>
          {!locked && (
            <button
              onClick={handleSave} disabled={loading}
              className={cn(
                'h-8 px-4 text-xs rounded-md font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                result === 'missed'
                  ? 'bg-red-500 text-white hover:bg-red-500/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                : result === 'missed' ? 'Record as Missed'
                : isPast ? 'Save (Late)' : 'Mark Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
