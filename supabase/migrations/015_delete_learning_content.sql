-- Remove a learner's selected topic/domain/language and the learner-owned
-- progress attached to it. Lessons are shared cache rows: purge a cache row
-- only after no learner is enrolled in its topic and no learner history
-- references it.

begin;

create or replace function public._delete_user_lesson_topic(
  p_user_id uuid,
  p_language text,
  p_domain text,
  p_topic text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.lesson_attempts la
  using public.lessons l
  where la.lesson_id = l.id
    and la.user_id = p_user_id
    and l.language_code = p_language
    and l.domain_slug = p_domain
    and l.topic = p_topic;

  delete from public.user_progress up
  using public.lessons l
  where up.lesson_id = l.id
    and up.user_id = p_user_id
    and l.language_code = p_language
    and l.domain_slug = p_domain
    and l.topic = p_topic;

  delete from public.user_vocabulary
  where user_id = p_user_id
    and language_code = p_language
    and domain_slug = p_domain
    and topic = p_topic;

  update public.user_domains
  set topics = array_remove(topics, p_topic)
  where user_id = p_user_id
    and language_code = p_language
    and domain_slug = p_domain;

  delete from public.user_domains
  where user_id = p_user_id
    and language_code = p_language
    and domain_slug = p_domain
    and cardinality(topics) = 0;

  delete from public.lessons l
  where l.language_code = p_language
    and l.domain_slug = p_domain
    and l.topic = p_topic
    and not exists (
      select 1 from public.user_domains ud
      where ud.language_code = l.language_code
        and ud.domain_slug = l.domain_slug
        and l.topic = any(ud.topics)
    )
    and not exists (select 1 from public.user_progress up where up.lesson_id = l.id)
    and not exists (select 1 from public.lesson_attempts la where la.lesson_id = l.id);
end;
$$;

revoke all on function public._delete_user_lesson_topic(uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.delete_lesson_topic(
  p_language text,
  p_domain text,
  p_topic text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'delete_lesson_topic: authentication required' using errcode = '28000';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'delete_lesson_topic: profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.user_languages
  where user_id = v_uid and language_code = p_language;
  if not found then
    raise exception 'delete_lesson_topic: language not found' using errcode = 'P0002';
  end if;
  perform 1 from public.user_domains
  where user_id = v_uid and language_code = p_language and domain_slug = p_domain
    and p_topic = any(topics)
  for update;
  if not found then
    raise exception 'delete_lesson_topic: topic not found' using errcode = 'P0002';
  end if;

  perform public._delete_user_lesson_topic(v_uid, p_language, p_domain, p_topic);
end;
$$;

revoke all on function public.delete_lesson_topic(text, text, text) from public, anon;
grant execute on function public.delete_lesson_topic(text, text, text) to authenticated;

create or replace function public.delete_domain_selection(
  p_language text,
  p_domain text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_topics text[];
  v_topic text;
begin
  if v_uid is null then
    raise exception 'delete_domain_selection: authentication required' using errcode = '28000';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'delete_domain_selection: profile not found' using errcode = 'P0002';
  end if;
  select topics into v_topics from public.user_domains
  where user_id = v_uid and language_code = p_language and domain_slug = p_domain
  for update;
  if not found then
    raise exception 'delete_domain_selection: domain not found' using errcode = 'P0002';
  end if;

  foreach v_topic in array v_topics loop
    perform public._delete_user_lesson_topic(v_uid, p_language, p_domain, v_topic);
  end loop;
end;
$$;

revoke all on function public.delete_domain_selection(text, text) from public, anon;
grant execute on function public.delete_domain_selection(text, text) to authenticated;

-- This replaces 014's configuration-only delete. The catalog row in
-- public.languages is shared by every learner and is deliberately retained.
create or replace function public.delete_language(p_language text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'delete_language: authentication required' using errcode = '28000';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'delete_language: profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.user_languages
  where user_id = v_uid and language_code = p_language
  for update;
  if not found then
    raise exception 'delete_language: language not found' using errcode = 'P0002';
  end if;

  delete from public.lesson_attempts
  where user_id = v_uid and language_code = p_language;

  delete from public.user_progress up
  using public.lessons l
  where up.lesson_id = l.id
    and up.user_id = v_uid
    and l.language_code = p_language;

  delete from public.user_vocabulary
  where user_id = v_uid and language_code = p_language;

  delete from public.user_domains
  where user_id = v_uid and language_code = p_language;
  delete from public.user_languages
  where user_id = v_uid and language_code = p_language;

  delete from public.lessons l
  where l.language_code = p_language
    and not exists (
      select 1 from public.user_domains ud
      where ud.language_code = l.language_code
        and ud.domain_slug = l.domain_slug
        and l.topic = any(ud.topics)
    )
    and not exists (select 1 from public.user_progress up where up.lesson_id = l.id)
    and not exists (select 1 from public.lesson_attempts la where la.lesson_id = l.id);
end;
$$;

revoke all on function public.delete_language(text) from public, anon;
grant execute on function public.delete_language(text) to authenticated;

commit;
