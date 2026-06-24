-- Staff-submitted parameter requests awaiting admin approval.
-- When approved, a real parameter row is inserted from this data.

create table if not exists public.parameter_requests (
  id                bigserial primary key,
  department        text    not null,
  name              text    not null,
  description       text,
  unit              text,
  schedule_type     text    not null default 'frequency',
  frequency         text,
  days_of_week      text,
  day_of_month      integer,
  specific_dates    text,
  entry_type        text    not null default 'numeric',
  min_value         real,
  max_value         real,
  critical          integer not null default 0,
  requires_review   integer not null default 0,
  sort_order        integer not null default 0,

  -- Who submitted it
  requested_by_id   bigint  not null,
  requested_by_name text    not null,
  requested_at      text    not null,

  -- Admin decision
  status            text    not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by_id    bigint,
  reviewed_by_name  text,
  reviewed_at       text,
  review_note       text
);

alter table public.parameter_requests enable row level security;
-- No public policies — only the service-role key (used by Electron main) may access.
