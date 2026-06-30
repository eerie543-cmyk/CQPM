import { useState, useEffect, useMemo } from 'react';
import { BarChart2, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

const DEPTS = {
  serology:     'Serology',
  molecularBio: 'Molecular Biology',
  microbiology: 'Microbiology',
};
const DEPT_IDS = Object.keys(DEPTS);

// ── Scoring ──────────────────────────────────────────────────────────────────
//
// CQPM User Score (0–100) = four weighted components:
//   Completion  ×50 — (done + late) / total logged
//   Timeliness  ×25 — done / (done + late) — penalises late entries
//   Consistency ×15 — inverse of monthly-rate std-dev (steady performance wins)
//   Quality     ×10 — review pass rate for entries that required review
//
// Department CQPM score = mean of all active user scores in that department.

function scoreProps(s) {
  if (s >= 85) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Excellent' };
  if (s >= 70) return { color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/20',     label: 'Good'      };
  if (s >= 55) return { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     label: 'Fair'      };
  if (s >= 40) return { color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20',   label: 'Low'       };
  return              { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         label: 'Critical'  };
}

function calcUserStats(userId, entries) {
  const ue     = entries.filter(e => e.done_by_id === userId);
  const done   = ue.filter(e => e.status === 'done').length;
  const late   = ue.filter(e => e.status === 'late').length;
  const missed = ue.filter(e => e.status === 'missed').length;
  const total  = done + late + missed;
  if (total === 0) return null;

  const completed      = done + late;
  const completionRate = completed / total;
  const timelinessRate = completed > 0 ? done / completed : 1;

  // Monthly consistency — low variance = high score
  const byMonth = {};
  for (const e of ue) {
    const m = e.slot_date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { done: 0, late: 0, missed: 0 };
    if (e.status in byMonth[m]) byMonth[m][e.status]++;
  }
  const mRates = Object.values(byMonth).map(m => {
    const t = m.done + m.late + m.missed;
    return t > 0 ? (m.done + m.late) / t : 0;
  });
  let consistency = 1;
  if (mRates.length > 1) {
    const mean   = mRates.reduce((a, b) => a + b, 0) / mRates.length;
    const stdDev = Math.sqrt(mRates.reduce((a, r) => a + (r - mean) ** 2, 0) / mRates.length);
    consistency  = Math.max(0, 1 - stdDev * 2);
  }

  // Review quality — pass rate for entries that went through review
  const reviewed = ue.filter(e => e.result === 'pass' || e.result === 'fail');
  const passes   = reviewed.filter(e => e.result === 'pass').length;
  const quality  = reviewed.length > 0 ? passes / reviewed.length : 1;

  const raw = completionRate * 50 + timelinessRate * 25 + consistency * 15 + quality * 10;
  return {
    score:          Math.round(raw * 100000) / 100000,
    done, late, missed, total, completed,
    completionPct:  Math.round(completionRate * 100),
    timelinessPct:  Math.round(timelinessRate * 100),
    consistencyPct: Math.round(consistency * 100),
    qualityPct:     Math.round(quality * 100),
    reviewedCount:  reviewed.length,
  };
}

function lastMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function calcDailyForMonth(userId, entries, month) {
  const [yr, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();

  const byDay = {};
  for (const e of entries.filter(e => e.done_by_id === userId && e.slot_date.startsWith(month + '-'))) {
    const day = parseInt(e.slot_date.slice(8, 10), 10);
    if (!byDay[day]) byDay[day] = { done: 0, late: 0, missed: 0 };
    if (e.status in byDay[day]) byDay[day][e.status]++;
  }

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const d = byDay[day];
    if (!d) return { day, rate: null };
    const t = d.done + d.late + d.missed;
    return { day, rate: t > 0 ? Math.round((d.done + d.late) / t * 100) : 0 };
  });
}

// ── Mini SVG line chart ───────────────────────────────────────────────────────

function MonthBarChart({ data }) {
  const hasData = data.some(d => d.rate !== null);
  if (!hasData) {
    return <p className="text-[9px] text-muted-foreground text-center py-3">No entries this month</p>;
  }

  const W = 220, H = 44;
  const n = data.length;
  const slotW = (W - 4) / n;
  const barW  = Math.max(1, slotW - 1);
  const barColor = r => r >= 90 ? '#34d399' : r >= 70 ? '#fbbf24' : '#f87171';

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <line x1="2" y1={H - 2} x2={W - 2} y2={H - 2}
          stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
        {data.map((d, i) => {
          if (d.rate === null) return null;
          const h  = Math.max(1, (d.rate / 100) * (H - 6));
          const x  = 2 + i * slotW + (slotW - barW) / 2;
          return (
            <rect key={i}
              x={x.toFixed(1)} y={(H - 2 - h).toFixed(1)}
              width={barW.toFixed(1)} height={h.toFixed(1)}
              fill={barColor(d.rate)} fillOpacity="0.75" rx="1" />
          );
        })}
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[8px] text-muted-foreground">1</span>
        <span className="text-[8px] text-muted-foreground">{Math.ceil(n / 2)}</span>
        <span className="text-[8px] text-muted-foreground">{n}</span>
      </div>
    </div>
  );
}

// ── User card ─────────────────────────────────────────────────────────────────

function UserCard({ user, stats, entries }) {
  const monthOptions = useMemo(() => lastMonths(12).reverse(), []);
  const [selMonth, setSelMonth] = useState(monthOptions[0]);
  const dailyData = useMemo(
    () => calcDailyForMonth(user.id, entries, selMonth),
    [user.id, entries, selMonth]
  );

  if (!stats) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
            {(user.display_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{user.display_name}</p>
            <p className="text-[10px] text-muted-foreground">{DEPTS[user.department] ?? '—'} · {user.role}</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 italic">No activity recorded in this period</p>
      </div>
    );
  }

  const sp = scoreProps(stats.score);

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      {/* Header — avatar + name + score badge */}
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0 mt-0.5">
          {(user.display_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user.display_name}</p>
          <p className="text-[10px] text-muted-foreground">{DEPTS[user.department] ?? '—'} · {user.role}</p>
        </div>
        <div className={cn('flex flex-col items-center rounded-lg border px-2.5 py-1.5 flex-shrink-0', sp.bg)}>
          <span className={cn('text-lg font-bold font-mono leading-none', sp.color)}>
            {(stats.score / 10).toFixed(3)}
          </span>
          <span className={cn('text-[8px] mt-0.5 font-medium text-muted-foreground')}>/ 10</span>
          <span className={cn('text-[8px] font-medium', sp.color)}>{sp.label}</span>
        </div>
      </div>

      {/* Completion bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Completion rate</span>
          <span className={sp.color}>{stats.completionPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-500/60 rounded-full transition-all" style={{ width: `${stats.completionPct}%` }} />
        </div>
      </div>

      {/* Done / Late / Missed counts */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 py-1.5">
          <p className="text-sm font-bold font-mono text-emerald-400 leading-none">{stats.done}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Done</p>
        </div>
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 py-1.5">
          <p className="text-sm font-bold font-mono text-amber-400 leading-none">{stats.late}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Late</p>
        </div>
        <div className="rounded-lg bg-red-500/5 border border-red-500/15 py-1.5">
          <p className="text-sm font-bold font-mono text-red-400 leading-none">{stats.missed}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Missed</p>
        </div>
      </div>

      {/* Late logging notice */}
      {stats.late > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>
            {user.display_name} has logged {stats.late} task{stats.late !== 1 ? 's' : ''} late
          </span>
        </div>
      )}

      {/* Score component breakdown */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Timeliness</span>
          <span className={scoreProps(stats.timelinessPct).color}>{stats.timelinessPct}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Consistency</span>
          <span className={scoreProps(stats.consistencyPct).color}>{stats.consistencyPct}%</span>
        </div>
        {stats.reviewedCount > 0 && (
          <div className="flex justify-between col-span-2">
            <span className="text-muted-foreground">Review quality ({stats.reviewedCount} entries)</span>
            <span className={scoreProps(stats.qualityPct).color}>{stats.qualityPct}%</span>
          </div>
        )}
      </div>

      {/* Monthly bar chart */}
      <div className="border-t border-border/40 pt-2">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Daily completion</p>
          <select
            value={selMonth}
            onChange={e => setSelMonth(e.target.value)}
            className="text-[9px] bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground focus:outline-none cursor-pointer"
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>
                {new Date(m + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
        </div>
        <MonthBarChart data={dailyData} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetricsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [rawUsers, setRawUsers] = useState([]);
  const [entries, setEntries]   = useState([]);
  const [filter, setFilter]     = useState('all');

  useEffect(() => {
    window.cqpm.metrics.get(token).then(res => {
      if (res.error) showToast(res.error, 'error');
      else { setRawUsers(res.data.users); setEntries(res.data.entries); }
      setLoading(false);
    });
  }, [token]);

  const userMetrics = useMemo(() =>
    rawUsers
      .filter(u => u.role !== 'admin')
      .map(u => ({
        user:  u,
        stats: calcUserStats(u.id, entries),
      }))
      // Sort: users with activity first, then by score descending
      .sort((a, b) => {
        if (!a.stats && !b.stats) return 0;
        if (!a.stats) return 1;
        if (!b.stats) return -1;
        return b.stats.score - a.stats.score;
      }),
  [rawUsers, entries]);

  const deptScores = useMemo(() => {
    const out = {};
    for (const dept of DEPT_IDS) {
      const active = userMetrics.filter(u => u.user.department === dept && u.stats);
      out[dept] = active.length
        ? Math.round(active.reduce((a, u) => a + u.stats.score, 0) / active.length * 100000) / 100000
        : null;
    }
    return out;
  }, [userMetrics]);

  const filtered = useMemo(() =>
    filter === 'all'
      ? userMetrics
      : userMetrics.filter(u => u.user.department === filter),
  [userMetrics, filter]);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-auto">

      {/* Page header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h1 className="text-base font-semibold">Metrics</h1>
        </div>
      </div>

      {/* Department CQPM scores */}
      <div className="flex-shrink-0 px-6 py-4 border-b">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Department CQPM scores
        </p>
        <div className="grid grid-cols-3 gap-3">
          {DEPT_IDS.map(dept => {
            const s  = deptScores[dept];
            const sp = s !== null ? scoreProps(s) : null;
            const active = userMetrics.filter(u => u.user.department === dept && u.stats).length;
            return (
              <div key={dept}
                className={cn(
                  'rounded-xl border px-4 py-3 flex items-center justify-between',
                  sp ? sp.bg : 'border-border bg-card'
                )}
              >
                <div>
                  <p className="text-xs font-medium">{DEPTS[dept]}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {active} active user{active !== 1 ? 's' : ''}
                  </p>
                </div>
                {s !== null ? (
                  <div className="text-right">
                    <p className={cn('text-2xl font-bold font-mono leading-none', sp.color)}>
                      {(s / 10).toFixed(3)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">/ 10</p>
                    <p className={cn('text-[9px] mt-0.5', sp.color)}>{sp.label}</p>
                  </div>
                ) : (
                  <p className="text-xl font-mono text-muted-foreground">—</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex-shrink-0 px-6 pt-4 pb-1 flex items-center gap-2">
        {[{ id: 'all', label: 'All users' }, ...DEPT_IDS.map(d => ({ id: d, label: DEPTS[d] }))].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filter === f.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

{/* User cards */}
      <div className="flex-1 px-6 pb-8 grid grid-cols-3 gap-4 auto-rows-max">
        {filtered.length === 0 ? (
          <div className="col-span-3 flex items-center justify-center py-16 text-sm text-muted-foreground">
            No users found.
          </div>
        ) : filtered.map(({ user, stats }) => (
          <UserCard key={user.id} user={user} stats={stats} entries={entries} />
        ))}
      </div>

    </div>
  );
}
