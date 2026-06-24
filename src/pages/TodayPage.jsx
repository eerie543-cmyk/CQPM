import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Circle, AlertCircle, AlertTriangle, History,
  Loader2, Lock, ClipboardCheck, ChevronRight, ChevronDown, CalendarClock, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { isDue, getDueDatesInRange, isOutOfRange, todayStr, addDays } from '@/lib/schedule';
import EntryModal from '@/components/EntryModal';

const DEPT_NAMES  = { serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology' };
const DEPT_SYMBOL = { serology: '⊕',        molecularBio: '⌬',                microbiology: '⊙' };
const LOOKBACK_DAYS = 30;

function StatusChip({ status, oor, requiresReview, reviewResult }) {
  if ((status === 'done' || status === 'late') && oor)
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20"><AlertTriangle className="w-3 h-3" /> Out of range</span>;
  // Review-required states
  if (requiresReview && (status === 'done' || status === 'late')) {
    if (reviewResult === 'pass')
      return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Pass</span>;
    if (reviewResult === 'fail')
      return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3 h-3" /> Fail</span>;
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3" /> Awaiting review</span>;
  }
  if (status === 'done')
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Done</span>;
  if (status === 'late')
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><CheckCircle2 className="w-3 h-3" /> Late</span>;
  if (status === 'missed')
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20"><AlertCircle className="w-3 h-3" /> Missed</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border"><Circle className="w-3 h-3" /> Pending</span>;
}

function TaskRow({ param, entry, onClick, locked }) {
  const oor = isOutOfRange(param, entry);
  return (
    <button onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
        'hover:bg-muted/40 hover:border-border'
      )}>
      {param.critical === 1 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Critical" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{param.name}</p>
        {param.description && <p className="text-[11px] text-muted-foreground truncate">{param.description}</p>}
        {entry?.value != null && entry.value !== '' && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Recorded: <strong>{entry.value}{param.unit ? ` ${param.unit}` : ''}</strong>
          </p>
        )}
      </div>
      {locked && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
      <StatusChip
        status={entry?.status}
        oor={oor}
        requiresReview={param.requires_review === 1}
        reviewResult={entry?.result ?? null}
      />
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
    </button>
  );
}

const fmtShort = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const fmtFull  = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

// One compact, collapsible row per overdue parameter (keeps the list minimal).
function OverdueGroup({ param, dates, onPick }) {
  const [open, setOpen] = useState(false);
  const oldest = dates[dates.length - 1];
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-amber-500/10 transition-colors">
        <CalendarClock className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{param.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {dates.length} missed day{dates.length !== 1 ? 's' : ''} · oldest {fmtShort(oldest)}
          </p>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20 flex-shrink-0">
          {dates.length}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-amber-500/15">
          {dates.map(d => (
            <button key={d} onClick={() => onPick(param, d)}
              className="group w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-left hover:bg-amber-500/10 transition-colors border-t border-amber-500/10 first:border-t-0">
              <span className="text-[11px] text-muted-foreground flex-1">Due {fmtFull(d)}</span>
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TodayPage({ dept }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const today = todayStr();

  const [params,   setParams]   = useState([]);
  const [entries,  setEntries]  = useState([]);
  const [signoff,  setSignoff]  = useState(null);
  const [closed,   setClosed]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [entry,    setEntry]    = useState(null); // { param, date, locked }
  const [submitting, setSubmitting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = addDays(today, -LOOKBACK_DAYS);
      const [pRes, eRes, sRes] = await Promise.all([
        window.cqpm.params.list(token, dept),
        window.cqpm.entries.getRange(token, dept, from, today),
        window.cqpm.signoff.get(token, dept, today),
      ]);
      setParams(pRes.params ?? []);
      setEntries(eRes.entries ?? []);
      setSignoff(sRes.signoff ?? null);
      setClosed(!!sRes.closed);
    } finally {
      setLoading(false);
    }
  }, [token, dept, today]);

  useEffect(() => { load(); }, [load]);

  const entryMap = useMemo(() => {
    const m = {};
    for (const e of entries) m[`${e.parameter_id}__${e.slot_date}`] = e;
    return m;
  }, [entries]);

  // Is today locked for this user?
  const todayLocked =
    closed ||
    signoff?.status === 'approved' ||
    (signoff?.status === 'submitted' && user?.role !== 'admin');

  // Today's checklist
  const todayTasks = useMemo(
    () => params.filter(p => isDue(p, today, 'day')),
    [params, today]
  );
  const doneCount = todayTasks.filter(p => {
    const e = entryMap[`${p.id}__${today}`];
    return e && e.status !== 'missed';
  }).length;
  const pendingCount = todayTasks.filter(p => !entryMap[`${p.id}__${today}`]).length;

  // Bulk target: pending, simple checkbox checks due today (numeric/text need a value).
  const bulkTargets = todayTasks.filter(p =>
    p.entry_type === 'checkbox' && !entryMap[`${p.id}__${today}`]
  );

  // Overdue carry-forward: due on a past day in the window, never recorded
  const overdue = useMemo(() => {
    const items = [];
    const from = addDays(today, -LOOKBACK_DAYS);
    const yesterday = addDays(today, -1);
    for (const p of params) {
      for (const d of getDueDatesInRange(p, from, yesterday)) {
        if (!entryMap[`${p.id}__${d}`]) items.push({ param: p, date: d });
      }
    }
    // Most recent first
    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [params, entryMap, today]);

  // Group overdue slots by parameter so the list stays short (one row each).
  const overdueGroups = useMemo(() => {
    const map = new Map();
    for (const { param, date } of overdue) {
      if (!map.has(param.id)) map.set(param.id, { param, dates: [] });
      map.get(param.id).dates.push(date);
    }
    return [...map.values()];
  }, [overdue]);

  function openTask(param, date) {
    const locked = date === today ? todayLocked : closed; // past days: locked only if month closed (approval lock handled server-side)
    setEntry({ param, date, locked });
  }

  async function handleMarkAllDone() {
    if (bulkTargets.length === 0) return;
    if (!window.confirm(`Mark ${bulkTargets.length} routine check${bulkTargets.length !== 1 ? 's' : ''} as done for today?`)) return;
    setBulkBusy(true);
    try {
      let ok = 0, failMsg = '';
      for (const p of bulkTargets) {
        const res = await window.cqpm.entries.save(token, {
          parameterId: p.id, slotDate: today, status: 'done',
          value: null, notes: null, department: dept,
        });
        if (res?.error) failMsg = res.error; else ok++;
      }
      if (ok > 0) toast(`Marked ${ok} check${ok !== 1 ? 's' : ''} done.`, 'success');
      if (failMsg) toast(failMsg, 'error');
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleSubmitShift() {
    if (pendingCount > 0 &&
        !window.confirm(`${pendingCount} check(s) are still pending today. Submit anyway? They will be recorded as not done.`))
      return;
    setSubmitting(true);
    try {
      const res = await window.cqpm.signoff.submit(token, dept, today);
      if (res?.error) { toast(res.error, 'error'); return; }
      toast('End-of-shift submitted for review.', 'success');
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const displayToday = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur flex-shrink-0 gap-4">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Today’s Checks
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <span className="font-mono">{DEPT_SYMBOL[dept]}</span> {DEPT_NAMES[dept]}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{displayToday}</p>
        </div>

        <div className="flex items-center gap-2">
          {!loading && todayTasks.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{doneCount}</span> / {todayTasks.length} done
            </div>
          )}
        </div>
      </div>

      {/* Sign-off status banner */}
      {!loading && (closed || signoff) && (
        <div className={cn(
          'flex items-center gap-2 px-6 py-2 text-xs border-b flex-shrink-0',
          closed                       ? 'bg-red-500/10 text-red-300'
          : signoff?.status === 'approved'  ? 'bg-emerald-500/10 text-emerald-300'
          : signoff?.status === 'submitted' ? 'bg-amber-500/10 text-amber-300'
          : 'bg-muted/40 text-muted-foreground'
        )}>
          {closed ? <Lock className="w-3.5 h-3.5" /> : signoff?.status === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
          {closed
            ? 'This month is closed — today’s record is locked.'
            : signoff?.status === 'approved'
              ? `Approved by ${signoff.approved_by_name || 'admin'} — locked.`
              : signoff?.status === 'submitted'
                ? `Submitted by ${signoff.submitted_by_name || 'staff'} — awaiting admin approval.`
                : 'Reopened for edits.'}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 flex flex-col gap-6 max-w-3xl w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
        ) : (
          <>
            {/* Overdue carry-forward */}
            {overdue.length > 0 && (
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Overdue from earlier ({overdue.length})
                  </h2>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Scheduled on past days and never recorded. Expand a row to clear or mark them missed.
                </p>
                <div className="flex flex-col gap-1.5">
                  {overdueGroups.map(g => (
                    <OverdueGroup key={g.param.id} param={g.param} dates={g.dates} onPick={openTask} />
                  ))}
                </div>
              </section>
            )}

            {/* Today */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-3.5 h-3.5 text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Due today ({todayTasks.length})
                </h2>
                {!todayLocked && bulkTargets.length > 0 && (
                  <button onClick={handleMarkAllDone} disabled={bulkBusy}
                    title="Marks all pending checkbox checks done. Numeric/text checks still need values."
                    className="ml-auto flex items-center gap-1.5 h-7 px-2.5 text-[11px] rounded-md border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50">
                    {bulkBusy
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Marking…</>
                      : <><CheckCircle2 className="w-3.5 h-3.5" /> Mark {bulkTargets.length} routine done</>}
                  </button>
                )}
              </div>

              {todayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground border border-dashed rounded-xl">
                  <CheckCircle2 className="w-7 h-7 opacity-30" />
                  <p className="text-sm">Nothing scheduled for {DEPT_NAMES[dept]} today.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {todayTasks.map(p => (
                    <TaskRow key={p.id} param={p}
                      entry={entryMap[`${p.id}__${today}`]}
                      locked={todayLocked}
                      onClick={() => openTask(p, today)} />
                  ))}
                </div>
              )}
            </section>

            {/* End-of-shift sign-off */}
            {todayTasks.length > 0 && !closed && (
              <section className="border-t pt-5">
                {signoff?.status === 'submitted' || signoff?.status === 'approved' ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="w-3.5 h-3.5" />
                    {signoff.status === 'approved' ? 'Day approved and locked.' : 'Day submitted — waiting for approval.'}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">Finished for the day?</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Submitting records your name &amp; time and locks today’s entries for review.
                        {pendingCount > 0 && <span className="text-amber-400"> {pendingCount} still pending.</span>}
                      </p>
                    </div>
                    <button onClick={handleSubmitShift} disabled={submitting}
                      className="flex items-center gap-1.5 h-9 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</>
                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Submit end-of-shift</>}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {entry && (
        <EntryModal
          param={entry.param}
          date={entry.date}
          existing={entryMap[`${entry.param.id}__${entry.date}`]}
          dept={dept}
          locked={entry.locked}
          onSave={() => { setEntry(null); load(); }}
          onClose={() => setEntry(null)}
        />
      )}
    </div>
  );
}
