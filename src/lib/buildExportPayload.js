import { getDueDatesInRange, isOutOfRange } from './schedule';

const FREQ_LABEL = {
  daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly',
  monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};
const TYPE_LABEL = { checkbox: 'Checkbox', numeric: 'Numeric', text: 'Text' };

function scheduleLabel(p) {
  if (p.schedule_type === 'specific') {
    const n = (p.specific_dates || '').split(',').filter(Boolean).length;
    return `Specific (${n} date${n !== 1 ? 's' : ''})`;
  }
  return FREQ_LABEL[p.frequency] || p.frequency || '—';
}

/**
 * Builds flat compliance rows for one department over [from, to].
 * One row per scheduled slot (parameter × due-date). A past slot with no entry
 * is reported as "Not done"; a today/future slot with no entry is "Pending".
 *
 * Mirrors the WES buildExcelPayload approach: pure data, no styling.
 */
export function buildDeptRows(deptId, params, entries, from, to, today) {
  const eMap = {};
  for (const e of entries) eMap[`${e.parameter_id}__${e.slot_date}`] = e;

  const rows = [];
  for (const p of params) {
    for (const date of getDueDatesInRange(p, from, to)) {
      const e   = eMap[`${p.id}__${date}`];
      const oor = isOutOfRange(p, e);

      let statusRaw;
      if (e)                   statusRaw = e.status;            // done | late | missed
      else if (date < today)   statusRaw = 'notdone';
      else                     statusRaw = 'pending';

      // Weighted compliance (same rule as the matrix): critical = 2×,
      // done = full, late = 0.7×, out-of-range earns nothing.
      // requires_review params: only result='pass' earns credit.
      const weight = p.critical === 1 ? 2 : 1;
      let earned = 0;
      if (!oor) {
        if (p.requires_review === 1) {
          if (e?.result === 'pass') {
            if      (statusRaw === 'done') earned = weight;
            else if (statusRaw === 'late') earned = weight * 0.7;
          }
        } else {
          if      (statusRaw === 'done') earned = weight;
          else if (statusRaw === 'late') earned = weight * 0.7;
        }
      }

      const reviewStatus = p.requires_review === 1
        ? (e?.result ?? (e ? 'pending' : null))
        : null;

      rows.push({
        date,
        department:    deptId,
        parameter:     p.name,
        critical:      p.critical === 1 ? 1 : 0,
        requiresReview: p.requires_review === 1 ? 1 : 0,
        schedule:      scheduleLabel(p),
        entryType:     TYPE_LABEL[p.entry_type] || p.entry_type || '',
        statusRaw,
        reviewStatus,
        reviewedBy:    e?.reviewed_by_name || '',
        reviewNote:    e?.review_note || '',
        value:         e?.value ?? '',
        unit:          p.unit || '',
        minValue:      p.min_value ?? null,
        maxValue:      p.max_value ?? null,
        oor,
        recordedBy:    e?.done_by_name || '',
        recordedAt:    e?.created_at   || '',
        reason:        e?.notes || '',
        weight,
        earned,
      });
    }
  }
  return rows;
}
