import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

const MOCK_PARAMS = {
  serology: [
    { id: 1, name: 'Daily QC Run',          frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'checkbox', critical: 1, description: 'Run positive & negative controls' },
    { id: 2, name: 'Reagent Check',         frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'checkbox', critical: 0, description: 'Check reagent expiry and lot numbers' },
    { id: 3, name: 'Water Bath Temp',       frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'numeric',  critical: 1, description: 'Log water bath temp (37°C ± 0.5)', unit: '°C' },
    { id: 4, name: 'Centrifuge Maintenance',frequency: 'weekly',  days_of_week: '1',  day_of_month: null, entry_type: 'checkbox', critical: 0, description: 'Weekly centrifuge check' },
    { id: 5, name: 'Reagent Lot Validation',frequency: 'monthly', days_of_week: null, day_of_month: 1,    entry_type: 'checkbox', critical: 0, description: 'Validate new lot before use' },
  ],
  molecularBio: [
    { id: 6,  name: 'PCR Controls',         frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'checkbox', critical: 1, description: 'Positive, negative & internal ctrl' },
    { id: 7,  name: 'Extraction QC',        frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'checkbox', critical: 1, description: 'Check extraction efficiency' },
    { id: 8,  name: 'Contamination Check',  frequency: 'weekly',  days_of_week: '1,3,5', day_of_month: null, entry_type: 'checkbox', critical: 0, description: 'Environmental contamination monitoring' },
    { id: 9,  name: 'Thermocycler Check',   frequency: 'weekly',  days_of_week: '1',  day_of_month: null, entry_type: 'checkbox', critical: 0, description: 'Verify thermocycler performance' },
    { id: 10, name: 'PT Submission',        frequency: 'quarterly', days_of_week: null, day_of_month: null, entry_type: 'checkbox', critical: 0, description: 'External proficiency testing submission' },
  ],
  microbiology: [
    { id: 11, name: 'Media QC',             frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'checkbox', critical: 1, description: 'Quality check on prepared culture media' },
    { id: 12, name: 'Incubator Temp',       frequency: 'daily',   days_of_week: null, day_of_month: null, entry_type: 'numeric',  critical: 1, description: 'Log incubator temp (35–37°C)', unit: '°C' },
    { id: 13, name: 'Media Sterility Test', frequency: 'weekly',  days_of_week: '1',  day_of_month: null, entry_type: 'checkbox', critical: 1, description: 'Test sterility of prepared media' },
    { id: 14, name: 'Autoclave Validation', frequency: 'weekly',  days_of_week: '1,4', day_of_month: null, entry_type: 'checkbox', critical: 0, description: 'Validate autoclave cycle' },
    { id: 15, name: 'Antibiotic Disc Check',frequency: 'monthly', days_of_week: null, day_of_month: 1,    entry_type: 'checkbox', critical: 0, description: 'Check antibiotic disc potency' },
  ],
};

export function useMatrix(dept, fromDate, toDate) {
  const { token } = useAuth();
  const [params,  setParams]  = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (window.cqpm?.params?.list) {
        const [pRes, eRes] = await Promise.all([
          window.cqpm.params.list(token, dept),
          window.cqpm.entries.getRange(token, dept, fromDate, toDate),
        ]);
        setParams(pRes.params  ?? []);
        setEntries(eRes.entries ?? []);
      } else {
        // Browser preview mock
        setParams(MOCK_PARAMS[dept] ?? []);
        setEntries([]);
      }
    } finally {
      setLoading(false);
    }
  }, [token, dept, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return { params, entries, loading, reload: load };
}
