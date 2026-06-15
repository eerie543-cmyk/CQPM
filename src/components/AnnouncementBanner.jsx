import { Info, AlertTriangle, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Broadcast banner driven by remote config `announcement`.
 * `kind` controls the tone: info | warning | danger.
 */
const KINDS = {
  info:    { icon: Info,         ring: 'border-sky-500/40',    tint: 'bg-sky-500/10',    text: 'text-sky-400'    },
  warning: { icon: AlertTriangle,ring: 'border-amber-500/40',  tint: 'bg-amber-500/10',  text: 'text-amber-400'  },
  danger:  { icon: AlertOctagon, ring: 'border-destructive/50',tint: 'bg-destructive/10',text: 'text-destructive'},
};

export default function AnnouncementBanner({ title, body, kind = 'info' }) {
  const k = KINDS[kind] || KINDS.info;
  const Icon = k.icon;
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border px-4 py-3 animate-slide-up',
      k.ring, k.tint,
    )}>
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', k.text)} />
      <div className="min-w-0">
        {title && <p className={cn('text-xs font-semibold', k.text)}>{title}</p>}
        {body && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}
