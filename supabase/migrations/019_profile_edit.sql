-- 019_profile_edit.sql — utilizatorii își pot edita numele și avatarul.
--
-- Migrația 012 a lăsat pe profiles doar update(native_language) pentru
-- clienți. Adăugăm full_name și avatar_url; restul coloanelor rămân
-- protejate (verificat de tools/check-schema.js).

grant update (full_name, avatar_url) on public.profiles to authenticated;
