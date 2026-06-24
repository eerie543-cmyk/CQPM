const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
} = require('./db');
const { signToken, verifyToken } = require('./auth');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
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

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(async () => {
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
  try { verifyToken(token); } catch { return { error: 'Session expired.' }; }
  try { return { params: await listParameters(dept) }; }
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
  if (data.scheduleType !== 'specific' && !data.frequency)
    return { error: 'Frequency is required for frequency-based parameters.' };
  if (data.scheduleType === 'specific' && !data.specificDates)
    return { error: 'At least one specific date is required.' };
  try {
    const result = await insertParameter(data);
    return { success: true, id: result.lastInsertRowid };
  } catch (err) { return { error: err.message }; }
});

// ── Parameters: Update (admin) ────────────────────────────────────
ipcMain.handle('params:update', async (_e, { token, id, fields } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  try { await updateParameter(id, fields); return { success: true }; }
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
  try { verifyToken(token); } catch { return { error: 'Session expired.' }; }
  try { return { entries: await getEntriesForRange(dept, from, to) }; }
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

  try {
    // Locking: block edits to submitted/approved/closed days
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
  try { verifyToken(token); } catch { return { error: 'Session expired.' }; }
  try {
    const [signoffs, closures] = await Promise.all([getSignoffsForRange(dept, from, to), listClosures(dept)]);
    return { signoffs, closures };
  } catch (err) { return { error: err.message }; }
});

// ── Sign-offs: get one day ────────────────────────────────────────
ipcMain.handle('signoff:get', async (_e, { token, dept, date } = {}) => {
  try { verifyToken(token); } catch { return { error: 'Session expired.' }; }
  try {
    const [signoff, closure] = await Promise.all([getSignoff(dept, date), getClosure(dept, date.slice(0, 7))]);
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
