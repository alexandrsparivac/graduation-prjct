-- Run this in Supabase -> SQL Editor.
--
-- Until now a lesson taught 15 words and 8 phrases and then dropped them: no
-- word was stored anywhere, so "words met" on the dashboard was a multiplication
-- (lessons x 15), and nothing ever brought a word back. This table is the
-- vocabulary itself, plus the scheduling state for SM-2 (see public/js/srs.js).

create table if not exists public.user_vocabulary (
  user_id uuid not null references public.profiles(id) on delete cascade,
  language_code text not null references public.languages(code) on delete cascade,
  -- The term as taught. Case and diacritics are kept: "Straße" and "strasse"
  -- are the same word to a reader but not to a learner practising spelling.
  term text not null,
  translation text not null,
  kind text not null default 'word' check (kind in ('word', 'phrase')),
  example text,
  -- Where it was met. Useful context on the review card, and the reason a word
  -- survives its source lesson being regenerated.
  domain_slug text references public.domains(slug) on delete set null,
  topic text,

  -- SM-2 state. ease is the E-Factor, floored at 1.3 by the algorithm.
  ease real not null default 2.5 check (ease >= 1.3),
  interval_days int not null default 0 check (interval_days >= 0),
  reps int not null default 0 check (reps >= 0),
  lapses int not null default 0 check (lapses >= 0),
  -- Dates, not timestamps: a review is due on a calendar day in the learner's
  -- own timezone, and comparing days avoids an hour-of-day cliff at midnight.
  due_on date not null,
  last_review_on date,
  created_at timestamptz default now(),

  primary key (user_id, language_code, term)
);

-- The one query the review page makes: my cards, in this language, due by today.
create index if not exists user_vocabulary_due
  on public.user_vocabulary (user_id, language_code, due_on);

alter table public.user_vocabulary enable row level security;

-- Postgres has no "create policy if not exists", so running this file twice
-- would fail on the policy alone. Dropping first makes the whole file re-runnable.
drop policy if exists "user_vocabulary: own" on public.user_vocabulary;
create policy "user_vocabulary: own" on public.user_vocabulary
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
