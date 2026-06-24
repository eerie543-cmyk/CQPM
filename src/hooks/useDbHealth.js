import { useState, useEffect } from 'react';

/**
 * Polls the backend's cheap DB ping every 20s so the UI can show a banner when
 * the shared cloud database is unreachable. Starts optimistic (online).
 */
export function useDbHealth() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await window.cqpm?.db?.ping?.();
        if (alive) setOnline(!!r?.ok);
      } catch {
        if (alive) setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return online;
}
