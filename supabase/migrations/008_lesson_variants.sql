-- Regenerated lessons are private variants on the existing user-owned row.
-- Shared lesson ids, completion scores and unfinished progress are preserved.
begin;
alter table public.user_progress add column if not exists lesson_variant jsonb;
commit;
