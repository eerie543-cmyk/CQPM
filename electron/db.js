// Data layer — backed by the shared Supabase (Postgres) database.
// The Electron main process talks to Supabase with the SERVICE-ROLE key, which
// bypasses row-level security. That key lives only here (backend side) and is
// never exposed to the renderer. Custom JWT auth still gates who may call what.

// Electron's main process runs on Node 20, which has no built-in WebSocket.
// The Supabase client always loads its realtime module (even when we only use
// the database), and that module needs a WebSocket. Provide the `ws` library.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = require('ws');
}

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

let _sb = null;
function sb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

// UTC "YYYY-MM-DD HH:MM:SS" — matches the format the app already parses.
function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// Throw on a Supabase error so callers' try/catch behave like the old sync code.
function must(res) {
  if (res.error) {
    const e = new Error(res.error.code === '23505' ? 'UNIQUE' : res.error.message);
    e.code = res.error.code;
    throw e;
  }
  return res.data;
}

// Seed the default admin once (called on startup).
async function ensureSeed() {
  const { count, error } = await sb().from('users').select('*', { count: 'exact', head: true });
  if (error) throw error;
  if (count && count > 0) return;
  const hash = bcrypt.hashSync('12345', 12);
  await sb().from('users').insert({
    username: 'archit', password_hash: hash, role: 'admin',
    department: null, display_name: 'Archit', must_change_password: 0,
    created_at: nowStr(),
  });
}

// ── Users ─────────────────────────────────────────────────────────
async function findByUsername(username) {
  const data = must(await sb().from('users').select('*').eq('username', username.toLowerCase()).maybeSingle());
  return data || undefined;
}
async function listUsers() {
  return must(await sb().from('users')
    .select('id, username, role, department, display_name, created_at')
    .order('created_at', { ascending: true }));
}
async function insertUser({ username, passwordHash, role, department, displayName, mustChange }) {
  return must(await sb().from('users').insert({
    username: username.toLowerCase(), password_hash: passwordHash, role,
    department: department || null, display_name: displayName,
    must_change_password: mustChange ? 1 : 0, created_at: nowStr(),
  }));
}
async function setPasswordHash(userId, hash) {
  must(await sb().from('users').update({ password_hash: hash, must_change_password: 0 }).eq('id', userId));
}
async function deleteUser(userId) {
  must(await sb().from('users').delete().eq('id', userId));
}

// ── Parameters ────────────────────────────────────────────────────
async function listParameters(department) {
  return must(await sb().from('parameters').select('*')
    .eq('department', department).eq('active', 1)
    .order('sort_order', { ascending: true }).order('id', { ascending: true }));
}
async function allParameters() {
  return must(await sb().from('parameters').select('*').eq('active', 1)
    .order('department', { ascending: true })
    .order('sort_order', { ascending: true }).order('id', { ascending: true }));
}
async function insertParameter({ department, name, description, scheduleType, frequency, daysOfWeek, dayOfMonth, specificDates, entryType, unit, minValue, maxValue, critical, sortOrder }) {
  const data = must(await sb().from('parameters').insert({
    department, name, description: description || null,
    schedule_type: scheduleType || 'frequency',
    frequency: frequency || null,
    days_of_week: daysOfWeek || null, day_of_month: dayOfMonth || null,
    specific_dates: specificDates || null,
    entry_type: entryType || 'checkbox', unit: unit || null,
    min_value: minValue ?? null, max_value: maxValue ?? null,
    critical: critical ? 1 : 0, sort_order: sortOrder || 0,
    created_at: nowStr(),
  }).select('id').single());
  return { lastInsertRowid: data.id };
}
async function updateParameter(id, fields) {
  must(await sb().from('parameters').update(fields).eq('id', id));
}
async function deleteParameter(id) {
  must(await sb().from('parameters').update({ active: 0 }).eq('id', id));
}

// ── Entries ───────────────────────────────────────────────────────
async function getEntriesForRange(department, fromDate, toDate) {
  // entries.department mirrors the parameter's department at write time,
  // so we can filter directly without a join.
  return must(await sb().from('entries').select('*')
    .eq('department', department)
    .gte('slot_date', fromDate).lte('slot_date', toDate)
    .order('slot_date', { ascending: true }));
}
async function upsertEntry({ parameterId, slotDate, status, value, notes, doneById, doneByName, department }) {
  must(await sb().from('entries').upsert({
    parameter_id: parameterId, slot_date: slotDate,
    status: status || 'done', value: value || null, notes: notes || null,
    done_by_id: doneById, done_by_name: doneByName, department,
    created_at: nowStr(),
  }, { onConflict: 'parameter_id,slot_date' }));
}

// ── Day sign-offs ─────────────────────────────────────────────────
async function getSignoff(department, slotDate) {
  return must(await sb().from('day_signoffs').select('*')
    .eq('department', department).eq('slot_date', slotDate).maybeSingle()) || undefined;
}
async function getSignoffsForRange(department, fromDate, toDate) {
  return must(await sb().from('day_signoffs').select('*')
    .eq('department', department)
    .gte('slot_date', fromDate).lte('slot_date', toDate));
}
async function submitDay(department, slotDate, userId, userName) {
  must(await sb().from('day_signoffs').upsert({
    department, slot_date: slotDate, status: 'submitted',
    submitted_by_id: userId, submitted_by_name: userName, submitted_at: nowStr(),
    approved_by_id: null, approved_by_name: null, approved_at: null,
  }, { onConflict: 'department,slot_date' }));
}
async function approveDay(department, slotDate, userId, userName) {
  must(await sb().from('day_signoffs')
    .update({ status: 'approved', approved_by_id: userId, approved_by_name: userName, approved_at: nowStr() })
    .eq('department', department).eq('slot_date', slotDate));
}
async function reopenDay(department, slotDate, userName) {
  must(await sb().from('day_signoffs')
    .update({ status: 'reopened', reopened_by_name: userName, reopened_at: nowStr(),
              approved_by_id: null, approved_by_name: null, approved_at: null })
    .eq('department', department).eq('slot_date', slotDate));
}
async function listPendingSignoffs() {
  return must(await sb().from('day_signoffs').select('*').eq('status', 'submitted')
    .order('slot_date', { ascending: false }).order('department', { ascending: true }));
}

// ── Month closures ────────────────────────────────────────────────
async function getClosure(department, month) {
  return must(await sb().from('month_closures').select('*')
    .eq('department', department).eq('month', month).maybeSingle()) || undefined;
}
async function listClosures(department) {
  return must(await sb().from('month_closures').select('*')
    .eq('department', department).order('month', { ascending: false }));
}
async function closeMonth(department, month, userId, userName) {
  must(await sb().from('month_closures').upsert({
    department, month, closed_by_id: userId, closed_by_name: userName, closed_at: nowStr(),
  }, { onConflict: 'department,month', ignoreDuplicates: true }));
}
async function reopenMonth(department, month) {
  must(await sb().from('month_closures').delete().eq('department', department).eq('month', month));
}

// ── Lock guard ────────────────────────────────────────────────────
// Returns a reason string if the day cannot be edited by this role, else null.
async function dayLockReason(department, slotDate, role) {
  if (await getClosure(department, slotDate.slice(0, 7))) return 'month-closed';
  const s = await getSignoff(department, slotDate);
  if (s) {
    if (s.status === 'approved')  return 'approved';
    if (s.status === 'submitted') return role === 'admin' ? null : 'submitted';
    // 'reopened' → unlocked
  }
  return null;
}

module.exports = {
  ensureSeed,
  findByUsername, listUsers, insertUser, setPasswordHash, deleteUser,
  listParameters, allParameters, insertParameter, updateParameter, deleteParameter,
  getEntriesForRange, upsertEntry,
  getSignoff, getSignoffsForRange, submitDay, approveDay, reopenDay, listPendingSignoffs,
  getClosure, listClosures, closeMonth, reopenMonth, dayLockReason,
};
