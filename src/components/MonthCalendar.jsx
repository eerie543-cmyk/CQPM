import { useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toLocalYMD } from '@/lib/schedule';
import { getDayStatus } from '@/lib/dayStatus';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Build the 6×7 (42-cell) grid of YYYY-MM-DD strings for the month containing `anchor`.
function buildGrid(anchor) {
  const first = new Date(anchor + 'T00:00:00');
  first.setDate(1);
  // Back up to Monday (getDay: 0=Sun..6=Sat → Monday-first offset)
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - offset);

  const cells = [];
  const cursor = new Date(start);
  for (let i = 0; i < 42; i++) {
    cells.push(toLocalYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

const slideVariants = {
  enter:  dir => ({ x: dir > 0 ? 320 : -320, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   dir => ({ x: dir > 0 ? -320 : 320, opacity: 0 }),
};

function DayTile({ dateStr, monthIdx, today, status, onSelect, draggedRef }) {
  const d = new Date(dateStr + 'T00:00:00');
  const inMonth = d.getMonth() === monthIdx;
  const isToday = dateStr === today;
  const dayNum  = d.getDate();
  const hasDue  = status.kind !== 'none';
  const isFuture = status.kind === 'future';

  // Break counts into display groups: good → pending → review → bad
  const statusParts = hasDue && !isFuture ? [
    (status.counts.done + status.counts.late) > 0 && { n: status.counts.done + status.counts.late, sym: '✓', cls: 'text-emerald-400' },
    status.counts.pending > 0                     && { n: status.counts.pending,                  sym: '◇', cls: 'text-amber-300'   },
    status.counts.review  > 0                     && { n: status.counts.review,                   sym: '◷', cls: 'text-amber-400'   },
    status.counts.problem > 0                     && { n: status.counts.problem,                  sym: '✗', cls: 'text-red-400/80'  },
  ].filter(Boolean) : [];

  return (
    <button
      onClick={() => { if (!draggedRef.current) onSelect(dateStr); }}
      className={cn(
        'group relative flex flex-col p-2 h-full w-full text-left select-none overflow-hidden border-r border-b border-border transition-colors',
        isToday        ? 'bg-yellow-400/20 dark:bg-yellow-400/10'
        : inMonth      ? 'hover:bg-muted/40'
        :                'bg-muted/10 hover:bg-muted/20',
      )}
    >
      {/* Day number — top-left, timeline-style (yellow today, dim out-of-month) */}
      <span className={cn(
        'text-xs leading-none font-semibold flex-shrink-0',
        isToday   ? 'text-yellow-600 dark:text-yellow-400 font-bold'
        : inMonth ? 'text-foreground'
        :           'text-muted-foreground/40',
      )}>
        {dayNum}
      </span>

      {/* Body indicator — one group per status type, count-prefixed when > 1 */}
      {statusParts.length > 0 && (
        <div className="flex-1 flex items-center justify-center" title={`${status.counts.total} scheduled`}>
          {statusParts.length === 1 ? (
            <span className={cn('text-xs font-bold font-mono leading-none transition-transform group-hover:scale-110', statusParts[0].cls)}>
              {statusParts[0].n > 1 ? `${statusParts[0].n}${statusParts[0].sym}` : statusParts[0].sym}
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              {statusParts.map(({ n, sym, cls }) => (
                <span key={sym} className={cn('text-xs font-bold font-mono leading-none', cls)}>
                  {n}{sym}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Future / upcoming cells: task count as "N tasks" */}
      {isFuture && status.counts.total > 0 && (
        <div className="flex-1 flex items-center justify-center" title={status.names.join(', ')}>
          <span className="text-[10px] font-semibold text-yellow-400/70 leading-none">
            {status.counts.total} task{status.counts.total !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </button>
  );
}

export default function MonthCalendar({
  monthAnchor, direction, params, entryMap, today,
  onSelectDay, onPrev, onNext, onToday, loading,
}) {
  const draggedRef = useRef(false);
  const monthKey = monthAnchor.slice(0, 7);
  const anchorDate = new Date(monthAnchor + 'T00:00:00');
  const monthIdx = anchorDate.getMonth();
  const monthTitle = anchorDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const cells = useMemo(() => buildGrid(monthAnchor), [monthAnchor]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Month bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold w-40">{monthTitle}</h2>
          {loading && <span className="text-[10px] text-muted-foreground animate-pulse">Updating…</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onToday}
            className="px-2.5 py-1 text-xs rounded-md hover:bg-muted transition-colors font-medium">
            Today
          </button>
          <button onClick={onNext} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday header — connected cells, flush like the timeline table */}
      <div className="grid grid-cols-7 flex-shrink-0">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn(
            'border-r border-b border-border px-1 py-2 text-center text-[10px] font-bold uppercase tracking-widest',
            i >= 5 ? 'text-muted-foreground/50' : 'text-muted-foreground',
          )}>
            {w}
          </div>
        ))}
      </div>

      {/* Animated month grid — relative clip so the sliding panel can't spill into scrollbars */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={monthKey}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragStart={() => { draggedRef.current = false; }}
            onDragEnd={(_e, info) => {
              if (Math.abs(info.offset.x) > 6) draggedRef.current = true;
              if (info.offset.x < -80 || info.velocity.x < -500) onNext();
              else if (info.offset.x > 80 || info.velocity.x > 500) onPrev();
              setTimeout(() => { draggedRef.current = false; }, 60);
            }}
            className="grid grid-cols-7 grid-rows-6 h-full cursor-grab active:cursor-grabbing"
          >
            {cells.map(dateStr => (
              <DayTile
                key={dateStr}
                dateStr={dateStr}
                monthIdx={monthIdx}
                today={today}
                status={getDayStatus(params, entryMap, dateStr, today)}
                onSelect={onSelectDay}
                draggedRef={draggedRef}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
