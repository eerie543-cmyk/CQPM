import { useState } from 'react';
import { FlaskConical, LayoutGrid, CalendarDays, Users, LogOut, ChevronRight, ClipboardCheck, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRemoteConfigContext } from '@/hooks/useRemoteConfigContext';
import UsersPanel from './UsersPanel';

const DEPTS = [
  { id: 'serology',     label: 'Serology',         color: 'bg-red-500'    },
  { id: 'molecularBio', label: 'Molecular Biology', color: 'bg-sky-500'    },
  { id: 'microbiology', label: 'Microbiology',      color: 'bg-yellow-500' },
];

const NAV = [
  { id: 'today',      label: 'Today',      icon: ClipboardCheck, adminOnly: false },
  { id: 'matrix',     label: 'Matrix',     icon: LayoutGrid,     adminOnly: false },
  { id: 'parameters', label: 'Parameters', icon: CalendarDays,   adminOnly: true  },
  { id: 'approvals',  label: 'Approvals',  icon: Inbox,          adminOnly: true  },
];

/** Short relative time for the sync tooltip, e.g. "just now", "4m ago". */
function relTime(ts) {
  if (!ts) return null;
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function Sidebar({ page, onPage, activeDept, onDept, isAdmin, matrixEnabled = true, user, visibleDepts }) {
  const { logout } = useAuth();
  const { appVersion, status, lastSync, configured } = useRemoteConfigContext();
  const [usersOpen, setUsersOpen] = useState(false);

  const depts = visibleDepts ? DEPTS.filter(d => visibleDepts.includes(d.id)) : DEPTS;

  // Whisper-subtle connection state: the version label dims when running on
  // saved/offline settings; the tooltip explains. No badge, no coloured dot.
  const offline     = configured && status === 'offline';
  const statusTitle = !configured
    ? 'Running locally'
    : status === 'ok'
      ? `Synced ${relTime(lastSync) ?? 'just now'}`
      : 'Offline · using saved settings';

  return (
    <>
      <aside className="w-56 flex-shrink-0 border-r bg-card flex flex-col z-50 relative select-none">

        {/* Brand */}
        <div className="px-4 py-4 border-b">
          <div className="flex items-center gap-2.5 group/brand cursor-default select-none">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-200 group-hover/brand:bg-primary/20 group-hover/brand:shadow-sm">
              <FlaskConical className="w-4 h-4 text-primary transition-transform duration-200 group-hover/brand:rotate-12 group-hover/brand:scale-110" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none transition-colors duration-150 group-hover/brand:text-primary">CQPM</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Quality Monitor</p>
            </div>
          </div>
        </div>

        {/* Department switcher */}
        <div className="px-3 py-3 border-b">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            Department
          </p>
          {depts.map(d => {
            const active    = d.id === activeDept;
            const canSwitch = !!onDept;
            return (
              <button
                key={d.id}
                onClick={() => canSwitch && onDept(d.id)}
                disabled={!canSwitch}
                className={cn(
                  'group/dept w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-xs transition-all duration-150',
                  active
                    ? 'bg-primary/10 text-foreground font-medium'
                    : canSwitch
                      ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      : 'text-muted-foreground cursor-default opacity-50'
                )}
              >
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0 transition-transform duration-150',
                  d.color,
                  canSwitch && !active && 'group-hover/dept:scale-125'
                )} />
                <span className="truncate">{d.label}</span>
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-primary transition-transform duration-150 group-hover/dept:translate-x-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            Navigation
          </p>
          {NAV
            .filter(n => !n.adminOnly || isAdmin)
            .filter(n => n.id !== 'matrix' || matrixEnabled)
            .map(n => {
            const Icon   = n.icon;
            const active = page === n.id;
            return (
              <button
                key={n.id}
                onClick={() => onPage(n.id)}
                className={cn(
                  'group/nav w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-xs transition-all duration-150',
                  active
                    ? 'bg-primary/10 text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className={cn(
                  'w-3.5 h-3.5 flex-shrink-0 transition-all duration-150',
                  active
                    ? 'text-primary'
                    : 'group-hover/nav:text-primary group-hover/nav:scale-110'
                )} />
                {n.label}
              </button>
            );
          })}

          {/* Users panel button — admin only */}
          {isAdmin && (
            <>
              <div className="my-2 border-t border-border/40" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 px-1">
                Admin
              </p>
              <button
                onClick={() => setUsersOpen(v => !v)}
                className={cn(
                  'group/users w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-xs transition-all duration-150',
                  usersOpen
                    ? 'bg-primary/10 text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Users className={cn(
                  'w-3.5 h-3.5 flex-shrink-0 transition-all duration-150',
                  usersOpen
                    ? 'text-primary'
                    : 'group-hover/users:text-primary group-hover/users:scale-110'
                )} />
                <span>Users</span>
                {usersOpen && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary transition-transform duration-150 group-hover/users:scale-125" />
                )}
              </button>
            </>
          )}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-3 border-t">
          <div className="flex items-center gap-2 mb-2 px-1 group/avatar">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 transition-all duration-150 group-hover/avatar:ring-2 group-hover/avatar:ring-primary/25 group-hover/avatar:bg-primary/15">
              <span className="text-[10px] font-bold text-primary">
                {user?.displayName?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{user?.displayName}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="group/logout w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
          >
            <LogOut className="w-3.5 h-3.5 transition-transform duration-150 group-hover/logout:-translate-x-0.5 group-hover/logout:scale-110" />
            Sign out
          </button>

          {/* Version label doubles as a whisper-subtle connection indicator. */}
          <p
            title={statusTitle}
            className={cn(
              'mt-2 px-1 text-[10px] text-muted-foreground/70 cursor-default transition-opacity duration-300',
              offline && 'opacity-50',
            )}
          >
            v{appVersion}
          </p>
        </div>
      </aside>

      {/* Users slide-out panel */}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
    </>
  );
}
