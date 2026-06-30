const path = require('path');
const fs = require('fs');
// Load environment. Packaged builds read resources/.env (placed via electron-builder
// extraResources); in dev we read the project-root .env. First existing file wins.
for (const envPath of [
  process.resourcesPath ? path.join(process.resourcesPath, '.env') : null,
  path.join(__dirname, '..', '.env'),
]) {
  if (envPath && fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}
const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const {
  cleanupOnStartup, checkForUpdate, downloadUpdate,
  cancelDownload, applyAndRestart, hasPending,
} = require('./updater');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { buildComplianceWorkbook } = require('./excelReport');
const {
  ensureSeed, ping,
  findByUsername, listUsers, insertUser, setPasswordHash, deleteUser,
  listParameters, allParameters, insertParameter, updateParameter, deleteParameter,
  getEntriesForRange, upsertEntry, reviewEntry,
  getSignoff, getSignoffsForRange, submitDay, approveDay, reopenDay, listPendingSignoffs,
  getClosure, listClosures, closeMonth, reopenMonth, dayLockReason,
  submitParamRequest, listParamRequests, reviewParamRequest,
  getMetricsData,
} = require('./db');
const { signToken, verifyToken } = require('./auth');

const isDev = !app.isPackaged;

// Windows: pin app identity so the taskbar icon matches the .exe icon
if (process.platform === 'win32') app.setAppUserModelId('com.aadvik.cqpm');

const iconPath = isDev
  ? path.join(__dirname, '..', 'favicon.ico')
  : path.join(process.resourcesPath, 'favicon.ico');

// Remote config — env vars read in main process only (never exposed to renderer)
const REMOTE_CONFIG_URL    = process.env.REMOTE_CONFIG_URL;
const REMOTE_CONFIG_SECRET = process.env.REMOTE_CONFIG_SECRET;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    show: false,
    backgroundColor: '#09090b',
  });

  if (isDev) {
    win.loadURL('http://localhost:5174');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    if (!isDev) {
      // S4: disable DevTools in production builds
      win.setMenu(null);
      win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') event.preventDefault();
        if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') event.preventDefault();
      });
      win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
    }
  });
}

app.whenReady().then(async () => {
  cleanupOnStartup();
  try {
    await ensureSeed();
  } catch (err) {
    console.error('[CQPM] Database seed/connection failed:', err.message);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Window controls (frameless titlebar) ──────────────────────────
ipcMain.handle('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.handle('window:toggle-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  if (w.isMaximized()) { w.unmaximize(); return false; }
  w.maximize();
  return true;
});
ipcMain.handle('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.handle('window:is-maximized', (e) =>
  BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
);

// ── DB health ping (no auth — connectivity check only) ────────────
ipcMain.handle('db:ping', async () => {
  try { await ping(); return { ok: true }; }
  catch { return { ok: false }; }
});

// ── Auth: Login ───────────────────────────────────────────────────
ipcMain.handle('auth:login', async (_e, { username, password } = {}) => {
  if (!username?.trim() || !password) return { error: 'Username and password are required.' };

  let user;
  try { user = await findByUsername(username.trim()); }
  catch (err) { return { error: 'Cannot reach the database. Check your connection.' }; }
  if (!user) return { error: 'Invalid username or password.' };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { error: 'Invalid username or password.' };

  const payload = {
    sub:         user.id,
    username:    user.username,
    displayName: user.display_name,
    role:        user.role,
    department:  user.department,
  };

  const token = signToken(payload);

  return {
    token,
    user: { ...payload },
    mustChangePassword: user.must_change_password === 1,
  };
});

// ── Auth: Verify ──────────────────────────────────────────────────
ipcMain.handle('auth:verify', (_e, token) => {
  try {
    const payload = verifyToken(token);
    return { valid: true, user: payload };
  } catch {
    return { valid: false };
  }
});

// ── Auth: Change Password ─────────────────────────────────────────
ipcMain.handle('auth:change-password', async (_e, { token, oldPassword, newPassword } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }

  const user = await findByUsername(payload.username);
  if (!user) return { error: 'User not found.' };

  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) return { error: 'Current password is incorrect.' };

  if (!newPassword || newPassword.length < 8)
    return { error: 'New password must be at least 8 characters.' };

  const hash = await bcrypt.hash(newPassword, 12);
  await setPasswordHash(user.id, hash);
  return { success: true };
});

// ── Admin: List Users ─────────────────────────────────────────────
ipcMain.handle('auth:list-users', async (_e, token) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { return { users: await listUsers() }; }
  catch (err) { return { error: err.message }; }
});

// ── Admin: Create User ────────────────────────────────────────────
ipcMain.handle('auth:create-user', async (_e, { token, userData } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };

  const { username, password, role, department, displayName } = userData || {};

  if (!username?.trim() || !password || !role)
    return { error: 'Username, password and role are required.' };
  if (password.length < 8)
    return { error: 'Password must be at least 8 characters.' };
  if (role === 'staff' && !department)
    return { error: 'Staff must be assigned to a department.' };

  try {
    const hash = await bcrypt.hash(password, 12);
    await insertUser({
      username:     username.trim(),
      passwordHash: hash,
      role,
      department:   department || null,
      displayName:  displayName?.trim() || username.trim(),
      mustChange:   true,
    });
    return { success: true };
  } catch (err) {
    if (err.message?.includes('UNIQUE'))
      return { error: 'Username already exists.' };
    return { error: 'Failed to create user.' };
  }
});

// ── Admin: Delete User ────────────────────────────────────────────
ipcMain.handle('auth:delete-user', async (_e, { token, userId } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (payload.sub === userId) return { error: 'Cannot delete your own account.' };
  try { await deleteUser(userId); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Parameters: List (by dept) ────────────────────────────────────
ipcMain.handle('params:list', async (_e, { token, dept } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  // S2: staff can only read their own department
  const safeDept = payload.role === 'staff' ? payload.department : dept;
  try { return { params: await listParameters(safeDept) }; }
  catch (err) { return { error: err.message }; }
});

// ── Parameters: All (admin) ───────────────────────────────────────
ipcMain.handle('params:all', async (_e, { token } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { return { params: await allParameters() }; }
  catch (err) { return { error: err.message }; }
});

// ── Parameters: Create (admin) ────────────────────────────────────
ipcMain.handle('params:create', async (_e, { token, data } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (!data?.name || !data?.department)
    return { error: 'Name and department are required.' };
  // U3: length limits
  if (data.name.length > 200) return { error: 'Parameter name too long (max 200 chars).' };
  if (data.description && data.description.length > 1000) return { error: 'Description too long (max 1000 chars).' };
  if (data.scheduleType !== 'specific' && !data.frequency)
    return { error: 'Frequency is required for frequency-based parameters.' };
  if (data.scheduleType === 'specific' && !data.specificDates)
    return { error: 'At least one specific date is required.' };
  // U4: numeric boundary validation
  if (data.minValue != null && data.minValue !== '') {
    if (!Number.isFinite(Number(data.minValue))) return { error: 'Invalid minimum value.' };
  }
  if (data.maxValue != null && data.maxValue !== '') {
    if (!Number.isFinite(Number(data.maxValue))) return { error: 'Invalid maximum value.' };
  }
  try {
    const result = await insertParameter(data);
    return { success: true, id: result.lastInsertRowid };
  } catch (err) { return { error: err.message }; }
});

// ── Parameters: Update (admin) ────────────────────────────────────
const PARAM_UPDATE_ALLOWED = [
  'name', 'description', 'schedule_type', 'frequency', 'days_of_week',
  'day_of_month', 'specific_dates', 'entry_type', 'unit', 'min_value',
  'max_value', 'critical', 'requires_review', 'sort_order', 'active',
  'start_date', 'end_date',
];
ipcMain.handle('params:update', async (_e, { token, id, fields } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  // S8: whitelist updatable columns
  const safeFields = Object.fromEntries(
    Object.entries(fields || {}).filter(([k]) => PARAM_UPDATE_ALLOWED.includes(k))
  );
  try { await updateParameter(id, safeFields); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Parameters: Remove (admin, soft delete) ───────────────────────
ipcMain.handle('params:remove', async (_e, { token, id } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { await deleteParameter(id); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Entries: Get range ────────────────────────────────────────────
ipcMain.handle('entries:get-range', async (_e, { token, dept, from, to } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  // S2: staff can only read their own department
  const safeDept = payload.role === 'staff' ? payload.department : dept;
  try { return { entries: await getEntriesForRange(safeDept, from, to) }; }
  catch (err) { return { error: err.message }; }
});

// ── Entries: Save ─────────────────────────────────────────────────
const LOCK_MESSAGES = {
  'month-closed': 'This month is closed. An admin must reopen the month to make changes.',
  'approved':     'This day has been approved and locked. An admin must reopen it to edit.',
  'submitted':    'This day was submitted for review and is locked. Ask an admin to reopen it.',
};
ipcMain.handle('entries:save', async (_e, { token, entry } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (!entry?.parameterId || !entry?.slotDate) return { error: 'Parameter and date required.' };

  // S3: staff can only write entries for their own department
  if (payload.role === 'staff' && payload.department !== entry.department)
    return { error: 'You can only record entries for your own department.' };

  // U4: validate numeric value; U3: cap notes length
  if (entry.value !== null && entry.value !== undefined && entry.value !== '') {
    if (!Number.isFinite(Number(entry.value))) return { error: 'Invalid entry value.' };
  }
  if (entry.notes && entry.notes.length > 2000) return { error: 'Notes too long (max 2000 chars).' };

  try {
    const lock = await dayLockReason(entry.department, entry.slotDate, payload.role);
    if (lock) return { error: LOCK_MESSAGES[lock] };

    await upsertEntry({ ...entry, doneById: payload.sub, doneByName: payload.displayName });
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

// ── Entries: Review result (admin) ───────────────────────────────
ipcMain.handle('entries:review', async (_e, { token, entryId, result, note } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (!entryId) return { error: 'Entry required.' };
  if (!['pass', 'fail'].includes(result)) return { error: 'Result must be pass or fail.' };
  try {
    await reviewEntry({ entryId, result, note, reviewerId: payload.sub, reviewerName: payload.displayName });
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

// ── Sign-offs: range (for matrix lock indicators) ─────────────────
ipcMain.handle('signoff:range', async (_e, { token, dept, from, to } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  // S2: staff can only read their own department
  const safeDept = payload.role === 'staff' ? payload.department : dept;
  try {
    const [signoffs, closures] = await Promise.all([getSignoffsForRange(safeDept, from, to), listClosures(safeDept)]);
    return { signoffs, closures };
  } catch (err) { return { error: err.message }; }
});

// ── Sign-offs: get one day ────────────────────────────────────────
ipcMain.handle('signoff:get', async (_e, { token, dept, date } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  // S2: staff can only read their own department
  const safeDept = payload.role === 'staff' ? payload.department : dept;
  try {
    const [signoff, closure] = await Promise.all([getSignoff(safeDept, date), getClosure(safeDept, date.slice(0, 7))]);
    return { signoff: signoff || null, closed: !!closure };
  } catch (err) { return { error: err.message }; }
});

// ── Sign-offs: submit end-of-shift (staff or admin) ───────────────
ipcMain.handle('signoff:submit', async (_e, { token, dept, date } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (!dept || !date) return { error: 'Department and date required.' };
  // Staff can only sign off their own department
  if (payload.role === 'staff' && payload.department !== dept)
    return { error: 'You can only sign off your own department.' };
  try {
    if (await getClosure(dept, date.slice(0, 7))) return { error: 'That month is already closed.' };
    await submitDay(dept, date, payload.sub, payload.displayName);
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

// ── Sign-offs: pending queue (admin) ──────────────────────────────
ipcMain.handle('signoff:pending', async (_e, { token } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { return { pending: await listPendingSignoffs() }; }
  catch (err) { return { error: err.message }; }
});

// ── Sign-offs: approve (admin) ────────────────────────────────────
ipcMain.handle('signoff:approve', async (_e, { token, dept, date } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { await approveDay(dept, date, payload.sub, payload.displayName); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Sign-offs: reopen (admin) ─────────────────────────────────────
ipcMain.handle('signoff:reopen', async (_e, { token, dept, date } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { await reopenDay(dept, date, payload.displayName); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Month closures: list (admin) ──────────────────────────────────
ipcMain.handle('closure:list', async (_e, { token, dept } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { return { closures: await listClosures(dept) }; }
  catch (err) { return { error: err.message }; }
});

// ── Month closures: close (admin) ─────────────────────────────────
ipcMain.handle('closure:close', async (_e, { token, dept, month } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (!dept || !month) return { error: 'Department and month required.' };
  try { await closeMonth(dept, month, payload.sub, payload.displayName); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Month closures: reopen (admin) ────────────────────────────────
ipcMain.handle('closure:reopen', async (_e, { token, dept, month } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { await reopenMonth(dept, month); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

// ── Export: styled .xlsx compliance report (admin) ────────────────
ipcMain.handle('export:xlsx', async (e, { token, payload } = {}) => {
  let auth;
  try { auth = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (auth.role !== 'admin') return { error: 'Unauthorized.' };
  if (!payload?.rows) return { error: 'Nothing to export.' };

  const win = BrowserWindow.fromWebContents(e.sender);
  const dateTag = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Compliance Report',
    defaultPath: `CQPM_Compliance_${dateTag}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };

  try {
    const wb = buildComplianceWorkbook(ExcelJS, payload);
    await wb.xlsx.writeFile(result.filePath);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Parameter requests: submit (any authenticated user) ───────────
ipcMain.handle('paramreq:submit', async (_e, { token, data } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (!data?.name || !data?.department)
    return { error: 'Name and department are required.' };
  // U3: length limits
  if (data.name.length > 200) return { error: 'Parameter name too long (max 200 chars).' };
  if (data.description && data.description.length > 1000) return { error: 'Description too long (max 1000 chars).' };
  // U4: numeric boundary validation
  if (data.minValue != null && data.minValue !== '') {
    if (!Number.isFinite(Number(data.minValue))) return { error: 'Invalid minimum value.' };
  }
  if (data.maxValue != null && data.maxValue !== '') {
    if (!Number.isFinite(Number(data.maxValue))) return { error: 'Invalid maximum value.' };
  }
  // Staff may only request for their own department
  if (payload.role === 'staff' && payload.department !== data.department)
    return { error: 'You can only request parameters for your own department.' };
  try {
    const result = await submitParamRequest({
      ...data,
      // Always use the token department for staff (belt-and-suspenders)
      department:      payload.role === 'staff' ? payload.department : data.department,
      requestedById:   payload.sub,
      requestedByName: payload.displayName,
    });
    return { success: true, id: result.lastInsertRowid };
  } catch (err) { return { error: err.message }; }
});

// ── Parameter requests: list (admin only) ─────────────────────────
ipcMain.handle('paramreq:list', async (_e, { token, status } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try {
    const requests = await listParamRequests({ status: status || undefined });
    return { requests };
  } catch (err) { return { error: err.message }; }
});

// ── Parameter requests: review approve/reject (admin only) ────────
ipcMain.handle('paramreq:review', async (_e, { token, requestId, result, note } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (!requestId) return { error: 'Request ID required.' };
  if (!['approved', 'rejected'].includes(result)) return { error: 'Result must be approved or rejected.' };
  if (result === 'rejected' && !note?.trim()) return { error: 'A rejection reason is required.' };
  try {
    await reviewParamRequest({
      requestId,
      result,
      note:         note?.trim() || null,
      reviewerId:   payload.sub,
      reviewerName: payload.displayName,
    });
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

// ── Metrics (admin only) ──────────────────────────────────────────
ipcMain.handle('metrics:get', async (_e, { token } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { return { data: await getMetricsData() }; }
  catch (err) { return { error: err.message }; }
});

// ── Remote config: fetch + heartbeat (secret lives in main only) ──
// S5: renderer never sees REMOTE_CONFIG_SECRET — IPC proxies the requests.
ipcMain.handle('config:fetch', async () => {
  if (!REMOTE_CONFIG_URL || !REMOTE_CONFIG_SECRET) return { ok: false, configured: false, data: null };
  try {
    const res = await net.fetch(REMOTE_CONFIG_URL, {
      headers: { Authorization: `Bearer ${REMOTE_CONFIG_SECRET}` },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, configured: true, data: null };
    const data = await res.json();
    return { ok: true, configured: true, data };
  } catch {
    return { ok: false, configured: true, data: null };
  }
});

ipcMain.handle('config:heartbeat', async (_e, { event, user, department, payload: hbPayload, timestamp } = {}) => {
  if (!REMOTE_CONFIG_URL || !REMOTE_CONFIG_SECRET) return;
  const logUrl = REMOTE_CONFIG_URL.replace(/\/api\/config$/, '/api/log');
  try {
    await net.fetch(logUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REMOTE_CONFIG_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, user, department, payload: hbPayload, timestamp }),
    });
  } catch { /* non-fatal */ }
});

// ── Updater ───────────────────────────────────────────────────────
// S5: REMOTE_CONFIG_URL and REMOTE_CONFIG_SECRET stay in main only.
// The renderer triggers checks and downloads but never sees URLs or secrets.
ipcMain.handle('update:check', async () => {
  return checkForUpdate(REMOTE_CONFIG_URL, REMOTE_CONFIG_SECRET);
});

ipcMain.handle('update:download', async (e) => {
  const sender = e.sender;
  return downloadUpdate((progress) => {
    if (!sender.isDestroyed()) sender.send('update:progress', progress);
  });
});

ipcMain.handle('update:cancel',        ()  => cancelDownload());
ipcMain.handle('update:apply-restart', ()  => applyAndRestart());
ipcMain.handle('update:has-pending',   ()  => hasPending());
ipcMain.handle('update:version',       ()  => app.getVersion());
