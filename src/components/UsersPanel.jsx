import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ShieldCheck, Loader2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const GROUPS = [
  { key: 'admin',       label: 'Administration', symbol: null,  filter: u => u.role === 'admin'                              },
  { key: 'serology',    label: 'Serology',        symbol: '⊕',  filter: u => u.role === 'staff' && u.department === 'serology'     },
  { key: 'molecularBio',label: 'Mol. Biology',    symbol: '⌬',  filter: u => u.role === 'staff' && u.department === 'molecularBio' },
  { key: 'microbiology', label: 'Microbiology',   symbol: '⊙',  filter: u => u.role === 'staff' && u.department === 'microbiology' },
];

function initials(name, username) {
  return (name || username).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({ user, isMe, onDelete, deleting }) {
  return (
    <div className="group flex items-center gap-3 px-6 py-2.5 hover:bg-muted/40 transition-colors">
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold',
        user.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground'
      )}>
        {initials(user.display_name, user.username)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{user.display_name}</span>
        {isMe && <span className="ml-2 text-[10px] text-muted-foreground">(you)</span>}
        <span className="ml-2 text-[11px] text-muted-foreground font-mono">@{user.username}</span>
      </div>
      {!isMe && (
        <button
          onClick={() => onDelete(user)}
          disabled={deleting === user.id}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-30">
          {deleting === user.id
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ── Add user form ─────────────────────────────────────────────────────────────
function AddUserForm({ token, onCreated, onCancel }) {
  const [form, setForm] = useState({ displayName: '', username: '', password: '', role: 'staff', department: 'serology' });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.displayName.trim())                  return setError('Full name required.');
    if (!form.username.trim())                     return setError('Username required.');
    if (form.password.length < 8)                  return setError('Password must be at least 8 characters.');
    if (form.role === 'staff' && !form.department) return setError('Department required for staff.');
    setSaving(true); setError('');
    try {
      const res = await window.cqpm.auth.createUser(token, {
        displayName: form.displayName.trim(),
        username:    form.username.trim(),
        password:    form.password,
        role:        form.role,
        department:  form.role === 'admin' ? null : form.department,
      });
      if (res?.error) return setError(res.error);
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div className="px-6 py-4 border rounded-xl bg-muted/20 flex flex-col gap-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">New Account</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Full name</label>
          <input autoFocus type="text" value={form.displayName}
            onChange={e => set('displayName', e.target.value)}
            placeholder="e.g. Jane Smith"
            className="h-8 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Username</label>
          <input type="text" value={form.username}
            onChange={e => set('username', e.target.value.toLowerCase())}
            placeholder="login handle"
            className="h-8 rounded-md border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={form.password}
              onChange={e => set('password', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Min 8 characters"
              className="h-8 w-full rounded-md border bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Role</label>
          <div className="flex gap-1.5 h-8">
            {[['staff','Staff'],['admin','Admin']].map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => set('role', val)}
                className={cn(
                  'flex-1 text-xs rounded-md border font-medium transition-colors',
                  form.role === val ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground'
                )}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {form.role === 'staff' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Department</label>
          <div className="flex gap-1.5">
            {[['serology','⊕ Serology'],['molecularBio','⌬ Mol. Biology'],['microbiology','⊙ Microbiology']].map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => set('department', val)}
                className={cn(
                  'flex-1 h-8 text-xs rounded-md border font-medium transition-colors font-mono',
                  form.department === val ? 'bg-primary/10 border-primary/40 text-primary' : 'hover:bg-muted text-muted-foreground'
                )}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 h-8 text-xs rounded-md border hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={saving}
          className="flex-1 h-8 text-xs rounded-md bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Creating…</> : 'Create Account'}
        </button>
      </div>
    </div>
  );
}

// ── Page Panel ────────────────────────────────────────────────────────────────
export default function UsersPanel() {
  const { token, user: me } = useAuth();
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await window.cqpm.auth.listUsers(token); setUsers(res.users ?? []); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(user) {
    if (!window.confirm(`Remove "${user.display_name}" (@${user.username})?\nThis cannot be undone.`)) return;
    setDeleting(user.id);
    try { await window.cqpm.auth.deleteUser(token, user.id); await load(); }
    finally { setDeleting(null); }
  }

  return (
    <div className="px-8 py-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4 flex-shrink-0 animate-fade-in">
        <div>
          <h1 className="text-base font-semibold">User Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} account{users.length !== 1 ? 's' : ''} · new users must change password on first login
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(v => !v)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 text-xs rounded-md font-medium transition-colors',
              showAdd ? 'bg-primary text-primary-foreground border-primary' : 'border hover:bg-muted text-muted-foreground'
            )}>
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="animate-slide-down">
          <AddUserForm token={token}
            onCreated={() => { setShowAdd(false); load(); }}
            onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {/* User list */}
      <div className="flex-1 overflow-y-auto animate-fade-in">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="rounded-xl border bg-card divide-y overflow-hidden shadow-sm">
            {GROUPS.map(group => {
              const members = users.filter(group.filter);
              return (
                <div key={group.key} className="py-4 first:pt-3 last:pb-3">
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-6 pb-2">
                    {group.symbol
                      ? <span className="font-mono text-[13px] text-muted-foreground leading-none">{group.symbol}</span>
                      : <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-auto">{members.length}</span>
                  </div>

                  {/* Members */}
                  <div className="divide-y divide-border/40">
                    {members.length === 0 ? (
                      <p className="px-6 py-2.5 text-xs text-muted-foreground italic">None assigned</p>
                    ) : (
                      members.map(u => (
                        <UserRow key={u.id} user={u} isMe={u.id === me?.sub}
                          onDelete={handleDelete} deleting={deleting} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t flex-shrink-0 text-muted-foreground">
        <p className="text-[10px]">
          Passwords hashed with bcrypt · JWT sessions expire after 10 h
        </p>
      </div>
    </div>
  );
}
