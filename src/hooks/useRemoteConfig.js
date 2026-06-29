import { useState, useEffect, useCallback, useRef } from 'react';

// S5: REMOTE_CONFIG_URL and REMOTE_CONFIG_SECRET are NOT exposed to the renderer.
// All remote config fetching and heartbeat reporting go through the main process via IPC.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
const POLL_MS     = 5 * 60 * 1000;
const CACHE_KEY   = 'cqpm.remoteConfig';

const DEFAULT_CONFIG = {
  version:      APP_VERSION,
  minVersion:   '1.0.0',
  locked:       false,
  lockMessage:  '',
  announcement: { active: false, title: '', body: '', kind: 'info' },
  departments:  { serology: true, molecularBio: true, microbiology: true },
  features:     { matrix: true, adminPanel: true, export: true },
  updateAvailable: false,
  updateVersion:   '',
  updateNotes:     '',
  downloadUrl:     '',
};

function versionGte(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
  catch { return null; }
}

export const useRemoteConfig = ({ user } = {}) => {
  const [config,     setConfig]     = useState(loadCache() || DEFAULT_CONFIG);
  const [status,     setStatus]     = useState('idle');
  const [lastSync,   setLastSync]   = useState(null);
  const [configured, setConfigured] = useState(false);

  const identityRef = useRef(user);
  useEffect(() => { identityRef.current = user; }, [user]);

  const sendHeartbeat = useCallback((updateSeen) => {
    const u = identityRef.current;
    window.cqpm.config.heartbeat({
      event:      'heartbeat',
      user:       u?.username   || '(not signed in)',
      department: u?.department || 'n/a',
      payload:    { version: APP_VERSION, role: u?.role || 'none', updateSeen },
      timestamp:  new Date().toISOString(),
    }).catch(() => {});
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await window.cqpm.config.fetch();
      if (!res.configured) { setConfigured(false); return; }
      setConfigured(true);
      if (!res.ok || !res.data) { setStatus('offline'); return; }
      setConfig(res.data);
      localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
      setStatus('ok');
      setLastSync(Date.now());
      sendHeartbeat(res.data.updateAvailable || false);
    } catch {
      setStatus('offline');
    }
  }, [sendHeartbeat]);

  useEffect(() => {
    const initial = setTimeout(fetchConfig, 0);
    const id      = setInterval(fetchConfig, POLL_MS);
    return () => { clearTimeout(initial); clearInterval(id); };
  }, [fetchConfig]);

  const isUpdateRequired = !versionGte(APP_VERSION, config.minVersion || '1.0.0');

  return {
    config,
    status,
    lastSync,
    appVersion:   APP_VERSION,
    configured,
    isLocked:     config.locked || false,
    lockMessage:  config.lockMessage || '',
    announcement: config.announcement || DEFAULT_CONFIG.announcement,
    departments:  { ...DEFAULT_CONFIG.departments, ...(config.departments || {}) },
    features:     { ...DEFAULT_CONFIG.features,    ...(config.features    || {}) },
    isUpdateRequired,
    updateInfo: {
      available: config.updateAvailable || false,
      version:   config.updateVersion   || '',
      notes:     config.updateNotes     || '',
      url:       config.downloadUrl     || '',
      needed:    (config.updateAvailable || false) && !versionGte(APP_VERSION, config.updateVersion || '0'),
    },
    refetch: fetchConfig,
  };
};
