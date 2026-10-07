begin;

create or replace function public.save_onboarding(
  p_language text,
  p_level text,
  p_domains jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_slug text;
  v_topics jsonb;
  v_topic text;
  v_allowed_topics text[];
  v_seen_domains text[] := array[]::text[];
  v_seen_topics text[];
begin
  if v_uid is null then
    raise exception 'save_onboarding: authentication required' using errcode = '28000';
  end if;
  if p_language is null or not exists (select 1 from public.languages where code = p_language) then
    raise exception 'save_onboarding: unsupported language' using errcode = '22023';
  end if;
  if p_level is null or p_level not in ('A1','A2','B1','B2','C1','C2') then
    raise exception 'save_onboarding: invalid study level' using errcode = '22023';
  end if;
  if jsonb_typeof(p_domains) is distinct from 'array' then
    raise exception 'save_onboarding: at least one domain is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_domains) = 0 then
    raise exception 'save_onboarding: at least one domain is required' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'save_onboarding: profile not found' using errcode = 'P0002';
  end if;

  for v_item in select value from jsonb_array_elements(p_domains)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'save_onboarding: invalid domain selection' using errcode = '22023';
    end if;
    v_slug := v_item ->> 'domain_slug';
    v_topics := v_item -> 'topics';
    if v_slug is null or v_slug = any(v_seen_domains) then
      raise exception 'save_onboarding: missing or duplicate domain' using errcode = '22023';
    end if;
    v_seen_domains := array_append(v_seen_domains, v_slug);
    if jsonb_typeof(v_topics) is distinct from 'array' then
      raise exception 'save_onboarding: each domain needs at least one topic' using errcode = '22023';
    end if;
    if jsonb_array_length(v_topics) = 0 then
      raise exception 'save_onboarding: each domain needs at least one topic' using errcode = '22023';
    end if;
    select topics into v_allowed_topics from public.domains where slug = v_slug;
    if not found then
      raise exception 'save_onboarding: unsupported domain' using errcode = '22023';
    end if;
    v_seen_topics := array[]::text[];
    for v_topic in select value from jsonb_array_elements_text(v_topics)
    loop
      if v_topic = any(v_seen_topics) or not (v_topic = any(v_allowed_topics)) then
        raise exception 'save_onboarding: unsupported or duplicate topic' using errcode = '22023';
      end if;
      v_seen_topics := array_append(v_seen_topics, v_topic);
    end loop;
  end loop;

  insert into public.user_languages (user_id, language_code, level)
  values (v_uid, p_language, p_level)
  on conflict (user_id, language_code) do update set level = excluded.level;

  delete from public.user_domains where user_id = v_uid and language_code = p_language;
  for v_item in select value from jsonb_array_elements(p_domains)
  loop
    insert into public.user_domains (user_id, language_code, domain_slug, topics)
    values (
      v_uid,
      p_language,
      v_item ->> 'domain_slug',
      array(select jsonb_array_elements_text(v_item -> 'topics'))
    );
  end loop;

  update public.profiles set onboarding_done = true where id = v_uid;
end;
$$;

revoke all on function public.save_onboarding(text, text, jsonb) from public, anon;
grant execute on function public.save_onboarding(text, text, jsonb) to authenticated;

revoke insert, update, delete on public.user_domains from anon, authenticated;
grant select on public.user_domains to authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (native_language) on public.profiles to authenticated;

commit;
