import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export function useMatrix(dept, fromDate, toDate) {
  const { token } = useAuth();
  const [params,   setParams]   = useState([]);
  const [entries,  setEntries]  = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [closures, setClosures] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes, sRes] = await Promise.all([
        window.cqpm.params.list(token, dept),
        window.cqpm.entries.getRange(token, dept, fromDate, toDate),
        window.cqpm.signoff.range(token, dept, fromDate, toDate),
      ]);
      setParams(pRes.params     ?? []);
      setEntries(eRes.entries   ?? []);
      setSignoffs(sRes.signoffs ?? []);
      setClosures(sRes.closures ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, dept, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return { params, entries, signoffs, closures, loading, reload: load };
}
