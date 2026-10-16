-- 018_admin_actions.sql — acțiuni de administrare fără cheie service.
--
-- Funcții SECURITY DEFINER apelabile direct din browser, care verifică în
-- interior că apelantul are profiles.is_admin = true. Citirile rămân
-- permise tuturor autentificaților (017); doar scrierile sunt protejate.
-- E-mailurile rămân accesibile doar cu cheia service (stau în auth.users).

begin;

-- Verifică apelantul; aruncă eroare dacă nu e admin. Returnează id-ul lui.
create or replace function public.admin_caller_check()
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'admin: not authenticated';
  end if;
  if not coalesce((select p.is_admin from public.profiles p where p.id = uid), false) then
    raise exception 'admin: forbidden';
  end if;
  return uid;
end;
$$;
revoke all on function public.admin_caller_check() from public, anon;
grant execute on function public.admin_caller_check() to authenticated;

create or replace function public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare caller uuid := public.admin_caller_check();
begin
  if p_user_id = caller and not p_is_admin then
    raise exception 'admin: cannot demote self';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user_id;
  if not found then raise exception 'admin: user not found'; end if;
end;
$$;
revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

create or replace function public.admin_set_ban(p_user_id uuid, p_banned boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_caller_check();
  update public.profiles set
    is_banned = p_banned,
    banned_at = case when p_banned then now() else null end,
    banned_reason = case when p_banned then nullif(left(coalesce(p_reason, ''), 300), '') else null end
  where id = p_user_id;
  if not found then raise exception 'admin: user not found'; end if;
end;
$$;
revoke all on function public.admin_set_ban(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;

create or replace function public.admin_update_profile(p_user_id uuid, p_full_name text default null, p_native_language text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_caller_check();
  if p_full_name is not null then
    update public.profiles set full_name = nullif(left(p_full_name, 120), '') where id = p_user_id;
  end if;
  if p_native_language is not null then
    if not exists (select 1 from public.languages where code = p_native_language) then
      raise exception 'admin: invalid language';
    end if;
    update public.profiles set native_language = p_native_language where id = p_user_id;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'admin: user not found';
  end if;
end;
$$;
revoke all on function public.admin_update_profile(uuid, text, text) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text) to authenticated;

create or replace function public.admin_reset_progress(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_caller_check();
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'admin: user not found';
  end if;
  delete from public.lesson_attempts where user_id = p_user_id;
  delete from public.user_progress where user_id = p_user_id;
  delete from public.user_vocabulary where user_id = p_user_id;
end;
$$;
revoke all on function public.admin_reset_progress(uuid) from public, anon;
grant execute on function public.admin_reset_progress(uuid) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare caller uuid := public.admin_caller_check();
begin
  if p_user_id = caller then
    raise exception 'admin: cannot delete self';
  end if;
  delete from auth.users where id = p_user_id;
  if not found then raise exception 'admin: user not found'; end if;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_delete_lesson(p_lesson_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_caller_check();
  delete from public.lessons where id = p_lesson_id;
  if not found then raise exception 'admin: lesson not found'; end if;
end;
$$;
revoke all on function public.admin_delete_lesson(uuid) from public, anon;
grant execute on function public.admin_delete_lesson(uuid) to authenticated;

create or replace function public.admin_upsert_domain(p_slug text, p_name text default null, p_description text default null, p_topics text[] default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_caller_check();
  if p_slug is null or lower(p_slug) !~ '^[a-z][a-z0-9_-]{1,49}$' then
    raise exception 'admin: invalid slug';
  end if;
  if exists (select 1 from public.domains where slug = lower(p_slug)) then
    update public.domains set
      name = coalesce(p_name, name),
      description = coalesce(p_description, description),
      topics = coalesce(p_topics, topics)
    where slug = lower(p_slug);
  else
    if p_name is null or p_name = '' then raise exception 'admin: name required'; end if;
    insert into public.domains (slug, name, description, topics)
    values (lower(p_slug), p_name, coalesce(p_description, ''), coalesce(p_topics, '{}'));
  end if;
end;
$$;
revoke all on function public.admin_upsert_domain(text, text, text, text[]) from public, anon;
grant execute on function public.admin_upsert_domain(text, text, text, text[]) to authenticated;

create or replace function public.admin_delete_domain(p_slug text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_caller_check();
  delete from public.domains where slug = lower(p_slug);
  if not found then raise exception 'admin: domain not found'; end if;
end;
$$;
revoke all on function public.admin_delete_domain(text) from public, anon;
grant execute on function public.admin_delete_domain(text) to authenticated;

commit;
