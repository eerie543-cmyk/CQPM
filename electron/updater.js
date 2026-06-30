'use strict';

const { app, net } = require('electron');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');
const { spawn }    = require('child_process');

const RESOURCES = process.resourcesPath;
const ASAR_PATH = path.join(RESOURCES, 'app.asar');
const PENDING   = path.join(RESOURCES, 'app.asar.pending');
const BACKUP    = path.join(RESOURCES, 'app.asar.backup');
const TMP       = path.join(RESOURCES, 'app.asar.tmp');

// Stored by checkForUpdate() — never exposed to renderer
let _pendingInfo = null;   // { asarUrl, sha256, version, notes }
let _abortCtrl   = null;

// Safely remove a file — never throws
function rm(p) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

// SHA-256 hash of a file
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data',  chunk => hash.update(chunk));
    stream.on('end',   ()    => resolve(hash.digest('hex')));
    stream.on('error', err   => reject(err));
  });
}

// True if semver `remote` is strictly newer than `current`.
// Strips pre-release labels before comparing numeric parts.
function isNewer(remote, current) {
  const parse = v =>
    String(v || '0')
      .split('-')[0]            // drop pre-release suffix (e.g. -beta.1)
      .split('.')
      .map(n => parseInt(n, 10) || 0);
  const r = parse(remote);
  const c = parse(current);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    if ((r[i] || 0) > (c[i] || 0)) return true;
    if ((r[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Called at very start of app.whenReady() — cleans stale temp files from a
 * previous crash so the app never boots with a corrupt partial download.
 */
function cleanupOnStartup() {
  rm(TMP);
  // If backup exists but pending doesn't, last update was applied cleanly
  if (fs.existsSync(BACKUP) && !fs.existsSync(PENDING)) rm(BACKUP);
}

/**
 * Fetches the remote config, compares versions, and stores the ASAR URL
 * internally (never returned to renderer). Returns { available, version, notes }.
 */
async function checkForUpdate(configUrl, secret) {
  if (!configUrl || !secret) return { available: false };
  try {
    const res = await net.fetch(configUrl, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    if (!res.ok) return { available: false };
    const data = await res.json();

    if (!data.asarUrl || !data.updateVersion) return { available: false };

    const current = app.getVersion();
    if (!isNewer(data.updateVersion, current)) return { available: false };

    // Store internally — renderer never sees asarUrl
    _pendingInfo = {
      asarUrl: data.asarUrl,
      sha256:  data.sha256  || '',
      version: data.updateVersion,
      notes:   data.updateNotes || '',
    };

    return { available: true, version: data.updateVersion, notes: data.updateNotes || '' };
  } catch {
    return { available: false };
  }
}

/**
 * Streams the ASAR from the stored URL → app.asar.tmp, verifies SHA-256 (if
 * provided), then atomically renames to app.asar.pending.
 *
 * Retries up to 3 times with exponential backoff. Calls sendProgress(data)
 * to push real-time state back to the renderer via webContents.send.
 *
 * Returns { success } | { cancelled } | { error: string }
 */
async function downloadUpdate(sendProgress) {
  if (!_pendingInfo?.asarUrl) {
    return { error: 'No update queued. Run check first.' };
  }

  const { asarUrl, sha256: expectedHash } = _pendingInfo;
  _abortCtrl = new AbortController();

  const MAX = 3;

  for (let attempt = 1; attempt <= MAX; attempt++) {
    rm(TMP);
    try {
      sendProgress({ state: 'downloading', percent: 0, downloaded: 0, total: 0, speed: 0, attempt, maxAttempts: MAX });

      const res = await net.fetch(asarUrl, { signal: _abortCtrl.signal });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

      const total      = parseInt(res.headers.get('content-length') || '0', 10);
      let   downloaded = 0;
      let   lastBytes  = 0;
      let   lastTime   = Date.now();

      const fileStream = fs.createWriteStream(TMP);
      const reader     = res.body.getReader();

      // Pump the ReadableStream into the file, reporting progress
      await new Promise((resolve, reject) => {
        (async () => {
          try {
            while (true) {
              if (_abortCtrl.signal.aborted) {
                reader.cancel();
                fileStream.destroy();
                return reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
              }

              const { done, value } = await reader.read();
              if (done) break;

              downloaded += value.length;
              fileStream.write(value);

              const now = Date.now();
              if (now - lastTime >= 350) {
                const speed = ((downloaded - lastBytes) / (now - lastTime)) * 1000;
                lastBytes = downloaded;
                lastTime  = now;
                sendProgress({
                  state: 'downloading',
                  percent: total ? Math.round((downloaded / total) * 100) : 0,
                  downloaded, total, speed,
                  attempt, maxAttempts: MAX,
                });
              }
            }
            await new Promise((ok, fail) => fileStream.end(err => err ? fail(err) : ok()));
            resolve();
          } catch (err) {
            fileStream.destroy();
            reject(err);
          }
        })();
      });

      // Verify integrity before staging
      if (expectedHash) {
        sendProgress({ state: 'verifying', percent: 100, downloaded, total, speed: 0 });
        const actual = await sha256File(TMP);
        if (actual !== expectedHash.toLowerCase()) {
          rm(TMP);
          throw new Error('Integrity check failed — file is corrupt or was tampered with');
        }
      }

      // Atomic stage: tmp → pending
      fs.renameSync(TMP, PENDING);
      sendProgress({ state: 'ready', percent: 100, downloaded, total, speed: 0 });
      return { success: true };

    } catch (err) {
      rm(TMP);

      if (_abortCtrl.signal.aborted || err.name === 'AbortError') {
        sendProgress({ state: 'cancelled' });
        return { cancelled: true };
      }

      if (attempt >= MAX) {
        const msg = err.message || 'Download failed';
        sendProgress({ state: 'error', error: msg });
        return { error: msg };
      }

      // Exponential backoff before retry: 2 s, 4 s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return { error: 'Download failed after all retries' };
}

/**
 * Aborts an in-progress download immediately.
 */
function cancelDownload() {
  _abortCtrl?.abort();
}

/**
 * Spawns a detached PowerShell script that — after this process exits —
 * backs up the current ASAR, swaps in the pending one, and re-launches the
 * app. Falls back to the backup if anything goes wrong so the app stays
 * runnable. Then calls app.exit(0).
 *
 * Returns false if there is no pending file to apply.
 */
function applyAndRestart() {
  if (!fs.existsSync(PENDING)) return false;

  const exe  = process.execPath;
  const name = path.basename(exe, '.exe');

  // Escape backslashes and double-quotes for use inside a PS double-quoted string
  const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const ps = `
$name    = "${esc(name)}"
$asar    = "${esc(ASAR_PATH)}"
$pending = "${esc(PENDING)}"
$backup  = "${esc(BACKUP)}"
$exe     = "${esc(exe)}"

# Wait for the old process to fully exit (up to 15 s)
$i = 0
while ((Get-Process -Name $name -ErrorAction SilentlyContinue) -and $i -lt 75) {
  Start-Sleep -Milliseconds 200
  $i++
}
Start-Sleep -Milliseconds 500

try {
  # Back up current ASAR in case we need to roll back
  Copy-Item -Force $asar $backup
  # Swap in the new ASAR
  Move-Item -Force $pending $asar
  # Success — drop the backup
  Remove-Item -Force $backup -ErrorAction SilentlyContinue
} catch {
  # Rollback: restore backup so the app is still runnable
  if (Test-Path $backup) {
    try { Copy-Item -Force $backup $asar } catch {}
  }
  if (Test-Path $pending) {
    try { Remove-Item -Force $pending } catch {}
  }
}

# Always re-launch regardless of swap outcome
Start-Process $exe
`.trim();

  const child = spawn('powershell.exe', [
    '-WindowStyle',    'Hidden',
    '-NonInteractive',
    '-Command', ps,
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  app.exit(0);
  return true;
}

/**
 * Returns true if a staged update is waiting to be applied.
 * Used by the renderer on mount to immediately show the "ready" state.
 */
function hasPending() {
  return fs.existsSync(PENDING);
}

module.exports = {
  cleanupOnStartup,
  checkForUpdate,
  downloadUpdate,
  cancelDownload,
  applyAndRestart,
  hasPending,
};
