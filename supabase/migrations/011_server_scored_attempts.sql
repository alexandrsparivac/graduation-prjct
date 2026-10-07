-- Keep the learner's freely selected study level separate from test-earned progress.
-- Existing levels are retained as earned levels; new language rows earn levels from A1.
begin;

alter table public.user_languages
  add column if not exists earned_level text;
update public.user_languages
  set earned_level = level
  where earned_level is null;
alter table public.user_languages
  alter column earned_level set default 'A1',
  alter column earned_level set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_languages'::regclass
      and conname = 'user_languages_earned_level_valid'
  ) then
    alter table public.user_languages
      add constraint user_languages_earned_level_valid
      check (earned_level in ('A1','A2','B1','B2','C1','C2'));
  end if;
end;
$$;

revoke insert, update, delete on public.user_languages from anon, authenticated;
grant select on public.user_languages to authenticated;
grant insert (user_id, language_code, level) on public.user_languages to authenticated;
grant update (user_id, language_code, level) on public.user_languages to authenticated;

revoke insert, update, delete on public.user_progress from anon, authenticated;
grant select on public.user_progress to authenticated;
grant insert (user_id, lesson_id, resume_state, resume_updated_at) on public.user_progress to authenticated;
grant update (user_id, lesson_id, resume_state, resume_updated_at) on public.user_progress to authenticated;

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
  select earned_level into v_level from public.user_languages
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
  if v_count < 10 or v_avg <= 0.90 then return null; end if;
  update public.user_languages set earned_level = v_next
    where user_id = v_uid and language_code = p_language;
  return v_next;
end;
$$;
revoke all on function public.try_promote(text) from public, anon;
grant execute on function public.try_promote(text) to authenticated;

create or replace function public.submit_lesson_attempt(
  p_lesson_id uuid,
  p_attempt_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_language text;
  v_lesson_level text;
  v_content jsonb;
  v_variant jsonb;
  v_quiz jsonb;
  v_existing public.lesson_attempts%rowtype;
  v_answer jsonb;
  v_correct jsonb;
  v_score integer := 0;
  v_total integer := 8;
  v_index integer;
  v_earned_level text;
begin
  if v_uid is null then
    raise exception 'submit_lesson_attempt: authentication required' using errcode = '28000';
  end if;
  if p_attempt_id is null or jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'submit_lesson_attempt: invalid attempt payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_answers) <> 8 then
    raise exception 'submit_lesson_attempt: invalid attempt payload' using errcode = '22023';
  end if;

  select language_code, level, content into v_language, v_lesson_level, v_content
  from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'submit_lesson_attempt: lesson not found' using errcode = 'P0002';
  end if;
  perform 1 from public.user_languages
  where user_id = v_uid and language_code = v_language
  for update;
  if not found then
    raise exception 'submit_lesson_attempt: learner language not found' using errcode = 'P0002';
  end if;

  select * into v_existing from public.lesson_attempts
  where user_id = v_uid and attempt_id = p_attempt_id;
  if found then
    select earned_level into v_earned_level from public.user_languages
    where user_id = v_uid and language_code = v_language;
    return jsonb_build_object('score', v_existing.score, 'total', v_existing.total,
      'earned_level', v_earned_level, 'duplicate', true);
  end if;

  select lesson_variant -> 'content' into v_variant from public.user_progress
  where user_id = v_uid and lesson_id = p_lesson_id;
  if jsonb_typeof(v_variant) = 'object' then
    v_content := v_variant;
  end if;
  v_quiz := v_content -> 'quiz';
  if jsonb_typeof(v_quiz) <> 'array' or jsonb_array_length(v_quiz) <> v_total then
    raise exception 'submit_lesson_attempt: lesson quiz is invalid' using errcode = '22023';
  end if;

  for v_index in 0..v_total - 1 loop
    v_answer := p_answers -> v_index;
    v_correct := v_quiz -> v_index -> 'answer';
    if jsonb_typeof(v_correct) is distinct from 'number' or (v_correct #>> '{}') !~ '^[0-3]$' then
      raise exception 'submit_lesson_attempt: lesson answer key is invalid' using errcode = '22023';
    end if;
    if v_answer <> 'null'::jsonb then
      if jsonb_typeof(v_answer) is distinct from 'number' or (v_answer #>> '{}') !~ '^[0-3]$' then
        raise exception 'submit_lesson_attempt: answer must be an option index or null' using errcode = '22023';
      end if;
      if v_answer = v_correct then
        v_score := v_score + 1;
      end if;
    end if;
  end loop;

  insert into public.user_progress (
    user_id, lesson_id, completed, score, total, completed_at, completion_attempt_id,
    resume_state, resume_updated_at
  ) values (
    v_uid, p_lesson_id, true, v_score, v_total, clock_timestamp(), p_attempt_id,
    null, clock_timestamp()
  )
  on conflict (user_id, lesson_id) do update set
    completed = true,
    score = excluded.score,
    total = excluded.total,
    completed_at = excluded.completed_at,
    completion_attempt_id = excluded.completion_attempt_id,
    resume_state = null,
    resume_updated_at = excluded.resume_updated_at;

  select earned_level into v_earned_level from public.user_languages
  where user_id = v_uid and language_code = v_language;
  return jsonb_build_object('score', v_score, 'total', v_total,
    'earned_level', v_earned_level, 'duplicate', false);
end;
$$;

revoke all on function public.submit_lesson_attempt(uuid, uuid, jsonb) from public, anon;
grant execute on function public.submit_lesson_attempt(uuid, uuid, jsonb) to authenticated;

commit;
