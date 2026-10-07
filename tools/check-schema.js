import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = fileURLToPath(new URL('..', import.meta.url));
const db = new PGlite();

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    create function auth.role() returns text
      language sql stable as $$
        select current_setting('request.jwt.claim.role', true)
      $$;
  `);

  await db.exec(await readFile(path.join(root, 'supabase/schema.sql'), 'utf8'));
  const migrations = (await readdir(path.join(root, 'supabase/migrations')))
    .filter(file => /^\d+_.*\.sql$/.test(file))
    .sort((a, b) => Number(a.match(/^\d+/)[0]) - Number(b.match(/^\d+/)[0]));
  for (const migration of migrations) {
    await db.exec(await readFile(path.join(root, 'supabase/migrations', migration), 'utf8'));
  }

  const requiredColumns = [
    ['user_progress', 'completion_attempt_id'],
    ['user_progress', 'lesson_variant'],
    ['user_progress', 'resume_state'],
  ];
  for (const [table, column] of requiredColumns) {
    const result = await db.query(
      'select 1 from information_schema.columns where table_schema = $1 and table_name = $2 and column_name = $3',
      ['public', table, column],
    );
    assert.equal(result.rows.length, 1, `Missing public.${table}.${column}`);
  }

  const requiredRelations = ['lesson_attempts', 'user_vocabulary', 'lesson_localizations'];
  for (const relation of requiredRelations) {
    const result = await db.query(
      'select 1 from information_schema.tables where table_schema = $1 and table_name = $2',
      ['public', relation],
    );
    assert.equal(result.rows.length, 1, `Missing public.${relation}`);
  }

  const policies = await db.query(`
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
      and tablename in ('lessons', 'lesson_localizations')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  `);
  assert.deepEqual(policies.rows, [], 'Shared lesson tables must not have client write policies');
  for (const table of ['public.lessons', 'public.lesson_localizations']) {
    const privileges = await db.query(
      'select has_table_privilege($1, $2, $3) as can_read, has_table_privilege($1, $2, $4) as can_write',
      ['authenticated', table, 'SELECT', 'INSERT'],
    );
    assert.equal(privileges.rows[0].can_read, true, `${table} must be readable by authenticated users`);
    assert.equal(privileges.rows[0].can_write, false, `${table} must not be writable by authenticated users`);
  }

  for (const [table, column] of [
    ['public.user_progress', 'score'], ['public.user_progress', 'total'],
    ['public.user_progress', 'completed'], ['public.user_progress', 'completion_attempt_id'],
    ['public.user_progress', 'lesson_variant'], ['public.user_languages', 'earned_level'],
    ['public.profiles', 'onboarding_done'],
  ]) {
    const privilege = await db.query(
      'select has_column_privilege($1, $2, $3, $4) as can_update',
      ['authenticated', table, column, 'UPDATE'],
    );
    assert.equal(privilege.rows[0].can_update, false, `${table}.${column} must be server-managed`);
  }
  const profileLanguagePrivilege = await db.query(
    "select has_column_privilege('authenticated', 'public.profiles', 'native_language', 'UPDATE') as can_update",
  );
  assert.equal(profileLanguagePrivilege.rows[0].can_update, true,
    'authenticated users must retain the native-language preference update');
  const domainWritePrivilege = await db.query(
    "select has_table_privilege('authenticated', 'public.user_domains', 'INSERT') as can_insert",
  );
  assert.equal(domainWritePrivilege.rows[0].can_insert, false,
    'domain selections must be saved through the atomic onboarding RPC');

  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const lessonId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const answers = [0, 1, 2, 3, 0, 1, 2, 3];
  await db.query('insert into auth.users (id, email) values ($1, $2)', [userId, 'schema-check@example.invalid']);
  await db.query('insert into public.user_languages (user_id, language_code, level) values ($1, $2, $3)',
    [userId, 'en', 'A1']);
  await db.query(
    'insert into public.lessons (id, language_code, domain_slug, topic, level, content) values ($1, $2, $3, $4, $5, $6::jsonb)',
    [lessonId, 'en', 'it', 'Schema check', 'A1', JSON.stringify({ quiz: answers.map(answer => ({ answer })) })],
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);

  await db.query('insert into public.user_domains (user_id, language_code, domain_slug, topics) values ($1, $2, $3, $4)',
    [userId, 'en', 'it', ['Code review']]);
  await assert.rejects(db.query(
    'select public.save_onboarding($1, $2, $3::jsonb)',
    ['en', 'B1', JSON.stringify([{ domain_slug: 'it', topics: ['not a seeded topic'] }])],
  ));
  const unchangedOnboarding = await db.query(`
    select ul.level, ul.earned_level, ud.topics, p.onboarding_done
    from public.user_languages ul
    join public.user_domains ud on ud.user_id = ul.user_id and ud.language_code = ul.language_code
    join public.profiles p on p.id = ul.user_id
    where ul.user_id = $1 and ul.language_code = 'en'
  `, [userId]);
  assert.deepEqual(unchangedOnboarding.rows[0], {
    level: 'A1', earned_level: 'A1', topics: ['Code review'], onboarding_done: false,
  }, 'a failed onboarding save must roll back every change');
  await db.query('select public.save_onboarding($1, $2, $3::jsonb)',
    ['en', 'B1', JSON.stringify([{ domain_slug: 'it', topics: ['Code review', 'Raportarea bug-urilor'] }])]);
  const savedOnboarding = await db.query(`
    select ul.level, ul.earned_level, ud.topics, p.onboarding_done
    from public.user_languages ul
    join public.user_domains ud on ud.user_id = ul.user_id and ud.language_code = ul.language_code
    join public.profiles p on p.id = ul.user_id
    where ul.user_id = $1 and ul.language_code = 'en'
  `, [userId]);
  assert.deepEqual(savedOnboarding.rows[0], {
    level: 'B1', earned_level: 'A1', topics: ['Code review', 'Raportarea bug-urilor'], onboarding_done: true,
  }, 'onboarding must save selected level, topics, and completion together');

  await db.exec('set role authenticated');
  await assert.rejects(db.query(
    'insert into public.user_domains (user_id, language_code, domain_slug, topics) values ($1, $2, $3, $4)',
    [userId, 'en', 'it', ['Code review']],
  ), 'authenticated clients must not bypass atomic onboarding');
  await assert.rejects(db.query('update public.profiles set onboarding_done = false where id = $1', [userId]),
    'authenticated clients must not mark onboarding incomplete directly');
  await db.query('select public.save_onboarding($1, $2, $3::jsonb)',
    ['en', 'B2', JSON.stringify([{ domain_slug: 'it', topics: ['Code review'] }])]);
  const authenticatedOnboarding = await db.query(`
    select ul.level, ul.earned_level, ud.topics, p.onboarding_done
    from public.user_languages ul
    join public.user_domains ud on ud.user_id = ul.user_id and ud.language_code = ul.language_code
    join public.profiles p on p.id = ul.user_id
    where ul.user_id = $1 and ul.language_code = 'en'
  `, [userId]);
  assert.deepEqual(authenticatedOnboarding.rows[0], {
    level: 'B2', earned_level: 'A1', topics: ['Code review'], onboarding_done: true,
  }, 'authenticated users must be able to save onboarding through the RPC without losing earned level');
  await db.exec('reset role');

  const submitAttempt = async (attemptId, selectedAnswers) => {
    const result = await db.query(
      'select public.submit_lesson_attempt($1, $2, $3::jsonb) as result',
      [lessonId, attemptId, JSON.stringify(selectedAnswers)],
    );
    return result.rows[0].result;
  };
  const firstAttempt = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
  const scored = await submitAttempt(firstAttempt, Array(8).fill(0));
  assert.equal(scored.score, 2, 'the RPC must calculate score from the saved answer key');
  assert.equal(scored.total, 8);
  const duplicate = await submitAttempt(firstAttempt, answers);
  assert.equal(duplicate.score, 2, 'an idempotent retry must preserve the original score');
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(submitAttempt('cccccccc-cccc-4ccc-8ccc-cccccccc0002', 'not-an-array'));
  for (let index = 2; index <= 9; index++) {
    const attemptId = `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`;
    await submitAttempt(attemptId, answers);
  }
  const beforeThreshold = await db.query("select public.try_promote('en') as level");
  assert.equal(beforeThreshold.rows[0].level, null, 'fewer than ten scored attempts cannot promote');
  await submitAttempt('cccccccc-cccc-4ccc-8ccc-cccccccc0010', answers);
  const promoted = await db.query("select public.try_promote('en') as level");
  assert.equal(promoted.rows[0].level, 'A2');
  const levels = await db.query('select level, earned_level from public.user_languages where user_id = $1 and language_code = $2',
    [userId, 'en']);
  assert.deepEqual(levels.rows[0], { level: 'B2', earned_level: 'A2' },
    'test-earned promotion must not change the learner-selected study level');
  const attemptCount = await db.query('select count(*)::int as count from public.lesson_attempts where user_id = $1',
    [userId]);
  assert.equal(attemptCount.rows[0].count, 10, 'duplicate submissions must not create extra attempts');

  console.log(`Schema validation passed: schema.sql and ${migrations.length} migrations applied; progression and shared-cache contracts are present.`);
} finally {
  await db.close();
}
