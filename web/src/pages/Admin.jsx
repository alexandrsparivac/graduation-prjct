import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { adminApi } from '../lib/admin.js';
import { Panel, PanelTitle, BtnSecondary, Msg, inputCls, useToast } from '../components/ui.jsx';
import { t, getLang, langMeta } from '../lib/legacy.js';

const FILTERS = [
  { id: 'all' },
  { id: 'admins' },
  { id: 'banned' },
  { id: 'recent' },
  { id: 'no_onboarding' },
];

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch { return String(iso).slice(0, 10); }
};
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return String(iso).slice(0, 16); }
};

function Badge({ kind, children }) {
  const cls = kind === 'admin'
    ? 'border-[var(--primary)] bg-[var(--fill)] text-[var(--text)]'
    : kind === 'banned'
      ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]'
      : 'border-[var(--border)] text-[var(--text-secondary)]';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function Users({ toast }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ users: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLang, setEditLang] = useState('ro');
  const [banReason, setBanReason] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.users({ q: debouncedQ, filter, page, limit: 50 });
      setList(data);
    } catch (err) { toast(err?.message || t('admin.users.loadFailed'), 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [debouncedQ, filter, page]);

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetail(null);
    setConfirmDelete(false);
    setDetailLoading(true);
    try {
      const d = await adminApi.userDetail(id);
      setDetail(d);
      setEditName(d.profile.full_name || '');
      setEditLang(d.profile.native_language || 'ro');
      setBanReason(d.profile.banned_reason || '');
      setRecoveryEmail(d.email || '');
    } catch { toast(t('admin.detail.loadFailed'), 'error'); }
    finally { setDetailLoading(false); }
  };

  const mutate = async (fn, okMsg) => {
    try {
      await fn();
      toast(okMsg);
      await load();
      if (selectedId) await openDetail(selectedId);
    } catch (e) {
      toast(e.message || t('admin.detail.actionFailed'), 'error');
    }
  };

  const pages = Math.max(1, Math.ceil(list.total / 50));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel>
        <PanelTitle>{t('admin.users.title', { n: list.total })}</PanelTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.users.search')} className={inputCls} />
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className={`${inputCls} sm:w-52`}>
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{t(`admin.filter.${f.id}`)}</option>)}
          </select>
        </div>
        {!loading && list.emailsMissing && (
          <p className="text-xs text-[var(--text-tertiary)]">{t('admin.users.emailsMissing')}</p>
        )}
        {!loading && list.capped && (
          <p className="text-xs text-[var(--text-tertiary)]">{t('admin.users.capped')}</p>
        )}
        {loading ? <p className="text-sm text-[var(--text-secondary)]">{t('admin.users.loading')}</p> : (
          <div className="grid gap-1.5">
            {list.users.map((u) => (
              <button
                key={u.id} onClick={() => openDetail(u.id)}
                className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${selectedId === u.id ? 'border-[var(--primary)] bg-[var(--fill)]' : 'border-[var(--border-secondary)] hover:border-[var(--text-tertiary)]'}`}
              >
                <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--fill-strong)] text-sm font-bold text-[var(--text-secondary)]">
                  {((u.full_name || u.email || '?').trim()[0] || '?').toUpperCase()}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-semibold">{u.full_name || t('admin.users.noName')} {u.is_admin && <Badge kind="admin">{t('admin.badge.admin')}</Badge>} {u.is_banned && <Badge kind="banned">{t('admin.badge.banned')}</Badge>}</span>
                  <span className="truncate text-xs text-[var(--text-tertiary)]">{u.email || t('admin.users.noEmail')} · {t('admin.users.since', { date: fmtDate(u.created_at) })}</span>
                </span>
              </button>
            ))}
            {!list.users.length && <p className="text-sm text-[var(--text-secondary)]">{t('admin.users.noMatch')}</p>}
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <BtnSecondary onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="w-auto px-4">←</BtnSecondary>
          <span className="text-xs text-[var(--text-tertiary)]">{t('admin.users.page', { page, pages })}</span>
          <BtnSecondary onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="w-auto px-4">→</BtnSecondary>
        </div>
      </Panel>

      <Panel>
        <PanelTitle>{t('admin.detail.title')}</PanelTitle>
        {!selectedId && <p className="text-sm text-[var(--text-secondary)]">{t('admin.detail.pick')}</p>}
        {detailLoading && <p className="text-sm text-[var(--text-secondary)]">{t('admin.users.loading')}</p>}
        {detail && (
          <div className="grid gap-3">
            <div className="grid gap-1 text-sm">
              <strong>{detail.profile.full_name || t('admin.users.noName')}</strong>
              <span className="text-[var(--text-secondary)]">{detail.email || t('admin.users.noEmail')} {detail.email_confirmed ? t('admin.detail.confirmed') : t('admin.detail.unconfirmed')}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{t('admin.detail.meta', { id: detail.profile.id, created: fmtDateTime(detail.profile.created_at), login: fmtDateTime(detail.last_sign_in_at) })}</span>
              <span className="flex gap-1.5">{detail.profile.is_admin && <Badge kind="admin">{t('admin.badge.admin')}</Badge>}{detail.profile.is_banned && <Badge kind="banned">{t('admin.badge.banned')}</Badge>}{!detail.profile.onboarding_done && <Badge>{t('admin.detail.unfinished')}</Badge>}</span>
              {detail.profile.is_banned && detail.profile.banned_reason && <span className="text-xs text-[var(--danger-text)]">{t('admin.detail.reason', { reason: detail.profile.banned_reason })}</span>}
            </div>
            <div className="grid gap-2 rounded-xl border border-[var(--border-secondary)] p-3">
              <span className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">{t('admin.edit.title')}</span>
              <label className="grid gap-1 text-sm">{t('admin.edit.name')}<input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} maxLength={120} /></label>
              <label className="grid gap-1 text-sm">{t('admin.edit.uiLang')}
                <select value={editLang} onChange={(e) => setEditLang(e.target.value)} className={inputCls}>
                  {['ro', 'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'uk'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <BtnSecondary onClick={() => mutate(() => adminApi.updateUser(selectedId, { full_name: editName, native_language: editLang }), t('admin.edit.saved'))} className="w-auto px-4">{t('admin.edit.save')}</BtnSecondary>
                {detail.profile.is_admin
                  ? <BtnSecondary onClick={() => mutate(() => adminApi.updateUser(selectedId, { is_admin: false }), t('admin.edit.adminRevoked'))} className="w-auto px-4">{t('admin.edit.revokeAdmin')}</BtnSecondary>
                  : <BtnSecondary onClick={() => mutate(() => adminApi.updateUser(selectedId, { is_admin: true }), t('admin.edit.nowAdmin'))} className="w-auto px-4">{t('admin.edit.makeAdmin')}</BtnSecondary>}
              </div>
            </div>
            <div className="grid gap-2 rounded-xl border border-[var(--border-secondary)] p-3">
              <span className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">{t('admin.mod.title')}</span>
              <label className="grid gap-1 text-sm">{t('admin.mod.reason')}<input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder={t('admin.mod.reasonPh')} className={inputCls} maxLength={300} /></label>
              <div className="flex flex-wrap gap-2">
                {detail.profile.is_banned
                  ? <BtnSecondary onClick={() => mutate(() => adminApi.updateUser(selectedId, { is_banned: false }), t('admin.mod.unbanned'))} className="w-auto px-4">{t('admin.mod.unban')}</BtnSecondary>
                  : <button onClick={() => mutate(() => adminApi.updateUser(selectedId, { is_banned: true, banned_reason: banReason }), t('admin.mod.banned'))} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">{t('admin.mod.ban')}</button>}
              </div>
              <label className="grid gap-1 text-sm">{t('admin.mod.recovery')}<input value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder={t('admin.mod.recoveryPh')} className={inputCls} maxLength={200} /></label>
              <div className="flex flex-wrap gap-2">
                <BtnSecondary onClick={() => mutate(() => adminApi.sendRecovery(selectedId, recoveryEmail), t('admin.mod.recoverySent'))} className="w-auto px-4">{t('admin.mod.sendRecovery')}</BtnSecondary>
              </div>
            </div>
            <div className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">{t('admin.learn.title', { n: detail.languages.length })}</span>
              {detail.languages.map((l) => <span key={l.language_code} className="text-[var(--text-secondary)]">{t('admin.learn.line', { code: l.language_code.toUpperCase(), level: l.level, earned: l.earned_level })}</span>)}
              {!detail.languages.length && <span className="text-[var(--text-tertiary)]">{t('admin.learn.none')}</span>}
              <span className="text-xs text-[var(--text-tertiary)]">{t('admin.learn.stats', { done: detail.progress.filter((p) => p.completed).length, total: detail.progress.length, attempts: detail.attempts.length, vocab: detail.vocab.length })}</span>
            </div>
            <div className="grid gap-2 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3">
              <span className="text-xs font-semibold tracking-wide uppercase">{t('admin.danger.title')}</span>
              <div className="flex flex-wrap gap-2">
                <BtnSecondary onClick={() => mutate(() => adminApi.resetProgress(selectedId), t('admin.danger.progressDeleted'))} className="w-auto px-4 !border-[var(--danger-border)] !text-[var(--danger-text)]">{t('admin.danger.resetProgress')}</BtnSecondary>
                {!confirmDelete
                  ? <BtnSecondary onClick={() => setConfirmDelete(true)} className="w-auto px-4 !border-[var(--danger-border)] !text-[var(--danger-text)]">{t('admin.danger.deleteAccount')}</BtnSecondary>
                  : (<span className="flex gap-2">
                    <button onClick={() => mutate(() => adminApi.deleteUser(selectedId).then(() => { setSelectedId(null); setDetail(null); }), t('admin.danger.accountDeleted'))} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">{t('admin.danger.confirmDelete')}</button>
                    <BtnSecondary onClick={() => setConfirmDelete(false)} className="w-auto px-4">{t('admin.danger.cancel')}</BtnSecondary>
                  </span>)}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Lessons({ toast }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState({ lessons: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [armed, setArmed] = useState(null);
  const load = async () => {
    setLoading(true);
    try { setData(await adminApi.lessons(q)); }
    catch (err) { toast(err?.message || t('admin.lessons.loadFailed'), 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { load(); }, []);
  const del = async (id) => {
    if (armed !== id) {
      setArmed(id);
      toast(t('admin.lessons.pressAgain'));
      setTimeout(() => setArmed((a) => (a === id ? null : a)), 4000);
      return;
    }
    setArmed(null);
    try { await adminApi.deleteLesson(id); toast(t('admin.lessons.deleted')); load(); }
    catch { toast(t('admin.lessons.deleteFailed'), 'error'); }
  };
  return (
    <Panel>
      <PanelTitle>{t('admin.lessons.title', { total: data.total })}</PanelTitle>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.lessons.search')} className={inputCls} />
      {!loading && data.statsCapped && (
        <p className="text-xs text-[var(--text-tertiary)]">{t('admin.lessons.statsCapped')}</p>
      )}
      {loading ? <p className="text-sm text-[var(--text-secondary)]">{t('admin.users.loading')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-tertiary)]">
                <th className="py-1.5 pr-2 font-medium">{t('admin.col.subject')}</th>
                <th className="py-1.5 pr-2 font-medium">{t('admin.col.domain')}</th>
                <th className="py-1.5 pr-2 font-medium">{t('admin.col.language')}</th>
                <th className="py-1.5 pr-2 font-medium">{t('admin.col.level')}</th>
                <th className="py-1.5 pr-2 font-medium">{t('admin.col.usage')}</th>
                <th className="py-1.5 pr-2 font-medium">{t('admin.col.created')}</th>
                <th className="py-1.5 font-medium"><span className="sr-only">{t('admin.col.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.lessons.map((l) => (
                <tr key={l.id} className="border-t border-[var(--border-secondary)]">
                  <td className="max-w-56 truncate py-2 pr-2 font-medium" title={l.topic}>{l.topic}</td>
                  <td className="py-2 pr-2 text-[var(--text-secondary)]">{l.domain_slug}</td>
                  <td className="py-2 pr-2">{l.language_code}→{l.native_language}</td>
                  <td className="py-2 pr-2">{l.level}</td>
                  <td className="py-2 pr-2 text-xs text-[var(--text-tertiary)]">{l.stats.done}/{l.stats.started}</td>
                  <td className="py-2 pr-2 text-xs text-[var(--text-tertiary)]">{fmtDate(l.created_at)}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => del(l.id)} className={`rounded-lg border px-3 py-1.5 text-xs ${armed === l.id ? 'border-red-500 bg-red-600 text-white' : 'border-[var(--border)] hover:border-[var(--danger-border)] hover:text-[var(--danger-text)]'}`}>
                      {armed === l.id ? t('admin.lessons.confirm') : t('admin.lessons.del')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.lessons.length && <p className="py-3 text-sm text-[var(--text-secondary)]">{t('admin.lessons.none')}</p>}
        </div>
      )}
    </Panel>
  );
}

function Catalog({ toast }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ slug: '', name: '', description: '', topics: '' });
  const [editing, setEditing] = useState(null);
  const [editTopics, setEditTopics] = useState('');
  const load = async () => {
    try { setData(await adminApi.catalog()); }
    catch { toast(t('admin.catalog.loadFailed'), 'error'); }
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    try {
      await adminApi.createDomain({
        slug: form.slug, name: form.name, description: form.description,
        topics: form.topics.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast(t('admin.catalog.created'));
      setForm({ slug: '', name: '', description: '', topics: '' });
      load();
    } catch { toast(t('admin.catalog.createFailed'), 'error'); }
  };
  const saveTopics = async (slug) => {
    try {
      await adminApi.updateDomain(slug, { topics: editTopics.split('\n').map((s) => s.trim()).filter(Boolean) });
      toast(t('admin.catalog.saved'));
      setEditing(null);
      load();
    } catch { toast(t('admin.catalog.saveFailed'), 'error'); }
  };
  const remove = async (slug) => {
    if (!window.confirm(t('admin.catalog.confirmDeleteDomain', { slug }))) return;
    try { await adminApi.deleteDomain(slug); toast(t('admin.catalog.deleted')); load(); }
    catch { toast(t('admin.catalog.deleteFailed'), 'error'); }
  };
  if (!data) return <p className="text-sm text-[var(--text-secondary)]">{t('admin.users.loading')}</p>;
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelTitle>{t('admin.catalog.langs', { n: data.languages.length })}</PanelTitle>
        {data.lessonsCapped && (
          <p className="text-xs text-[var(--text-tertiary)]">{t('admin.catalog.langsCapped')}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {data.languages.map((l) => {
            const iso = langMeta(l.code)?.flag || l.code;
            return (
              <span key={l.code} title={t('admin.catalog.lessonsFor', { name: l.name, n: data.lessonsByLang[l.code] || 0 })} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">
                <img src={`/img/flags/${iso}.svg`} alt="" aria-hidden="true" loading="lazy" className="h-3 w-[18px] rounded-[2px] object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                {l.code.toUpperCase()} · {data.lessonsByLang[l.code] || 0}
              </span>
            );
          })}
        </div>
      </Panel>
      <Panel>
        <PanelTitle>{t('admin.catalog.domains', { n: data.domains.length })}</PanelTitle>
        <div className="grid gap-2">
          {data.domains.map((d) => (
            <div key={d.slug} className="rounded-xl border border-[var(--border-secondary)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{d.name}</strong>
                <code className="rounded bg-[var(--fill)] px-1.5 py-0.5 text-xs">{d.slug}</code>
                <span className="text-xs text-[var(--text-tertiary)]">{t('admin.catalog.subjects', { n: (d.topics || []).length })}</span>
                <span className="flex-1" />
                <BtnSecondary onClick={() => { setOpen(open === d.slug ? null : d.slug); setEditing(null); }} className="w-auto px-3 py-1.5 text-xs">{open === d.slug ? t('admin.catalog.close') : t('admin.catalog.open')}</BtnSecondary>
                <BtnSecondary onClick={() => remove(d.slug)} className="w-auto px-3 py-1.5 text-xs !border-[var(--danger-border)] !text-[var(--danger-text)]">{t('admin.catalog.delete')}</BtnSecondary>
              </div>
              {open === d.slug && (
                <div className="mt-2 grid gap-2">
                  {editing === d.slug ? (
                    <>
                      <textarea value={editTopics} onChange={(e) => setEditTopics(e.target.value)} rows={6} className={inputCls} />
                      <div className="flex gap-2">
                        <BtnSecondary onClick={() => saveTopics(d.slug)} className="w-auto px-4 text-xs">{t('admin.catalog.save')}</BtnSecondary>
                        <BtnSecondary onClick={() => setEditing(null)} className="w-auto px-4 text-xs">{t('admin.catalog.cancel')}</BtnSecondary>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {(d.topics || []).map((tp) => <span key={tp} className="rounded-full bg-[var(--fill)] px-2.5 py-1 text-xs">{tp}</span>)}
                      </div>
                      <div><BtnSecondary onClick={() => { setEditing(d.slug); setEditTopics((d.topics || []).join('\n')); }} className="w-auto px-4 text-xs">{t('admin.catalog.editSubjects')}</BtnSecondary></div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelTitle>{t('admin.catalog.newDomain')}</PanelTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">{t('admin.catalog.slug')}<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputCls} placeholder={t('admin.catalog.slugPh')} /></label>
          <label className="grid gap-1 text-sm">{t('admin.catalog.name')}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder={t('admin.catalog.namePh')} /></label>
        </div>
        <label className="grid gap-1 text-sm">{t('admin.catalog.description')}<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder={t('admin.catalog.descriptionPh')} /></label>
        <label className="grid gap-1 text-sm">{t('admin.catalog.topicsLabel')}<textarea value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} rows={4} className={inputCls} placeholder={t('admin.catalog.topicsPh')} /></label>
        <div><BtnSecondary onClick={create} className="w-auto px-4">{t('admin.catalog.create')}</BtnSecondary></div>
      </Panel>
    </div>
  );
}

function Activity({ toast }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    adminApi.activity().then(setData).catch(() => toast(t('admin.activity.loadFailed'), 'error'));
  }, []);
  if (!data) return <p className="text-sm text-[var(--text-secondary)]">{t('admin.users.loading')}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelTitle>{t('admin.activity.tests')}</PanelTitle>
        <div className="grid gap-1.5 text-sm">
          {data.attempts.map((a) => (
            <div key={a.sequence} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-secondary)] px-2.5 py-1.5">
              <span className="min-w-0 truncate">{a.user_name} · {a.language_code.toUpperCase()} {a.level}</span>
              <span className={`flex-none text-xs font-bold ${a.score / a.total >= 0.9 ? 'text-green-600 dark:text-green-400' : 'text-[var(--text-tertiary)]'}`}>{a.score}/{a.total}</span>
            </div>
          ))}
          {!data.attempts.length && <p className="text-[var(--text-secondary)]">{t('admin.activity.noAttempts')}</p>}
        </div>
      </Panel>
      <Panel>
        <PanelTitle>{t('admin.activity.recent')}</PanelTitle>
        <div className="grid gap-1.5 text-sm">
          {data.recent.map((p) => (
            <div key={`${p.user_id}-${p.lesson_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-secondary)] px-2.5 py-1.5">
              <span className="min-w-0 truncate">{p.user_name}</span>
              <span className="flex-none text-xs text-[var(--text-tertiary)]">{fmtDateTime(p.completed_at)}</span>
            </div>
          ))}
          {!data.recent.length && <p className="text-[var(--text-secondary)]">{t('admin.activity.noCompletions')}</p>}
        </div>
      </Panel>
    </div>
  );
}

export default function Admin() {
  const [toast, toastNode] = useToast();
  const [tab, setTab] = useState('users');
  const tabs = useMemo(() => ([
    { id: 'users', labelKey: 'admin.tab.users' },
    { id: 'lessons', labelKey: 'admin.tab.lessons' },
    { id: 'catalog', labelKey: 'admin.tab.catalog' },
    { id: 'activity', labelKey: 'admin.tab.activity' },
  ]), []);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} className="grid gap-4">
      {toastNode}
      <p className="text-sm text-[var(--text-secondary)]">{t('admin.sub')}</p>
      <div role="tablist" aria-label={t('admin.tabs.label')} className="flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.id} role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === t.id ? 'bg-[var(--primary)] font-semibold text-[var(--on-primary)]' : 'border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>
      {tab === 'users' && <Users toast={toast} />}
      {tab === 'lessons' && <Lessons toast={toast} />}
      {tab === 'catalog' && <Catalog toast={toast} />}
      {tab === 'activity' && <Activity toast={toast} />}
    </motion.div>
  );
}
