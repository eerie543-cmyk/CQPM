// Shared scheduling helpers — used by the Matrix grid and the Today checklist
// so "what is due" is computed in exactly one place.

export function toLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
}

export function todayStr() {
  return toLocalYMD(new Date());
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalYMD(d);
}

// First/last date of the 6×7 (Monday-first) grid for the month containing `anchorYMD`.
export function monthGridRange(anchorYMD) {
  const first = new Date(anchorYMD + 'T00:00:00');
  first.setDate(1);
  const offset = (first.getDay() + 6) % 7; // days back to Monday
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 41);
  return [toLocalYMD(start), toLocalYMD(end)];
}

// First day of the month containing `dateStr`.
export function monthFirst(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(1);
  return toLocalYMD(d);
}

// Is `param` due on `dateStr`?  `scale` widens the check for coarser grid views.
export function isDue(param, dateStr, scale = 'day') {
  if (scale === 'day') {
    return isDueDay(param, dateStr);
  }

  const start = new Date(dateStr + 'T00:00:00');
  const end   = new Date(start);
  if      (scale === 'week')    end.setDate(end.getDate() + 6);
  else if (scale === 'month')   { end.setMonth(end.getMonth() + 1);     end.setDate(0); }
  else if (scale === 'quarter') { end.setMonth(end.getMonth() + 3);     end.setDate(0); }
  else if (scale === 'year')    { end.setFullYear(end.getFullYear()+1); end.setDate(0); }

  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = toLocalYMD(cursor);
    if (isDueDay(param, ds)) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

function isDueDay(param, dateStr) {
  if (param.start_date && dateStr < param.start_date) return false;
  if (param.end_date   && dateStr > param.end_date)   return false;

  if (param.schedule_type === 'specific') {
    const dates = (param.specific_dates || '').split(',').filter(Boolean);
    return dates.includes(dateStr);
  }

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
    const ds = toLocalYMD(cursor);
    if (isDue(param, ds, 'day')) out.push(ds);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// Start date for a named relative range (used by ExportModal and ExportDefaults in Settings).
export function computeFromDate(range) {
  const d = new Date();
  if (range === 'last_7')  { d.setDate(d.getDate() - 6);  return toLocalYMD(d); }
  if (range === 'last_30') { d.setDate(d.getDate() - 29); return toLocalYMD(d); }
  if (range === 'last_90') { d.setDate(d.getDate() - 89); return toLocalYMD(d); }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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
