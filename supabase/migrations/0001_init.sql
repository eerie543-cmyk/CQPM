-- CQPM schema — ported from the local SQLite database to Postgres.
-- Timestamps are stored as text in "YYYY-MM-DD HH:MM:SS" (UTC) to match the
-- format the app already parses; the backend fills them in from JS.

-- ── Users ────────────────────────────────────────────────────────────
create table if not exists public.users (
  id                   bigint generated always as identity primary key,
  username             text    not null,
  password_hash        text    not null,
  role                 text    not null check (role in ('admin','staff')),
  department           text    check (department in ('serology','molecularBio','microbiology')),
  display_name         text    not null,
  must_change_password integer not null default 0,
  created_at           text    not null
);
create unique index if not exists users_username_key on public.users (lower(username));

-- ── Parameters ───────────────────────────────────────────────────────
create table if not exists public.parameters (
  id             bigint generated always as identity primary key,
  department     text    not null check (department in ('serology','molecularBio','microbiology')),
  name           text    not null,
  description    text,
  schedule_type  text    not null default 'frequency' check (schedule_type in ('frequency','specific')),
  frequency      text    check (frequency in ('daily','weekly','biweekly','monthly','quarterly','yearly')),
  days_of_week   text,
  day_of_month   integer,
  specific_dates text,
  entry_type     text    not null default 'checkbox' check (entry_type in ('checkbox','numeric','text')),
  unit           text,
  min_value      double precision,
  max_value      double precision,
  critical       integer not null default 0,
  active         integer not null default 1,
  sort_order     integer not null default 0,
  created_at     text    not null
);

-- ── Entries ──────────────────────────────────────────────────────────
create table if not exists public.entries (
  id            bigint generated always as identity primary key,
  parameter_id  bigint  not null references public.parameters(id) on delete cascade,
  slot_date     text    not null,
  status        text    not null default 'done' check (status in ('done','late','missed')),
  value         text,
  notes         text,
  done_by_id    bigint  references public.users(id),
  done_by_name  text    not null,
  department    text    not null,
  created_at    text    not null,
  unique (parameter_id, slot_date)
);
create index if not exists entries_dept_date_idx on public.entries (department, slot_date);

-- ── Day sign-offs (submit / approve / reopen) ────────────────────────
create table if not exists public.day_signoffs (
  id                bigint generated always as identity primary key,
  department        text not null,
  slot_date         text not null,
  status            text not null default 'submitted' check (status in ('submitted','approved','reopened')),
  submitted_by_id   bigint,
  submitted_by_name text,
  submitted_at      text,
  approved_by_id    bigint,
  approved_by_name  text,
  approved_at       text,
  reopened_by_name  text,
  reopened_at       text,
  unique (department, slot_date)
);

-- ── Month closures ───────────────────────────────────────────────────
create table if not exists public.month_closures (
  id             bigint generated always as identity primary key,
  department     text not null,
  month          text not null,
  closed_by_id   bigint,
  closed_by_name text,
  closed_at      text not null,
  unique (department, month)
);

-- ── Security ─────────────────────────────────────────────────────────
-- Enable RLS with NO policies on every table. This blocks the public anon
-- key entirely; only the service-role key (used by the Electron backend)
-- can read or write. The renderer never holds the service key.
alter table public.users          enable row level security;
alter table public.parameters     enable row level security;
alter table public.entries        enable row level security;
alter table public.day_signoffs   enable row level security;
alter table public.month_closures enable row level security;
