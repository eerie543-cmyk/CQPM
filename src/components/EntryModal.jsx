import { useState } from 'react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function EntryModal({ param, date, existing, dept, onSave, onClose }) {
  const { token } = useAuth();
  const [value,   setValue]   = useState(existing?.value ?? '');
  const [notes,   setNotes]   = useState(existing?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  async function handleSave() {
    if (param.entry_type === 'numeric' && value === '')
      return setError('Please enter a value.');

    setLoading(true);
    setError('');
    try {
      const today  = new Date().toISOString().slice(0, 10);
      const status = date < today ? 'late' : 'done';

      if (window.cqpm?.entries?.save) {
        const res = await window.cqpm.entries.save(token, {
          parameterId: param.id,
          slotDate:    date,
          status,
          value:       value || null,
          notes:       notes || null,
          department:  dept,
        });
        if (res.error) return setError(res.error);
      }
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

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">

          {/* Checkbox type */}
          {param.entry_type === 'checkbox' && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <p className="text-sm text-foreground">Mark this task as completed</p>
            </div>
          )}

          {/* Numeric type */}
          {param.entry_type === 'numeric' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">
                Recorded Value {param.unit && <span className="text-muted-foreground">({param.unit})</span>}
              </label>
              <input
                type="number"
                step="0.1"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={`Enter value${param.unit ? ` in ${param.unit}` : ''}`}
                autoFocus
                className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Text type */}
          {param.entry_type === 'text' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Entry</label>
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Enter value"
                autoFocus
                className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any observations or remarks…"
              rows={2}
              className="rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {existing && (
            <p className="text-[10px] text-muted-foreground">
              Previously logged by <strong>{existing.done_by_name}</strong> — updating will overwrite.
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
          <button
            onClick={handleSave}
            disabled={loading}
            className={cn(
              'h-8 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium',
              'flex items-center gap-1.5 hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : 'Mark Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
