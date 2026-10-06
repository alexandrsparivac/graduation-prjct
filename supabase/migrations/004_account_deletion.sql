-- Run this in Supabase -> SQL Editor.
--
-- The privacy page promises two things the app could not actually do: hand back
-- a copy of everything we hold, and delete the account for good. The export is
-- plain reads the browser can already make under RLS; deletion is not, because
-- no client may touch auth.users. This function is the missing half.
--
-- Everything else cascades from here: profiles references auth.users on delete
-- cascade, and user_languages, user_domains and user_progress all reference
-- profiles the same way, so one delete clears the lot. Lessons the account
-- generated stay behind on purpose -- created_by is "on delete set null", and
-- they hold no personal data, only teaching material other learners reuse.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_account: no authenticated user';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- Callable only by a signed-in user, and only ever for their own row: the id
-- comes from auth.uid() inside the function, never from an argument.
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
