# CQPM — Pre-Mortem Stress & Security Audit

**Target:** CQPM (Continuous Quality Process Monitoring)
**Stack:** Electron (main + preload + React/Vite/Tailwind renderer) · Supabase Postgres (service-role key) · custom JWT + bcrypt auth · Vercel remote-control backend (cqpm-control)
**Audit date:** 2026-06-25
**Auditor stance:** adversarial QA + ethical-hacker pre-mortem

---

## ⚠️ Executive summary — the headline flaw

**The entire security model assumes the client machine is trusted, but it is not.** The Electron **main process holds the Supabase `SUPABASE_SERVICE_ROLE_KEY`**, which *bypasses Row-Level Security entirely*. That process runs on every lab machine, so the key ships to every install. Every role check, department restriction, and lock you enforce lives in `electron/main.js` — but an attacker doesn't have to call `main.js`. They extract the service key from the installed app and talk to Postgres directly, with **god-mode read/write/delete over every department, every user, every record.** "RLS enabled with no public policies" provides **zero** protection against the service key.

Everything else in this report is real and worth fixing, but **this one finding makes all the others moot if the app is distributed to untrusted users.** Fix the architecture first.

---

## 1. Security & Vulnerabilities

| # | Vector | Threat / Scenario | Severity | Mitigation |
|---|--------|-------------------|----------|------------|
| S1 | Security | **Service-role key on every client.** `electron/db.js` creates the Supabase client with `SUPABASE_SERVICE_ROLE_KEY` (RLS-bypassing) loaded from a `.env` that must ship with the packaged app. Unpack the `app.asar` (or read the env on disk) → extract key → full DB compromise, bypassing 100% of the role/dept/lock checks in `main.js`. | **Critical** | Do **not** ship the service key. Put the existing Vercel backend (cqpm-control) in front of the DB: clients send their JWT to that server, which holds the service key and enforces authz server-side. *Or* adopt Supabase Auth + real RLS policies so the client only ever holds the anon key and the DB enforces per-user/per-dept access. |
| S2 | Security | **Broken authorization / IDOR on reads (OWASP A01).** `entries:get-range`, `params:list`, `signoff:range`, `signoff:get` only call `verifyToken` — **no department check**. A serology staffer opens DevTools and runs `window.cqpm.entries.getRange(token,'molecularBio','2026-01-01','2026-12-31')` and reads another department's entire record. The UI hiding other depts is cosmetic. | **High** | Add server-side dept scoping in each handler: if `payload.role==='staff'`, force `dept = payload.department` and reject mismatches. Never trust the `dept` argument from the renderer for staff. |
| S3 | Security | **IDOR on writes — cross-department entry injection.** `entries:save` (main.js:261) validates the lock via `dayLockReason(entry.department,…)` but **never checks that a staff user's department equals `entry.department`.** `window.cqpm.entries.save(token,{parameterId:<other dept param>,slotDate,department:'molecularBio',status:'done'})` lets staff forge compliance records in departments they don't belong to. | **Critical** | In `entries:save`, reject when `payload.role==='staff' && payload.department !== entry.department`. Also verify the `parameterId` actually belongs to `entry.department` before upserting. |
| S4 | Security | **Reverse-engineering / DevTools left enabled in prod.** `sandbox:false` and no `win.webContents` DevTools lockdown; Electron lets users press Ctrl+Shift+I in the packaged app and call any `window.cqpm.*` method with their valid token. Combined with S2/S3 this turns "hidden in the UI" into "fully reachable." No CSP is set on the renderer. | **High** | Disable DevTools & the app menu in production (`isDev` gate), set `sandbox:true`, add a strict `Content-Security-Policy` meta/header, and treat every IPC argument as hostile input in `main.js`. |
| S5 | Security | **Remote-control bearer secret baked into the renderer bundle.** `useRemoteConfig.js` reads `VITE_REMOTE_SECRET` / `VITE_REMOTE_CONFIG_URL`; the `VITE_` prefix means Vite **inlines them into the client JS** at build. Extract from the bundle → call the cqpm-control API as a trusted client: read config, spoof presence/heartbeat logs, and (if the backend honors it) push `locked:true` to **remote-DoS every install**, or push fake update banners. CORS on the control backend is open (per project notes). | **High** | Move the remote-config fetch + heartbeat into the **main process** (never expose the secret to the renderer). Lock the secret to read-only scope, add per-token rate limiting, and restrict CORS on cqpm-control. Treat the kill-switch endpoint as privileged. |
| S6 | Security | **Default admin with a weak, non-rotating password.** `db.js` `ensureSeed()` creates `archit` / `12345` with `must_change_password: 0`. If this reaches production unchanged, anyone who knows the default owns the admin role. | **High** | Seed with a random one-time password printed to a secure channel and `must_change_password: 1`, or require first-run admin setup. Never ship a known credential. |
| S7 | Security | **No login throttling / lockout (OWASP A07).** `auth:login` does an unbounded bcrypt compare per attempt against a shared cloud DB; any installed client can brute-force any username. | **Medium** | Add exponential backoff / temporary lockout per username+IP (enforced server-side once S1 is fixed), and generic error messages (already done). |
| S8 | Security | **Mass-assignment on parameter update.** `params:update` passes the renderer's `fields` object straight into `updateParameter(id, fields)` → `.update(fields)`. An admin (or forged admin via S1) can write arbitrary columns (`department`, `active`, `requires_review`, even unintended ones). | **Medium** | Whitelist updatable columns explicitly before the DB call. |

---

## 2. Concurrency & Load Failures

> Context: "traffic spike" here = many lab machines hitting the **shared Supabase free tier** at once.

| # | Vector | Threat / Scenario | Severity | Mitigation |
|---|--------|-------------------|----------|------------|
| L1 | Load | **Last-write-wins clobbering on `entries` upsert.** `upsertEntry` uses `onConflict:'parameter_id,slot_date'` with no version/timestamp guard. Two machines recording the same check the same day silently overwrite each other; worse, the upsert **resets the review fields**, so a re-record wipes an admin's just-saved Pass/Fail verdict. Pure data loss with no error. | **High** | Add optimistic concurrency: an `updated_at`/version column checked on write; reject stale writes and surface a "someone changed this" prompt. Don't blanket-reset review state unless the recorded value actually changed. |
| L2 | Load | **Unguarded state-machine races on sign-off / closure.** `submitDay`/`approveDay`/`reopenDay`/`closeMonth` are separate non-transactional calls. Two admins approving+reopening the same day, or a `closeMonth` racing a staffer's `entries:save` (the closure check and the write aren't atomic), produce inconsistent locks and entries written into a "closed" month. | **High** | Wrap transitions in a DB transaction/RPC (Supabase `rpc`) with row locking (`select … for update`), and enforce valid state transitions server-side. |
| L3 | Load | **Polling + wide range queries swamp the free tier.** Every month/period navigation refetches params + entries + signoffs + closures (now a 42-day grid), with **no caching or pagination**; on top sit a 20s `db:ping`, a 5-min remote-config poll, and a heartbeat — per machine. N machines × these = connection-limit/rate-limit exhaustion and slow, partial responses. | **Medium** | Cache params per dept; debounce navigation fetches; widen-and-reuse the loaded range instead of refetching each page; back off `db:ping` when hidden/blurred; consider Supabase connection pooling (PgBouncer) and an upgraded tier for multi-machine use. |

---

## 3. Adversarial UX & Boundary Inputs

| # | Vector | Threat / Scenario | Severity | Mitigation |
|---|--------|-------------------|----------|------------|
| U1 | UX | **Excel/CSV formula injection in export.** Param names, display names, and notes are user-controlled and written verbatim by `excelReport.js`. A value like `=cmd|'/c calc'!A1` or `=HYPERLINK(...)` becomes a **live formula** when the exported `.xlsx` is opened — classic CSV injection that can exfiltrate data or run commands on the reviewer's machine. | **High** | Prefix any cell value beginning with `= + - @ \t \r` with a single quote (or set the cell type to text) before writing. Sanitize on export in `buildComplianceWorkbook`. |
| U2 | UX | **Rapid double-tap → duplicate side effects.** Buttons without an in-flight guard fire two IPC calls. Double-clicking **Approve** on a parameter request inserts the parameter **twice** (no uniqueness on approve); double-submitting day sign-off / param requests creates duplicates. | **Medium** | Disable the button while the request is in flight (you already do this on some — apply consistently), and add idempotency/uniqueness server-side (e.g., unique index on `(department, name, active)` for parameters). |
| U3 | UX | **No length limits → DB/UX/export bloat.** Pasting megabytes into param name, description, notes, or review note has no `maxLength`; it bloats rows, breaks Excel column sizing, and janks the matrix/calendar render. | **Medium** | Enforce `maxLength` on inputs **and** validate length server-side in `main.js` before insert/update. |
| U4 | UX | **Numeric boundary abuse.** `isOutOfRange` uses `parseFloat`; inputs like `1e999` (→ `Infinity`), `NaN`, negatives, or scientific notation pass through and corrupt scoring/flags. Min/max not validated as `min ≤ max` on param create. | **Medium** | Validate numeric entries server-side (`Number.isFinite`, range sanity, `min ≤ max`); reject non-finite values. |
| U5 | UX | **Malicious `specific_dates` / schedule blowup.** `specific_dates` is a free CSV; `getDueDatesInRange` iterates day-by-day. A far-future date (e.g. `9999-12-31`) or a huge custom range makes the schedule loop iterate millions of times → UI freeze (effective client DoS). Emoji/script in text fields are render-safe via React but flow unescaped into the Excel export (see U1). | **Medium** | Validate/normalize `specific_dates` (format + sane bounds), cap schedule iteration windows, and bound the matrix/score range. |

---

## 4. Network & Environment Chaos

| # | Vector | Threat / Scenario | Severity | Mitigation |
|---|--------|-------------------|----------|------------|
| N1 | Network | **Offline mid-write = silent data loss.** Drop the network during `entries:save`/`signoff:submit`: the Supabase call hangs or rejects, the IPC promise rejects, and there's **no offline queue**. The user may believe the reading saved when it didn't — unacceptable for a compliance record. | **High** | Add a durable outbox: persist pending writes locally, retry on reconnect, and show explicit "saved / pending / failed" state per entry. Never show success until the DB confirms. |
| N2 | Network | **Partial/dropped payloads → wrong compliance verdict.** A truncated `entries:get-range` response renders missing entries as "missed/pending," which **lowers the compliance score and drives wrong approvals/closures.** High latency also stacks the 20s ping + polls into a request pileup. | **High** | Treat partial/failed range loads as "unknown," not "missed" — block scoring/approval until a complete load succeeds; add request timeouts + retry with integrity checks. |
| N3 | Network | **Per-machine JWT secret + control-backend dependency.** `auth.js` stores a *per-machine* random secret via `safeStorage`; if encryption is unavailable (e.g., Linux without a keyring) the secret regenerates each launch → **all users force-logged-out on every restart.** Separately, if cqpm-control is unreachable the app correctly falls back to cached config — but a spoofed control response (via S5) reaching a client could push `locked:true` and brick it. | **Medium** | Provide a secure fallback secret store; surface a clear re-login prompt rather than silent failure; sign/verify remote-config payloads so a leaked bearer token alone can't push a kill switch. |

---

## 5. Unintended Feature Interactivity (race / state bugs)

| # | Vector | Threat / Scenario | Severity | Mitigation |
|---|--------|-------------------|----------|------------|
| I1 | Interactivity | **Remote config flips a dept off mid-edit.** The 5-min `useRemoteConfig` poll sets `departments.serology=false`; `App.jsx`'s effect then resets `activeDept`, unmounting the page **while an EntryModal save is in flight** → lost edit or a crash on stale state. | **High** | Gate disruptive remote-config changes behind "no unsaved work / no in-flight request," or apply them on next navigation rather than mid-interaction. |
| I2 | Interactivity | **Inactivity auto-logout during a write/export.** `useInactivityLogout` can clear the token mid-`entries:save` or mid-`export:xlsx`; the in-flight call may complete in `main` while the UI logs out, or fail with "Session expired," losing the action. | **Medium** | Defer logout while a request/export is in flight; flush/confirm pending writes before tearing down the session. |
| I3 | Interactivity | **Background `useMatrix` reload vs open EntryModal.** A refetch swaps `entryMap` underneath an open modal whose `existing` prop is now stale; saving overwrites with old data, and the review-reset (L1) compounds it. | **High** | Snapshot the entry when the modal opens, compare against current on save (optimistic concurrency), and warn on conflict instead of blind overwrite. |
| I4 | Interactivity | **Concurrent admin approve vs reopen vs close.** Two admins acting on the same day/month with no locking (see L2) leave the day in a contradictory state (e.g., "approved" yet editable, or entries under a "closed" month). | **High** | Single source of truth via transactional RPC with state-transition validation; reflect server state back to all clients. |
| I5 | Interactivity | **Param-request approval double-fire vs concurrent edit.** Approving a request inserts a parameter (no dedupe); two admins approving the same pending request, or one approving while another rejects, can both insert and/or leave the request in a wrong terminal state. | **Medium** | Make `reviewParamRequest` atomic: re-check `status='pending'` inside the transaction before inserting the parameter; unique-constrain resulting params. |

---

## Priority order for remediation

1. **S1** (service key off the client) — re-architect; nothing else matters until this is done.
2. **S3 / S2** (cross-dept write/read authz in IPC) — cheap, high-impact server-side checks.
3. **S6** (default credential), **U1** (Excel formula injection) — easy wins, real impact.
4. **S4 / S5** (DevTools + renderer secret), **N1 / N2** (offline & partial-load integrity).
5. **L1–L3 / I1–I5** (concurrency & state) — needed before true multi-machine load.

> Note on scope: this audits the CQPM desktop app + its data layer as found in the repo. The Vercel control backends (cqpm-control / ess-control / rms-control) were assessed only via their client-side usage; a separate server-side review of those endpoints (auth, CORS, rate limiting, kill-switch authorization) is recommended.
