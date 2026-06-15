import { useState, useEffect, useCallback, useRef } from 'react';

const REMOTE_URL    = import.meta.env.VITE_REMOTE_CONFIG_URL;
const REMOTE_SECRET = import.meta.env.VITE_REMOTE_SECRET;
const APP_VERSION   = import.meta.env.VITE_APP_VERSION || '1.0.0';
const POLL_MS       = 5 * 60 * 1000;   // 5 minutes
const CACHE_KEY     = 'cqpm.remoteConfig';

// Derive the log endpoint from the config URL (/api/config → /api/log)
const LOG_URL = REMOTE_URL ? REMOTE_URL.replace(/\/api\/config$/, '/api/log') : null;

/**
 * Default config — mirrors cqpm-control/lib/defaultConfig.js.
 * Used until the first successful fetch, and whenever the backend is unreachable.
 */
const DEFAULT_CONFIG = {
  version:     APP_VERSION,
  minVersion:  '1.0.0',
  locked:      false,
  lockMessage: '',
  announcement: { active: false, title: '', body: '', kind: 'info' },
  departments: { serology: true, molecularBio: true, microbiology: true },
  features:    { matrix: true, adminPanel: true, export: true },
  updateAvailable: false,
  updateVersion:   '',
  updateNotes:     '',
  downloadUrl:     '',
};

/** Returns true if semver a >= b */
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

/**
 * Polls the cqpm-control backend for remote config (kill switch, announcements,
 * feature flags, update notices) and reports a presence heartbeat.
 *
 * @param {{ user?: { username?: string, role?: string, department?: string } }} opts
 *   The signed-in user, so the heartbeat can report who is online (multi-user presence).
 */
export const useRemoteConfig = ({ user } = {}) => {
  const [config, setConfig] = useState(loadCache() || DEFAULT_CONFIG);
  const [status, setStatus] = useState('idle'); // 'idle' | 'ok' | 'offline'
  const [lastSync, setLastSync] = useState(null);

  // Keep the latest identity in a ref so the polling closure always sees it
  // without restarting the interval on every login/logout.
  const identityRef = useRef(user);
  useEffect(() => { identityRef.current = user; }, [user]);

  /** Fire-and-forget presence heartbeat — never throws, never blocks the poll */
  const sendHeartbeat = useCallback((updateSeen) => {
    if (!LOG_URL || !REMOTE_SECRET) return;
    const u = identityRef.current;
    fetch(LOG_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${REMOTE_SECRET}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        event:      'heartbeat',
        user:       u?.username   || '(not signed in)',
        department: u?.department || 'n/a',
        payload:    { version: APP_VERSION, role: u?.role || 'none', updateSeen },
        timestamp:  new Date().toISOString(),
      }),
    }).catch(() => { /* non-fatal */ });
  }, []);

  const fetchConfig = useCallback(async () => {
    // If env vars are not set (dev without .env) skip silently — app runs Local.
    if (!REMOTE_URL || !REMOTE_SECRET) return;

    try {
      const res = await fetch(REMOTE_URL, {
        headers: { Authorization: `Bearer ${REMOTE_SECRET}` },
        cache:   'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      setStatus('ok');
      setLastSync(Date.now());
      sendHeartbeat(data.updateAvailable || false);
    } catch {
      // Keep using cached config — don't crash the app on network failure.
      setStatus('offline');
    }
  }, [sendHeartbeat]);

  useEffect(() => {
    // Defer initial fetch off the render cycle so setState happens async.
    const initial = setTimeout(fetchConfig, 0);
    const id = setInterval(fetchConfig, POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [fetchConfig]);

  const isUpdateRequired = !versionGte(APP_VERSION, config.minVersion || '1.0.0');

  return {
    config,
    status,
    lastSync,
    appVersion:   APP_VERSION,
    configured:   !!(REMOTE_URL && REMOTE_SECRET),
    isLocked:     config.locked || false,
    lockMessage:  config.lockMessage || '',
    announcement: config.announcement || DEFAULT_CONFIG.announcement,
    departments:  { ...DEFAULT_CONFIG.departments, ...(config.departments || {}) },
    features:     { ...DEFAULT_CONFIG.features, ...(config.features || {}) },
    isUpdateRequired,
    updateInfo: {
      available: config.updateAvailable || false,
      version:   config.updateVersion   || '',
      notes:     config.updateNotes     || '',
      url:       config.downloadUrl     || '',
      // Only show the banner when the running version is actually behind.
      // Once the user installs the update, APP_VERSION >= updateVersion → banner disappears.
      needed:    (config.updateAvailable || false) && !versionGte(APP_VERSION, config.updateVersion || '0'),
    },
    refetch: fetchConfig,
  };
};
