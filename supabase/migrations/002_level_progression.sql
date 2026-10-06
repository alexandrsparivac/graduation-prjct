-- Run in Supabase SQL Editor after schema.sql

-- Level promotion rule: a learner advances one CEFR level for a language when
-- every chosen topic (across their chosen domains) has a completed lesson at the
-- current level AND the average quiz score is at least 70%.
-- Returns the new level, or null if the requirements are not met yet.

create or replace function public.try_promote(p_language text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_level text;
  v_next text;
  v_total int;
  v_done int;
  v_avg numeric;
begin
  if v_uid is null then return null; end if;

  select level into v_level from user_languages where user_id = v_uid and language_code = p_language;
  if v_level is null then return null; end if;

  v_next := case v_level when 'A1' then 'A2' when 'A2' then 'B1' when 'B1' then 'B2' when 'B2' then 'C1' when 'C1' then 'C2' else null end;
  if v_next is null then return null; end if;

  -- Total chosen topics for this language
  select coalesce(sum(cardinality(topics)), 0) into v_total
  from user_domains where user_id = v_uid and language_code = p_language;
  if v_total = 0 then return null; end if;

  -- Topics completed at the current level, with their scores
  with chosen as (
    select ud.domain_slug, unnest(ud.topics) as topic
    from user_domains ud where ud.user_id = v_uid and ud.language_code = p_language
  ),
  completed as (
    select c.domain_slug, c.topic, up.score, up.total
    from chosen c
    join lessons l on l.language_code = p_language and l.domain_slug = c.domain_slug and l.topic = c.topic and l.level = v_level
    join user_progress up on up.lesson_id = l.id and up.user_id = v_uid and up.completed
  )
  select count(*), avg(score::numeric / nullif(total, 0)) into v_done, v_avg from completed;

  if v_done < v_total or coalesce(v_avg, 0) < 0.7 then return null; end if;

  update user_languages set level = v_next where user_id = v_uid and language_code = p_language;
  return v_next;
end;
$$;

grant execute on function public.try_promote(text) to authenticated;
