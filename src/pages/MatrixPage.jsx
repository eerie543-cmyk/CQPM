import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, CheckCircle2, Circle, AlertCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMatrix } from '@/hooks/useMatrix';
import EntryModal from '@/components/EntryModal';

const SCALES = ['day', 'week', 'month', 'quarter', 'year'];
const SCALE_LABELS = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };

const DEPT_COLORS = {
  serology:     { accent: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/30'    },
  molecularBio: { accent: 'text-violet-400',  bg: 'bg-violet-500/20',  border: 'border-violet-500/30'  },
  microbiology: { accent: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
};

const DEPT_NAMES = {
  serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology'
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

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
    for (let i = 0; i < count; i++) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (scale === 'week') {
    cursor.setDate(cursor.getDate() - cursor.getDay()); // snap to Sunday
    for (let i = 0; i < count; i++) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (scale === 'month') {
    cursor.setDate(1);
    for (let i = 0; i < count; i++) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (scale === 'quarter') {
    const q = Math.floor(cursor.getMonth() / 3);
    cursor = new Date(cursor.getFullYear(), q * 3, 1);
    for (let i = 0; i < count; i++) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setMonth(cursor.getMonth() + 3);
    }
  } else {
    cursor = new Date(cursor.getFullYear(), 0, 1);
    for (let i = 0; i < count; i++) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  }
  return dates;
}

function CellStatus({ status, isDue, isToday, critical }) {
  if (!isDue) return (
    <div className="w-full h-full flex items-center justify-center">
      <Minus className="w-3 h-3 text-muted-foreground/20" />
    </div>
  );
  if (status === 'done') return (
    <div className={cn('w-full h-full flex items-center justify-center rounded', isToday && 'ring-1 ring-emerald-400/50')}>
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
  // due but not yet logged
  return (
    <div className={cn('w-full h-full flex items-center justify-center rounded', isToday && 'ring-1 ring-primary/40')}>
      <Circle className={cn('w-4 h-4', critical ? 'text-primary/80' : 'text-muted-foreground/40')} />
    </div>
  );
}

export default function MatrixPage({ dept }) {
  const today = getToday();
  const COL_COUNT = 14;

  const [scale, setScale]         = useState('day');
  const [anchorDate, setAnchor]   = useState(() => addDays(today, -7));
  const [entry, setEntry]         = useState(null); // {param, date}

  const cols = useMemo(() => getColumnDates(anchorDate, scale, COL_COUNT), [anchorDate, scale]);

  const { params, entries, loading, reload } = useMatrix(dept, cols[0], cols[cols.length - 1]);

  const colors = DEPT_COLORS[dept] ?? DEPT_COLORS.serology;

  const scaleIdx = SCALES.indexOf(scale);

  function navigate(dir) {
    const step = { day: 7, week: 4, month: 3, quarter: 2, year: 1 }[scale] ?? 7;
    const d = new Date(anchorDate + 'T00:00:00');
    if (scale === 'day')     d.setDate(d.getDate() + dir * step);
    else if (scale === 'week')  d.setDate(d.getDate() + dir * step * 7);
    else if (scale === 'month') d.setMonth(d.getMonth() + dir * step);
    else if (scale === 'quarter') d.setMonth(d.getMonth() + dir * step * 3);
    else d.setFullYear(d.getFullYear() + dir * step);
    setAnchor(d.toISOString().slice(0, 10));
  }

  function jumpToToday() { setAnchor(addDays(today, -7)); }

  // Check if a parameter is due on a given date
  function isDue(param, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun
    switch (param.frequency) {
      case 'daily':   return true;
      case 'weekly': {
        const days = (param.days_of_week || '1').split(',').map(Number);
        return days.includes(dow);
      }
      case 'biweekly': return dow === 1; // every other Mon — simplified
      case 'monthly':  return d.getDate() === (param.day_of_month || 1);
      case 'quarterly': {
        const m = d.getMonth(); return d.getDate() === 1 && (m % 3 === 0);
      }
      case 'yearly': return d.getDate() === 1 && d.getMonth() === 0;
      default: return false;
    }
  }

  const entryMap = useMemo(() => {
    const m = {};
    for (const e of entries) m[`${e.parameter_id}__${e.slot_date}`] = e;
    return m;
  }, [entries]);

  // Compliance score for visible range
  const score = useMemo(() => {
    let due = 0, done = 0;
    for (const p of params) {
      for (const col of cols) {
        if (!isDue(p, col)) continue;
        due++;
        const e = entryMap[`${p.id}__${col}`];
        if (e && (e.status === 'done' || e.status === 'late')) done++;
      }
    }
    return due === 0 ? null : Math.round((done / due) * 100);
  }, [params, cols, entryMap]);

  const handleCellClick = useCallback((param, dateStr) => {
    const isFuture = dateStr > today;
    if (isFuture) return;
    setEntry({ param, date: dateStr });
  }, [today]);

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur gap-4 flex-shrink-0">
        <div>
          <h1 className={cn('text-base font-semibold', colors.accent)}>
            {DEPT_NAMES[dept]}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {params.length} parameters · {SCALE_LABELS[scale]} view
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Score badge */}
          {score !== null && (
            <div className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold border',
              score >= 90 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : score >= 70 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            )}>
              {score}% compliant
            </div>
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
            <button onClick={() => navigate(-1)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={jumpToToday}
              className="px-2.5 py-1 text-xs rounded-md hover:bg-muted transition-colors font-medium">
              Today
            </button>
            <button onClick={() => navigate(1)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 py-2 border-b text-[10px] text-muted-foreground flex-shrink-0">
        {[
          { color: 'text-emerald-400', label: 'Done' },
          { color: 'text-amber-400',   label: 'Done late' },
          { color: 'text-red-400',     label: 'Missed' },
          { color: 'text-primary/60',  label: 'Pending' },
          { color: 'text-muted-foreground/20', label: 'Not scheduled' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-full bg-current', color)} />
            {label}
          </span>
        ))}
      </div>

      {/* Matrix */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Loading…
          </div>
        ) : params.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No parameters defined for this department yet.
          </div>
        ) : (
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${COL_COUNT * 52 + 220}px` }}>
            <thead>
              <tr>
                {/* Parameter label column */}
                <th className="sticky left-0 z-10 bg-card border-r border-b px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-52">
                  Parameter
                </th>
                {cols.map(col => {
                  const isToday = col === today;
                  return (
                    <th key={col} className={cn(
                      'border-b border-r px-1 py-2 text-center font-medium w-12',
                      isToday ? 'bg-primary/5 text-primary' : 'text-muted-foreground'
                    )}>
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
            </thead>
            <tbody>
              {params.map((param, pi) => (
                <tr key={param.id} className={cn('hover:bg-muted/30 transition-colors', pi % 2 === 0 ? '' : 'bg-muted/10')}>
                  {/* Parameter name */}
                  <td className="sticky left-0 z-10 bg-card border-r border-b px-3 py-1.5 w-52">
                    <div className="flex items-center gap-1.5">
                      {param.critical === 1 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Critical" />
                      )}
                      <div>
                        <p className="font-medium text-foreground truncate max-w-[170px]">{param.name}</p>
                        <p className="text-[9px] text-muted-foreground capitalize">{param.frequency}</p>
                      </div>
                    </div>
                  </td>

                  {/* Cells */}
                  {cols.map(col => {
                    const due      = isDue(param, col);
                    const isFuture = col > today;
                    const isToday  = col === today;
                    const entry    = entryMap[`${param.id}__${col}`];
                    return (
                      <td
                        key={col}
                        onClick={() => due && !isFuture && handleCellClick(param, col)}
                        className={cn(
                          'border-b border-r p-0.5 h-9 w-12 text-center',
                          isToday && 'bg-primary/5',
                          due && !isFuture && 'cursor-pointer hover:bg-muted/50',
                          !due && 'opacity-40'
                        )}
                      >
                        <CellStatus
                          status={entry?.status}
                          isDue={due}
                          isToday={isToday}
                          critical={param.critical === 1}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Entry modal */}
      {entry && (
        <EntryModal
          param={entry.param}
          date={entry.date}
          existing={entryMap[`${entry.param.id}__${entry.date}`]}
          dept={dept}
          onSave={() => { setEntry(null); reload(); }}
          onClose={() => setEntry(null)}
        />
      )}
    </div>
  );
}
