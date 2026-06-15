import { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

const win = () => window.cqpm?.win;

/**
 * Frameless-window title bar. The whole bar is a drag region (move the window);
 * the buttons opt out via WebkitAppRegion 'no-drag'. Always visible — login,
 * locked, and the main app — so the window can always be moved or closed.
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    win()?.isMaximized().then(setMaximized).catch(() => {});
  }, []);

  const onMinimize = () => win()?.minimize();
  const onToggle   = async () => { const m = await win()?.toggleMaximize(); setMaximized(!!m); };
  const onClose    = () => win()?.close();

  const btn = 'flex h-full w-11 items-center justify-center text-muted-foreground transition-colors';

  return (
    <div
      className="flex h-9 flex-shrink-0 items-center justify-between border-b bg-card select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-3">
        <FlaskConical className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold tracking-tight">CQPM</span>
        <span className="text-[10px] text-muted-foreground">Quality Monitor</span>
      </div>

      {/* Window controls */}
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' }}>
        <button className={cn(btn, 'hover:bg-muted hover:text-foreground')} onClick={onMinimize} title="Minimize">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button className={cn(btn, 'hover:bg-muted hover:text-foreground')} onClick={onToggle} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button className={cn(btn, 'hover:bg-destructive hover:text-destructive-foreground')} onClick={onClose} title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
