'use strict';
// One-time migration: adds start_date and end_date to parameters table.
// Run from the CQPM project root: node scripts/migrate-add-dates.cjs

if (!globalThis.WebSocket) globalThis.WebSocket = require('ws');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.beta') });

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MIGRATION_SQL = `
ALTER TABLE parameters ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL;
ALTER TABLE parameters ADD COLUMN IF NOT EXISTS end_date DATE DEFAULT NULL;
UPDATE parameters SET start_date = COALESCE(created_at::date, CURRENT_DATE) WHERE start_date IS NULL;
`;

async function run() {
  console.log('Checking column existence...');
  const { error: checkErr } = await sb.from('parameters').select('start_date, end_date').limit(1);
  if (!checkErr) {
    console.log('✓ Columns already exist — migration not needed.');
    return;
  }

  console.log('Columns missing. Attempting migration via exec_sql rpc...');
  const { error: rpcErr } = await sb.rpc('exec_sql', { query: MIGRATION_SQL });
  if (!rpcErr) {
    console.log('✓ Migration complete via rpc!');
    return;
  }
  console.log('exec_sql rpc not available:', rpcErr.message);

  console.log('\n──────────────────────────────────────────────');
  console.log('Could not run DDL automatically (service_role cannot ALTER TABLE).');
  console.log('Please run the following in your Supabase SQL Editor:');
  console.log('──────────────────────────────────────────────\n');
  console.log(MIGRATION_SQL.trim());
  console.log('\n──────────────────────────────────────────────');
  process.exit(1);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
