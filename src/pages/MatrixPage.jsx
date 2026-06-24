import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, CheckCircle2, XCircle, Circle, AlertCircle, AlertTriangle, Minus, Plus, Lock, RotateCcw, RefreshCw, FileSpreadsheet, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMatrix } from '@/hooks/useMatrix';
import { useAuth } from '@/hooks/useAuth';
import { useRemoteConfigContext } from '@/hooks/useRemoteConfigContext';
import { isDue, isOutOfRange, todayStr, addDays } from '@/lib/schedule';
import EntryModal from '@/components/EntryModal';
import ReviewModal from '@/components/ReviewModal';
import ParamBuilderModal from '@/components/ParamBuilderModal';
import ExportModal from '@/components/ExportModal';
import DayDetailPanel from '@/components/DayDetailPanel';

const SCALES = ['day', 'week', 'month', 'quarter', 'year'];
const SCALE_LABELS = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };

const DEPT_NAMES   = { serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology' };
const DEPT_SYMBOL  = { serology: '⊕',        molecularBio: '⌬',                 microbiology: '⊙' };

// Score grade tiers
const GRADE = score =>
  score >= 95 ? { label: 'Excellent', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
  : score >= 80 ? { label: 'Good',     cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' }
  : score >= 65 ? { label: 'Fair',     cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
  :               { label: 'At Risk',  cls: 'bg-red-500/10 text-red-400 border-red-500/20' };

function formatDate(dateStr, scale) {
  const d = new Date(dateStr + 'T00:00:00');
  if (scale === 'day')     return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (scale === 'week')    return `W${getWeekNum(d)} ${d.getFullYear()}`;
  if (scale === 'month')   return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  if (scale === 'quarter') return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

function getWeekNum(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

function getColumnDates(anchorDate, scale, count) {
  const dates = [];
  let cursor = new Date(anchorDate + 'T00:00:00');

  if (scale === 'day') {
    for (let i = 0; i < count; i++) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1); }
  } else if (scale === 'week') {
    cursor.setDate(cursor.getDate() - cursor.getDay());
    for (let i = 0; i < count; i++) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 7); }
  } else if (scale === 'month') {
    cursor.setDate(1);
    for (let i = 0; i < count; i++) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setMonth(cursor.getMonth() + 1); }
  } else if (scale === 'quarter') {
    const q = Math.floor(cursor.getMonth() / 3);
    cursor = new Date(cursor.getFullYear(), q * 3, 1);
    for (let i = 0; i < count; i++) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setMonth(cursor.getMonth() + 3); }
  } else {
    cursor = new Date(cursor.getFullYear(), 0, 1);
    for (let i = 0; i < count; i++) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setFullYear(cursor.getFullYear() + 1); }
  }
  return dates;
}

function CellStatus({ status, isDueFlag, isToday, critical, outOfRange, requiresReview, reviewResult }) {
  if (!isDueFlag) return (
    <div className="w-full h-full flex items-center justify-center">
      <Minus className="w-3 h-3 text-muted-foreground/20" />
    </div>
  );
  // Done/late but value out of allowed range → flag instead of a clean tick
  if ((status === 'done' || status === 'late') && outOfRange) return (
    <div className="w-full h-full flex items-center justify-center" title="Recorded value is out of range">
      <AlertTriangle className="w-4 h-4 text-orange-400" />
    </div>
  );
  // Review-required and already filled → show review state
  if (requiresReview && (status === 'done' || status === 'late')) {
    if (reviewResult === 'pass') return (
      <div className={cn('w-full h-full flex items-center justify-center rounded relative', isToday && 'ring-1 ring-emerald-400/40')} title="Review: Pass">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-card" />
      </div>
    );
    if (reviewResult === 'fail') return (
      <div className="w-full h-full flex items-center justify-center" title="Review: Fail">
        <XCircle className="w-4 h-4 text-red-400" />
      </div>
    );
    // Awaiting review
    return (
      <div className="w-full h-full flex items-center justify-center" title="Awaiting result review">
        <CheckCircle2 className="w-4 h-4 text-amber-300/70" />
      </div>
    );
  }
  if (status === 'done') return (
    <div className={cn('w-full h-full flex items-center justify-center rounded', isToday && 'ring-1 ring-emerald-400/40')}>
      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    </div>
  );
  if (status === 'late') return (
    <div className="w-full h-full flex items-center justify-center">
      <CheckCircle2 className="w-4 h-4 text-amber-400" />
    </div>
  );
  if (status === 'missed') return (
    <div className="w-full h-full flex items-center justify-center">
      <AlertCircle className={cn('w-4 h-4', critical ? 'text-red-400' : 'text-red-400/60')} />
    </div>
  );
  return (
    <div className={cn('w-full h-full flex items-center justify-center rounded', isToday && 'ring-1 ring-primary/40')}>
      <Circle className={cn('w-4 h-4', critical ? 'text-primary/80' : 'text-muted-foreground/40')} />
    </div>
  );
}

// Readable hover summary for a matrix cell.
function cellTitle(param, col, e, due, oor) {
  if (!due) return '';
  const dateLabel = new Date(col + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (!e) return `${param.name} · ${dateLabel} · Pending`;
  const statusLabel = { done: 'Done', late: 'Late', missed: 'Missed' }[e.status] || e.status;
  const parts = [param.name, dateLabel, statusLabel + (oor ? ' (out of range)' : '')];
  if (e.value !== null && e.value !== undefined && e.value !== '') parts.push(`${e.value}${param.unit ? ' ' + param.unit : ''}`);
  if (e.done_by_name) parts.push(`by ${e.done_by_name}`);
  if (e.notes) parts.push(`”${e.notes}”`);
  if (param.requires_review === 1) {
    if (e.result === 'pass')   parts.push(`Review: Pass`);
    else if (e.result === 'fail') parts.push(`Review: Fail — ${e.review_note || ''}`);
    else if (e.status === 'done' || e.status === 'late') parts.push('Awaiting result review');
  }
  return parts.join(' · ');
}

export default function MatrixPage({ dept }) {
  const today = todayStr();
  const COL_COUNT = 14;
  const { isAdmin } = useAuth();
  const { features } = useRemoteConfigContext();
  const exportEnabled = isAdmin && features.export !== false;

  const [scale,      setScale]    = useState('day');
  const [anchorDate, setAnchor]   = useState(() => addDays(today, -7));
  const [entry,      setEntry]    = useState(null);   // {param, date, locked}
  const [review,     setReview]   = useState(null);   // {param, date} — admin review modal
  const [addParam,   setAddParam] = useState(false);  // open param builder
  const [exporting,  setExporting]= useState(false);  // open export modal
  const [query,      setQuery]    = useState('');     // row filter
  const [dayDetail,  setDayDetail]= useState(null);   // date string for details panel

  const containerRef = useRef(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, active: false });
  const accumXRef = useRef(0);
  const lastSwipeTimeRef = useRef(0);
  const lastZoomTimeRef = useRef(0);

  // Dynamic ref to navigate to avoid recreating useEffect on every navigate change
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Zoom function
  const handleZoom = useCallback((direction) => {
    setScale(curr => {
      const idx = SCALES.indexOf(curr);
      if (direction === 'out' && idx < SCALES.length - 1) {
        return SCALES[idx + 1];
      }
      if (direction === 'in' && idx > 0) {
        return SCALES[idx - 1];
      }
      return curr;
    });
  }, []);

  const handleZoomThrottled = useCallback((direction) => {
    const now = Date.now();
    if (now - lastZoomTimeRef.current < 200) return;
    lastZoomTimeRef.current = now;
    handleZoom(direction);
  }, [handleZoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Wheel event handler for zoom & horizontal swipe
    const handleWheel = (e) => {
      // A. Touchpad pinch-to-zoom (ctrlKey is true)
      if (e.ctrlKey) {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 'out' : 'in'; // Pinch out/zoom out vs pinch in/zoom in
        handleZoomThrottled(dir);
        return;
      }

      // B. Scroll wheel zoom on headers (timeline)
      const targetHeader = e.target.closest('thead');
      if (targetHeader) {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 'out' : 'in'; // Scroll up zooms out (day to year), scroll down zooms in
        handleZoomThrottled(dir);
        return;
      }

      // C. Double-finger slide navigation (horizontal scroll deltaX)
      if (Math.abs(e.deltaX) > 3) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastSwipeTimeRef.current > 150) {
          accumXRef.current += e.deltaX;
          if (Math.abs(accumXRef.current) > 60) {
            const dir = accumXRef.current > 0 ? -1 : 1; // deltaX > 0 means slide left -> past; deltaX < 0 means slide right -> future
            navigateRef.current(dir);
            accumXRef.current = 0;
            lastSwipeTimeRef.current = now;
          }
        }
      }
    };

    // 2. Mouse drag-to-navigate event handlers
    const handleMouseDown = (e) => {
      // Only handle left clicks
      if (e.button !== 0) return;
      dragStartRef.current = { x: e.clientX, active: true };
      setIsGrabbing(true);
    };

    const handleMouseMove = (e) => {
      if (!dragStartRef.current.active) return;
      
      const diffX = dragStartRef.current.x - e.clientX;
      const absDiffX = Math.abs(diffX);

      if (absDiffX > 5) {
        isDraggingRef.current = true;
      }

      if (absDiffX > 80) {
        const dir = diffX > 0 ? 1 : -1; // Drag left -> navigate(1) (future); Drag right -> navigate(-1) (past)
        navigateRef.current(dir);
        dragStartRef.current.x = e.clientX; // Update starting x for smooth continuous dragging
      }
    };

    const handleMouseUp = () => {
      if (dragStartRef.current.active) {
        dragStartRef.current.active = false;
        setIsGrabbing(false);
        // Small delay to ensure click handlers check isDraggingRef before it is reset
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleZoomThrottled]);

  const cols = useMemo(() => getColumnDates(anchorDate, scale, COL_COUNT), [anchorDate, scale]);
  const { params, entries, signoffs, closures, loading, reload } = useMatrix(dept, cols[0], cols[cols.length - 1]);
  const q = query.trim().toLowerCase();
  const shownParams = q ? params.filter(p => p.name.toLowerCase().includes(q)) : params;
  const scaleIdx = SCALES.indexOf(scale);

  // Per-day lock state (only meaningful at day scale)
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

  // Is the day read-only for the current user?
  const isLockedForUser = useCallback((date) => {
    const lock = dayLock(date);
    if (lock === 'closed' || lock === 'approved') return true;
    if (lock === 'submitted' && !isAdmin) return true;
    return false;
  }, [dayLock, isAdmin]);

  function navigate(dir) {
    const step = { day: 7, week: 4, month: 3, quarter: 2, year: 1 }[scale] ?? 7;
    const d = new Date(anchorDate + 'T00:00:00');
    if (scale === 'day')          d.setDate(d.getDate()       + dir * step);
    else if (scale === 'week')    d.setDate(d.getDate()       + dir * step * 7);
    else if (scale === 'month')   d.setMonth(d.getMonth()     + dir * step);
    else if (scale === 'quarter') d.setMonth(d.getMonth()     + dir * step * 3);
    else                          d.setFullYear(d.getFullYear() + dir * step);
    setAnchor(d.toISOString().slice(0, 10));
  }

  function jumpToToday() { setAnchor(addDays(today, -7)); }

  const entryMap = useMemo(() => {
    const m = {};
    for (const e of entries) m[`${e.parameter_id}__${e.slot_date}`] = e;
    return m;
  }, [entries]);

  // Weighted compliance score
  // Critical params = weight 2, normal = weight 1
  // Done = full, Late = 0.7×, Missed / pending = 0
  // requires_review params: only result='pass' earns credit (fail/pending = 0)
  const scoreData = useMemo(() => {
    let totalW = 0, earnedW = 0;
    let critDue = 0, critDone = 0;
    for (const p of params) {
      const w = p.critical === 1 ? 2 : 1;
      for (const col of cols) {
        if (!isDue(p, col, scale)) continue;
        totalW += w;
        if (p.critical) critDue++;
        const e   = entryMap[`${p.id}__${col}`];
        const oor = isOutOfRange(p, e);
        if (p.requires_review === 1) {
          if (e?.result === 'pass' && !oor) {
            if (e.status === 'done')       { earnedW += w;       if (p.critical) critDone++; }
            else if (e.status === 'late')  { earnedW += w * 0.7; if (p.critical) critDone++; }
          }
        } else {
          if (e?.status === 'done' && !oor)      { earnedW += w;       if (p.critical) critDone++; }
          else if (e?.status === 'late' && !oor) { earnedW += w * 0.7; if (p.critical) critDone++; }
        }
      }
    }
    const pct = totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
    return { pct, critDue, critDone };
  }, [params, cols, entryMap, scale]);

  const handleCellClick = useCallback((param, dateStr) => {
    if (dateStr > today) return;
    const e = entryMap[`${param.id}__${dateStr}`];
    // Admin clicking a filled review-required cell → ReviewModal
    if (isAdmin && param.requires_review === 1 && e && (e.status === 'done' || e.status === 'late')) {
      setReview({ param, date: dateStr });
    } else {
      setEntry({ param, date: dateStr, locked: isLockedForUser(dateStr) });
    }
  }, [today, isLockedForUser, isAdmin, entryMap]);

  const { pct: score, critDue, critDone } = scoreData;
  const grade = score !== null ? GRADE(score) : null;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur gap-4 flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <span className="font-mono text-[13px] leading-none text-muted-foreground">{DEPT_SYMBOL[dept]}</span>
            {DEPT_NAMES[dept]}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {params.length} parameter{params.length !== 1 ? 's' : ''} · {SCALE_LABELS[scale]} view
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Score + grade badge */}
          {grade && (
            <div className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5', grade.cls)}>
              <span>{score}%</span>
              <span className="opacity-70">·</span>
              <span>{grade.label}</span>
              {critDue > 0 && (
                <span className="text-[9px] opacity-60 ml-0.5">
                  ({critDone}/{critDue} crit)
                </span>
              )}
            </div>
          )}

          {/* Export — admin only, remotely gateable */}
          {exportEnabled && (
            <button onClick={() => setExporting(true)}
              className="flex items-center gap-1 h-7 px-2.5 text-xs rounded-md border hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors"
              title="Export compliance report (.xlsx)">
              <FileSpreadsheet className="w-3 h-3" />
              Export
            </button>
          )}

          {/* Add parameter — admin only */}
          {isAdmin && (
            <button onClick={() => setAddParam(true)}
              className="flex items-center gap-1 h-7 px-2.5 text-xs rounded-md border border-dashed hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors">
              <Plus className="w-3 h-3" />
              Add Param
            </button>
          )}

          {/* Scale controls */}
          <div className="flex items-center gap-1 border rounded-lg p-1">
            <button onClick={() => setScale(SCALES[Math.max(0, scaleIdx - 1)])}
              disabled={scaleIdx === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-medium px-1 min-w-[52px] text-center">{SCALE_LABELS[scale]}</span>
            <button onClick={() => setScale(SCALES[Math.min(SCALES.length - 1, scaleIdx + 1)])}
              disabled={scaleIdx === SCALES.length - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={jumpToToday}
              className="px-2.5 py-1 text-xs rounded-md hover:bg-muted transition-colors font-medium">
              Today
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-4 px-6 py-2 border-b text-[10px] text-muted-foreground flex-shrink-0">
        {[
          { sym: '✓',  label: 'Done' },
          { sym: '≈',  label: 'Done late (0.7×)' },
          { sym: '✗',  label: 'Missed' },
          { sym: '○',  label: 'Pending' },
          { sym: '–',  label: 'Not scheduled' },
          { sym: '◷',  label: 'Awaiting review' },
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

      {/* Matrix */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 overflow-auto",
          isGrabbing ? "cursor-grabbing select-none" : "cursor-grab"
        )}
      >
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
          <div className="relative">
            {loading && (
              <div className="absolute top-2 right-4 flex items-center gap-1.5 bg-background/80 border border-border/50 text-[10px] px-2.5 py-0.5 rounded-full shadow-sm text-muted-foreground backdrop-blur z-20 pointer-events-none animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                Updating...
              </div>
            )}
            <table
              className={cn(
                "w-full border-collapse text-xs transition-opacity duration-200",
                loading && "opacity-75 pointer-events-none"
              )}
              style={{ minWidth: `${COL_COUNT * 52 + 240}px` }}
            >
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card border-r border-b px-2 py-1.5 text-left w-56">
                  <div className="relative">
                    <Search className="w-3 h-3 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                    <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                      placeholder="Parameter…"
                      className="h-6 w-full rounded border bg-background pl-7 pr-2 text-[11px] font-normal normal-case tracking-normal focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </th>
                {cols.map(col => {
                  const isToday = col === today;
                  const isPast  = col < today;
                  return (
                    <th key={col}
                      onClick={() => { if (!isDraggingRef.current) setDayDetail(col); }}
                      className={cn(
                        'border-b border-r px-1 py-2 text-center font-medium w-12 cursor-pointer hover:bg-muted/50 transition-colors',
                        isToday ? 'bg-primary/5 text-primary' : 'text-muted-foreground',
                      )}
                      title={`Click to view tasks and entries for ${formatDate(col, scale)}`}
                    >
                      <div className="leading-tight">
                        {formatDate(col, scale).split(' ').map((part, i) => (
                          <div key={i} className={i === 0 ? 'font-semibold' : 'text-[9px] opacity-70'}>{part}</div>
                        ))}
                        {isToday && <div className="w-1 h-1 bg-primary rounded-full mx-auto mt-0.5" />}
                      </div>
                    </th>
                  );
                })}
              </tr>

              {/* Per-day lock / approval status (day scale only) */}
              {scale === 'day' && (
                <tr>
                  <th className="sticky left-0 z-10 bg-card border-r border-b px-3 py-1 text-left text-[9px] font-medium uppercase tracking-widest text-muted-foreground/70 w-56">
                    Day status
                  </th>
                  {cols.map(col => {
                    const lock = dayLock(col);
                    const icon =
                      lock === 'closed'    ? <Lock className="w-3 h-3 text-red-400 mx-auto" />
                    : lock === 'approved'  ? <CheckCircle2 className="w-3 h-3 text-emerald-400 mx-auto" />
                    : lock === 'submitted' ? <Lock className="w-3 h-3 text-amber-400 mx-auto" />
                    : lock === 'reopened'  ? <RotateCcw className="w-3 h-3 text-muted-foreground/50 mx-auto" />
                    : null;
                    const title =
                      lock === 'closed'    ? 'Month closed — locked'
                    : lock === 'approved'  ? 'Approved & locked'
                    : lock === 'submitted' ? 'Submitted, awaiting approval'
                    : lock === 'reopened'  ? 'Reopened for edits'
                    : '';
                    return (
                      <th key={col} title={title}
                        className={cn('border-b border-r py-1 text-center', col === today && 'bg-primary/5')}>
                        {icon}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {shownParams.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="text-center text-xs text-muted-foreground py-8">
                    No parameters match “{query}”.
                  </td>
                </tr>
              )}
              {shownParams.map((param, pi) => (
                <tr key={param.id} className={cn('hover:bg-muted/30 transition-colors', pi % 2 === 0 ? '' : 'bg-muted/10')}>
                  {/* Parameter label */}
                  <td className="sticky left-0 z-10 bg-card border-r border-b px-3 py-1.5 w-56">
                    <div className="flex items-center gap-1.5">
                      {param.critical === 1 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Critical (2× weight)" />
                      )}
                      <div>
                        <p className="font-medium text-foreground truncate max-w-[180px]">{param.name}</p>
                        <p className="text-[9px] text-muted-foreground capitalize">
                          {param.schedule_type === 'specific'
                            ? `${(param.specific_dates || '').split(',').filter(Boolean).length} date(s)`
                            : param.frequency}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Cells */}
                  {cols.map(col => {
                    const due      = isDue(param, col, scale);
                    const isFuture = col > today;
                    const isToday  = col === today;
                    const e        = entryMap[`${param.id}__${col}`];
                    const oor      = isOutOfRange(param, e);
                    const locked   = scale === 'day' && isLockedForUser(col);
                    return (
                      <td key={col}
                        onClick={() => due && !isFuture && !isDraggingRef.current && handleCellClick(param, col)}
                        title={cellTitle(param, col, e, due, oor)}
                        className={cn(
                          'border-b border-r p-0.5 h-9 w-12 text-center',
                          isToday && 'bg-primary/5',
                          locked && 'bg-muted/30',
                          due && !isFuture && 'cursor-pointer hover:bg-muted/50',
                          !due && 'opacity-40'
                        )}
                      >
                        <CellStatus
                          status={e?.status}
                          isDueFlag={due}
                          isToday={isToday}
                          critical={param.critical === 1}
                          outOfRange={oor}
                          requiresReview={param.requires_review === 1}
                          reviewResult={e?.result ?? null}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Entry modal */}
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

      {/* Review modal (admin only) */}
      {review && (
        <ReviewModal
          param={review.param}
          date={review.date}
          entry={entryMap[`${review.param.id}__${review.date}`]}
          onSave={() => { setReview(null); reload(); }}
          onClose={() => setReview(null)}
        />
      )}

      {/* Param builder (admin) */}
      {addParam && (
        <ParamBuilderModal
          dept={dept}
          onSave={() => { setAddParam(false); reload(); }}
          onClose={() => setAddParam(false)}
        />
      )}

      {/* Export report (admin) */}
      {exporting && (
        <ExportModal dept={dept} onClose={() => setExporting(false)} />
      )}

      {/* Day Detail Panel */}
      {dayDetail && (
        <DayDetailPanel
          date={dayDetail}
          scale={scale}
          dept={dept}
          params={params}
          entryMap={entryMap}
          isAdmin={isAdmin}
          isLockedForUser={isLockedForUser}
          onRowClick={(param) => {
            handleCellClick(param, dayDetail);
            setDayDetail(null);
          }}
          onClose={() => setDayDetail(null)}
        />
      )}
    </div>
  );
}
