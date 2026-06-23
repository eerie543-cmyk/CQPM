// Shared scheduling helpers — used by the Matrix grid and the Today checklist
// so "what is due" is computed in exactly one place.

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Is `param` due on `dateStr`?  `scale` widens the check for coarser grid views.
export function isDue(param, dateStr, scale = 'day') {
  if (param.schedule_type === 'specific') {
    const dates = (param.specific_dates || '').split(',').filter(Boolean);
    if (scale === 'day') return dates.includes(dateStr);

    const start = new Date(dateStr + 'T00:00:00');
    const end   = new Date(start);
    if      (scale === 'week')    end.setDate(end.getDate() + 6);
    else if (scale === 'month')   { end.setMonth(end.getMonth() + 1);     end.setDate(0); }
    else if (scale === 'quarter') { end.setMonth(end.getMonth() + 3);     end.setDate(0); }
    else if (scale === 'year')    { end.setFullYear(end.getFullYear()+1); end.setDate(0); }
    return dates.some(d => {
      const dt = new Date(d + 'T00:00:00');
      return dt >= start && dt <= end;
    });
  }

  // Frequency-based
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  switch (param.frequency) {
    case 'daily':    return true;
    case 'weekly': {
      const days = (param.days_of_week || '1').split(',').map(Number);
      return days.includes(dow);
    }
    case 'biweekly': return dow === 1;
    case 'monthly':  return d.getDate() === (param.day_of_month || 1);
    case 'quarterly': {
      const m = d.getMonth();
      return d.getDate() === 1 && m % 3 === 0;
    }
    case 'yearly': return d.getDate() === 1 && d.getMonth() === 0;
    default: return false;
  }
}

// Every date in [fromStr, toStr] (inclusive) on which the param is due (day scale).
export function getDueDatesInRange(param, fromStr, toStr) {
  const out = [];
  const cursor = new Date(fromStr + 'T00:00:00');
  const end    = new Date(toStr + 'T00:00:00');
  while (cursor <= end) {
    const ds = cursor.toISOString().slice(0, 10);
    if (isDue(param, ds, 'day')) out.push(ds);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// True if a numeric entry's recorded value falls outside the param's allowed range.
export function isOutOfRange(param, entry) {
  if (!entry || param.entry_type !== 'numeric') return false;
  if (param.min_value == null && param.max_value == null) return false;
  const v = parseFloat(entry.value);
  if (Number.isNaN(v)) return false;
  if (param.min_value != null && v < param.min_value) return true;
  if (param.max_value != null && v > param.max_value) return true;
  return false;
}
