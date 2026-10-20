-- Lets learners bookmark individual lesson words without changing their
-- spaced-repetition schedule. Existing vocabulary remains unbookmarked.
alter table public.user_vocabulary
  add column if not exists is_saved boolean not null default false;

create index if not exists user_vocabulary_saved
  on public.user_vocabulary (user_id, language_code, term)
  where is_saved = true;
