-- Run after 008_lesson_variants.sql. Existing lesson scores stay intact.
-- Earlier retries were overwritten, so only newly recorded attempts can form
-- a verifiable sequence of ten consecutive tests.
begin;

alter table public.user_progress
  add column if not exists completion_attempt_id uuid;

create table if not exists public.lesson_attempts (
  sequence bigint generated always as identity primary key,
  attempt_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  language_code text not null references public.languages(code),
  level text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  score integer not null,
  total integer not null check (total > 0),
  completed_at timestamptz not null default clock_timestamp(),
  constraint lesson_attempts_score_valid check (score >= 0 and score <= total),
  unique (user_id, attempt_id)
);

create index if not exists lesson_attempts_latest
  on public.lesson_attempts (user_id, language_code, level, sequence desc);

alter table public.lesson_attempts enable row level security;
drop policy if exists "lesson_attempts: read own" on public.lesson_attempts;
create policy "lesson_attempts: read own" on public.lesson_attempts
  for select to authenticated using (auth.uid() = user_id);
-- Attempts are append-only through the progress trigger, never client edits.
revoke all on public.lesson_attempts from anon, authenticated;
grant select on public.lesson_attempts to authenticated;

create or replace function public.record_lesson_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_language text;
  v_level text;
begin
  if new.completed is not true or new.completion_attempt_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.completion_attempt_id is not distinct from old.completion_attempt_id then return new; end if;
  end if;

  select language_code, level into strict v_language, v_level
  from public.lessons where id = new.lesson_id;
  -- Serialize completed tests and promotion for this learner/language.
  perform 1 from public.user_languages
    where user_id = new.user_id and language_code = v_language for update;

  insert into public.lesson_attempts (attempt_id, user_id, lesson_id, language_code, level, score, total)
  values (new.completion_attempt_id, new.user_id, new.lesson_id, v_language, v_level, new.score, new.total)
  on conflict (user_id, attempt_id) do nothing;
  return new;
end;
$$;

revoke all on function public.record_lesson_attempt() from public, anon, authenticated;
drop trigger if exists on_lesson_completed on public.user_progress;
create trigger on_lesson_completed
  after insert or update on public.user_progress
  for each row execute function public.record_lesson_attempt();

create or replace function public.try_promote(p_language text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_level text;
  v_next text;
  v_count integer;
  v_avg numeric;
begin
  if v_uid is null then return null; end if;
  select level into v_level from public.user_languages
    where user_id = v_uid and language_code = p_language for update;
  if v_level is null then return null; end if;
  v_next := case v_level when 'A1' then 'A2' when 'A2' then 'B1' when 'B1' then 'B2'
    when 'B2' then 'C1' when 'C1' then 'C2' else null end;
  if v_next is null then return null; end if;

  select count(*), avg(score::numeric / total) into v_count, v_avg
  from (
    select score, total from public.lesson_attempts
    where user_id = v_uid and language_code = p_language and level = v_level
    order by sequence desc limit 10
  ) recent;
  -- Strictly above 90%, including every low score in the latest ten tests.
  if v_count < 10 or v_avg <= 0.90 then return null; end if;
  update public.user_languages set level = v_next
    where user_id = v_uid and language_code = p_language;
  return v_next;
end;
$$;

revoke all on function public.try_promote(text) from public, anon;
grant execute on function public.try_promote(text) to authenticated;
commit;
