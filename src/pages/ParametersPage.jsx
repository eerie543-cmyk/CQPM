import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, FlaskConical,
  RefreshCw, CalendarDays, AlertTriangle, Hash, Type, CheckSquare, Search, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import ParamBuilderModal from '@/components/ParamBuilderModal';

const DEPTS = [
  { id: 'serology',     label: 'Serology',         symbol: '⊕' },
  { id: 'molecularBio', label: 'Molecular Biology', symbol: '⌬' },
  { id: 'microbiology', label: 'Microbiology',      symbol: '⊙' },
];

const FREQ_LABELS = {
  daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly',
  monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

// 0=Sun 1=Mon … 6=Sat — display order Mon→Sun
const DOW_DISPLAY = [
  { val: 1, short: 'M' }, { val: 2, short: 'T' }, { val: 3, short: 'W' },
  { val: 4, short: 'T' }, { val: 5, short: 'F' }, { val: 6, short: 'S' },
  { val: 0, short: 'S' },
];

// ── Schedule visualiser ────────────────────────────────────────────────────────
function ScheduleViz({ param }) {
  if (param.schedule_type === 'specific') {
    const dates  = (param.specific_dates || '').split(',').filter(Boolean);
    const months = [...new Set(dates.map(d => d.slice(0, 7)))];
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <CalendarDays className="w-3 h-3" />
          <span>{dates.length} date{dates.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {months.slice(0, 4).map(m => (
            <span key={m}
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
              {new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
            </span>
          ))}
          {months.length > 4 && (
            <span className="text-[9px] text-muted-foreground">+{months.length - 4} more</span>
          )}
        </div>
      </div>
    );
  }

  if (param.frequency === 'daily') {
    return (
      <div className="flex items-center gap-0.5">
        {DOW_DISPLAY.map(({ val, short }) => (
          <span key={val}
            className="w-5 h-5 text-[9px] rounded flex items-center justify-center font-bold bg-primary/15 text-primary">
            {short}
          </span>
        ))}
      </div>
    );
  }

  if (param.frequency === 'weekly' || param.frequency === 'biweekly') {
    const active = (param.days_of_week || '').split(',').map(Number);
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-0.5">
          {DOW_DISPLAY.map(({ val, short }) => (
            <span key={val}
              className={cn(
                'w-5 h-5 text-[9px] rounded flex items-center justify-center font-bold transition-colors',
                active.includes(val)
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted/40 text-muted-foreground/30'
              )}>
              {short}
            </span>
          ))}
        </div>
        {param.frequency === 'biweekly' && (
          <p className="text-[9px] text-muted-foreground">Every 2 weeks</p>
        )}
      </div>
    );
  }

  if (param.frequency === 'monthly') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-8 h-8 rounded-lg border-2 border-primary/30 bg-primary/5 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">{param.day_of_month || 1}</span>
        </div>
        <span className="text-[10px] text-muted-foreground leading-tight">
          of every<br />month
        </span>
      </div>
    );
  }

  if (param.frequency === 'quarterly') {
    return (
      <div className="flex items-center gap-1">
        {['Q1','Q2','Q3','Q4'].map(q => (
          <span key={q}
            className="text-[9px] px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/20 font-semibold">
            {q}
          </span>
        ))}
      </div>
    );
  }

  if (param.frequency === 'yearly') {
    return <span className="text-[10px] text-muted-foreground">Once a year (Jan 1)</span>;
  }

  return <span className="text-[10px] text-muted-foreground capitalize">{param.frequency}</span>;
}

// ── Entry type indicator ───────────────────────────────────────────────────────
function TypeBadge({ param }) {
  const map = {
    checkbox: { Icon: CheckSquare, label: 'Checkbox' },
    numeric:  { Icon: Hash,        label: param.unit ? `Numeric · ${param.unit}` : 'Numeric' },
    text:     { Icon: Type,        label: 'Text' },
  };
  const { Icon, label } = map[param.entry_type] ?? map.checkbox;
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </div>
  );
}

// ── Numeric range badge ───────────────────────────────────────────────────────
function RangeBadge({ param }) {
  if (param.entry_type !== 'numeric') return null;
  if (param.min_value == null && param.max_value == null) return null;
  const label =
    param.min_value != null && param.max_value != null ? `${param.min_value}–${param.max_value}`
    : param.min_value != null ? `≥ ${param.min_value}`
    : `≤ ${param.max_value}`;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground"
      title="Acceptable range — readings outside are flagged">
      <Hash className="w-2.5 h-2.5" />
      {label}{param.unit ? ` ${param.unit}` : ''}
    </span>
  );
}

// ── Single parameter row (stacked vertically) ─────────────────────────────────
function ParamRow({ param, isAdmin, onEdit, onDelete }) {
  return (
    <div className={cn(
      'group flex items-center gap-4 rounded-lg border bg-card px-4 py-3',
      'hover:border-border/80 hover:bg-muted/20 transition-colors',
      param.critical ? 'border-l-2 border-l-red-400' : 'border-l-2 border-l-transparent'
    )}>
      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {param.critical === 1 && (
            <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
          )}
          <p className="text-sm font-semibold leading-tight truncate">{param.name}</p>
          {param.critical === 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20 font-semibold tracking-wide">
              CRITICAL
            </span>
          )}
        </div>
        {param.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{param.description}</p>
        )}
      </div>

      {/* Schedule */}
      <div className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {param.schedule_type === 'specific' ? 'Scheduled On' : 'Repeats'}
        </p>
        <ScheduleViz param={param} />
      </div>

      {/* Type + range */}
      <div className="hidden sm:flex flex-col items-start gap-1 w-40 flex-shrink-0">
        <TypeBadge param={param} />
        <RangeBadge param={param} />
      </div>

      {/* Admin actions — always visible, brighten on hover */}
      {isAdmin && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => onEdit(param)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground"
            title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(param)}
            className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground/60 hover:text-destructive"
            title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParametersPage({ dept }) {
  const { token, isAdmin } = useAuth();
  const toast = useToast();
  const [params,  setParams]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | { dept } | param-object
  const [staffModal, setStaffModal] = useState(false);
  const [query,   setQuery]   = useState('');
  const [critOnly, setCritOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = isAdmin
        ? await window.cqpm.params.all(token)
        : await window.cqpm.params.list(token, dept);
      setParams(res.params ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, dept]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(param) {
    if (!window.confirm(`Remove "${param.name}"?\n\nThis hides it from the matrix — existing entries are kept.`)) return;
    await window.cqpm.params.remove(token, param.id);
    load();
  }

  // Only the department selected in the sidebar is shown.
  const deptMeta   = DEPTS.find(d => d.id === dept) ?? DEPTS[0];
  const deptParams = params.filter(p => p.department === dept);

  const totalParams   = deptParams.length;
  const critCount     = deptParams.filter(p => p.critical).length;
  const freqCount     = deptParams.filter(p => p.schedule_type !== 'specific').length;
  const specificCount = deptParams.filter(p => p.schedule_type === 'specific').length;

  const q = query.trim().toLowerCase();
  const shown = deptParams.filter(p =>
    (!critOnly || p.critical) &&
    (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
  );

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur flex-shrink-0 gap-4">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <span className="font-mono text-[13px] leading-none text-muted-foreground">{deptMeta.symbol}</span>
            {deptMeta.label}
            <span className="text-muted-foreground font-normal">· Parameters</span>
          </h1>
          {!loading && (
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[11px] text-muted-foreground">{totalParams} total</span>
              {critCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red-400">
                  <AlertTriangle className="w-3 h-3" />{critCount} critical
                </span>
              )}
              {freqCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <RefreshCw className="w-3 h-3" />{freqCount} repeating
                </span>
              )}
              {specificCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarDays className="w-3 h-3" />{specificCount} calendar
                </span>
              )}
            </div>
          )}
        </div>
        {isAdmin ? (
          <button onClick={() => setModal({ dept })}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-border/40 bg-background/30 text-muted-foreground/70 backdrop-blur hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
            Add Parameter
          </button>
        ) : (
          <button onClick={() => setStaffModal(true)}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-border/40 bg-background/30 text-muted-foreground/70 backdrop-blur hover:border-amber-400/40 hover:bg-amber-500/5 hover:text-amber-400 transition-all flex-shrink-0">
            <Send className="w-3.5 h-3.5" />
            Request Parameter
          </button>
        )}
      </div>

      {/* Body — clean stacked list for the selected department only */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            {deptParams.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground border border-dashed rounded-xl">
                <FlaskConical className="w-7 h-7 opacity-25" />
                <p className="text-sm">No parameters yet for {deptMeta.label}.</p>
                {isAdmin && (
                  <button onClick={() => setModal({ dept })}
                    className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-md border hover:bg-muted transition-colors mt-1">
                    <Plus className="w-3 h-3" /> Add first parameter
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Search + filter */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                      placeholder="Search parameters…"
                      className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <button onClick={() => setCritOnly(v => !v)}
                    className={cn(
                      'h-8 px-2.5 text-[11px] rounded-md border font-medium flex items-center gap-1 transition-colors flex-shrink-0',
                      critOnly ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'text-muted-foreground hover:bg-muted'
                    )}>
                    <AlertTriangle className="w-3 h-3" /> Critical only
                  </button>
                </div>

                {shown.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-10">No parameters match your filter.</p>
                ) : (
                  shown.map(p => (
                    <ParamRow key={p.id} param={p} isAdmin={isAdmin}
                      onEdit={() => setModal(p)} onDelete={handleDelete} />
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ParamBuilderModal
          dept={modal.dept ?? modal.department}
          existing={modal.dept ? null : modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}

      {staffModal && (
        <ParamBuilderModal
          dept={dept}
          mode="staff"
          onSave={(outcome) => {
            setStaffModal(false);
            if (outcome === 'requested')
              toast('Request submitted — awaiting admin approval.', 'success');
          }}
          onClose={() => setStaffModal(false)}
        />
      )}
    </div>
  );
}
