import { useState } from 'react';
import { X, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { todayStr } from '@/lib/schedule';
import { buildDeptRows } from '@/lib/buildExportPayload';

const ALL_DEPTS = ['serology', 'molecularBio', 'microbiology'];
const DEPT_LABEL = { serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology' };

export const EXPORT_DEFAULTS_KEY = 'cqpm:export_defaults';

function loadExportDefaults() {
  try { return JSON.parse(localStorage.getItem(EXPORT_DEFAULTS_KEY) || 'null') || {}; }
  catch { return {}; }
}

function computeFromDate(range) {
  const d = new Date();
  if (range === 'last_7')  { d.setDate(d.getDate() - 6);  return d.toISOString().slice(0, 10); }
  if (range === 'last_30') { d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); }
  if (range === 'last_90') { d.setDate(d.getDate() - 89); return d.toISOString().slice(0, 10); }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ExportModal({ dept, onClose }) {
  const { token } = useAuth();
  const today = todayStr();

  const [from,  setFrom]  = useState(() => { const d = loadExportDefaults(); return computeFromDate(d.range || 'current_month'); });
  const [to,    setTo]    = useState(today);
  const [scope, setScope] = useState(() => loadExportDefaults().scope || 'current');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [done,  setDone]  = useState('');

  async function handleExport() {
    if (from > to) return setError('“From” date must be on or before “To” date.');
    setBusy(true);
    setError('');
    setDone('');
    try {
      const depts = scope === 'all' ? ALL_DEPTS : [dept];
      let rows = [];
      for (const d of depts) {
        const [pRes, eRes] = await Promise.all([
          window.cqpm.params.list(token, d),
          window.cqpm.entries.getRange(token, d, from, to),
        ]);
        rows = rows.concat(buildDeptRows(d, pRes.params ?? [], eRes.entries ?? [], from, to, today));
      }

      const payload = {
        range: { from, to },
        scopeLabel: scope === 'all' ? 'All Departments' : DEPT_LABEL[dept],
        generatedAt: new Date().toISOString(),
        rows,
      };

      const res = await window.cqpm.report.xlsx(token, payload);
      if (res?.canceled) return;           // user dismissed the save dialog
      if (res?.error)    return setError(res.error);
      setDone(res.path || 'Saved.');
    } catch (err) {
      setError(err.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Export Compliance Report</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">From</label>
              <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
                className="h-9 rounded-md border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">To</label>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
                className="h-9 rounded-md border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {/* Scope */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Departments</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setScope('current')}
                className={cn(
                  'h-10 px-3 rounded-lg border text-xs font-medium transition-colors',
                  scope === 'current' ? 'bg-primary/10 border-primary/40 text-primary' : 'hover:bg-muted text-muted-foreground border-border'
                )}>
                {DEPT_LABEL[dept]}
              </button>
              <button type="button" onClick={() => setScope('all')}
                className={cn(
                  'h-10 px-3 rounded-lg border text-xs font-medium transition-colors',
                  scope === 'all' ? 'bg-primary/10 border-primary/40 text-primary' : 'hover:bg-muted text-muted-foreground border-border'
                )}>
                All Departments
              </button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Produces a styled <strong>.xlsx</strong> with a full compliance log (one row per scheduled check)
            and a summary sheet (weighted compliance, per-department and critical-parameter breakdowns).
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {done && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-300 break-all">Saved to {done}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="h-8 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
            {done ? 'Close' : 'Cancel'}
          </button>
          <button onClick={handleExport} disabled={busy}
            className={cn(
              'h-8 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium',
              'flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50'
            )}>
            {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
              : <><FileSpreadsheet className="w-3.5 h-3.5" /> Export .xlsx</>}
          </button>
        </div>
      </div>
    </div>
  );
}
