import { X, CalendarDays, RefreshCw, CheckCircle2, XCircle, AlertTriangle, AlertCircle, Circle, Lock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDue, isOutOfRange, todayStr } from '@/lib/schedule';

const DEPT_NAMES = {
  serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology',
};

const FREQ_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly'
};

export default function DayDetailPanel({ date, scale, dept, params, entryMap, isAdmin, isLockedForUser, onRowClick, onClose }) {
  const today = todayStr();
  const isFuture = date > today;
  const isLocked = isLockedForUser(date);

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Filter parameters due or with an existing entry on this date
  const relevantParams = params.filter(p => isDue(p, date, scale) || !!entryMap[`${p.id}__${date}`]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl animate-slide-up flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Day Details
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{displayDate} · {DEPT_NAMES[dept] || dept}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lock Info */}
        {isLocked && (
          <div className="mx-5 mt-4 flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              This date is locked. Admins can open or edit but staff can only view recorded values.
            </p>
          </div>
        )}

        {/* Body / List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {relevantParams.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground flex flex-col items-center gap-2">
              <CalendarDays className="w-8 h-8 text-muted-foreground/30" />
              <p>No parameters scheduled or recorded for this date.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {relevantParams.map(param => {
                const entry = entryMap[`${param.id}__${date}`];
                const due = isDue(param, date, scale);
                const oor = isOutOfRange(param, entry);
                const status = entry?.status;
                const requiresReview = param.requires_review === 1;
                const reviewResult = entry?.result ?? null;

                // Determine Status Indicator
                let statusIcon = null;
                let statusText = 'Pending';
                let statusColor = 'text-muted-foreground/40 bg-muted/20 border-border/50';

                if (!due && !entry) {
                  statusText = 'Not Scheduled';
                  statusColor = 'text-muted-foreground/30 bg-muted/10 border-transparent';
                } else if (status === 'done' || status === 'late') {
                  if (oor) {
                    statusIcon = <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />;
                    statusText = 'Out of Range';
                    statusColor = 'text-orange-400 bg-orange-500/5 border-orange-500/20';
                  } else if (requiresReview) {
                    if (reviewResult === 'pass') {
                      statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                      statusText = 'Review: Pass';
                      statusColor = 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20';
                    } else if (reviewResult === 'fail') {
                      statusIcon = <XCircle className="w-3.5 h-3.5 text-red-400" />;
                      statusText = 'Review: Fail';
                      statusColor = 'text-red-400 bg-red-500/5 border-red-500/20';
                    } else {
                      statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-amber-300/70" />;
                      statusText = 'Awaiting Review';
                      statusColor = 'text-amber-300 bg-amber-500/5 border-amber-500/20';
                    }
                  } else {
                    statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                    statusText = status === 'late' ? 'Done Late' : 'Completed';
                    statusColor = 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20';
                  }
                } else if (status === 'missed' || (due && !entry && !isFuture && date < today)) {
                  statusIcon = <AlertCircle className="w-3.5 h-3.5 text-red-400/80" />;
                  statusText = 'Missed';
                  statusColor = 'text-red-400 bg-red-500/5 border-red-500/20';
                } else if (isFuture) {
                  statusIcon = <Circle className="w-3.5 h-3.5 text-muted-foreground/30" />;
                  statusText = 'Future Task';
                  statusColor = 'text-muted-foreground/50 bg-muted/10 border-border/30';
                } else {
                  statusIcon = <Circle className="w-3.5 h-3.5 text-primary/80" />;
                  statusText = 'Pending';
                  statusColor = 'text-primary bg-primary/5 border-primary/20';
                }

                const isClickable = !isFuture && (due || !!entry);

                return (
                  <div
                    key={param.id}
                    onClick={() => isClickable && onRowClick(param)}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border text-xs transition-all",
                      isClickable 
                        ? "cursor-pointer hover:bg-muted/50 border-border/80 hover:border-primary/40 active:scale-[0.99]" 
                        : "border-border/40 opacity-75"
                    )}
                  >
                    <div className="flex flex-col gap-1 pr-4 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {param.critical === 1 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Critical" />
                        )}
                        <span className="font-semibold text-foreground truncate">{param.name}</span>
                      </div>
                      
                      {/* Schedule type/frequency label */}
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {param.schedule_type === 'specific' ? (
                          <>
                            <CalendarDays className="w-3 h-3 text-muted-foreground/60" />
                            Specific Dates
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 text-muted-foreground/60" />
                            {FREQ_LABELS[param.frequency] || param.frequency}
                          </>
                        )}
                      </div>

                      {/* Display value / done by if exists */}
                      {entry && (entry.value !== null && entry.value !== undefined && entry.value !== '') && (
                        <div className="mt-1 text-[11px] text-foreground font-mono bg-muted/40 px-2 py-0.5 rounded border max-w-max">
                          Value: {entry.value}{param.unit ? ` ${param.unit}` : ''}
                        </div>
                      )}
                      {entry?.done_by_name && (
                        <div className="text-[9px] text-muted-foreground italic">
                          Logged by: {entry.done_by_name}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1",
                        statusColor
                      )}>
                        {statusIcon}
                        {statusText}
                      </span>
                      {isClickable && (
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end bg-muted/10 rounded-b-xl">
          <button onClick={onClose} className="h-8 px-4 text-xs rounded-md border hover:bg-muted transition-colors">
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
