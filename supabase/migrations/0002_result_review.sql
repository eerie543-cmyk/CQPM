-- Result review: some checks are input-and-result based — the input being
-- recorded doesn't mean the result was satisfactory. An admin judges Pass/Fail.

-- Per-parameter: does this check need an admin result review?
alter table public.parameters add column if not exists requires_review integer not null default 0;

-- Per-entry: the review verdict and who/when/why.
alter table public.entries add column if not exists result           text;   -- 'pending' | 'pass' | 'fail' | null
alter table public.entries add column if not exists reviewed_by_id   bigint;
alter table public.entries add column if not exists reviewed_by_name text;
alter table public.entries add column if not exists reviewed_at      text;
alter table public.entries add column if not exists review_note      text;
