import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, FlaskConical, ChevronDown, ChevronRight,
  RefreshCw, CalendarDays, AlertTriangle, Hash, Type, CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import ParamBuilderModal from '@/components/ParamBuilderModal';

const DEPTS = [
  { id: 'serology',     label: 'Serology',         color: 'bg-red-500',    accent: 'text-red-400',    border: 'border-red-500/25',    headerBg: 'bg-red-500/8'    },
  { id: 'molecularBio', label: 'Molecular Biology', color: 'bg-sky-500',    accent: 'text-sky-400',    border: 'border-sky-500/25',    headerBg: 'bg-sky-500/8'    },
  { id: 'microbiology', label: 'Microbiology',      color: 'bg-yellow-500', accent: 'text-yellow-400', border: 'border-yellow-500/25', headerBg: 'bg-yellow-500/8' },
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

// ── Single parameter card ─────────────────────────────────────────────────────
function ParamCard({ param, isAdmin, onEdit, onDelete }) {
  return (
    <div className={cn(
      'relative rounded-xl border bg-card flex flex-col gap-3 p-4 group',
      'hover:border-border/80 hover:shadow-sm transition-all',
      param.critical ? 'border-l-2 border-l-red-400' : ''
    )}>
      {/* Admin actions */}
      {isAdmin && (
        <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(param)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Edit">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(param)}
            className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            title="Remove">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-start gap-1.5 pr-12">
          {param.critical === 1 && (
            <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm font-semibold leading-snug">{param.name}</p>
        </div>
        {param.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{param.description}</p>
        )}
      </div>

      {/* Schedule viz */}
      <div className="flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
          {param.schedule_type === 'specific' ? 'Scheduled On' : 'Repeats'}
        </p>
        <ScheduleViz param={param} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <TypeBadge param={param} />
        {param.critical === 1 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20 font-semibold tracking-wide">
            CRITICAL
          </span>
        )}
      </div>
    </div>
  );
}

// ── Department section ────────────────────────────────────────────────────────
function DeptSection({ dept, params, isAdmin, onAdd, onEdit, onDelete }) {
  const [open, setOpen] = useState(true);
  const critCount = params.filter(p => p.critical).length;

  return (
    <div className={cn('rounded-xl border overflow-hidden', dept.border)}>
      {/* Section header */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20',
          dept.headerBg
        )}>
        <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', dept.color)} />
        <span className={cn('text-xs font-bold uppercase tracking-wider', dept.accent)}>
          {dept.label}
        </span>
        <span className="text-[10px] text-muted-foreground ml-1">
          {params.length} param{params.length !== 1 ? 's' : ''}
          {critCount > 0 && ` · ${critCount} critical`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <span
              onClick={e => { e.stopPropagation(); onAdd(dept.id); }}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-md border font-medium transition-colors cursor-pointer',
                'hover:bg-primary/10 hover:text-primary hover:border-primary/30',
                'text-muted-foreground border-border/60'
              )}>
              + Add
            </span>
          )}
          {open
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Cards grid */}
      {open && (
        <div className="p-4">
          {params.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground border border-dashed rounded-lg">
              <FlaskConical className="w-6 h-6 opacity-25" />
              <p className="text-xs">No parameters yet for {dept.label}.</p>
              {isAdmin && (
                <button onClick={() => onAdd(dept.id)}
                  className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-md border hover:bg-muted transition-colors mt-1">
                  <Plus className="w-3 h-3" /> Add first
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {params.map(p => (
                <ParamCard key={p.id} param={p} isAdmin={isAdmin}
                  onEdit={onEdit} onDelete={onDelete} />
              ))}
              {/* Add card (admin only) */}
              {isAdmin && (
                <button onClick={() => onAdd(dept.id)}
                  className={cn(
                    'rounded-xl border-2 border-dashed border-border/40 min-h-[120px]',
                    'flex flex-col items-center justify-center gap-2 text-muted-foreground',
                    'hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all group'
                  )}>
                  <Plus className="w-5 h-5 transition-transform group-hover:scale-110" />
                  <span className="text-xs font-medium">New Parameter</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParametersPage({ dept }) {
  const { token, isAdmin } = useAuth();
  const [params,  setParams]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | { dept } | param-object

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

  // Visible depts: admin sees all, staff sees only theirs
  const visibleDepts = isAdmin ? DEPTS : DEPTS.filter(d => d.id === dept);

  const totalParams   = params.length;
  const critCount     = params.filter(p => p.critical).length;
  const freqCount     = params.filter(p => p.schedule_type !== 'specific').length;
  const specificCount = params.filter(p => p.schedule_type === 'specific').length;

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur flex-shrink-0 gap-4">
        <div>
          <h1 className="text-base font-semibold">Parameter Configuration</h1>
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
        {isAdmin && (
          <button onClick={() => setModal({ dept: 'serology' })}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
            Add Parameter
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
        ) : (
          visibleDepts.map(d => (
            <DeptSection
              key={d.id}
              dept={d}
              params={params.filter(p => p.department === d.id)}
              isAdmin={isAdmin}
              onAdd={deptId => setModal({ dept: deptId })}
              onEdit={p => setModal(p)}
              onDelete={handleDelete}
            />
          ))
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
    </div>
  );
}
