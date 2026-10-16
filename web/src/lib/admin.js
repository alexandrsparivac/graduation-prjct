import { supabase } from './supabase.js';

async function adminFetch(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('no_session');
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `admin_${res.status}`);
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const isAdminProfile = (profile) => profile?.is_admin === true;

// ---- Citiri directe prin RLS (migrația 016_admin.sql) ----
// Funcționează fără cheia service pe server; scrierile rămân pe /api/admin/*.

async function rowsOrThrow(table, select, build) {
  let q = supabase.from(table).select(select);
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function countOrThrow(table, build) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

// E-mailurile stau în auth.users (invizibil prin PostgREST), deci le
// îmbogățim best-effort de pe server; fără cheie service lipsesc, dar
// restul datelor se afișează normal.
async function enrichEmails(users, q, filter) {
  try {
    const srv = await adminFetch(
      `/api/admin/users?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}&page=1&limit=200`
    );
    const byId = Object.fromEntries((srv.users || []).filter((u) => u.email).map((u) => [u.id, u]));
    let merged = 0;
    const out = users.map((u) => {
      const s = byId[u.id];
      if (s) {
        merged++;
        return { ...u, email: s.email, email_confirmed: s.email_confirmed, last_sign_in_at: s.last_sign_in_at };
      }
      return { ...u, email: u.email || null };
    });
    return { users: out, ok: merged > 0 };
  } catch {
    return { users: users.map((u) => ({ ...u, email: u.email || null })), ok: false };
  }
}

async function usersDirect({ q = '', filter = 'all', page = 1, limit = 50 } = {}) {
  const all = await rowsOrThrow('profiles', '*', (qb) => qb.order('created_at', { ascending: false }).limit(1000));
  const capped = all.length >= 1000;
  const needle = String(q || '').toLowerCase().trim();
  let users = all;
  if (needle) {
    users = users.filter((u) =>
      (u.full_name || '').toLowerCase().includes(needle) || u.id.toLowerCase().includes(needle));
  }
  const weekAgo = Date.now() - 7 * 86400_000;
  if (filter === 'admins') users = users.filter((u) => u.is_admin);
  else if (filter === 'banned') users = users.filter((u) => u.is_banned);
  else if (filter === 'recent') users = users.filter((u) => new Date(u.created_at).getTime() >= weekAgo);
  else if (filter === 'no_onboarding') users = users.filter((u) => !u.onboarding_done);
  const enriched = await enrichEmails(users, q, filter);
  users = enriched.users;
  if (needle) {
    users = users.filter((u) =>
      (u.full_name || '').toLowerCase().includes(needle)
      || (u.email || '').toLowerCase().includes(needle)
      || u.id.toLowerCase().includes(needle));
  }
  const total = users.length;
  const start = (page - 1) * limit;
  return { users: users.slice(start, start + limit), total, page, limit, emailsMissing: !enriched.ok, capped };
}

async function userDetailDirect(id) {
  const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  if (!profile) {
    const err = new Error('user_not_found');
    err.code = 'user_not_found';
    err.status = 404;
    throw err;
  }
  const [languages, domains, progress, attempts, vocab] = await Promise.all([
    rowsOrThrow('user_languages', 'language_code,level,earned_level,created_at', (q) => q.eq('user_id', id)),
    rowsOrThrow('user_domains', 'language_code,domain_slug,topics,created_at', (q) => q.eq('user_id', id)),
    rowsOrThrow('user_progress', 'lesson_id,completed,score,total,completed_at', (q) => q.eq('user_id', id).limit(500)),
    rowsOrThrow('lesson_attempts', 'sequence,lesson_id,language_code,level,score,total,completed_at',
      (q) => q.eq('user_id', id).order('sequence', { ascending: false }).limit(50)),
    rowsOrThrow('user_vocabulary', 'language_code,term,kind,due_on', (q) => q.eq('user_id', id).limit(200)),
  ]);
  let email = null, email_confirmed = false, last_sign_in_at = null;
  try {
    const srv = await adminFetch(`/api/admin/users/${encodeURIComponent(id)}`);
    email = srv.email || null;
    email_confirmed = !!srv.email_confirmed;
    last_sign_in_at = srv.last_sign_in_at || null;
  } catch { /* e-mail indisponibil fără cheia service */ }
  return { profile, email, email_confirmed, last_sign_in_at, languages, domains, progress, attempts, vocab };
}

async function lessonsDirect(q = '') {
  const needle = String(q || '').toLowerCase().trim();
  const [lessons, progress] = await Promise.all([
    rowsOrThrow('lessons', 'id,language_code,domain_slug,topic,level,native_language,model,created_at',
      (qb) => qb.order('created_at', { ascending: false }).limit(1000)),
    rowsOrThrow('user_progress', 'lesson_id,completed', (qb) => qb.limit(1000)),
  ]);
  const doneByLesson = {};
  for (const p of progress) {
    doneByLesson[p.lesson_id] = doneByLesson[p.lesson_id] || { started: 0, done: 0 };
    doneByLesson[p.lesson_id].started++;
    if (p.completed) doneByLesson[p.lesson_id].done++;
  }
  const filtered = needle
    ? lessons.filter((l) => (l.topic || '').toLowerCase().includes(needle)
      || (l.domain_slug || '').toLowerCase().includes(needle) || l.id.toLowerCase().includes(needle))
    : lessons;
  return {
    lessons: filtered.slice(0, 200).map((l) => ({ ...l, stats: doneByLesson[l.id] || { started: 0, done: 0 } })),
    total: filtered.length,
    statsCapped: progress.length >= 1000,
  };
}

async function activityDirect() {
  const [attempts, progress, profiles] = await Promise.all([
    rowsOrThrow('lesson_attempts', 'sequence,user_id,lesson_id,language_code,level,score,total,completed_at',
      (q) => q.order('sequence', { ascending: false }).limit(60)),
    rowsOrThrow('user_progress', 'user_id,lesson_id,completed,completed_at',
      (q) => q.order('completed_at', { ascending: false, nullsFirst: false }).limit(60)),
    rowsOrThrow('profiles', 'id,full_name', (q) => q.limit(1000)),
  ]);
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.id.slice(0, 8)]));
  return {
    attempts: attempts.map((a) => ({ ...a, user_name: names[a.user_id] || String(a.user_id).slice(0, 8) })),
    recent: progress.filter((p) => p.completed).slice(0, 30)
      .map((p) => ({ ...p, user_name: names[p.user_id] || String(p.user_id).slice(0, 8) })),
  };
}

async function catalogDirect() {
  const [languages, domains, translations, lessons] = await Promise.all([
    rowsOrThrow('languages', 'code,name,native_name,flag', (q) => q.order('code')),
    rowsOrThrow('domains', 'slug,name,description,topics', (q) => q.order('slug')),
    rowsOrThrow('lesson_localizations', 'lesson_id,native_language', (q) => q.limit(2000)),
    rowsOrThrow('lessons', 'id,language_code,domain_slug', (q) => q.limit(2000)),
  ]);
  const locByLesson = {};
  for (const tr of translations) {
    locByLesson[tr.lesson_id] = locByLesson[tr.lesson_id] || [];
    locByLesson[tr.lesson_id].push(tr.native_language);
  }
  const lessonsByLang = {};
  for (const l of lessons) lessonsByLang[l.language_code] = (lessonsByLang[l.language_code] || 0) + 1;
  return { languages, domains, locByLesson, lessonsByLang, lessonsCapped: lessons.length >= 2000 };
}

// ---- Scrieri prin RPC (migrația 018_admin_actions.sql) ----
// Verificarea de admin se face în interiorul funcțiilor SQL, deci nu e
// nevoie de cheia service. La nevoie, fallback pe server (/api/admin/*).

function friendlyRpcError(e) {
  const m = String(e?.message || '');
  if (/forbidden|not authenticated/i.test(m)) {
    return Object.assign(new Error('Nu ai drept de administrator.'), { code: 'forbidden' });
  }
  if (/demote self/i.test(m)) {
    return Object.assign(new Error('Nu-ți poți lua singur rolul de admin.'), { code: 'cannot_demote_self' });
  }
  if (/delete self/i.test(m)) {
    return Object.assign(new Error('Nu-ți poți șterge propriul cont de aici.'), { code: 'cannot_delete_self' });
  }
  if (/user not found/i.test(m)) return new Error('Utilizatorul nu mai există.');
  if (/lesson not found/i.test(m)) return new Error('Lecția nu mai există.');
  if (/domain not found/i.test(m)) return new Error('Domeniul nu mai există.');
  if (/invalid language/i.test(m)) return new Error('Limba aleasă nu e validă.');
  if (/invalid slug/i.test(m)) return new Error('Slug invalid (litere mici, cifre, -, _).');
  if (/name required/i.test(m)) return new Error('Domeniul nou are nevoie de un nume.');
  return e instanceof Error ? e : new Error(m || 'Acțiunea a eșuat.');
}

async function writeWithFallback(rpcName, args, serverCall) {
  const { error } = await supabase.rpc(rpcName, args);
  if (!error) return { ok: true };
  if (error.code === 'PGRST202' || /does not exist|could not find the function|schema cache/i.test(error.message || '')) {
    // 018 lipsește sau cache-ul PostgREST nu s-a reîncărcat — mai încearcă serverul.
    try {
      return await serverCall();
    } catch {
      throw new Error('Rulează migrația 018_admin_actions.sql în Supabase, așteaptă ~30s, apoi reîncearcă.');
    }
  }
  throw friendlyRpcError(error);
}

async function updateUserWrite(id, patch) {
  const steps = [];
  if (patch.full_name !== undefined || patch.native_language !== undefined) {
    steps.push(['admin_update_profile', {
      p_user_id: id,
      p_full_name: patch.full_name !== undefined ? String(patch.full_name) : null,
      p_native_language: patch.native_language !== undefined ? String(patch.native_language) : null,
    }]);
  }
  if (patch.is_admin !== undefined) {
    steps.push(['admin_set_admin', { p_user_id: id, p_is_admin: !!patch.is_admin }]);
  }
  if (patch.is_banned !== undefined) {
    steps.push(['admin_set_ban', {
      p_user_id: id,
      p_banned: !!patch.is_banned,
      p_reason: patch.banned_reason !== undefined ? String(patch.banned_reason) : null,
    }]);
  } else if (patch.banned_reason !== undefined) {
    steps.push(['admin_set_ban', { p_user_id: id, p_banned: true, p_reason: String(patch.banned_reason) }]);
  }
  if (!steps.length) throw new Error('nothing_to_update');
  for (const [rpcName, args] of steps) {
    await writeWithFallback(rpcName, args,
      () => adminFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }));
  }
  return { ok: true };
}

async function sendRecoveryMail(email) {
  const addr = String(email || '').trim();
  if (!addr) throw new Error('Completează adresa de e-mail a contului pentru trimiterea resetării.');
  const { error } = await supabase.auth.resetPasswordForEmail(addr, {
    redirectTo: window.location.origin + '/',
  });
  if (error) throw error;
  return { ok: true, email: addr };
}
async function readWithFallback(direct, server) {
  try {
    return await direct();
  } catch (directErr) {
    try {
      return await server();
    } catch {
      const err = new Error(
        'Nu pot citi datele. Verifică migrația 016_admin.sql în Supabase (politici RLS pentru admini) și cheia service pe server.');
      err.cause = directErr?.message;
      throw err;
    }
  }
}

export const adminApi = {
  users: ({ q = '', filter = 'all', page = 1, limit = 50 } = {}) =>
    readWithFallback(
      () => usersDirect({ q, filter, page, limit }),
      () => adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}&page=${page}&limit=${limit}`)),
  userDetail: (id) => readWithFallback(() => userDetailDirect(id), () => adminFetch(`/api/admin/users/${encodeURIComponent(id)}`)),
  updateUser: (id, patch) => updateUserWrite(id, patch),
  resetProgress: (id) => writeWithFallback('admin_reset_progress', { p_user_id: id },
    () => adminFetch(`/api/admin/users/${encodeURIComponent(id)}/reset-progress`, { method: 'POST', body: {} })),
  sendRecovery: (id, email) => sendRecoveryMail(email),
  deleteUser: (id) => writeWithFallback('admin_delete_user', { p_user_id: id },
    () => adminFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })),
  lessons: (q = '') => readWithFallback(() => lessonsDirect(q), () => adminFetch(`/api/admin/lessons?q=${encodeURIComponent(q)}`)),
  deleteLesson: (id) => writeWithFallback('admin_delete_lesson', { p_lesson_id: id },
    () => adminFetch(`/api/admin/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' })),
  activity: () => readWithFallback(activityDirect, () => adminFetch('/api/admin/activity')),
  catalog: () => readWithFallback(catalogDirect, () => adminFetch('/api/admin/catalog')),
  createDomain: (domain) => writeWithFallback('admin_upsert_domain',
    {
      p_slug: String(domain.slug || '').toLowerCase(),
      p_name: String(domain.name || '').trim(),
      p_description: String(domain.description || ''),
      p_topics: Array.isArray(domain.topics) ? domain.topics : [],
    },
    () => adminFetch('/api/admin/domains', { method: 'POST', body: domain })),
  updateDomain: (slug, patch) => writeWithFallback('admin_upsert_domain',
    {
      p_slug: slug,
      p_name: patch.name !== undefined ? String(patch.name) : null,
      p_description: patch.description !== undefined ? String(patch.description) : null,
      p_topics: Array.isArray(patch.topics) ? patch.topics : null,
    },
    () => adminFetch(`/api/admin/domains/${encodeURIComponent(slug)}`, { method: 'PUT', body: patch })),
  deleteDomain: (slug) => writeWithFallback('admin_delete_domain', { p_slug: slug },
    () => adminFetch(`/api/admin/domains/${encodeURIComponent(slug)}`, { method: 'DELETE' })),
};
