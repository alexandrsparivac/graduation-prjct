-- 014_delete_language.sql
--
-- Removing a language the learner no longer needs: its domain selections and
-- its language row go away. Finished-lesson history (user_progress,
-- lesson_attempts, vocabulary) stays untouched, so past scores are never
-- rewritten — the dashboard simply stops listing the removed language.

create or replace function public.delete_language(p_language text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'delete_language: authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.user_languages where user_id = v_uid and language_code = p_language) then
    raise exception 'delete_language: language not found' using errcode = 'P0002';
  end if;
  delete from public.user_domains where user_id = v_uid and language_code = p_language;
  delete from public.user_languages where user_id = v_uid and language_code = p_language;
end;
$$;

revoke all on function public.delete_language(text) from public, anon;
grant execute on function public.delete_language(text) to authenticated;
