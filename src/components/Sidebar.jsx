import { FlaskConical, LayoutGrid, Settings, Users, LogOut, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const DEPTS = [
  { id: 'serology',     label: 'Serology',         color: 'bg-red-500'    },
  { id: 'molecularBio', label: 'Molecular Biology', color: 'bg-sky-500'    },
  { id: 'microbiology', label: 'Microbiology',      color: 'bg-yellow-500' },
];

const NAV = [
  { id: 'matrix',     label: 'Matrix',      icon: LayoutGrid },
  { id: 'parameters', label: 'Parameters',  icon: Settings },
  { id: 'users',      label: 'Users',       icon: Users, adminOnly: true },
];

export default function Sidebar({ page, onPage, activeDept, onDept, isAdmin, user }) {
  const { logout } = useAuth();
  const dept = DEPTS.find(d => d.id === activeDept);

  return (
    <aside className="w-56 flex-shrink-0 border-r bg-card flex flex-col">

      {/* Brand */}
      <div className="px-4 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">CQPM</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Quality Monitor</p>
          </div>
        </div>
      </div>

      {/* Department switcher */}
      <div className="px-3 py-3 border-b">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Department
        </p>
        {DEPTS.map(d => {
          const active = d.id === activeDept;
          const canSwitch = !!onDept;
          return (
            <button
              key={d.id}
              onClick={() => canSwitch && onDept(d.id)}
              disabled={!canSwitch}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-xs transition-colors',
                active
                  ? 'bg-primary/10 text-foreground font-medium'
                  : canSwitch
                    ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    : 'text-muted-foreground cursor-default opacity-50'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', d.color)} />
              <span className="truncate">{d.label}</span>
              {active && <ChevronRight className="w-3 h-3 ml-auto text-primary" />}
            </button>
          );
        })}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Navigation
        </p>
        {NAV.filter(n => !n.adminOnly || isAdmin).map(n => {
          const Icon = n.icon;
          const active = page === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onPage(n.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-xs transition-colors',
                active
                  ? 'bg-primary/10 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-primary' : '')} />
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-3 border-t">
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
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
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
