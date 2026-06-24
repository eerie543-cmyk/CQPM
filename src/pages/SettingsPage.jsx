import { useState, useCallback } from 'react';
import {
  Sun, Moon, Monitor, Settings, Database, Shield, Clock, Info,
  Key, Eye, EyeOff, Timer, Download, Bell, BellOff,
  Radio, RefreshCw, CheckCircle2, Loader2, Wifi, WifiOff,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useRemoteConfigContext } from '@/hooks/useRemoteConfigContext';
import { INACTIVITY_LS_KEY } from '@/hooks/useInactivityLogout';
import { toLocalYMD } from '@/lib/schedule';
import { EXPORT_DEFAULTS_KEY } from '@/components/ExportModal';

// ── localStorage helpers ──────────────────────────────────────────────────────
function computeFromDate(range) {
  const d = new Date();
  if (range === 'last_7')  { d.setDate(d.getDate() - 6);  return toLocalYMD(d); }
  if (range === 'last_30') { d.setDate(d.getDate() - 29); return toLocalYMD(d); }
  if (range === 'last_90') { d.setDate(d.getDate() - 89); return toLocalYMD(d); }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Layout primitives ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {children}
      </div>
    </div>
  );
}

function Row({ label, sublabel, children, className }) {
  return (
    <div className={cn('flex items-center justify-between px-5 py-3.5 gap-4', className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sublabel && <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ── 1. Change Password ────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const { changePassword } = useAuth();
  const [open,   setOpen]  = useState(false);
  const [form,   setForm]  = useState({ old: '', newPw: '', confirm: '' });
  const [show,   setShow]  = useState({ old: false, newPw: false, confirm: false });
  const [saving, setSaving]= useState(false);
  const [error,  setError] = useState('');
  const [done,   setDone]  = useState(false);

  function resetForm() {
    setForm({ old: '', newPw: '', confirm: '' });
    setShow({ old: false, newPw: false, confirm: false });
    setError(''); setDone(false);
  }

  function toggle() { setOpen(v => !v); if (!open) resetForm(); }

  async function handleSubmit() {
    if (!form.old)                    return setError('Current password is required.');
    if (form.newPw.length < 8)        return setError('New password must be at least 8 characters.');
    if (form.newPw !== form.confirm)  return setError('Passwords do not match.');
    setSaving(true); setError('');
    try {
      const res = await changePassword(form.old, form.newPw);
      if (res?.error) return setError(res.error);
      setDone(true);
      setTimeout(() => { setOpen(false); resetForm(); }, 2000);
    } finally { setSaving(false); }
  }

  const fields = [
    { key: 'old',     label: 'Current password' },
    { key: 'newPw',   label: 'New password' },
    { key: 'confirm', label: 'Confirm new password' },
  ];

  return (
    <div className="rounded-xl border bg-card divide-y">
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 gap-4 hover:bg-muted/30 transition-colors text-left">
        <div>
          <p className="text-sm font-medium">Change Password</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Update your login credentials</p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Key className="w-3.5 h-3.5" />
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {open && (
        <div className="px-5 py-4 flex flex-col gap-3">
          {done ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Password updated successfully.
            </div>
          ) : (
            <>
              {fields.map(({ key, label }, i) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">{label}</label>
                  <div className="relative">
                    <input
                      type={show[key] ? 'text' : 'password'}
                      value={form[key]}
                      autoFocus={i === 0}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      className="h-8 w-full rounded-md border bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    <button type="button"
                      onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {show[key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setOpen(false); resetForm(); }}
                  className="flex-1 h-8 text-xs rounded-md border hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 h-8 text-xs rounded-md bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : 'Update Password'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reusable toggle switch ────────────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  return (
    <button type="button" onClick={onToggle}
      className={cn(
        'w-11 h-6 rounded-full border-2 transition-all relative flex-shrink-0',
        on ? 'bg-primary border-primary' : 'border-border bg-muted'
      )}>
      <span className={cn(
        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
        on ? 'left-[calc(100%-18px)]' : 'left-0.5'
      )} />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const { user, isAdmin } = useAuth();
  const { appVersion, status, lastSync, configured, features, departments, refetch } = useRemoteConfigContext();

  // ── Inactivity timeout ────────────────────────────────────────────────────
  const [inactivityMins, setInactivityMins] = useState(
    () => parseInt(localStorage.getItem(INACTIVITY_LS_KEY) || '0', 10)
  );
  function saveInactivity(val) {
    const n = parseInt(val, 10);
    setInactivityMins(n);
    if (n > 0) localStorage.setItem(INACTIVITY_LS_KEY, String(n));
    else       localStorage.removeItem(INACTIVITY_LS_KEY);
  }

  // ── Export defaults ───────────────────────────────────────────────────────
  const [exportDefaults, setExportDefaults] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EXPORT_DEFAULTS_KEY) || 'null') || { range: 'current_month', scope: 'current' }; }
    catch { return { range: 'current_month', scope: 'current' }; }
  });
  function saveExportDefault(key, val) {
    const next = { ...exportDefaults, [key]: val };
    setExportDefaults(next);
    localStorage.setItem(EXPORT_DEFAULTS_KEY, JSON.stringify(next));
  }

  // ── Notification prefs ────────────────────────────────────────────────────
  const [notifySession, setNotifySession] = useState(
    () => localStorage.getItem('cqpm:notify_session_warn') !== 'false'
  );
  function saveNotifySession(val) {
    setNotifySession(val);
    localStorage.setItem('cqpm:notify_session_warn', val ? 'true' : 'false');
  }

  // ── Remote config refresh ─────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const handleRefetch = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 600);
  }, [refetch]);

  const TIMEOUT_OPTIONS = [
    { value: 0,   label: 'Off (disabled)' },
    { value: 15,  label: '15 minutes' },
    { value: 30,  label: '30 minutes' },
    { value: 60,  label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 240, label: '4 hours' },
  ];

  const RANGE_OPTIONS = [
    { value: 'current_month', label: 'Current month' },
    { value: 'last_7',        label: 'Last 7 days' },
    { value: 'last_30',       label: 'Last 30 days' },
    { value: 'last_90',       label: 'Last 90 days' },
  ];

  const remoteStatusColor = {
    ok:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    offline: 'text-red-400 bg-red-500/10 border-red-500/20',
    idle:    'text-muted-foreground bg-muted border-border',
  }[configured ? (status || 'idle') : 'idle'];

  const remoteStatusLabel = !configured ? 'Not configured' : status === 'ok' ? 'Connected' : status === 'offline' ? 'Offline' : 'Idle';

  const fmtSync = lastSync
    ? new Date(lastSync).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-card/50 backdrop-blur flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">App preferences and information</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-8">

          {/* ── Account ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Account</h2>
            </div>
            <ChangePasswordSection />
          </div>

          {/* ── Appearance ───────────────────────────────────────────── */}
          <Section title="Appearance" icon={Monitor}>
            <Row label="Theme" sublabel="Toggle between light and dark interface">
              <button onClick={toggleTheme}
                className="flex items-center gap-2 h-8 px-3 text-xs rounded-md border font-medium transition-all bg-muted hover:bg-muted/70">
                {dark ? <><Sun className="w-3.5 h-3.5" /> Switch to Light</> : <><Moon className="w-3.5 h-3.5" /> Switch to Dark</>}
              </button>
            </Row>
          </Section>

          {/* ── Session ──────────────────────────────────────────────── */}
          <Section title="Session" icon={Clock}>
            <Row label="Signed in as" sublabel={`@${user?.username} · ${user?.role}`}>
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                isAdmin ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
              )}>
                {user?.role}
              </span>
            </Row>
            <Row label="Session lifetime" sublabel="JWT tokens expire after 10 hours · sign in again to extend">
              <span className="text-xs text-muted-foreground">10 h</span>
            </Row>
            {user?.department && (
              <Row label="Department" sublabel="Your assigned lab section">
                <span className="text-xs text-muted-foreground capitalize">{user.department}</span>
              </Row>
            )}
            <Row
              label="Auto-logout after inactivity"
              sublabel="Signs you out automatically if no mouse or keyboard activity is detected">
              <select
                value={inactivityMins}
                onChange={e => saveInactivity(e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                {TIMEOUT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
          </Section>

          {/* ── Export Defaults ───────────────────────────────────────── */}
          <Section title="Export Defaults" icon={Download}>
            <Row
              label="Default date range"
              sublabel="Pre-fills the date range when you open the Export dialog">
              <select
                value={exportDefaults.range}
                onChange={e => saveExportDefault('range', e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                {RANGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
            <Row
              label="Default scope"
              sublabel="Whether the export defaults to your department or all departments">
              <div className="flex gap-1.5">
                {[['current', 'My Dept'], ['all', 'All Depts']].map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => saveExportDefault('scope', val)}
                    className={cn(
                      'h-7 px-2.5 text-[11px] rounded-md border font-medium transition-colors',
                      exportDefaults.scope === val
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'hover:bg-muted text-muted-foreground'
                    )}>
                    {lbl}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Preview" sublabel="What the Export dialog will open with">
              <span className="text-[11px] text-muted-foreground font-mono">
                {RANGE_OPTIONS.find(r => r.value === exportDefaults.range)?.label} · {exportDefaults.scope === 'all' ? 'All depts' : 'My dept'}
              </span>
            </Row>
          </Section>

          {/* ── Notifications ─────────────────────────────────────────── */}
          <Section title="Notifications" icon={Bell}>
            <Row
              label="Session expiry warning"
              sublabel="Show a popup banner 30 minutes before your session token expires">
              <Toggle on={notifySession} onToggle={() => saveNotifySession(!notifySession)} />
            </Row>
          </Section>

          {/* ── Remote Configuration ──────────────────────────────────── */}
          <Section title="Remote Configuration" icon={Radio}>
            <Row label="Connection status" sublabel={configured ? `Last synced at ${fmtSync}` : 'Set VITE_REMOTE_CONFIG_URL and VITE_REMOTE_SECRET to enable'}>
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border', remoteStatusColor)}>
                  {remoteStatusLabel}
                </span>
                {configured && (
                  <button onClick={handleRefetch} disabled={refreshing}
                    className="p-1.5 rounded-md border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40">
                    <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
                  </button>
                )}
              </div>
            </Row>

            <div className="px-5 py-3.5">
              <p className="text-xs font-medium mb-2.5">Features</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'matrix',     label: 'Matrix' },
                  { key: 'adminPanel', label: 'Admin Panel' },
                  { key: 'export',     label: 'Export' },
                ].map(({ key, label }) => {
                  const on = features[key] !== false;
                  return (
                    <div key={key} className={cn(
                      'rounded-lg border px-3 py-2 flex items-center justify-between gap-2',
                      on ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
                    )}>
                      <span className="text-xs font-medium">{label}</span>
                      <span className={cn('text-[10px] font-bold', on ? 'text-emerald-400' : 'text-red-400')}>
                        {on ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3.5">
              <p className="text-xs font-medium mb-2.5">Departments</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'serology',     label: 'Serology' },
                  { key: 'molecularBio', label: 'Mol. Biology' },
                  { key: 'microbiology', label: 'Microbiology' },
                ].map(({ key, label }) => {
                  const on = departments[key] !== false;
                  return (
                    <div key={key} className={cn(
                      'rounded-lg border px-3 py-2 flex items-center justify-between gap-2',
                      on ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-muted/30'
                    )}>
                      <span className="text-xs font-medium">{label}</span>
                      <span className={cn('text-[10px] font-bold', on ? 'text-emerald-400' : 'text-muted-foreground')}>
                        {on ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* ── Database ─────────────────────────────────────────────── */}
          <Section title="Database" icon={Database}>
            <Row label="Storage backend" sublabel="All data is stored in a shared cloud Postgres database">
              <span className="text-xs text-muted-foreground">Supabase · ap-south-1</span>
            </Row>
            <Row label="Connection check" sublabel="The app pings the database every 20 seconds">
              <span className="text-xs text-muted-foreground">Every 20 s</span>
            </Row>
            <Row label="Sync model" sublabel="All machines read from the same database — no local state">
              <span className="text-xs text-muted-foreground">Cloud · real-time</span>
            </Row>
          </Section>

          {/* ── Security ─────────────────────────────────────────────── */}
          <Section title="Security" icon={Shield}>
            <Row label="Authentication" sublabel="Passwords hashed with bcrypt (cost 12) · JWT signed with device key">
              <span className="text-xs text-muted-foreground">JWT + bcrypt</span>
            </Row>
            <Row label="Row-level security" sublabel="Supabase RLS is enabled — only the backend service key can access data">
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                Enabled
              </span>
            </Row>
          </Section>

          {/* ── About ────────────────────────────────────────────────── */}
          <Section title="About" icon={Info}>
            <Row label="Application" sublabel="Continuous Quality Process Monitoring">
              <span className="text-xs text-muted-foreground font-mono">CQPM</span>
            </Row>
            <Row label="Version" sublabel="Current build">
              <span className="text-xs text-muted-foreground font-mono">v{appVersion}</span>
            </Row>
          </Section>

        </div>
      </div>
    </div>
  );
}
