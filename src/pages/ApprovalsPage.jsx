import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, RotateCcw, Loader2, Lock, Unlock, CalendarClock,
  ClipboardCheck, AlertTriangle, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { isDue, isOutOfRange } from '@/lib/schedule';

const DEPTS = [
  { id: 'serology',     label: 'Serology',          dot: 'bg-red-500',    accent: 'text-red-400'    },
  { id: 'molecularBio', label: 'Molecular Biology', dot: 'bg-sky-500',    accent: 'text-sky-400'    },
  { id: 'microbiology', label: 'Microbiology',      dot: 'bg-yellow-500', accent: 'text-yellow-400' },
];
const DEPT_LABEL = Object.fromEntries(DEPTS.map(d => [d.id, d.label]));
const DEPT_ACCENT = Object.fromEntries(DEPTS.map(d => [d.id, d.accent]));

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtWhen(ts) {
  if (!ts) return '';
  return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── A single submitted day awaiting approval ──────────────────────
function PendingCard({ row, token, onAction }) {
  const [counts, setCounts] = useState(null);
  const [busy,   setBusy]   = useState(null); // 'approve' | 'reopen'

  useEffect(() => {
    let alive = true;
    (async () => {
      const [pRes, eRes] = await Promise.all([
        window.cqpm.params.list(token, row.department),
        window.cqpm.entries.getRange(token, row.department, row.slot_date, row.slot_date),
      ]);
      if (!alive) return;
      const params = pRes.params ?? [];
      const eMap = {};
      for (const e of (eRes.entries ?? [])) eMap[e.parameter_id] = e;
      const due = params.filter(p => isDue(p, row.slot_date, 'day'));
      let done = 0, late = 0, missed = 0, pending = 0, flagged = 0;
      for (const p of due) {
        const e = eMap[p.id];
        if (isOutOfRange(p, e)) flagged++;
        if (!e) pending++;
        else if (e.status === 'done') done++;
        else if (e.status === 'late') late++;
        else if (e.status === 'missed') missed++;
      }
      setCounts({ total: due.length, done, late, missed, pending, flagged });
    })();
    return () => { alive = false; };
  }, [token, row.department, row.slot_date]);

  async function act(kind) {
    setBusy(kind);
    try {
      const fn = kind === 'approve' ? window.cqpm.signoff.approve : window.cqpm.signoff.reopen;
      const res = await fn(token, row.department, row.slot_date);
      if (res?.error) { alert(res.error); return; }
      onAction();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-bold uppercase tracking-wider', DEPT_ACCENT[row.department])}>
              {DEPT_LABEL[row.department]}
            </span>
            <span className="text-sm font-semibold">{fmtDate(row.slot_date)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Submitted by <strong>{row.submitted_by_name || '—'}</strong>
            {row.submitted_at && ` · ${fmtWhen(row.submitted_at)}`}
          </p>
        </div>
        <CalendarClock className="w-4 h-4 text-amber-400 flex-shrink-0" />
      </div>

      {/* Counts */}
      {counts ? (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{counts.total} due</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{counts.done} done</span>
          {counts.late > 0   && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{counts.late} late</span>}
          {counts.missed > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{counts.missed} missed</span>}
          {counts.pending > 0 && <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">{counts.pending} pending</span>}
          {counts.flagged > 0 && <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" />{counts.flagged} flagged</span>}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">Loading summary…</div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => act('approve')} disabled={!!busy}
          className="flex-1 h-8 text-xs rounded-md bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50">
          {busy === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
        </button>
        <button onClick={() => act('reopen')} disabled={!!busy}
          className="flex-1 h-8 text-xs rounded-md border font-medium flex items-center justify-center gap-1.5 hover:bg-muted transition-colors disabled:opacity-50">
          {busy === 'reopen' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Send back
        </button>
      </div>
    </div>
  );
}

// ── Month closure control for one department ──────────────────────
function MonthCloser({ dept, token }) {
  const [closures, setClosures] = useState([]);
  const [month,    setMonth]    = useState(() => new Date().toISOString().slice(0, 7));
  const [busy,     setBusy]     = useState(false);

  const load = useCallback(async () => {
    const res = await window.cqpm.closure.list(token, dept.id);
    setClosures(res.closures ?? []);
  }, [token, dept.id]);

  useEffect(() => { load(); }, [load]);

  async function close() {
    if (!window.confirm(`Close ${month} for ${dept.label}? This locks every day that month as the permanent record.`)) return;
    setBusy(true);
    try {
      const res = await window.cqpm.closure.close(token, dept.id, month);
      if (res?.error) { alert(res.error); return; }
      await load();
    } finally { setBusy(false); }
  }
  async function reopen(m) {
    if (!window.confirm(`Reopen ${m} for ${dept.label}? Days become editable again.`)) return;
    const res = await window.cqpm.closure.reopen(token, dept.id, m);
    if (res?.error) { alert(res.error); return; }
    await load();
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', dept.dot)} />
        <span className={cn('text-xs font-bold uppercase tracking-wider', dept.accent)}>{dept.label}</span>
      </div>

      <div className="flex items-center gap-2">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
        <button onClick={close} disabled={busy}
          className="h-8 px-3 text-xs rounded-md border font-medium flex items-center gap-1.5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Close month
        </button>
      </div>

      {closures.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">Closed</p>
          {closures.map(c => (
            <div key={c.month} className="flex items-center justify-between text-[11px] py-0.5">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="w-3 h-3" />
                {new Date(c.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => reopen(c.month)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <Unlock className="w-3 h-3" /> Reopen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { token } = useAuth();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.cqpm.signoff.pending(token);
      setPending(res.pending ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" /> Approvals &amp; Closures
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review submitted days, then approve or send them back. Close months for the permanent record.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 flex flex-col gap-8 max-w-5xl w-full mx-auto">

        {/* Pending review */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Inbox className="w-3.5 h-3.5" /> Awaiting approval ({pending.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground border border-dashed rounded-xl">
              <CheckCircle2 className="w-7 h-7 opacity-30" />
              <p className="text-sm">Nothing waiting. All submitted days are cleared.</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {pending.map(row => (
                <PendingCard key={`${row.department}__${row.slot_date}`} row={row} token={token} onAction={load} />
              ))}
            </div>
          )}
        </section>

        {/* Month closures */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> Month-end closure
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {DEPTS.map(d => <MonthCloser key={d.id} dept={d} token={token} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
