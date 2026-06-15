import { Download, ArrowUpCircle } from 'lucide-react';

/**
 * "Update available" bar driven by remote config. Appears only when the running
 * version is behind the published `updateVersion`. The download link points at
 * wherever the new installer is hosted (set from the cqpm-control panel).
 */
export default function UpdateBanner({ version, notes, url }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 animate-slide-up">
      <div className="flex items-start gap-3 min-w-0">
        <ArrowUpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">
            Update available{version ? ` — v${version}` : ''}
          </p>
          {notes && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{notes}</p>}
        </div>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      )}
    </div>
  );
}
