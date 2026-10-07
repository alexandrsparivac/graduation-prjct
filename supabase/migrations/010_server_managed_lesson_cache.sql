-- Shared lesson content is validated by the application server before it is cached.
-- Client sessions may read the shared cache but cannot publish or replace entries.
begin;

drop policy if exists "lessons: insert" on public.lessons;
drop policy if exists "lessons: update own" on public.lessons;
drop policy if exists "lessons: delete own" on public.lessons;
revoke insert, update, delete on public.lessons from anon, authenticated;
grant select on public.lessons to authenticated;

drop policy if exists "lesson_localizations: insert" on public.lesson_localizations;
drop policy if exists "lesson_localizations: update own" on public.lesson_localizations;
drop policy if exists "lesson_localizations: delete own" on public.lesson_localizations;
revoke insert, update, delete on public.lesson_localizations from anon, authenticated;
grant select on public.lesson_localizations to authenticated;

commit;
