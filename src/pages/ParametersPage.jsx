import { cn } from '@/lib/utils';

const DEPT_NAMES = {
  serology: 'Serology', molecularBio: 'Molecular Biology', microbiology: 'Microbiology'
};

export default function ParametersPage({ dept }) {
  return (
    <div className="p-6">
      <h1 className="text-base font-semibold mb-1">Parameters — {DEPT_NAMES[dept]}</h1>
      <p className="text-xs text-muted-foreground">Define and manage quality parameters for this department.</p>
      <div className="mt-8 flex items-center justify-center h-40 border rounded-lg border-dashed text-muted-foreground text-sm">
        Parameter management coming next
      </div>
    </div>
  );
}
