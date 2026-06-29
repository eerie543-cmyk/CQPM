// Styled .xlsx compliance report for CQPM — mirrors the structured WES export
// (frozen, colour-coded data sheet + a Summary sheet). Pure formatting; the
// renderer supplies the flat rows.

const DEPT_LABEL = {
  serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology',
};
const STATUS_LABEL = {
  done: 'Done', late: 'Late', missed: 'Missed', notdone: 'Not done', pending: 'Pending',
};
const REVIEW_LABEL = { pass: 'Pass', fail: 'Fail', pending: 'Pending', null: '—' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day} ${MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
}
function fmtDateTime(raw) {
  if (!raw) return '';
  try {
    const dt = new Date(raw.replace(' ', 'T') + 'Z');
    return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return raw; }
}
function rangeText(r) {
  if (r.minValue != null && r.maxValue != null) return `${r.minValue}–${r.maxValue}${r.unit ? ' ' + r.unit : ''}`;
  if (r.minValue != null) return `≥ ${r.minValue}${r.unit ? ' ' + r.unit : ''}`;
  if (r.maxValue != null) return `≤ ${r.maxValue}${r.unit ? ' ' + r.unit : ''}`;
  return '';
}

// U1: Prevent formula injection — prefix cells that begin with formula characters.
// Applies to string cells only; numbers and dates are safe as-is.
function sanitizeCell(v) {
  if (typeof v !== 'string' || v.length === 0) return v;
  return '=+-@\t\r'.includes(v[0]) ? "'" + v : v;
}

function buildComplianceWorkbook(ExcelJS, payload) {
  const { range, scopeLabel, generatedAt, rows } = payload;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CQPM — Continuous Quality Process Monitoring';
  wb.created = new Date();

  // ── Colours (CQPM emerald theme) ────────────────────────────────────────────
  const C = {
    TEAL:        'FF0E9F6E',
    TEAL_DARK:   'FF0B7A55',
    TEAL_TINT:   'FFEAF7F1',
    WHITE:       'FFFFFFFF',
    BORDER:      'FFD0D0D0',
    MUTED:       'FF888888',
    ST_GREEN:    'FFD1FAE5',
    ST_AMBER:    'FFFEF3C7',
    ST_RED:      'FFFEE2E2',
    ST_GREY:     'FFF1F5F9',
    ST_ORANGE:   'FFFFEDD5',
    ST_REVIEW:   'FFFFF8E1',  // amber-tint for "pending review"
    SUMMARY_BG:  'FFD4EDDA',
    SUMMARY_TXT: 'FF2D5A3D',
    FOOTER_BG:   'FFF5F5F5',
    CRIT_RED:    'FFB91C1C',
  };
  const border = (clr) => ({ style: 'thin', color: { argb: clr } });
  const allBorders = (clr) => ({ top: border(clr), left: border(clr), bottom: border(clr), right: border(clr) });
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  const statusFill = (s) =>
      s === 'done'                      ? C.ST_GREEN
    : s === 'late'                      ? C.ST_AMBER
    : (s === 'missed' || s === 'notdone') ? C.ST_RED
    :                                     C.ST_GREY;

  const dateStr = new Date(generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rangeStr = `${fmtDate(range.from)} → ${fmtDate(range.to)}`;

  // ── Columns ─────────────────────────────────────────────────────────────────
  const COLS = [
    { header: '#',              key: 'idx',        width: 5  },
    { header: 'Date',           key: 'date',       width: 15 },
    { header: 'Department',     key: 'department', width: 20 },
    { header: 'Parameter',      key: 'parameter',  width: 30 },
    { header: 'Critical',       key: 'critical',   width: 9  },
    { header: 'Schedule',       key: 'schedule',   width: 16 },
    { header: 'Type',           key: 'type',       width: 11 },
    { header: 'Status',         key: 'status',     width: 12 },
    { header: 'Value',          key: 'value',      width: 12 },
    { header: 'Allowed',        key: 'allowed',    width: 14 },
    { header: 'In Range',       key: 'inRange',    width: 13 },
    { header: 'Review Result',  key: 'reviewResult', width: 14 },
    { header: 'Reviewed By',    key: 'reviewedBy', width: 18 },
    { header: 'Recorded By',    key: 'recordedBy', width: 18 },
    { header: 'Recorded At',    key: 'recordedAt', width: 18 },
    { header: 'Reason / Notes', key: 'reason',     width: 40 },
  ];
  const NCOLS = COLS.length;
  const lastCol = NCOLS <= 26 ? String.fromCharCode(64 + NCOLS) : 'A' + String.fromCharCode(64 + NCOLS - 26);

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Compliance Log
  // ═══════════════════════════════════════════════════════════════════════════
  const ws = wb.addWorksheet('Compliance Log', { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = COLS;

  // Title (row 1, merged)
  ws.insertRow(1, []);
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = `CQPM — Compliance Report   ·   ${scopeLabel}   ·   ${rangeStr}`;
  titleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: C.WHITE } };
  titleCell.fill = fill(C.TEAL_DARK);
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 22;

  // Header (row 2)
  const headerRow = ws.getRow(2);
  COLS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: C.WHITE } };
    cell.fill = fill(C.TEAL);
    cell.border = allBorders(C.BORDER);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 20;

  // Data rows
  rows.forEach((r, idx) => {
    const inRange = r.entryType === 'Numeric' && (r.minValue != null || r.maxValue != null) && r.value !== ''
      ? (r.oor ? 'OUT OF RANGE' : 'In range')
      : '';
    const reviewLabel = r.requiresReview
      ? (REVIEW_LABEL[r.reviewStatus] || (r.reviewStatus ? r.reviewStatus : '—'))
      : '—';
    const dataRow = ws.addRow([
      idx + 1,
      fmtDate(r.date),
      DEPT_LABEL[r.department] || r.department,
      sanitizeCell(r.parameter),
      r.critical ? 'Yes' : '—',
      r.schedule,
      r.entryType,
      STATUS_LABEL[r.statusRaw] || r.statusRaw,
      r.value !== '' ? sanitizeCell(`${r.value}${r.unit ? ' ' + r.unit : ''}`) : '',
      rangeText(r),
      inRange,
      reviewLabel,
      sanitizeCell(r.reviewedBy || ''),
      sanitizeCell(r.recordedBy || ''),
      fmtDateTime(r.recordedAt),
      sanitizeCell(r.reason || ''),
    ]);

    const isEven = idx % 2 === 0;
    const rowFill = fill(isEven ? C.WHITE : C.TEAL_TINT);

    dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = {
        name: 'Arial', size: 9,
        bold: colNum === 4,                                  // Parameter name bold
        color: { argb: colNum === 5 && r.critical ? C.CRIT_RED : 'FF111827' },
      };
      cell.border = allBorders(C.BORDER);
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum === 4 || colNum === 16 ? 'left' : 'center',
        wrapText: colNum === 16,
      };
      if      (colNum === 8)  cell.fill = fill(statusFill(r.statusRaw));     // Status
      else if (colNum === 11 && r.oor) cell.fill = fill(C.ST_ORANGE);        // In Range = OUT
      else if (colNum === 12 && r.requiresReview) {
        const rf = r.reviewStatus === 'pass'    ? C.ST_GREEN
                 : r.reviewStatus === 'fail'    ? C.ST_RED
                 : r.reviewStatus === 'pending' ? C.ST_REVIEW
                 : C.ST_GREY;
        cell.fill = fill(rf);
      }
      else    cell.fill = rowFill;
    });
    dataRow.height = 18;
  });

  if (rows.length === 0) {
    const empty = ws.addRow(['', 'No scheduled checks in this range.', ...Array(NCOLS - 2).fill('')]);
    ws.mergeCells(`B${empty.number}:${lastCol}${empty.number}`);
    empty.getCell(2).font = { name: 'Arial', size: 9, italic: true, color: { argb: C.MUTED } };
    empty.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  }

  // Aggregate
  const agg = aggregate(rows);

  // Summary row
  const summaryRow = ws.addRow([
    '', `${rows.length} scheduled checks  ·  ${agg.done} done · ${agg.late} late · ${agg.missedTotal} missed/not-done · ${agg.pending} pending  ·  Compliance: ${agg.compliance}`,
    ...Array(NCOLS - 2).fill(''),
  ]);
  ws.mergeCells(`B${summaryRow.number}:${lastCol}${summaryRow.number}`);
  summaryRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: C.SUMMARY_TXT } };
    cell.fill = fill(C.SUMMARY_BG);
    cell.border = allBorders(C.BORDER);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
  summaryRow.height = 18;

  // Footer
  const footerRow = ws.addRow([
    '', `Generated by CQPM on ${new Date(generatedAt).toLocaleString('en-IN')}`,
    ...Array(NCOLS - 2).fill(''),
  ]);
  ws.mergeCells(`B${footerRow.number}:${lastCol}${footerRow.number}`);
  footerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Arial', size: 8.5, color: { argb: C.MUTED } };
    cell.fill = fill(C.FOOTER_BG);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
  footerRow.height = 16;

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Summary');
  ws2.columns = [{ width: 34 }, { width: 24 }];

  const addTitle = (label) => {
    const row = ws2.addRow([label, '']);
    ws2.mergeCells(`A${row.number}:B${row.number}`);
    row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: C.WHITE } };
    row.getCell(1).fill = fill(C.TEAL);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(1).border = allBorders(C.BORDER);
    row.height = 18;
  };
  const addRow = (label, value, bold = false) => {
    const row = ws2.addRow([label, value]);
    [1, 2].forEach(i => {
      row.getCell(i).font = { name: 'Arial', size: 9, bold, color: { argb: bold ? C.SUMMARY_TXT : 'FF111827' } };
      row.getCell(i).fill = fill(bold ? C.SUMMARY_BG : C.WHITE);
      row.getCell(i).border = allBorders(C.BORDER);
      row.getCell(i).alignment = { vertical: 'middle', horizontal: i === 2 ? 'center' : 'left', indent: i === 1 ? 1 : 0 };
    });
    row.height = 17;
  };
  const addBlank = () => ws2.addRow([]);

  ws2.addRow([]);
  ws2.mergeCells('A1:B1');
  const s2t = ws2.getCell('A1');
  s2t.value = `CQPM Compliance Summary  ·  ${dateStr}`;
  s2t.font = { name: 'Arial', size: 10, bold: true, color: { argb: C.WHITE } };
  s2t.fill = fill(C.TEAL_DARK);
  s2t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws2.getRow(1).height = 22;
  addBlank();

  addTitle('Overview');
  addRow('Scope', scopeLabel);
  addRow('Date Range', rangeStr);
  addRow('Scheduled Checks', rows.length);
  addRow('Done', agg.done);
  addRow('Done Late', agg.late);
  addRow('Missed / Not done', agg.missedTotal);
  addRow('Pending', agg.pending);
  addRow('Weighted Compliance', agg.compliance, true);
  addRow('Out-of-range Readings', agg.flagged);
  if (agg.reviewDue > 0) {
    addRow('Requires Review (checks)', agg.reviewDue);
    addRow('  ↳ Passed', agg.reviewPass);
    addRow('  ↳ Failed', agg.reviewFail);
    addRow('  ↳ Awaiting review', agg.reviewPending);
  }
  addBlank();

  addTitle('Critical Parameters');
  addRow('Critical Checks Due', agg.critDue);
  addRow('Critical Checks Met', agg.critMet);
  addRow('Critical Compliance', agg.critDue ? Math.round((agg.critMet / agg.critDue) * 100) + '%' : '—', true);
  addBlank();

  // By department
  addTitle('By Department');
  Object.keys(agg.byDept).sort().forEach(dep => {
    const d = agg.byDept[dep];
    const pct = d.totalW ? Math.round((d.earnedW / d.totalW) * 100) + '%' : '—';
    addRow(DEPT_LABEL[dep] || dep, `${d.count} checks · ${pct}`);
  });
  addBlank();

  // By status
  addTitle('By Status');
  ['done', 'late', 'missed', 'notdone', 'pending'].forEach(s => {
    if (agg.byStatus[s]) addRow(STATUS_LABEL[s], agg.byStatus[s]);
  });

  return wb;
}

function aggregate(rows) {
  let totalW = 0, earnedW = 0, critDue = 0, critMet = 0, flagged = 0;
  let reviewDue = 0, reviewPass = 0, reviewFail = 0, reviewPending = 0;
  const byStatus = {};
  const byDept = {};
  rows.forEach(r => {
    totalW += r.weight;
    earnedW += r.earned;
    byStatus[r.statusRaw] = (byStatus[r.statusRaw] || 0) + 1;
    if (!byDept[r.department]) byDept[r.department] = { count: 0, totalW: 0, earnedW: 0 };
    byDept[r.department].count++;
    byDept[r.department].totalW += r.weight;
    byDept[r.department].earnedW += r.earned;
    if (r.critical) { critDue++; if (r.earned > 0) critMet++; }
    if (r.oor) flagged++;
    if (r.requiresReview) {
      reviewDue++;
      if      (r.reviewStatus === 'pass')    reviewPass++;
      else if (r.reviewStatus === 'fail')    reviewFail++;
      else if (r.reviewStatus === 'pending') reviewPending++;
    }
  });
  const done = byStatus.done || 0;
  const late = byStatus.late || 0;
  const pending = byStatus.pending || 0;
  const missedTotal = (byStatus.missed || 0) + (byStatus.notdone || 0);
  const compliance = totalW ? Math.round((earnedW / totalW) * 100) + '%' : '—';
  return { totalW, earnedW, done, late, pending, missedTotal, compliance, critDue, critMet, flagged, reviewDue, reviewPass, reviewFail, reviewPending, byStatus, byDept };
}

module.exports = { buildComplianceWorkbook };
