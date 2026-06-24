import { useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function ReviewModal({ param, date, entry, onSave, onClose }) {
  const { token } = useAuth();

  const [verdict, setVerdict] = useState(
    entry?.result === 'pass' ? 'pass' : entry?.result === 'fail' ? 'fail' : null
  );
  const [note,    setNote]    = useState(entry?.review_note ?? '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  async function handleSubmit() {
    if (!verdict)      return setError('Select Pass or Fail.');
    if (!note.trim())  return setError('A review note is required.');
    setLoading(true);
    setError('');
    try {
      const res = await window.cqpm.entries.review(token, entry.id, verdict, note.trim());
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
              {param.critical === 1 && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="Critical" />}
              <h2 className="text-sm font-semibold">{param.name}</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{displayDate} · Result review</p>
          </div>
          <button onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* What was recorded */}
          <div className="p-3 rounded-lg border bg-muted/20 text-xs flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Recorded by</span>
              <span className="font-medium">{entry.done_by_name || '—'}</span>
            </div>
            {entry.value != null && entry.value !== '' && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Value</span>
                <span className="font-medium">{entry.value}{param.unit ? ` ${param.unit}` : ''}</span>
              </div>
            )}
            {entry.notes && (
              <div>
                <span className="text-muted-foreground">Notes: </span>
                <span className="italic">"{entry.notes}"</span>
              </div>
            )}
          </div>

          {/* Pass / Fail choice */}
          <div>
            <p className="text-xs font-medium mb-2">
              Result verdict <span className="text-destructive">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setVerdict('pass')}
                className={cn(
                  'flex items-center gap-2 h-11 px-3 rounded-lg border text-xs font-medium transition-colors',
                  verdict === 'pass'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : 'hover:bg-muted text-muted-foreground border-border'
                )}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Pass</div>
                  <div className="text-[9px] opacity-70">Result is acceptable</div>
                </div>
              </button>
              <button type="button" onClick={() => setVerdict('fail')}
                className={cn(
                  'flex items-center gap-2 h-11 px-3 rounded-lg border text-xs font-medium transition-colors',
                  verdict === 'fail'
                    ? 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'hover:bg-muted text-muted-foreground border-border'
                )}>
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Fail</div>
                  <div className="text-[9px] opacity-70">Result not acceptable</div>
                </div>
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              Review note <span className="text-destructive">*</span>
            </label>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              placeholder={
                verdict === 'fail'
                  ? 'Why did it fail? What corrective action is needed?'
                  : 'Confirm the result is acceptable, or add any observations.'
              }
              rows={2}
              className="rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Prior review stamp */}
          {entry.reviewed_by_name && (
            <p className="text-[10px] text-muted-foreground">
              Previously reviewed by <strong>{entry.reviewed_by_name}</strong>
              {entry.reviewed_at && ` on ${new Date(entry.reviewed_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN')}`}.
              Saving will overwrite.
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="h-8 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className={cn(
              'h-8 px-4 text-xs rounded-md font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              verdict === 'fail'
                ? 'bg-red-500 text-white hover:bg-red-500/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}>
            {loading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
              : verdict === 'fail' ? 'Mark as Failed' : 'Mark as Passed'}
          </button>
        </div>
      </div>
    </div>
  );
}
