import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Circle, AlertCircle, AlertTriangle, Plus, Lock, RotateCcw, RefreshCw, FileSpreadsheet, Search, CalendarDays, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMatrix } from '@/hooks/useMatrix';
import { useAuth } from '@/hooks/useAuth';
import { useRemoteConfigContext } from '@/hooks/useRemoteConfigContext';
import { isDue, isOutOfRange, todayStr, addDays, toLocalYMD, monthGridRange, monthFirst } from '@/lib/schedule';
import EntryModal from '@/components/EntryModal';
import ReviewModal from '@/components/ReviewModal';
import ParamBuilderModal from '@/components/ParamBuilderModal';
import ExportModal from '@/components/ExportModal';
import DayDetailPanel from '@/components/DayDetailPanel';
import MonthCalendar from '@/components/MonthCalendar';
import { DEPT_LABEL as DEPT_NAMES, DEPT_SYMBOL } from '@/lib/depts';

const GRADE = score =>
  score >= 95 ? { label: 'Excellent', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
  : score >= 80 ? { label: 'Good',    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' }
  : score >= 65 ? { label: 'Fair',    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
  :               { label: 'At Risk', cls: 'bg-red-500/10 text-red-400 border-red-500/20' };

const tlVariants = {
  enter:  dir => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   dir => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function dossierStatus(param, e, oor) {
  if (!e) return { Icon: Circle, cls: 'text-muted-foreground/25' };
  if ((e.status === 'done' || e.status === 'late') && oor)
    return { Icon: AlertTriangle, cls: 'text-orange-400' };
  if (param.requires_review === 1 && (e.status === 'done' || e.status === 'late')) {
    if (e.result === 'pass') return { Icon: CheckCircle2, cls: 'text-emerald-400' };
    if (e.result === 'fail') return { Icon: XCircle,      cls: 'text-red-400' };
    return { Icon: CheckCircle2, cls: 'text-amber-300/60' };
  }
  if (e.status === 'done')   return { Icon: CheckCircle2, cls: 'text-emerald-400' };
  if (e.status === 'late')   return { Icon: CheckCircle2, cls: 'text-amber-400' };
  if (e.status === 'missed') return { Icon: AlertCircle,  cls: param.critical === 1 ? 'text-red-400' : 'text-red-400/50' };
  return { Icon: Circle, cls: 'text-muted-foreground/25' };
}

// ── Two-column dossier row: [date | tasks] ────────────────────────
function DossierDateCard({ date, params, entryMap, isToday, dayLock, isLockedForUser, isAdmin, onParamClick, today, todayCardRef }) {
  const dueParams = params.filter(p => isDue(p, date, 'day'));
  if (dueParams.length === 0) return null;

  const dateObj  = new Date(date + 'T00:00:00');
  const dayAbbr  = dateObj.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();
  const dayNum   = dateObj.getDate();
  const monthStr = dateObj.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
  const yearNum  = dateObj.getFullYear();
  const isFuture = date > today;
  const lock     = dayLock(date);

  return (
    <div ref={isToday ? todayCardRef : null} className="relative flex border-b border-border/20 last:border-0">

      {/* Today accent stripe (left edge) */}
      {isToday && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-yellow-400/80 z-10 pointer-events-none" />
      )}

      {/* ── LEFT: date column ──────────────────── */}
      <div className={cn(
        'w-[78px] flex-shrink-0 flex flex-col items-center justify-center gap-0.5 border-r border-border/10 py-3 px-2',
        isToday ? 'bg-yellow-500/[0.06]' : ''
      )}>
        {/* Day abbreviation */}
        <span className={cn(
          'text-[7px] font-black tracking-[0.2em] font-mono leading-none',
          isToday ? 'text-yellow-500/70' : 'text-muted-foreground/25'
        )}>
          {dayAbbr}
        </span>

        {/* Day number — the main visual anchor */}
        <span className={cn(
          'text-[22px] font-bold leading-none tabular-nums mt-0.5',
          isToday    ? 'text-yellow-600 dark:text-yellow-300'
          : isFuture ? 'text-foreground/20'
          :             'text-foreground/65'
        )}>
          {dayNum}
        </span>

        {/* Month */}
        <span className={cn(
          'text-[8px] leading-none font-semibold tracking-widest mt-0.5',
          isToday ? 'text-yellow-500/55' : 'text-muted-foreground/30'
        )}>
          {monthStr}
        </span>

        {/* Year */}
        <span className={cn(
          'text-[7px] leading-none font-mono mt-px',
          isToday ? 'text-yellow-500/25' : 'text-muted-foreground/15'
        )}>
          {yearNum}
        </span>

        {/* Now pill */}
        {isToday && (
          <span className="mt-1.5 text-[6px] font-bold uppercase tracking-[0.14em] text-yellow-500 bg-yellow-400/15 border border-yellow-400/20 px-1.5 py-[2px] rounded-sm leading-none">
            now
          </span>
        )}

        {/* Lock status */}
        {lock && (
          <div className="mt-1">
            {lock === 'closed'    && <Lock className="w-2.5 h-2.5 text-red-400/50" title="Month closed" />}
            {lock === 'approved'  && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400/50" title="Approved" />}
            {lock === 'submitted' && <Lock className="w-2.5 h-2.5 text-amber-400/50" title="Submitted" />}
            {lock === 'reopened'  && <RotateCcw className="w-2.5 h-2.5 text-muted-foreground/25" title="Reopened" />}
          </div>
        )}
      </div>

      {/* ── RIGHT: tasks column ────────────────── */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col divide-y divide-border/[0.07]',
        isToday && 'bg-yellow-500/[0.015]'
      )}>
        {dueParams.map(param => {
          const e        = entryMap[`${param.id}__${date}`];
          const oor      = isOutOfRange(param, e);
          const { Icon, cls } = dossierStatus(param, e, oor);
          const clickable = !isFuture;
          const hasValue  = e?.value !== undefined && e?.value !== null && e?.value !== '';

          return (
            <div
              key={param.id}
              onClick={() => clickable && onParamClick(param, date)}
              className={cn(
                'flex items-center gap-2.5 px-4 py-[7px] transition-colors duration-100',
                clickable ? 'cursor-pointer hover:bg-muted/[0.18]' : 'opacity-25 cursor-default'
              )}
            >
              <Icon className={cn('w-[11px] h-[11px] flex-shrink-0', cls)} />

              <span className={cn(
                'flex-1 text-[11px] leading-tight truncate',
                param.critical === 1
                  ? 'font-semibold text-foreground/85'
                  : 'font-normal text-foreground/50'
              )}>
                {param.name}
              </span>

              <div className="flex items-center gap-2 flex-shrink-0">
                {param.critical === 1 && (
                  <span className="text-[7px] text-red-400/60 font-bold uppercase tracking-widest">crit</span>
                )}
                {param.requires_review === 1 && e && !e.result && (e.status === 'done' || e.status === 'late') && (
                  <span className="text-[7px] text-amber-400/70">review</span>
                )}
                {hasValue && (
                  <span className={cn('text-[10px] tabular-nums font-mono',
                    oor ? 'text-orange-400/80' : 'text-muted-foreground/35')}>
                    {e.value}{param.unit ? ` ${param.unit}` : ''}
                  </span>
                )}
                {oor && <AlertTriangle className="w-[9px] h-[9px] text-orange-400/80 flex-shrink-0" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MatrixPage({ dept }) {
  const today = todayStr();
  const { isAdmin } = useAuth();
  const { features } = useRemoteConfigContext();
  const exportEnabled = isAdmin && features.export !== false;

  const [view,        setView]        = useState('calendar');
  const [anchorDate,  setAnchor]      = useState(() => addDays(today, -7));
  const [monthAnchor, setMonthAnchor] = useState(() => monthFirst(today));
  const [pageDir,     setPageDir]     = useState(0);
  const [tlDir,       setTlDir]       = useState(0);
  const [entry,       setEntry]       = useState(null);
  const [review,      setReview]      = useState(null);
  const [addParam,    setAddParam]    = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [query,       setQuery]       = useState('');
  const [dayDetail,   setDayDetail]   = useState(null);

  const todayCardRef = useRef(null);

  useEffect(() => {
    if (view !== 'timeline') return;
    const id = setTimeout(() => todayCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => clearTimeout(id);
  }, [view, anchorDate]);

  const tlRangeFrom = anchorDate;
  const tlRangeTo   = useMemo(() => addDays(anchorDate, 59), [anchorDate]);
  const [calFrom, calTo] = useMemo(() => monthGridRange(monthAnchor), [monthAnchor]);

  const rangeFrom = view === 'calendar' ? calFrom : tlRangeFrom;
  const rangeTo   = view === 'calendar' ? calTo   : tlRangeTo;

  const { params, entries, signoffs, closures, loading, reload } = useMatrix(dept, rangeFrom, rangeTo);
  const q = query.trim().toLowerCase();
  const shownParams = q ? params.filter(p => p.name.toLowerCase().includes(q)) : params;

  const signoffMap = useMemo(() => {
    const m = {};
    for (const s of signoffs) m[s.slot_date] = s;
    return m;
  }, [signoffs]);
  const closedMonths = useMemo(() => new Set(closures.map(c => c.month)), [closures]);

  const dayLock = useCallback((date) => {
    if (closedMonths.has(date.slice(0, 7))) return 'closed';
    const s = signoffMap[date];
    if (s?.status === 'approved')  return 'approved';
    if (s?.status === 'submitted') return 'submitted';
    if (s?.status === 'reopened')  return 'reopened';
    return null;
  }, [signoffMap, closedMonths]);

  const isLockedForUser = useCallback((date) => {
    const lock = dayLock(date);
    if (lock === 'closed' || lock === 'approved') return true;
    if (lock === 'submitted' && !isAdmin) return true;
    return false;
  }, [dayLock, isAdmin]);

  function navigate(dir) {
    setTlDir(dir);
    const d = new Date(anchorDate + 'T00:00:00');
    d.setDate(d.getDate() + dir * 30);
    setAnchor(toLocalYMD(d));
  }

  function jumpToToday() { setTlDir(0); setAnchor(addDays(today, -7)); }

  function changeMonth(dir) {
    setPageDir(dir);
    const d = new Date(monthAnchor + 'T00:00:00');
    d.setMonth(d.getMonth() + dir);
    setMonthAnchor(toLocalYMD(d));
  }
  function monthToToday() { setPageDir(0); setMonthAnchor(monthFirst(today)); }

  const entryMap = useMemo(() => {
    const m = {};
    for (const e of entries) m[`${e.parameter_id}__${e.slot_date}`] = e;
    return m;
  }, [entries]);

  const dossierDates = useMemo(() => {
    if (view !== 'timeline') return [];
    const out = [];
    const cur = new Date(tlRangeFrom + 'T00:00:00');
    const end = new Date(tlRangeTo   + 'T00:00:00');
    while (cur <= end) {
      const ds = toLocalYMD(cur);
      if (shownParams.some(p => isDue(p, ds, 'day'))) out.push(ds);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [view, shownParams, tlRangeFrom, tlRangeTo]);

  const scoreCols = useMemo(() => {
    const from = view === 'calendar' ? calFrom : tlRangeFrom;
    const to   = view === 'calendar' ? calTo   : tlRangeTo;
    const out  = [];
    const cur  = new Date(from + 'T00:00:00');
    const end  = new Date(to   + 'T00:00:00');
    while (cur <= end) { out.push(toLocalYMD(cur)); cur.setDate(cur.getDate() + 1); }
    return out;
  }, [view, calFrom, calTo, tlRangeFrom, tlRangeTo]);

  const scoreData = useMemo(() => {
    let totalW = 0, earnedW = 0, critDue = 0, critDone = 0;
    for (const p of params) {
      const w = p.critical === 1 ? 2 : 1;
      for (const col of scoreCols) {
        if (col > today) continue;
        if (!isDue(p, col, 'day')) continue;
        totalW += w;
        if (p.critical) critDue++;
        const e   = entryMap[`${p.id}__${col}`];
        const oor = isOutOfRange(p, e);
        if (p.requires_review === 1) {
          if (e?.result === 'pass' && !oor) {
            if (e.status === 'done')      { earnedW += w;       if (p.critical) critDone++; }
            else if (e.status === 'late') { earnedW += w * 0.7; if (p.critical) critDone++; }
          }
        } else {
          if (e?.status === 'done' && !oor)      { earnedW += w;       if (p.critical) critDone++; }
          else if (e?.status === 'late' && !oor) { earnedW += w * 0.7; if (p.critical) critDone++; }
        }
      }
    }
    const pct = totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
    return { pct, critDue, critDone };
  }, [params, scoreCols, entryMap, today]);

  const handleCellClick = useCallback((param, dateStr) => {
    if (dateStr > today) return;
    const e = entryMap[`${param.id}__${dateStr}`];
    if (isAdmin && param.requires_review === 1 && e && (e.status === 'done' || e.status === 'late')) {
      setReview({ param, date: dateStr });
    } else {
      setEntry({ param, date: dateStr, locked: isLockedForUser(dateStr) });
    }
  }, [today, isLockedForUser, isAdmin, entryMap]);

  const { pct: score, critDue, critDone } = scoreData;
  const grade = score !== null ? GRADE(score) : null;

  const fmtShort = (ds) =>
    new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur gap-4 flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <span className="font-mono text-[13px] leading-none text-muted-foreground">{DEPT_SYMBOL[dept]}</span>
            {DEPT_NAMES[dept]}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {params.length} parameter{params.length !== 1 ? 's' : ''} ·{' '}
            {view === 'calendar'
              ? 'Calendar'
              : `${fmtShort(tlRangeFrom)} – ${fmtShort(tlRangeTo)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {grade && (
            <div className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5', grade.cls)}>
              <span>{score}%</span>
              <span className="opacity-70">·</span>
              <span>{grade.label}</span>
              {critDue > 0 && (
                <span className="text-[9px] opacity-60 ml-0.5">({critDone}/{critDue} crit)</span>
              )}
            </div>
          )}

          {exportEnabled && (
            <button onClick={() => setExporting(true)}
              className="flex items-center gap-1 h-7 px-2.5 text-xs rounded-md border hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors"
              title="Export compliance report (.xlsx)">
              <FileSpreadsheet className="w-3 h-3" />
              Export
            </button>
          )}

          {isAdmin && (
            <button onClick={() => setAddParam(true)}
              className="flex items-center gap-1 h-7 px-2.5 text-xs rounded-md border border-dashed hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors">
              <Plus className="w-3 h-3" />
              Add Param
            </button>
          )}

          <div className="flex items-center border rounded-lg p-0.5">
            <button onClick={() => setView('calendar')}
              className={cn('flex items-center gap-1 h-6 px-2 text-xs rounded-md font-medium transition-colors',
                view === 'calendar' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
            <button onClick={() => setView('timeline')}
              className={cn('flex items-center gap-1 h-6 px-2 text-xs rounded-md font-medium transition-colors',
                view === 'timeline' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <LayoutGrid className="w-3.5 h-3.5" /> Timeline
            </button>
          </div>

          {view === 'timeline' && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={jumpToToday}
                className="px-2 py-1 text-[11px] rounded hover:bg-muted transition-colors font-medium text-muted-foreground hover:text-foreground">
                Today
              </button>
              <button onClick={() => navigate(1)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-4 px-6 py-2 border-b text-[10px] text-muted-foreground flex-shrink-0">
        {[
          { sym: '✓', label: 'Done' },
          { sym: '≈', label: 'Done late (0.7×)' },
          { sym: '✗', label: 'Missed' },
          { sym: '○', label: 'Pending' },
          { sym: '◷', label: 'Awaiting review' },
        ].map(({ sym, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] leading-none">{sym}</span>
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="font-mono text-[11px]">!</span>
          Critical = 2× weight
        </span>
      </div>

      {/* ── Calendar view ──────────────────────────────────────── */}
      {view === 'calendar' && (
        <MonthCalendar
          monthAnchor={monthAnchor}
          direction={pageDir}
          params={params}
          entryMap={entryMap}
          today={today}
          onSelectDay={(d) => setDayDetail({ date: d, scale: 'day' })}
          onPrev={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
          onToday={monthToToday}
          loading={loading}
        />
      )}

      {/* ── Timeline dossier view ──────────────────────────────── */}
      {view === 'timeline' && (
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {params.length === 0 && loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2 text-primary" />
              Loading…
            </div>
          ) : params.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground text-sm">
              <p>No parameters defined for {DEPT_NAMES[dept]} yet.</p>
              {isAdmin && (
                <button onClick={() => setAddParam(true)}
                  className="flex items-center gap-1.5 h-7 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
                  <Plus className="w-3 h-3" /> Add the first parameter
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false} custom={tlDir} mode="popLayout">
              <motion.div
                key={anchorDate}
                custom={tlDir}
                variants={tlVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                className="relative h-full flex flex-col"
              >
                {/* Frosted search bar */}
                <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-border/30 bg-background/75 backdrop-blur-md shadow-[0_1px_0_0_hsl(var(--border)/0.15)]">
                  <div className="relative flex-1 max-w-[260px]">
                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Filter parameters…"
                      className="h-7 w-full rounded-md border border-border/30 bg-background/40 pl-7 pr-2 text-[11px] placeholder:text-muted-foreground/25 focus:outline-none focus:ring-1 focus:ring-ring/40 focus:border-border/60 transition-colors"
                    />
                  </div>
                  {loading && (
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground/40">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      Updating
                    </span>
                  )}
                  <span className="ml-auto text-[9px] text-muted-foreground/25 tabular-nums">
                    {dossierDates.length} days
                  </span>
                </div>

                {/* Dossier list */}
                <div className="flex-1 min-h-0 overflow-auto">
                  {dossierDates.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">
                      No scheduled tasks in this range.
                    </div>
                  ) : (
                    dossierDates.map(date => (
                      <DossierDateCard
                        key={date}
                        date={date}
                        params={shownParams}
                        entryMap={entryMap}
                        isToday={date === today}
                        dayLock={dayLock}
                        isLockedForUser={isLockedForUser}
                        isAdmin={isAdmin}
                        onParamClick={handleCellClick}
                        today={today}
                        todayCardRef={todayCardRef}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {entry && (
        <EntryModal
          param={entry.param}
          date={entry.date}
          existing={entryMap[`${entry.param.id}__${entry.date}`]}
          dept={dept}
          locked={entry.locked}
          onSave={() => { setEntry(null); reload(); }}
          onClose={() => setEntry(null)}
        />
      )}

      {review && (
        <ReviewModal
          param={review.param}
          date={review.date}
          entry={entryMap[`${review.param.id}__${review.date}`]}
          onSave={() => { setReview(null); reload(); }}
          onClose={() => setReview(null)}
        />
      )}

      {addParam && (
        <ParamBuilderModal
          dept={dept}
          onSave={() => { setAddParam(false); reload(); }}
          onClose={() => setAddParam(false)}
        />
      )}

      {exporting && (
        <ExportModal dept={dept} onClose={() => setExporting(false)} />
      )}

      {dayDetail && (
        <DayDetailPanel
          date={dayDetail.date}
          scale={dayDetail.scale}
          dept={dept}
          params={params}
          entryMap={entryMap}
          isAdmin={isAdmin}
          isLockedForUser={isLockedForUser}
          onRowClick={(param, dateStr) => {
            handleCellClick(param, dateStr);
            setDayDetail(null);
          }}
          onClose={() => setDayDetail(null)}
        />
      )}
    </div>
  );
}
