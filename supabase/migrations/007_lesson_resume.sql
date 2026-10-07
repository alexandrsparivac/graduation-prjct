-- Keep unfinished exercise state on the existing, user-owned progress row.
-- Existing completion dates and scores are preserved. Safe to run again.
begin;
alter table public.user_progress
  add column if not exists resume_state jsonb,
  add column if not exists resume_updated_at timestamptz;
commit;
