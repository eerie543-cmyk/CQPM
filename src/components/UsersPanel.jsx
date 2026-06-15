import { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Trash2, ShieldCheck, Loader2,
  Eye, EyeOff, UserCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const DEPT_NAMES = {
  serology:     'Serology',
  molecularBio: 'Mol. Biology',
  microbiology: 'Microbiology',
};
const DEPT_DOT = {
  serology:     'bg-red-500',
  molecularBio: 'bg-sky-500',
  microbiology: 'bg-yellow-500',
};
const DEPT_IDS = ['serology', 'molecularBio', 'microbiology'];

// ── Inline user row ───────────────────────────────────────────────────────────
function UserRow({ user, isMe, onDelete, deleting }) {
  const initials = (user.display_name || user.username)
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/40 group transition-colors">
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
        user.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground'
      )}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate leading-tight">
          {user.display_name}
          {isMe && <span className="ml-1 text-[9px] text-muted-foreground font-normal">(you)</span>}
        </p>
        <p className="text-[9px] text-muted-foreground font-mono leading-tight">@{user.username}</p>
      </div>

      {/* Delete */}
      {!isMe && (
        <button
          onClick={() => onDelete(user)}
          disabled={deleting === user.id}
          className={cn(
            'p-1 rounded-md text-muted-foreground transition-all flex-shrink-0',
            'opacity-0 group-hover:opacity-100',
            'hover:bg-destructive/10 hover:text-destructive',
            'disabled:opacity-30 disabled:cursor-not-allowed'
          )}>
          {deleting === user.id
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Trash2 className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

// ── Add user inline form ──────────────────────────────────────────────────────
function AddUserForm({ onCreated, onCancel, token }) {
  const [form, setForm] = useState({
    displayName: '', username: '', password: '',
    role: 'staff', department: 'serology',
  });
  const [showPw,  setShowPw]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleCreate() {
    if (!form.displayName.trim())                 return setError('Display name required.');
    if (!form.username.trim())                    return setError('Username required.');
    if (form.password.length < 8)                 return setError('Password min 8 characters.');
    if (form.role === 'staff' && !form.department) return setError('Department required for staff.');

    setSaving(true);
    setError('');
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border bg-muted/20 p-3 flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
        New Account
      </p>

      <input type="text" value={form.displayName}
        onChange={e => set('displayName', e.target.value)}
        placeholder="Full name" autoFocus
        className="h-7 rounded-md border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-full" />

      <input type="text" value={form.username}
        onChange={e => set('username', e.target.value.toLowerCase())}
        placeholder="username (login)"
        className="h-7 rounded-md border bg-background px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full" />

      <div className="relative">
        <input type={showPw ? 'text' : 'password'} value={form.password}
          onChange={e => set('password', e.target.value)}
          placeholder="Password (min 8 chars)"
          className="h-7 rounded-md border bg-background px-2.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-full" />
        <button type="button" onClick={() => setShowPw(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          {showPw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>

      {/* Role picker */}
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1">
          {[['staff','Staff'],['admin','Admin']].map(([val, lbl]) => (
            <button key={val} type="button" onClick={() => set('role', val)}
              className={cn(
                'h-6 px-2.5 text-[10px] rounded-md border font-medium transition-colors',
                form.role === val
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted text-muted-foreground'
              )}>
              {lbl}
            </button>
          ))}
        </div>
        {form.role === 'staff' && (
          <select value={form.department} onChange={e => set('department', e.target.value)}
            className="flex-1 h-6 rounded-md border bg-background px-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="serology">Serology</option>
            <option value="molecularBio">Mol. Biology</option>
            <option value="microbiology">Microbiology</option>
          </select>
        )}
      </div>

      {error && <p className="text-[10px] text-destructive">{error}</p>}

      <div className="flex gap-2 pt-0.5">
        <button onClick={onCancel}
          className="flex-1 h-7 text-[10px] rounded-md border hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={handleCreate} disabled={saving}
          className={cn(
            'flex-1 h-7 text-[10px] rounded-md bg-primary text-primary-foreground font-medium',
            'flex items-center justify-center gap-1 hover:bg-primary/90 transition-colors disabled:opacity-50'
          )}>
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Creating…</> : 'Create Account'}
        </button>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function UsersPanel({ onClose }) {
  const { token, user: me } = useAuth();
  const [users,    setUsers]   = useState([]);
  const [loading,  setLoading] = useState(true);
  const [showAdd,  setShowAdd] = useState(false);
  const [deleting, setDeleting]= useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.cqpm.auth.listUsers(token);
      setUsers(res.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(user) {
    if (!window.confirm(`Remove "${user.display_name}" (@${user.username})?\nThis cannot be undone.`)) return;
    setDeleting(user.id);
    try {
      await window.cqpm.auth.deleteUser(token, user.id);
      await load();
    } finally {
      setDeleting(null);
    }
  }

  const admins = users.filter(u => u.role === 'admin');
  const byDept = id => users.filter(u => u.role === 'staff' && u.department === id);
  const total  = users.length;

  return (
    /* Overlay confined to the content area (sits below the title bar) */
    <div className="absolute inset-0 z-40">

      {/* Even dim over the content — the sidebar (z-50) stays bright and clickable.
          No backdrop blur: it clashed with the matrix header's own blur. */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      {/* Panel — sits just to the right of the sidebar */}
      <div className="absolute inset-y-0 left-56 w-72 bg-card border-r shadow-2xl flex flex-col animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Users</span>
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
              {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAdd(v => !v)}
              className={cn(
                'flex items-center gap-1 h-6 px-2 text-[10px] rounded-md font-medium transition-colors',
                showAdd
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground border border-border'
              )}>
              <Plus className="w-3 h-3" /> Add
            </button>
            <button onClick={onClose}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors ml-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Add user form */}
        {showAdd && (
          <div className="border-b pb-1 flex-shrink-0">
            <AddUserForm
              token={token}
              onCreated={() => { setShowAdd(false); load(); }}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        {/* User list */}
        <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              {/* Administration */}
              <section className="px-3">
                <div className="flex items-center gap-1.5 mb-1 px-2">
                  <ShieldCheck className="w-3 h-3 text-primary" />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-primary">
                    Administration
                  </p>
                  <span className="text-[9px] text-muted-foreground ml-auto">{admins.length}</span>
                </div>
                <div className="flex flex-col">
                  {admins.map(u => (
                    <UserRow key={u.id} user={u}
                      isMe={u.id === me?.sub}
                      onDelete={handleDelete}
                      deleting={deleting} />
                  ))}
                </div>
              </section>

              {/* Dept sections */}
              {DEPT_IDS.map(id => {
                const staff = byDept(id);
                return (
                  <section key={id} className="px-3">
                    <div className="flex items-center gap-1.5 mb-1 px-2">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DEPT_DOT[id])} />
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        {DEPT_NAMES[id]}
                      </p>
                      <span className="text-[9px] text-muted-foreground ml-auto">{staff.length}</span>
                    </div>
                    <div className="flex flex-col">
                      {staff.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic px-2 py-1">
                          No staff assigned
                        </p>
                      ) : (
                        staff.map(u => (
                          <UserRow key={u.id} user={u}
                            isMe={u.id === me?.sub}
                            onDelete={handleDelete}
                            deleting={deleting} />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>

        {/* Footer note */}
        <div className="px-4 py-2 border-t flex-shrink-0">
          <p className="text-[9px] text-muted-foreground">
            New accounts must change their password on first login.
            JWT tokens expire after 10 hours.
          </p>
        </div>
      </div>

    </div>
  );
}
