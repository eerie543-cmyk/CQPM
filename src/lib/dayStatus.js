// Rolls up a single day's many parameters into ONE verdict for the calendar grid.
// Severity order (worst wins): problem > pending > review > late > done > future > none.
import { isDue, isOutOfRange } from './schedule';

// Per-kind presentation — a colored ring + a symbol inside it.
export const DAY_KIND = {
  problem: { symbol: '✗', ring: 'border-red-500/70 text-red-400',           tint: 'bg-red-500/5'     },
  pending: { symbol: '◇', ring: 'border-amber-400/60 text-amber-300',        tint: 'bg-amber-500/5'   },
  review:  { symbol: '◷', ring: 'border-amber-500/70 text-amber-400',        tint: 'bg-amber-500/5'   },
  late:    { symbol: '≈', ring: 'border-amber-500/70 text-amber-400',        tint: 'bg-amber-500/5'   },
  done:    { symbol: '✓', ring: 'border-emerald-500/70 text-emerald-400',    tint: 'bg-emerald-500/5' },
  future:  { symbol: '·', ring: 'border-border text-muted-foreground/40',    tint: ''                 },
  none:    { symbol: '',  ring: '',                                          tint: ''                 },
};

const SEVERITY = ['problem', 'pending', 'review', 'late', 'done', 'future'];

// Classify ONE parameter instance on a given day.
function paramKind(param, entry, dateStr, today) {
  const oor = isOutOfRange(param, entry);
  const status = entry?.status;

  if (status === 'done' || status === 'late') {
    if (oor) return 'problem';
    if (param.requires_review === 1) {
      if (entry.result === 'pass') return status === 'late' ? 'late' : 'done';
      if (entry.result === 'fail') return 'problem';
      return 'review';
    }
    return status === 'late' ? 'late' : 'done';
  }
  if (status === 'missed') return 'problem';

  // No usable entry
  if (dateStr < today)  return 'problem'; // past + nothing recorded = missed
  if (dateStr === today) return 'pending';
  return 'future';
}

/**
 * @returns { kind, symbol, ring, tint, counts:{done,late,review,pending,problem,future,total} }
 *          kind 'none' when nothing is scheduled that day.
 */
export function getDayStatus(params, entryMap, dateStr, today) {
  const counts = { done: 0, late: 0, review: 0, pending: 0, problem: 0, future: 0, total: 0 };
  const names = [];

  for (const p of params) {
    const entry = entryMap[`${p.id}__${dateStr}`];
    if (!isDue(p, dateStr, 'day') && !entry) continue;
    const kind = paramKind(p, entry, dateStr, today);
    counts[kind]++;
    counts.total++;
    names.push(p.name);
  }

  if (counts.total === 0) return { kind: 'none', ...DAY_KIND.none, counts, names, hasMixed: false };

  const kind = SEVERITY.find(k => counts[k] > 0) || 'done';
  const hasGood  = counts.done + counts.late > 0;
  const hasMixed = hasGood && counts.problem > 0;
  return { kind, ...DAY_KIND[kind], counts, names, hasMixed };
}
