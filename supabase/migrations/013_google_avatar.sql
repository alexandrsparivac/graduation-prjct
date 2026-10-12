-- 013_google_avatar.sql
--
-- Google OAuth exposes the profile photo as `picture` inside
-- auth.users.raw_user_meta_data, while handle_new_user() only read
-- `avatar_url` (populated by email sign-ups). Google users therefore kept a
-- NULL profiles.avatar_url and saw initials instead of their photo.
--
-- New profiles now prefer avatar_url and fall back to picture; existing rows
-- without an avatar are backfilled from their own auth metadata.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url, native_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', '')
    ),
    coalesce(new.raw_user_meta_data->>'native_language', 'ro')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

update public.profiles p
set avatar_url = nullif(u.raw_user_meta_data->>'picture', '')
from auth.users u
where u.id = p.id
  and (p.avatar_url is null or p.avatar_url = '')
  and nullif(u.raw_user_meta_data->>'picture', '') is not null;
