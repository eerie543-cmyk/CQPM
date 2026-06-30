import { useState } from 'react';
import { X, Plus, Loader2, ChevronLeft, ChevronRight, CalendarDays, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toLocalYMD } from '@/lib/schedule';
import { DEPT_LABEL as DEPT_NAMES } from '@/lib/depts';

const WEEK_DAYS = [
  { val: '1', label: 'Mon' }, { val: '2', label: 'Tue' },
  { val: '3', label: 'Wed' }, { val: '4', label: 'Thu' },
  { val: '5', label: 'Fri' }, { val: '6', label: 'Sat' },
  { val: '0', label: 'Sun' },
];

const DOW_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ── Inline calendar date picker ───────────────────────────────────────────────
function CalendarPicker({ selected, onChange }) {
  const todayStr = toLocalYMD(new Date());
  const [vy, setVy] = useState(() => new Date().getFullYear());
  const [vm, setVm] = useState(() => new Date().getMonth());

  function nav(dir) {
    let m = vm + dir, y = vy;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setVm(m); setVy(y);
  }

  function toggle(dateStr) {
    onChange(selected.includes(dateStr)
      ? selected.filter(d => d !== dateStr)
      : [...selected, dateStr].sort()
    );
  }

  const firstDow  = new Date(vy, vm, 1).getDay();   // 0=Sun
  const totalDays = new Date(vy, vm + 1, 0).getDate();
  const monthLabel = new Date(vy, vm, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Build grid cells: leading nulls + day strings
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => {
      const d = i + 1;
      return `${vy}-${String(vm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];

  return (
    <div className="rounded-lg border bg-muted/10 p-3 select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" onClick={() => nav(-1)}
          className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-semibold">{monthLabel}</span>
        <button type="button" onClick={() => nav(1)}
          className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_ABBR.map(d => (
          <div key={d} className="text-[9px] font-medium text-muted-foreground text-center py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const isSelected = selected.includes(dateStr);
          const isToday    = dateStr === todayStr;
          return (
            <button key={i} type="button" onClick={() => toggle(dateStr)}
              className={cn(
                'h-7 w-full text-[11px] rounded-full transition-colors font-medium',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'ring-1 ring-primary/60 text-primary hover:bg-primary/10'
                    : 'hover:bg-muted text-foreground'
              )}>
              {parseInt(dateStr.slice(-2))}
            </button>
          );
        })}
      </div>

      {/* Count */}
      <p className="mt-2 text-[10px] text-muted-foreground text-center">
        {selected.length} date{selected.length !== 1 ? 's' : ''} selected across all months
      </p>
    </div>
  );
}

// ── Selected date chips ───────────────────────────────────────────────────────
function DateChips({ dates, onRemove }) {
  if (dates.length === 0) return null;

  // Group by month
  const grouped = {};
  for (const d of dates) {
    const key = d.slice(0, 7); // YYYY-MM
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }

  return (
    <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
      {Object.entries(grouped).map(([month, days]) => (
        <div key={month}>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
            {new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
          <div className="flex flex-wrap gap-1">
            {days.map(d => (
              <span key={d}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                <button type="button" onClick={() => onRemove(d)}
                  className="hover:text-destructive transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ParamBuilderModal({ dept, existing, onSave, onClose, mode = 'admin' }) {
  const { token } = useAuth();
  const isEdit   = !!existing;
  const isStaff  = mode === 'staff';

  const [form, setForm] = useState({
    name:          existing?.name          ?? '',
    description:   existing?.description   ?? '',
    department:    existing?.department    ?? dept ?? 'serology',
    // Calendar-first: new parameters open on the date picker. The "+ Frequency"
    // button switches to a repeating pattern instead.
    scheduleType:  existing?.schedule_type ?? 'specific',
    // Frequency fields
    frequency:     existing?.frequency     ?? '',
    daysOfWeek:    existing?.days_of_week  ? existing.days_of_week.split(',') : [],
    dayOfMonth:    existing?.day_of_month  ?? 1,
    // Specific dates
    specificDates: existing?.specific_dates ? existing.specific_dates.split(',').filter(Boolean) : [],
    // Common
    entryType:     existing?.entry_type    ?? 'checkbox',
    unit:          existing?.unit          ?? '',
    minValue:      existing?.min_value     ?? '',
    maxValue:      existing?.max_value     ?? '',
    critical:        existing?.critical        === 1,
    requiresReview:  existing?.requires_review === 1,
    endDate:         existing?.end_date        ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleDay(val) {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(val)
        ? f.daysOfWeek.filter(d => d !== val)
        : [...f.daysOfWeek, val].sort(),
    }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) return setError('Parameter name is required.');

    if (form.scheduleType === 'frequency') {
      if (!form.frequency) return setError('Please select a frequency.');
      const needsDays = form.frequency === 'weekly' || form.frequency === 'biweekly';
      if (needsDays && form.daysOfWeek.length === 0)
        return setError('Select at least one day of the week.');
    } else {
      if (form.specificDates.length === 0)
        return setError('Select at least one specific date.');
    }

    if (form.entryType === 'numeric' && form.minValue !== '' && form.maxValue !== ''
        && Number(form.minValue) > Number(form.maxValue))
      return setError('Minimum value cannot be greater than maximum.');

    setLoading(true);
    setError('');
    try {
      const isFreq  = form.scheduleType === 'frequency';
      const needsDays = isFreq && (form.frequency === 'weekly' || form.frequency === 'biweekly');

      const isNumeric = form.entryType === 'numeric';
      const minVal = isNumeric && form.minValue !== '' ? Number(form.minValue) : null;
      const maxVal = isNumeric && form.maxValue !== '' ? Number(form.maxValue) : null;

      const isDailyFreq = isFreq && form.frequency === 'daily';
      const commonFields = {
        name:           form.name.trim(),
        description:    form.description.trim() || null,
        schedule_type:  form.scheduleType,
        frequency:      isFreq ? form.frequency : null,
        days_of_week:   needsDays ? form.daysOfWeek.join(',') : null,
        day_of_month:   (isFreq && form.frequency === 'monthly') ? Number(form.dayOfMonth) : null,
        specific_dates: !isFreq ? form.specificDates.join(',') : null,
        entry_type:     form.entryType,
        unit:           isNumeric ? form.unit.trim() || null : null,
        min_value:      minVal,
        max_value:      maxVal,
        critical:       form.critical ? 1 : 0,
        requires_review: form.requiresReview ? 1 : 0,
        end_date:       (isDailyFreq && form.endDate) ? form.endDate : null,
      };

      let res;
      if (isStaff) {
        // Staff: submit as a request pending admin approval
        res = await window.cqpm.paramreq.submit(token, {
          department:     form.department,
          name:           form.name.trim(),
          description:    form.description.trim() || null,
          scheduleType:   form.scheduleType,
          frequency:      isFreq ? form.frequency : null,
          daysOfWeek:     needsDays ? form.daysOfWeek.join(',') : null,
          dayOfMonth:     (isFreq && form.frequency === 'monthly') ? Number(form.dayOfMonth) : null,
          specificDates:  !isFreq ? form.specificDates.join(',') : null,
          entryType:      form.entryType,
          unit:           isNumeric ? form.unit.trim() || null : null,
          minValue:       minVal,
          maxValue:       maxVal,
          critical:       form.critical ? 1 : 0,
          requiresReview: form.requiresReview ? 1 : 0,
          sortOrder:      0,
        });
      } else if (isEdit) {
        res = await window.cqpm.params.update(token, existing.id, commonFields);
      } else {
        res = await window.cqpm.params.create(token, {
          ...commonFields,
          // map snake_case → camelCase for create handler
          scheduleType:   form.scheduleType,
          daysOfWeek:     needsDays ? form.daysOfWeek.join(',') : null,
          dayOfMonth:     (isFreq && form.frequency === 'monthly') ? Number(form.dayOfMonth) : null,
          specificDates:  !isFreq ? form.specificDates.join(',') : null,
          entryType:      form.entryType,
          minValue:       minVal,
          maxValue:       maxVal,
          requiresReview: form.requiresReview ? 1 : 0,
          endDate:        (isDailyFreq && form.endDate) ? form.endDate : null,
          department:     form.department,
        });
      }
      if (res?.error) return setError(res.error);
      onSave(isStaff ? 'requested' : 'saved');
    } finally {
      setLoading(false);
    }
  }

  const showFreqDays = form.scheduleType === 'frequency' &&
    (form.frequency === 'weekly' || form.frequency === 'biweekly');
  const showDayOfMonth = form.scheduleType === 'frequency' && form.frequency === 'monthly';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold">
              {isStaff ? 'Request New Parameter' : isEdit ? 'Edit Parameter' : 'New Parameter'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStaff
                ? `${DEPT_NAMES[dept ?? form.department]} · Your request will be sent to an admin for approval`
                : DEPT_NAMES[isEdit ? existing.department : form.department]}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">

          {/* Department — dropdown for admin create, locked badge for staff */}
          {!isEdit && (
            isStaff ? (
              <div className="flex items-center gap-2 p-2.5 rounded-md border bg-muted/30">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Department</span>
                <span className="text-xs font-medium text-foreground">{DEPT_NAMES[dept ?? form.department]}</span>
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full border bg-muted text-muted-foreground">Locked to your dept</span>
              </div>
            ) : (
              <Field label="Department">
                <select value={form.department} onChange={e => set('department', e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full">
                  <option value="serology">Serology</option>
                  <option value="molecularBio">Molecular Biology</option>
                  <option value="microbiology">Microbiology</option>
                </select>
              </Field>
            )
          )}

          {/* Name */}
          <Field label="Parameter Name *">
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Daily QC Run" autoFocus
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full" />
          </Field>

          {/* Description */}
          <Field label="Description">
            <input type="text" value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Brief description of the task"
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full" />
          </Field>

          {/* ── Schedule type toggle (calendar first, frequency via +) ── */}
          <Field label="When is it due?">
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => set('scheduleType', 'specific')}
                className={cn(
                  'flex items-center gap-2 h-10 px-3 rounded-lg border text-xs font-medium transition-colors',
                  form.scheduleType === 'specific'
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'hover:bg-muted text-muted-foreground border-border'
                )}>
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Pick Dates</div>
                  <div className="text-[9px] opacity-70">Choose days on a calendar</div>
                </div>
              </button>
              <button type="button"
                onClick={() => set('scheduleType', 'frequency')}
                className={cn(
                  'flex items-center gap-2 h-10 px-3 rounded-lg border text-xs font-medium transition-colors',
                  form.scheduleType === 'frequency'
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'hover:bg-muted text-muted-foreground border-border'
                )}>
                <span className="relative flex-shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <Plus className="w-2 h-2 absolute -top-1 -right-1" />
                </span>
                <div className="text-left">
                  <div className="font-semibold">+ Frequency</div>
                  <div className="text-[9px] opacity-70">Repeats on a pattern</div>
                </div>
              </button>
            </div>
          </Field>

          {/* ── FREQUENCY section ── */}
          {form.scheduleType === 'frequency' && (
            <>
              <Field label="Frequency">
                <select value={form.frequency} onChange={e => set('frequency', e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full">
                  <option value="" disabled>Select frequency…</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly (every 2 weeks)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </Field>

              {form.frequency === 'daily' && (
                <Field label="Repeats until (optional)">
                  <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                    className="h-9 w-44 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground">
                    Leave blank to repeat indefinitely.
                  </p>
                </Field>
              )}

              {showFreqDays && (
                <Field label="Days of Week">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEK_DAYS.map(d => (
                      <button key={d.val} type="button" onClick={() => toggleDay(d.val)}
                        className={cn(
                          'h-8 w-10 text-xs rounded-md border font-medium transition-colors',
                          form.daysOfWeek.includes(d.val)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'hover:bg-muted text-muted-foreground'
                        )}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {showDayOfMonth && (
                <Field label="Day of Month (1–28)">
                  <input type="number" min={1} max={28}
                    value={form.dayOfMonth} onChange={e => set('dayOfMonth', e.target.value)}
                    className="h-9 w-20 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </Field>
              )}
            </>
          )}

          {/* ── SPECIFIC DATES section ── */}
          {form.scheduleType === 'specific' && (
            <>
              <Field label="Pick Dates on Calendar">
                <CalendarPicker
                  selected={form.specificDates}
                  onChange={v => set('specificDates', v)}
                />
              </Field>

              {form.specificDates.length > 0 && (
                <Field label={`Selected Dates (${form.specificDates.length})`}>
                  <DateChips
                    dates={form.specificDates}
                    onRemove={d => set('specificDates', form.specificDates.filter(x => x !== d))}
                  />
                </Field>
              )}
            </>
          )}

          {/* ── Entry type ── */}
          <Field label="Entry Type">
            <div className="flex gap-2">
              {[['checkbox', 'Checkbox ☑'], ['numeric', 'Numeric #'], ['text', 'Text Aa']].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set('entryType', val)}
                  className={cn(
                    'h-8 px-3 text-xs rounded-md border font-medium transition-colors',
                    form.entryType === val
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted text-muted-foreground'
                  )}>
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          {form.entryType === 'numeric' && (
            <>
              <Field label="Unit (optional)">
                <input type="text" value={form.unit} onChange={e => set('unit', e.target.value)}
                  placeholder="e.g. °C, mg/dL, CFU/mL"
                  className="h-9 w-36 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </Field>

              <Field label="Acceptable Range (optional)">
                <div className="flex items-center gap-2">
                  <input type="number" step="0.1" value={form.minValue}
                    onChange={e => set('minValue', e.target.value)} placeholder="Min"
                    className="h-9 w-24 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input type="number" step="0.1" value={form.maxValue}
                    onChange={e => set('maxValue', e.target.value)} placeholder="Max"
                    className="h-9 w-24 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  {form.unit && <span className="text-xs text-muted-foreground">{form.unit}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Readings outside this range are flagged and require a reason. Leave blank for no limit.
                </p>
              </Field>
            </>
          )}

          {/* Critical toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div>
              <p className="text-xs font-medium">Critical Parameter</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Weighted 2× in scoring · flagged red in matrix
              </p>
            </div>
            <button type="button" onClick={() => set('critical', !form.critical)}
              className={cn(
                'w-11 h-6 rounded-full border-2 transition-all relative flex-shrink-0',
                form.critical ? 'bg-red-500 border-red-500' : 'border-border bg-muted'
              )}>
              <span className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                form.critical ? 'left-[calc(100%-18px)]' : 'left-0.5'
              )} />
            </button>
          </div>

          {/* Requires review toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div>
              <p className="text-xs font-medium">Requires Result Review</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Admin must judge Pass/Fail before this check earns compliance credit
              </p>
            </div>
            <button type="button" onClick={() => set('requiresReview', !form.requiresReview)}
              className={cn(
                'w-11 h-6 rounded-full border-2 transition-all relative flex-shrink-0',
                form.requiresReview ? 'bg-amber-500 border-amber-500' : 'border-border bg-muted'
              )}>
              <span className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                form.requiresReview ? 'left-[calc(100%-18px)]' : 'left-0.5'
              )} />
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5 flex-shrink-0">
          <button onClick={onClose}
            className="h-8 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className={cn(
              'h-8 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium',
              'flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            )}>
            {loading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> {isStaff ? 'Submitting…' : 'Saving…'}</>
              : isStaff ? 'Submit Request'
              : isEdit  ? 'Update'
              : 'Create Parameter'}
          </button>
        </div>
      </div>
    </div>
  );
}
