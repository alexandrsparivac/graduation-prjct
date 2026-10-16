-- 017_open_admin_reads.sql — citiri simple pentru panoul Admin, fără verificări pe roluri.
--
-- Înlocuiește politicile condiționate de admin din 016 cu citire permisivă
-- pentru orice utilizator autentificat. Fără funcții, fără is_admin() în RLS.
-- Datele expuse sunt de învățare (profiluri, progres, vocabular) — e-mailurile
-- și parolele stau în auth.users și rămân invizibile prin API-ul public.
-- Cine VEDE panoul rămâne decis de flagul profiles.is_admin în interfață,
-- iar scrierile privilegiate (ban, ștergeri, roluri) rămân pe /api/admin/*.

begin;

drop policy if exists "profiles: admin read" on public.profiles;
drop policy if exists "user_languages: admin read" on public.user_languages;
drop policy if exists "user_domains: admin read" on public.user_domains;
drop policy if exists "user_progress: admin read" on public.user_progress;
drop policy if exists "user_vocabulary: admin read" on public.user_vocabulary;
drop policy if exists "lesson_attempts: admin read" on public.lesson_attempts;
drop function if exists public.is_admin();

drop policy if exists "profiles: readable" on public.profiles;
create policy "profiles: readable" on public.profiles
  for select to authenticated using (true);

drop policy if exists "user_languages: readable" on public.user_languages;
create policy "user_languages: readable" on public.user_languages
  for select to authenticated using (true);

drop policy if exists "user_domains: readable" on public.user_domains;
create policy "user_domains: readable" on public.user_domains
  for select to authenticated using (true);

drop policy if exists "user_progress: readable" on public.user_progress;
create policy "user_progress: readable" on public.user_progress
  for select to authenticated using (true);

drop policy if exists "user_vocabulary: readable" on public.user_vocabulary;
create policy "user_vocabulary: readable" on public.user_vocabulary
  for select to authenticated using (true);

drop policy if exists "lesson_attempts: readable" on public.lesson_attempts;
create policy "lesson_attempts: readable" on public.lesson_attempts
  for select to authenticated using (true);

commit;
