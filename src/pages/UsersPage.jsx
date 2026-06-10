import { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldCheck, Loader2, X, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const DEPTS = [
  { id: 'serology',     label: 'Serology',         dot: 'bg-red-500',    ring: 'border-red-500/30',    text: 'text-red-400'    },
  { id: 'molecularBio', label: 'Molecular Biology', dot: 'bg-sky-500',    ring: 'border-sky-500/30',    text: 'text-sky-400'    },
  { id: 'microbiology', label: 'Microbiology',      dot: 'bg-yellow-500', ring: 'border-yellow-500/30', text: 'text-yellow-400' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({ defaultDept, defaultRole, onSave, onClose }) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    displayName: '',
    username:    '',
    password:    '',
    role:        defaultRole ?? 'staff',
    department:  defaultDept ?? 'serology',
  });
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleCreate() {
    if (!form.displayName.trim()) return setError('Display name is required.');
    if (!form.username.trim())    return setError('Username is required.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.role === 'staff' && !form.department) return setError('Staff must have a department.');

    setLoading(true);
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
      onSave();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-sm font-semibold">New User</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <Field label="Display Name">
            <input type="text" value={form.displayName} onChange={e => set('displayName', e.target.value)}
              placeholder="Full name" autoFocus
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full" />
          </Field>

          <Field label="Username">
            <input type="text" value={form.username}
              onChange={e => set('username', e.target.value.toLowerCase())}
              placeholder="login username"
              className="h-9 rounded-md border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring w-full" />
          </Field>

          <Field label="Password (min 8 chars)">
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Temporary password"
                className="h-9 rounded-md border bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>

          <Field label="Role">
            <div className="flex gap-2">
              {[['staff', 'Staff'], ['admin', 'Admin']].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set('role', val)}
                  className={cn(
                    'h-8 px-3 text-xs rounded-md border font-medium transition-colors',
                    form.role === val
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted text-muted-foreground'
                  )}>
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          {form.role === 'staff' && (
            <Field label="Department">
              <select value={form.department} onChange={e => set('department', e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full">
                {DEPTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Field>
          )}

          <p className="text-[10px] text-muted-foreground">
            User will be prompted to change their password on first login.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="h-8 px-3 text-xs rounded-md border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={loading}
            className={cn(
              'h-8 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium',
              'flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50'
            )}>
            {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Creating…</> : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User node (circle card) ───────────────────────────────────────────────────
function UserNode({ user, onDelete, canDelete }) {
  return (
    <div className="relative group flex flex-col items-center gap-1">
      <div className={cn(
        'w-14 h-14 rounded-full border-2 bg-card flex items-center justify-center shadow',
        'transition-transform duration-150 group-hover:scale-105',
        user.role === 'admin' ? 'border-primary/50' : 'border-border'
      )}>
        <span className={cn(
          'text-sm font-bold',
          user.role === 'admin' ? 'text-primary' : 'text-foreground'
        )}>
          {initials(user.display_name)}
        </span>
      </div>
      <p className="text-[11px] font-medium text-center max-w-[76px] truncate leading-tight">
        {user.display_name}
      </p>
      <p className="text-[9px] text-muted-foreground font-mono leading-none">@{user.username}</p>

      {canDelete && (
        <button onClick={() => onDelete(user)}
          className={cn(
            'absolute -top-0.5 -right-1 w-5 h-5 rounded-full bg-destructive text-white',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'flex items-center justify-center hover:bg-destructive/80 shadow-sm'
          )}>
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

// ── Add-user "+" node ─────────────────────────────────────────────────────────
function AddNode({ label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group">
      <div className={cn(
        'w-10 h-10 rounded-full border-2 border-dashed border-border',
        'flex items-center justify-center',
        'transition-colors group-hover:border-primary/60 group-hover:bg-primary/5'
      )}>
        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <p className="text-[9px] text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </p>
    </button>
  );
}

// ── Connector line segment ────────────────────────────────────────────────────
function VLine({ h = 8 }) {
  return <div className="w-px bg-border flex-shrink-0" style={{ height: `${h * 4}px` }} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { token, user: me } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | { dept?, role? }

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

  const admins = users.filter(u => u.role === 'admin');
  const byDept = id => users.filter(u => u.role === 'staff' && u.department === id);

  async function handleDelete(user) {
    if (!window.confirm(`Remove "${user.display_name}" (@${user.username})?\nThis cannot be undone.`)) return;
    await window.cqpm.auth.deleteUser(token, user.id);
    await load();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
  );

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold">User Hierarchy</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {admins.length} admin · {users.filter(u => u.role === 'staff').length} staff
          </p>
        </div>
        <button onClick={() => setModal({ role: 'staff', dept: 'serology' })}
          className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add User
        </button>
      </div>

      {/* Org chart canvas */}
      <div className="flex-1 overflow-auto py-10 px-6">
        <div className="max-w-3xl mx-auto flex flex-col items-center">

          {/* ── Administration node ── */}
          <div className="w-full max-w-lg rounded-xl border-2 border-primary/20 bg-primary/5 px-6 py-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Administration</span>
            </div>
            <div className="flex flex-wrap gap-5 justify-center">
              {admins.map(u => (
                <UserNode key={u.id} user={u}
                  canDelete={admins.length > 1 && u.id !== me?.sub}
                  onDelete={handleDelete} />
              ))}
              <AddNode label="Add Admin" onClick={() => setModal({ role: 'admin' })} />
            </div>
          </div>

          {/* Admin → junction line */}
          <VLine h={8} />

          {/* ── Department level ── */}
          <div className="w-full relative">
            {/* Horizontal connector bar spanning dept centers (grid-cols-3 → centers at 1/6, 1/2, 5/6) */}
            <div className="absolute top-0 h-px bg-border"
              style={{ left: 'calc(100% / 6)', right: 'calc(100% / 6)' }} />

            <div className="grid grid-cols-3">
              {DEPTS.map(dept => {
                const staff = byDept(dept.id);
                return (
                  <div key={dept.id} className="flex flex-col items-center px-2">
                    {/* Vertical: horizontal bar → dept node */}
                    <VLine h={8} />

                    {/* Dept node */}
                    <div className={cn(
                      'w-full rounded-xl border-2 p-3 text-center shadow-sm',
                      dept.ring
                    )}>
                      <div className="flex items-center justify-center gap-1.5 mb-0.5">
                        <span className={cn('w-2 h-2 rounded-full', dept.dot)} />
                        <span className={cn('text-xs font-semibold', dept.text)}>{dept.label}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{staff.length} staff</p>
                    </div>

                    {/* Dept → staff line */}
                    <VLine h={staff.length > 0 ? 6 : 4} />

                    {/* Staff nodes */}
                    {staff.length > 0 && (
                      <div className="relative w-full flex justify-around mb-0">
                        {/* Horizontal connector across staff if >1 */}
                        {staff.length > 1 && (
                          <div className="absolute top-0 h-px bg-border"
                            style={{
                              left:  `${100 / (2 * staff.length)}%`,
                              right: `${100 / (2 * staff.length)}%`,
                            }} />
                        )}
                        {staff.map(u => (
                          <div key={u.id} className="flex flex-col items-center">
                            <VLine h={6} />
                            <UserNode user={u}
                              canDelete={u.id !== me?.sub}
                              onDelete={handleDelete} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add staff */}
                    <VLine h={4} />
                    <AddNode label={`Add to ${dept.label}`}
                      onClick={() => setModal({ role: 'staff', dept: dept.id })} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-14 flex items-center gap-8 text-[10px] text-muted-foreground border-t pt-4 w-full justify-center">
            <span className="flex items-center gap-1.5">
              <span className="w-8 border-t border-border" /> Reporting line
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full border-2 border-dashed border-border" /> Add position
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full border-2 border-primary/40 bg-primary/5" /> Admin
            </span>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <CreateUserModal
          defaultDept={modal.dept}
          defaultRole={modal.role}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
