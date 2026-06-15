const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
  findByUsername, listUsers, insertUser, setPasswordHash, deleteUser,
  listParameters, allParameters, insertParameter, updateParameter, deleteParameter,
  getEntriesForRange, upsertEntry,
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

app.whenReady().then(createWindow);

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

// ── Auth: Login ───────────────────────────────────────────────────
ipcMain.handle('auth:login', async (_e, { username, password } = {}) => {
  if (!username?.trim() || !password) return { error: 'Username and password are required.' };

  const user = findByUsername(username.trim());
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

  const user = findByUsername(payload.username);
  if (!user) return { error: 'User not found.' };

  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) return { error: 'Current password is incorrect.' };

  if (!newPassword || newPassword.length < 8)
    return { error: 'New password must be at least 8 characters.' };

  const hash = await bcrypt.hash(newPassword, 12);
  setPasswordHash(user.id, hash);
  return { success: true };
});

// ── Admin: List Users ─────────────────────────────────────────────
ipcMain.handle('auth:list-users', (_e, token) => {
  try {
    const payload = verifyToken(token);
    if (payload.role !== 'admin') return { error: 'Unauthorized.' };
    return { users: listUsers() };
  } catch {
    return { error: 'Session expired.' };
  }
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
    insertUser({
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
ipcMain.handle('auth:delete-user', (_e, { token, userId } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (payload.sub === userId) return { error: 'Cannot delete your own account.' };
  deleteUser(userId);
  return { success: true };
});

// ── Parameters: List (by dept) ────────────────────────────────────
ipcMain.handle('params:list', (_e, { token, dept } = {}) => {
  try { verifyToken(token); } catch { return { error: 'Session expired.' }; }
  return { params: listParameters(dept) };
});

// ── Parameters: All (admin) ───────────────────────────────────────
ipcMain.handle('params:all', (_e, { token } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  return { params: allParameters() };
});

// ── Parameters: Create (admin) ────────────────────────────────────
ipcMain.handle('params:create', (_e, { token, data } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  if (!data?.name || !data?.department)
    return { error: 'Name and department are required.' };
  if (data.scheduleType !== 'specific' && !data.frequency)
    return { error: 'Frequency is required for frequency-based parameters.' };
  if (data.scheduleType === 'specific' && !data.specificDates)
    return { error: 'At least one specific date is required.' };
  const result = insertParameter(data);
  return { success: true, id: result.lastInsertRowid };
});

// ── Parameters: Update (admin) ────────────────────────────────────
ipcMain.handle('params:update', (_e, { token, id, fields } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  updateParameter(id, fields);
  return { success: true };
});

// ── Parameters: Remove (admin, soft delete) ───────────────────────
ipcMain.handle('params:remove', (_e, { token, id } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (payload.role !== 'admin') return { error: 'Unauthorized.' };
  deleteParameter(id);
  return { success: true };
});

// ── Entries: Get range ────────────────────────────────────────────
ipcMain.handle('entries:get-range', (_e, { token, dept, from, to } = {}) => {
  try { verifyToken(token); } catch { return { error: 'Session expired.' }; }
  return { entries: getEntriesForRange(dept, from, to) };
});

// ── Entries: Save ─────────────────────────────────────────────────
ipcMain.handle('entries:save', (_e, { token, entry } = {}) => {
  let payload;
  try { payload = verifyToken(token); } catch { return { error: 'Session expired.' }; }
  if (!entry?.parameterId || !entry?.slotDate) return { error: 'Parameter and date required.' };
  upsertEntry({ ...entry, doneById: payload.sub, doneByName: payload.displayName });
  return { success: true };
});
