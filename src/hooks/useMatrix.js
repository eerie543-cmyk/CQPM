import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export function useMatrix(dept, fromDate, toDate) {
  const { token } = useAuth();
  const [params,  setParams]  = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes] = await Promise.all([
        window.cqpm.params.list(token, dept),
        window.cqpm.entries.getRange(token, dept, fromDate, toDate),
      ]);
      setParams(pRes.params   ?? []);
      setEntries(eRes.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, dept, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return { params, entries, loading, reload: load };
}
