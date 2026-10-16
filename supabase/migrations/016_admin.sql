-- 016_admin.sql — rol de administrator + moderare conturi.
--
-- Rulați în Supabase -> SQL Editor după 015. Adaugă coloanele necesare
-- panoului Admin din aplicație (gestionare useri, roluri, ban, statistici).
-- Conturile normale nu văd și nu modifică aceste coloane; serverul
-- (service_role) este singurul care scrie prin /api/admin/*.
--
-- Bootstrap prim admin (înlocuiți e-mailul):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'admin@example.com');

begin;

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_reason text,
  add column if not exists banned_at timestamptz;

-- Funcție ajutătoare: evaluează true doar pentru admini autentificați.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Adminii pot citi toate profilurile (necesar listei de useri din panou).
-- Scrierea rămâne pe server prin service_role, nu direct din browser.
drop policy if exists "profiles: admin read" on public.profiles;
create policy "profiles: admin read" on public.profiles
  for select to authenticated using (public.is_admin());

-- Adminii pot citi progresul, limbile, domeniile, lecțiile altora
-- (doar citire — acțiunile de scriere trec prin /api/admin/*).
drop policy if exists "user_languages: admin read" on public.user_languages;
create policy "user_languages: admin read" on public.user_languages
  for select to authenticated using (public.is_admin());

drop policy if exists "user_domains: admin read" on public.user_domains;
create policy "user_domains: admin read" on public.user_domains
  for select to authenticated using (public.is_admin());

drop policy if exists "user_progress: admin read" on public.user_progress;
create policy "user_progress: admin read" on public.user_progress
  for select to authenticated using (public.is_admin());

drop policy if exists "user_vocabulary: admin read" on public.user_vocabulary;
create policy "user_vocabulary: admin read" on public.user_vocabulary
  for select to authenticated using (public.is_admin());

drop policy if exists "lesson_attempts: admin read" on public.lesson_attempts;
create policy "lesson_attempts: admin read" on public.lesson_attempts
  for select to authenticated using (public.is_admin());

commit;
