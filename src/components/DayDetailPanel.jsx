import { X, CalendarDays, Lock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDue, isOutOfRange, todayStr, toLocalYMD } from '@/lib/schedule';

const DEPT_NAMES = {
  serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology',
};

function getWeekNum(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

function getDatesInPeriod(startDateStr, scale) {
  const dates = [];
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(start);

  if (scale === 'day') {
    return [startDateStr];
  } else if (scale === 'week') {
    end.setDate(end.getDate() + 6);
  } else if (scale === 'month') {
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
  } else if (scale === 'quarter') {
    end.setMonth(end.getMonth() + 3);
    end.setDate(0);
  } else if (scale === 'year') {
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(0);
  }

  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toLocalYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export default function DayDetailPanel({ date, scale, dept, params, entryMap, isAdmin, isLockedForUser, onRowClick, onClose }) {
  const today = todayStr();

  const titleMap = {
    day: 'Day Details',
    week: 'Week Details',
    month: 'Month Details',
    quarter: 'Quarter Details',
    year: 'Year Details',
  };
  const titleText = titleMap[scale] || 'Details';

  let displayDate = '';
  if (scale === 'day') {
    displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } else if (scale === 'week') {
    const dStart = new Date(date + 'T00:00:00');
    const dEnd = new Date(dStart);
    dEnd.setDate(dEnd.getDate() + 6);
    const startStr = dStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const endStr = dEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    displayDate = `Week ${getWeekNum(dStart)}, ${dStart.getFullYear()} (${startStr} – ${endStr})`;
  } else if (scale === 'month') {
    const d = new Date(date + 'T00:00:00');
    displayDate = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } else if (scale === 'quarter') {
    const d = new Date(date + 'T00:00:00');
    const q = Math.ceil((d.getMonth() + 1) / 3);
    displayDate = `Q${q} ${d.getFullYear()}`;
  } else {
    displayDate = new Date(date + 'T00:00:00').getFullYear().toString();
  }

  // Filter and build list of instances active in this period
  const instances = [];
  const periodDates = getDatesInPeriod(date, scale);

  for (const dStr of periodDates) {
    for (const p of params) {
      const entry = entryMap[`${p.id}__${dStr}`];
      const due = isDue(p, dStr, 'day');
      if (due || entry) {
        instances.push({
          param: p,
          date: dStr,
          entry,
          due,
        });
      }
    }
  }

  // Sort chronologically, then by name
  instances.sort((a, b) => a.date.localeCompare(b.date) || a.param.name.localeCompare(b.param.name));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl animate-slide-up flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span>{titleText}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {instances.length} {instances.length === 1 ? 'task' : 'tasks'}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{displayDate} · {DEPT_NAMES[dept] || dept}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {instances.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground flex flex-col items-center gap-2">
              <CalendarDays className="w-8 h-8 text-muted-foreground/30" />
              <p>No parameters scheduled or recorded for this period.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {instances.map(inst => {
                const param = inst.param;
                const entry = inst.entry;
                const due = inst.due;
                const dateStr = inst.date;
                const isFutureInstance = dateStr > today;
                const instanceLocked = isLockedForUser(dateStr);
                const oor = isOutOfRange(param, entry);
                const status = entry?.status;
                const requiresReview = param.requires_review === 1;
                const reviewResult = entry?.result ?? null;

                // Determine Status Dot Color & Text
                let dotColor = 'bg-muted-foreground/30';
                let statusText = 'Pending';

                if (!due && !entry) {
                  statusText = 'Not Scheduled';
                  dotColor = 'bg-muted-foreground/20';
                } else if (status === 'done' || status === 'late') {
                  if (oor) {
                    statusText = 'Out of Range';
                    dotColor = 'bg-orange-400';
                  } else if (requiresReview) {
                    if (reviewResult === 'pass') {
                      statusText = 'Pass';
                      dotColor = 'bg-emerald-400';
                    } else if (reviewResult === 'fail') {
                      statusText = 'Fail';
                      dotColor = 'bg-red-400';
                    } else {
                      statusText = 'Awaiting Review';
                      dotColor = 'bg-amber-400';
                    }
                  } else {
                    statusText = status === 'late' ? 'Done Late' : 'Completed';
                    dotColor = 'bg-emerald-400';
                  }
                } else if (status === 'missed' || (due && !entry && !isFutureInstance && dateStr < today)) {
                  statusText = 'Missed';
                  dotColor = 'bg-red-400';
                } else if (isFutureInstance) {
                  statusText = 'Future Task';
                  dotColor = 'bg-muted-foreground/30';
                } else {
                  statusText = 'Pending';
                  dotColor = 'bg-primary';
                }

                const isClickable = !isFutureInstance && (due || !!entry);

                return (
                  <div
                    key={`${param.id}__${dateStr}`}
                    onClick={() => isClickable && onRowClick(param, dateStr)}
                    className={cn(
                      "flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 transition-colors text-xs rounded-md",
                      isClickable ? "cursor-pointer" : "opacity-60 cursor-default"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
                      <span className="font-medium text-foreground truncate">{param.name}</span>
                      {scale !== 'day' && (
                        <span className="text-[10px] text-muted-foreground/60">
                          ({new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short'
                          })})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-muted-foreground/70">
                      <span>{statusText}</span>
                      {instanceLocked && <Lock className="w-2.5 h-2.5 text-muted-foreground/50" />}
                      {isClickable && <ArrowRight className="w-3 h-3 text-muted-foreground/30" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-end bg-muted/10 rounded-b-xl">
          <button onClick={onClose} className="h-7 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
