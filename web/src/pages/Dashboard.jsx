import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import {
  t, tp, getLang, topicName, domainName, languageName, loadCatalogTranslations,
  PASS, LEVELS, PROMOTION_THRESHOLD,
  currentStreak, longestStreak, lessonsPerWeek, materialMet, meanAccuracy,
  recentlyCompleted, scoresOverTime, activityGrid, pacePerWeek, daysSinceLast,
  favouriteSlot, domainRollup, currentWeekCount, promotionState,
  loadCards, vocabStats, createDashboardWidgets, DASHBOARD_WIDGETS,
  latestLessonDrafts, draftCompletion, fetchAllRows,
} from '../lib/legacy.js';
import { domainIcon } from '../../../shared/domain-icons.js';
import { topicIcon } from '../../../shared/topic-icons.js';
import { useToast } from '../components/ui.jsx';
import { resolveActiveLanguage, rememberActiveLanguage } from '../lib/lang.js';

const PASS_PCT = Math.round(PASS * 100);
const HEAT_WEEKS = 16;
const W = 300;

const iconSrc = (domain, topic) => {
  try {
    const m = topicIcon(domain, topic).match(/src="([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

const list = { show: { transition: { staggerChildren: 0.06 } } };
const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

const fmtNum = (n) => new Intl.NumberFormat(getLang(), { maximumFractionDigits: 1 }).format(n);
const fmtPct = (v) => new Intl.NumberFormat(getLang(), { maximumFractionDigits: 2 }).format(v * 100);
const fmtDay = (d) => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short' }).format(d);
const fmtAgo = (days) => new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' }).format(-days, 'day');

const goalKey = (uid) => `weeklyGoal:${uid}`;
// This device first (instant), then the account copy (syncs new devices),
// then the default. Saves always write both places at once.
const getGoalTarget = (u) => {
  let v = null;
  try { v = parseInt(localStorage.getItem(goalKey(u.id)), 10); } catch { /* fallback below */ }
  if (Number.isInteger(v) && v >= 1) return v;
  const meta = u?.user_metadata?.weekly_goal;
  if (Number.isInteger(meta) && meta >= 1) return meta;
  return 5;
};

const CHEV_UP = (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>);
const CHEV_DOWN = (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>);
const CHEV_X = (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>);

function TrendChart({ points }) {
  const H = 96, P = 12;
  const x = (i) => (points.length < 2 ? W / 2 : P + ((W - 2 * P) * i) / (points.length - 1));
  const y = (a) => H - P - (H - 2 * P) * Math.min(1, Math.max(0, a));
  const passY = y(PASS);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dash.trend.title')} className="w-full">
      <line x1={P} y1={passY} x2={W - P} y2={passY} stroke="var(--border)" strokeDasharray="4 3" />
      <polyline points={points.map((p, i) => `${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i).toFixed(1)} cy={y(p.accuracy).toFixed(1)} r="3.5" fill="var(--primary)">
          <title>{Math.round(p.accuracy * 100)}%</title>
        </circle>
      ))}
    </svg>
  );
}

function Bars({ bars }) {
  const H = 112, P = 8;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const bw = (W - 2 * P) / bars.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dash.weekly.title')} className="w-full">
      {bars.map((b, i) => {
        const h = Math.round(((H - 32) * b.count) / max);
        const cx = P + i * bw + bw / 2;
        return (
          <g key={i}>
            <title>{tp('dash.act.cell', b.count, { date: fmtDay(b.monday) })}</title>
            <rect
              x={(cx - (bw - 6) / 2).toFixed(1)} y={H - 24 - h}
              width={(bw - 6).toFixed(1)} height={Math.max(b.count ? 3 : 0, h)} rx="2"
              fill={b.count ? 'var(--primary)' : 'var(--border-secondary)'}
            />
            <text x={cx.toFixed(1)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">
              {b.monday.getDate()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ learned, total }) {
  const C = 2 * Math.PI * 34;
  const share = total ? learned / total : 0;
  return (
    <svg viewBox="0 0 90 90" role="img" aria-label={`${learned}/${total}`} className="h-24 w-24">
      <circle cx="45" cy="45" r="34" fill="none" stroke="var(--border-secondary)" strokeWidth="10" />
      <circle cx="45" cy="45" r="34" fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(share * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 45 45)" />
      <text x="45" y="45" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="var(--text)">
        {learned}/{total}
      </text>
    </svg>
  );
}

const LEVEL_IDX = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

export default function Dashboard({ user, onReview, onStartLesson }) {
  const [toast, toastNode] = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [widgets, setWidgets] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dropPos, setDropPos] = useState(null); // { id, after }
  const dragId = useRef(null);

  const clearDrag = () => { dragId.current = null; setDropPos(null); };
  const posFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return (e.clientY - rect.top) > rect.height / 2;
  };
  const onDragStart = (e, id) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* Safari needs this */ }
  };
  const onDragOverCard = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const after = posFromEvent(e);
    if (dropPos?.id !== id || dropPos?.after !== after) setDropPos({ id, after });
  };
  // Drop exactly where the mouse stops: the dragged widget lands before or
  // after the card under the cursor, inside its own group (KPIs vs sections).
  const onDropOn = (id) => (e) => {
    e.preventDefault();
    const from = dragId.current || (() => { try { return e.dataTransfer.getData('text/plain'); } catch { return null; } })();
    const after = posFromEvent(e);
    clearDrag();
    const mgr = widgets?.mgr;
    if (!mgr || !from || from === id) return;
    const kpi = KPI_IDS.includes(from);
    if (KPI_IDS.includes(id) !== kpi) return;
    const full = mgr.getOrder();
    const seq = full.filter((x) => KPI_IDS.includes(x) === kpi && mgr.isVisible(x));
    const fromIdx = seq.indexOf(from);
    let toIdx = seq.indexOf(id);
    if (fromIdx < 0 || toIdx < 0) return;
    seq.splice(fromIdx, 1);
    toIdx = seq.indexOf(id) + (after ? 1 : 0);
    seq.splice(toIdx, 0, from);
    const it = seq.values();
    mgr.setOrder(full.map((x) => (KPI_IDS.includes(x) === kpi && mgr.isVisible(x) ? it.next().value : x)));
  };

  const saveGoal = (v) => {
    const value = Math.max(1, Math.round(v) || 1);
    try { localStorage.setItem(goalKey(user.id), String(value)); } catch { /* repaint below */ }
    setReloadKey((k) => k + 1);
    supabase.auth.updateUser({ data: { weekly_goal: value } }).then(({ error }) => {
      if (error) toast(t('dash.widgets.saveFailed'), 'error');
    });
  };

  // Push a device-only goal into the account once, so new devices inherit it.
  useEffect(() => {
    if (user?.user_metadata && !Number.isInteger(user.user_metadata.weekly_goal)) {
      let v = null;
      try { v = parseInt(localStorage.getItem(goalKey(user.id)), 10); } catch { /* nothing to push */ }
      if (Number.isInteger(v) && v >= 1) supabase.auth.updateUser({ data: { weekly_goal: v } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    const mgr = createDashboardWidgets({
      sb: supabase,
      user,
      onChange: () => setWidgets({ mgr }),
      onStatus: (value) => {
        if (value === 'error') toast(t('dash.widgets.saveFailed'), 'error');
      },
    });
    setWidgets({ mgr });
    mgr.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const langsRes = await supabase.from('user_languages').select('*').eq('user_id', user.id).order('created_at');
      const langs = langsRes.data || [];
      if (!langs.length) {
        if (alive) {
          setData({ emptyLangs: true });
          setLoading(false);
        }
        return;
      }
      let active = null;
      const resolved = resolveActiveLanguage(langs);
      active = resolved.language_code;
      rememberActiveLanguage(active);
      const row = resolved;
      const level = row.level;
      const earnedLevel = row.earned_level || 'A1';
      await loadCatalogTranslations(supabase);
      if (!alive) return;
      const [ud, lessons, progress, attemptsRes] = await Promise.all([
        fetchAllRows(supabase.from('user_domains').select('domain_slug, topics', { count: 'exact' }).eq('user_id', user.id).eq('language_code', active).order('domain_slug', { ascending: true })),
        fetchAllRows(supabase.from('lessons').select('id, domain_slug, topic, level', { count: 'exact' }).eq('language_code', active).eq('level', level).order('domain_slug', { ascending: true }).order('topic', { ascending: true })),
        fetchAllRows(supabase.from('user_progress').select('lesson_id, completed, score, total, completed_at, resume_state, resume_updated_at, lessons(language_code, domain_slug, topic, level)', { count: 'exact' }).eq('user_id', user.id).order('lesson_id', { ascending: true })),
        supabase.from('lesson_attempts').select('sequence, language_code, level, score, total').eq('user_id', user.id).eq('language_code', active).eq('level', earnedLevel).order('sequence', { ascending: false }).limit(10),
      ]);
      let deck = null;
      try {
        const { cards, ready } = await loadCards(supabase, { userId: user.id, language: active });
        if (ready) deck = vocabStats(cards);
      } catch (err) {
        if (alive) setError(err?.message || t('dash.widgets.saveFailed'));
      }
      if (!alive) return;
      setData({
        ud, lessons, progress,
        attempts: attemptsRes.data || [],
        historyReady: !attemptsRes.error,
        deck, active, level, earnedLevel, langs,
      });
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, reloadKey]);

  if (loading || !widgets) return <p className="text-sm text-[var(--text-secondary)]">{t('common.moment')}</p>;
  if (error && !data) return <p className="text-sm text-[var(--danger-text)]">{error}</p>;
  if (data?.emptyLangs) {
    return (
      <section className="grid gap-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
        <p className="text-sm text-[var(--text-secondary)]">{t('dash.empty')}</p>
        <button onClick={() => window.location.reload()} className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
          {t('dash.emptyLink')}
        </button>
      </section>
    );
  }
  if (!data) return null;

  const mgr = widgets.mgr;
  const isVisible = (id) => mgr.isVisible(id);
  const hide = (id) => mgr.setVisible(id, false);

  const KPI_IDS = ['streak', 'completed', 'average', 'words'];
  const orderOf = (id) => {
    const full = widgets?.mgr?.getOrder?.() || [];
    const i = full.indexOf(id);
    return i < 0 ? full.length : i;
  };
  // Swap with the nearest visible widget of the same group (KPIs vs sections).
  const moveWidget = (id, dir) => {
    const mgr = widgets?.mgr;
    if (!mgr) return;
    const full = mgr.getOrder();
    const i = full.indexOf(id);
    if (i < 0) return;
    const kpi = KPI_IDS.includes(id);
    for (let j = i + dir; j >= 0 && j < full.length; j += dir) {
      const other = full[j];
      if ((KPI_IDS.includes(other) === kpi) && mgr.isVisible(other)) {
        const next = [...full];
        [next[i], next[j]] = [next[j], next[i]];
        mgr.setOrder(next);
        return;
      }
    }
  };
  const WidgetTools = ({ id, hideLabel }) => {
    const tool = 'grid h-6 w-6 place-items-center rounded-md text-[var(--text-tertiary)] transition-all hover:text-[var(--text)]';
    return (
      <span className="absolute top-2.5 right-2.5 flex gap-0.5 opacity-0 transition-all focus-within:opacity-100 [.group:hover_&]:opacity-100">
        <button onClick={() => moveWidget(id, -1)} title={t('dash.widgets.up')} aria-label={t('dash.widgets.up')} className={tool}>{CHEV_UP}</button>
        <button onClick={() => moveWidget(id, 1)} title={t('dash.widgets.down')} aria-label={t('dash.widgets.down')} className={tool}>{CHEV_DOWN}</button>
        <button onClick={() => hide(id)} title={hideLabel} aria-label={hideLabel} className={tool}>{CHEV_X}</button>
      </span>
    );
  };

  const { ud, lessons, progress, attempts, historyReady, deck, active, level, earnedLevel } = data;
  const key = (d, topic) => `${d}|${topic}`;
  const lessonMap = Object.fromEntries(lessons.map((l) => [key(l.domain_slug, l.topic), l]));
  const progMap = Object.fromEntries(progress.map((p) => [p.lesson_id, p]));
  const progOf = (d, topic) => progMap[lessonMap[key(d, topic)]?.id];
  const inLang = progress.filter((p) => p.lessons?.language_code === active);
  const doneInLang = inLang.filter((p) => p.completed);
  const topics = ud.flatMap((d) => (d.topics || []).map((topic) => ({ domain: d.domain_slug, topic })));
  const doneList = topics.filter((x) => progOf(x.domain, x.topic)?.completed);
  const weak = doneList
    .filter((x) => { const p = progOf(x.domain, x.topic); return p.total && p.score / p.total < PASS; })
    .sort((a, b) => {
      const pa = progOf(a.domain, a.topic), pb = progOf(b.domain, b.topic);
      return pa.score / pa.total - pb.score / pb.total;
    });
  const promo = promotionState({ level: earnedLevel, language: active, attempts });
  const drafts = latestLessonDrafts(user.id, progress).filter(
    (draft) =>
      draft.nativeLanguage === getLang() && draft.params?.lang === active && draft.params.level === level
      && topics.some((x) => x.domain === draft.params.domain && x.topic === draft.params.topic)
      && lessons.some((l) => l.id === draft.lessonId)
  );
  const resume = drafts[0] || null;
  const next = resume
    ? { domain: resume.params.domain, topic: resume.params.topic }
    : topics.find((x) => !progOf(x.domain, x.topic)?.completed) || weak[0] || null;

  const startParams = (d, topic, custom = null, resumeDraft = false) => ({
    lang: active, domain: d, topic, level, custom, resume: resumeDraft,
  });

  const streak = currentStreak(progress);
  const best = longestStreak(progress);
  const { words, phrases } = materialMet(doneInLang.length);
  const wordCount = deck ? deck.total : words;
  const kpis = [
    { id: 'streak', n: String(streak), label: t('dash.streak'), sub: best > streak ? tp('dash.kpi.record', best, { n: best }) : t('dash.kpi.streakHint') },
    { id: 'completed', n: `${doneList.length}/${topics.length}`, label: t('dash.stat.done', { level }), sub: t('dash.kpi.ofLevel', { pct: topics.length ? Math.round((doneList.length / topics.length) * 100) : 0 }) },
    { id: 'average', n: promo.accuracy === null ? '–' : `${fmtPct(promo.accuracy)}%`, label: t('dash.stat.avg'), sub: historyReady ? t('dash.lvl.series', { done: promo.testCount, total: promo.required }) : t('dash.lvl.historyError') },
    { id: 'words', n: String(wordCount), label: t('dash.kpi.words'), sub: deck ? tp('dash.kpi.learned', deck.learned, { n: fmtNum(deck.learned) }) : tp('dash.kpi.phrases', phrases, { n: fmtNum(phrases) }) },
  ];
  const visibleKpis = kpis.filter((k) => isVisible(k.id));

  const points = scoresOverTime(doneInLang, 20);
  const bars = lessonsPerWeek(progress, new Date(), 8);
  const barsTotal = bars.reduce((s, b) => s + b.count, 0);
  const target = getGoalTarget(user);
  const weekCount = currentWeekCount(progress);
  const goalPct = Math.min(100, Math.round((weekCount / target) * 100));
  const grid = activityGrid(progress, new Date(), HEAT_WEEKS);
  const inWindow = grid.flat().reduce((s, c) => s + c.count, 0);
  const hasDone = progress.some((p) => p.completed && p.completed_at);
  const habit = favouriteSlot(progress);
  const roll = domainRollup(ud, progOf, (d) => domainName(d));
  const recent = recentlyCompleted(doneInLang, 5);

  const promote = async () => {
    const { data: newLevel, error: err } = await supabase.rpc('try_promote', { p_language: active });
    if (err || !newLevel) {
      toast(err?.message || t('dash.lvl.notYet'), 'error');
      return;
    }
    toast(t('dash.lvl.promoted', { level: newLevel }));
    setReloadKey((k) => k + 1);
  };

  const idx = LEVEL_IDX[earnedLevel] ?? 0;

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid grid-flow-dense gap-4 md:grid-cols-2 xl:grid-cols-4">
      {toastNode}
      {error && <p className="text-sm text-[var(--danger-text)] md:col-span-2">{error}</p>}

      {resume && (
        <button
          onClick={() => onStartLesson({ ...startParams(resume.params.domain, resume.params.topic, resume.params.custom, true) })}
          className="group grid gap-2 rounded-2xl border border-[var(--primary)] bg-[var(--bg-container)] p-4 text-left md:col-span-2 xl:col-span-4"
        >
          <span className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">{t('dash.resume')}</span>
          <span className="text-lg font-bold">{topicName(resume.params.domain, resume.params.topic)}</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {t('les.stepOf', { n: (draftCompletion(resume).stepIdx || 0) + 1, total: draftCompletion(resume).totalSteps || '?' })} · {t('les.continue')} →
          </span>
        </button>
      )}

      {visibleKpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:col-span-2 lg:grid-cols-4 xl:col-span-4">
          {[...visibleKpis].sort((a, b) => orderOf(a.id) - orderOf(b.id)).map((k) => (
            <motion.div key={k.id} layout variants={rise} draggable onDragStart={(e) => onDragStart(e, k.id)} onDragOver={(e) => onDragOverCard(e, k.id)} onDrop={onDropOn(k.id)} onDragEnd={clearDrag} className={`group relative grid content-start gap-1 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === k.id ? ' ring-2 ring-[var(--primary)]' : '')}>
              <WidgetTools id={k.id} hideLabel={t('dash.widgets.hide', { name: k.label })} />
              <span className="text-xs text-[var(--text-secondary)]">{k.label}</span>
              <span className="text-3xl font-bold tracking-tight">{k.n}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{k.sub}</span>
            </motion.div>
          ))}
        </div>
      )}

      {isVisible('focus') && (
        <motion.section layout variants={rise} style={{ order: orderOf('focus') }} draggable onDragStart={(e) => onDragStart(e, 'focus')} onDragOver={(e) => onDragOverCard(e, 'focus')} onDrop={onDropOn('focus')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === 'focus' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="focus" hideLabel={t('dash.widgets.hide', { name: t('dash.focus.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.focus.title')}</h2>
          {(next || weak[0]) ? (
          <div className="grid gap-1.5">
            {next && (
              <button onClick={() => onStartLesson(startParams(next.domain, next.topic))}
                className="flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--fill)]">
                <span className="min-w-0 truncate">{t('dash.focus.next')}: {topicName(next.domain, next.topic)}</span>
                <span aria-hidden="true" className="flex-none">→</span>
              </button>
            )}
            {weak[0] && (() => {
              const w0 = weak[0];
              const p = progOf(w0.domain, w0.topic);
              const src = iconSrc(w0.domain, w0.topic);
              return (
                <button onClick={() => onStartLesson(startParams(w0.domain, w0.topic))}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--fill)]">
                  {src && <img src={src} alt="" aria-hidden="true" loading="lazy" className="h-5 w-5 opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  <span className="min-w-0 flex-1 truncate">{t('dash.focus.weak')}: {topicName(w0.domain, w0.topic)}</span>
                  <span className="flex-none text-xs text-[var(--text-tertiary)]">{p.score}/{p.total}</span>
                </button>
              );
            })()}
          </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('dash.empty.lessons')}</p>
          )}
        </motion.section>
      )}

      {isVisible('level') && (
        <motion.section layout variants={rise} style={{ order: orderOf('level') }} draggable onDragStart={(e) => onDragStart(e, 'level')} onDragOver={(e) => onDragOverCard(e, 'level')} onDrop={onDropOn('level')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2.5 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4 md:col-span-2 xl:col-span-2` + (dropPos?.id === 'level' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="level" hideLabel={t('dash.widgets.hide', { name: t('dash.widgets.level') })} />
          <h2 className="text-sm font-semibold">{promo.next ? t('dash.lvl.toward', { level: promo.next }) : t('dash.lvl.max')}</h2>
          <div className="flex gap-1" aria-hidden="true">
            {LEVELS.map((l, i) => (
              <span key={l} className={`grid h-7 flex-1 place-items-center rounded-md text-[11px] font-bold ${i < idx ? 'bg-[var(--fill-strong)] text-[var(--text-tertiary)]' : i === idx ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'bg-[var(--fill)] text-[var(--text-tertiary)]'}`}>
                {l}
              </span>
            ))}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{t('dash.lvl.plain', { n: promo.required, pass: PASS_PCT })}</p>
          {promo.next && historyReady && (
            <>
              <p className="text-xs text-[var(--text-secondary)]">
                {t('dash.lvl.series', { done: promo.testCount, total: promo.required })}
                {promo.accuracy === null ? '' : ` · ${t('dash.lvl.seriesAvg', { avg: fmtPct(promo.accuracy) })}`}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--fill-strong)]" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={promo.percent}>
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${promo.percent}%` }} />
              </div>
            </>
          )}
          {promo.next && (
            <p className="text-xs text-[var(--text-secondary)]">
              {!historyReady ? t('dash.lvl.historyError')
                : promo.ready ? t('dash.lvl.ready', { level: promo.next })
                : (() => {
                    const req = [];
                    if (promo.testsLeft) req.push(tp('dash.lvl.reqLeft', promo.testsLeft));
                    if (promo.accuracy !== null && !promo.accuracyOk) req.push(t('dash.lvl.reqAvg', { avg: fmtPct(promo.accuracy), pass: PASS_PCT }));
                    return req.length ? t('dash.lvl.need', { level: promo.next, req: req.join('; ') }) : '';
                  })()}
            </p>
          )}
          {!promo.next && <p className="text-xs text-[var(--text-secondary)]">{t('dash.lvl.maxDesc')}</p>}
          {promo.next && promo.ready && (
            <button onClick={promote} className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
              {t('dash.lvl.promote', { level: promo.next })}
            </button>
          )}
        </motion.section>
      )}

      {isVisible('trend') && (
        <motion.section layout variants={rise} style={{ order: orderOf('trend') }} draggable onDragStart={(e) => onDragStart(e, 'trend')} onDragOver={(e) => onDragOverCard(e, 'trend')} onDrop={onDropOn('trend')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4 md:col-span-2 xl:col-span-2` + (dropPos?.id === 'trend' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="trend" hideLabel={t('dash.widgets.hide', { name: t('dash.trend.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.trend.title')}</h2>
          {points.length ? (
            <>
              <TrendChart points={points} />
              <p className="text-xs text-[var(--text-tertiary)]">{t('dash.trend.last', { n: points.length })} · {fmtPct(points[points.length - 1].accuracy)}%</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('dash.trend.empty')}</p>
          )}
        </motion.section>
      )}

      {isVisible('weekly') && (
        <motion.section layout variants={rise} style={{ order: orderOf('weekly') }} draggable onDragStart={(e) => onDragStart(e, 'weekly')} onDragOver={(e) => onDragOverCard(e, 'weekly')} onDrop={onDropOn('weekly')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4 md:col-span-2 xl:col-span-2` + (dropPos?.id === 'weekly' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="weekly" hideLabel={t('dash.widgets.hide', { name: t('dash.weekly.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.weekly.title')}</h2>
          <Bars bars={bars} />
          <p className="text-xs text-[var(--text-tertiary)]">{t('dash.weekly.span')}: <b>{barsTotal}</b></p>
        </motion.section>
      )}

      {isVisible('mastery') && (
        <motion.section layout variants={rise} style={{ order: orderOf('mastery') }} draggable onDragStart={(e) => onDragStart(e, 'mastery')} onDragOver={(e) => onDragOverCard(e, 'mastery')} onDrop={onDropOn('mastery')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === 'mastery' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="mastery" hideLabel={t('dash.widgets.hide', { name: t('dash.mastery.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.mastery.title')}</h2>
          {deck && deck.total ? (
          <>
          <div className="flex items-center gap-4">
            <Donut learned={deck.learned} total={deck.total} />
            <div className="grid gap-1 text-sm">
              <div>{tp('dash.kpi.learned', deck.learned, { n: fmtNum(deck.learned) })} {t('dash.mastery.learned')}</div>
              <div className="text-[var(--text-secondary)]">{fmtNum(deck.total - deck.learned)} {t('dash.mastery.learning')}</div>
              <div className="text-xs text-[var(--text-tertiary)]">{fmtNum(deck.due)} {t('dash.mastery.due')}</div>
            </div>
          </div>
          {!!deck.due && (
            <button onClick={onReview} className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
              {t('dash.review.start')}
            </button>
          )}
          </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('dash.empty.words')}</p>
          )}
        </motion.section>
      )}

      {isVisible('goal') && (
        <motion.section layout variants={rise} style={{ order: orderOf('goal') }} draggable onDragStart={(e) => onDragStart(e, 'goal')} onDragOver={(e) => onDragOverCard(e, 'goal')} onDrop={onDropOn('goal')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === 'goal' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="goal" hideLabel={t('dash.widgets.hide', { name: t('dash.goal.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.goal.title')}</h2>
          <div className="text-3xl font-bold">{weekCount}<span className="text-lg text-[var(--text-tertiary)]">/{target}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--fill-strong)]" role="progressbar" aria-label={t('dash.goal.title')} aria-valuemin="0" aria-valuemax={target} aria-valuenow={Math.min(weekCount, target)}>
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${goalPct}%` }} />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {weekCount >= target ? t('dash.goal.reached') : t('dash.goal.progress', { done: weekCount, target })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                saveGoal(target - 1);
              }}
              aria-label={t('dash.goal.less')}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-sm hover:border-[var(--text-tertiary)]"
            >−</button>
            <button
              onClick={() => {
                saveGoal(target + 1);
              }}
              aria-label={t('dash.goal.more')}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-sm hover:border-[var(--text-tertiary)]"
            >+</button>
          </div>
        </motion.section>
      )}

      {isVisible('review') && (
        <motion.section layout variants={rise} style={{ order: orderOf('review') }} draggable onDragStart={(e) => onDragStart(e, 'review')} onDragOver={(e) => onDragOverCard(e, 'review')} onDrop={onDropOn('review')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === 'review' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="review" hideLabel={t('dash.widgets.hide', { name: t('dash.review.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.review.title')}</h2>
          {deck && deck.total ? (
          <div className="text-3xl font-bold">{deck.due}<span className="text-sm font-normal text-[var(--text-tertiary)]"> {tp('dash.review.of', deck.total, { n: fmtNum(deck.total) })}</span></div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('dash.empty.words')}</p>
          )}
          {deck && !!deck.total && (
          <p className="text-xs text-[var(--text-secondary)]">{deck.due ? tp('dash.review.due', deck.due, { n: fmtNum(deck.due) }) : t('dash.review.clear')}</p>
          )}
          {!!deck?.due && (
            <button onClick={onReview} className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
              {t('dash.review.start')}
            </button>
          )}
        </motion.section>
      )}

      {isVisible('activity') && (
        <motion.section layout variants={rise} style={{ order: orderOf('activity') }} draggable onDragStart={(e) => onDragStart(e, 'activity')} onDragOver={(e) => onDragOverCard(e, 'activity')} onDrop={onDropOn('activity')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4 md:col-span-2 xl:col-span-4` + (dropPos?.id === 'activity' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="activity" hideLabel={t('dash.widgets.hide', { name: t('dash.act.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.act.title')}</h2>
          {!hasDone ? (
            <div className="grid gap-2">
              <span className="text-sm text-[var(--text-secondary)]">{t('dash.act.empty')}</span>
              <button onClick={() => next && onStartLesson(startParams(next.domain, next.topic))} className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
                {t('dash.next.btn.start')}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-[3px]" role="img" aria-label={tp('dash.act.summary', inWindow)}>
                {grid.map((col, wi) => (
                  <div key={wi} className="grid flex-1 gap-[3px]">
                    {col.map((c) => (
                      <span
                        key={c.key}
                        title={c.future ? '' : tp('dash.act.cell', c.count, { date: fmtDay(c.date) })}
                        className="aspect-square w-full rounded-[3px]"
                        style={{ background: c.future ? 'transparent' : `color-mix(in srgb, var(--primary) ${(c.count >= 4 ? 100 : c.count * 25)}%, var(--fill-strong))`, opacity: c.future ? 0.25 : 1, border: c.future ? '1px dashed var(--border-secondary)' : 'none' }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]" aria-hidden="true">
                <span>{t('dash.act.less')}</span>
                {[0, 1, 2, 3, 4].map((n) => (
                  <span key={n} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--primary) ${n * 25}%, var(--fill-strong))` }} />
                ))}
                <span>{t('dash.act.more')}</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                {tp('dash.act.pace', Math.round(pacePerWeek(progress) * 10) / 10, { n: fmtNum(pacePerWeek(progress)) })} · {t('dash.act.last', { when: fmtAgo(daysSinceLast(progress)) })}
              </p>
              {habit && <p className="text-xs text-[var(--text-secondary)]">{t('dash.habit.' + habit.slot)}</p>}
            </>
          )}
        </motion.section>
      )}

      {isVisible('weak') && (
        <motion.section layout variants={rise} style={{ order: orderOf('weak') }} draggable onDragStart={(e) => onDragStart(e, 'weak')} onDragOver={(e) => onDragOverCard(e, 'weak')} onDrop={onDropOn('weak')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === 'weak' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="weak" hideLabel={t('dash.widgets.hide', { name: t('dash.rev.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.rev.title')}</h2>
          <p className="text-xs text-[var(--text-secondary)]">{t('dash.rev.note', { pass: PASS_PCT })}</p>
          {weak.length ? (
          <div className="grid gap-1">
            {weak.slice(0, 5).map((x) => {
              const p = progOf(x.domain, x.topic);
              const src = iconSrc(x.domain, x.topic);
              return (
                <button key={`${x.domain}|${x.topic}`} onClick={() => onStartLesson(startParams(x.domain, x.topic))}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--fill)]">
                  {src && <img src={src} alt="" aria-hidden="true" loading="lazy" className="h-5 w-5 opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  <span className="min-w-0 flex-1 truncate">{topicName(x.domain, x.topic)}</span>
                  <span className="flex-none text-xs text-[var(--text-tertiary)]">{p.score}/{p.total}</span>
                </button>
              );
            })}
          </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('dash.empty.scores')}</p>
          )}
        </motion.section>
      )}

      {isVisible('domains') && (
        <motion.section layout variants={rise} style={{ order: orderOf('domains') }} draggable onDragStart={(e) => onDragStart(e, 'domains')} onDragOver={(e) => onDragOverCard(e, 'domains')} onDrop={onDropOn('domains')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2.5 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4 md:col-span-2 xl:col-span-2` + (dropPos?.id === 'domains' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="domains" hideLabel={t('dash.widgets.hide', { name: t('dash.dom.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.dom.title')}</h2>
          {roll.filter((r) => r.accuracy !== null).length > 1 && (
            <p className="text-xs text-[var(--text-secondary)]">{t('dash.dom.note')}</p>
          )}
          <div className="grid gap-2.5">
            {roll.map((r) => {
              const pct = r.accuracy === null ? null : Math.round(r.accuracy * 100);
              const under = pct !== null && r.accuracy < PASS;
              return (
                <div key={r.slug}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex flex-none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: domainIcon(r.slug) }} />
                      <span className="truncate font-medium">{r.name}</span>
                    </span>
                    <span className={`flex-none text-xs ${under ? 'text-[var(--danger-text)]' : 'text-[var(--text-tertiary)]'}`}>
                      {pct === null ? t('dash.dom.noScore') : under ? `${pct}% · ${t('dash.dom.under')}` : `${pct}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--fill-strong)]" aria-hidden="true">
                    <div className={`h-full rounded-full ${under ? 'bg-[var(--danger-text)]' : 'bg-[var(--primary)]'}`} style={{ width: `${pct ?? 0}%` }} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{t('dash.unitDone', { done: r.done, total: r.total })}</div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)]">{t('dash.dom.pass', { pass: PASS_PCT })}</p>
        </motion.section>
      )}

      {isVisible('recent') && (
        <motion.section layout variants={rise} style={{ order: orderOf('recent') }} draggable onDragStart={(e) => onDragStart(e, 'recent')} onDragOver={(e) => onDragOverCard(e, 'recent')} onDrop={onDropOn('recent')} onDragEnd={clearDrag} className={`group relative grid content-start gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4` + (dropPos?.id === 'recent' ? ' ring-2 ring-[var(--primary)]' : '')}>
          <WidgetTools id="recent" hideLabel={t('dash.widgets.hide', { name: t('dash.rec.title') })} />
          <h2 className="text-sm font-semibold">{t('dash.rec.title')}</h2>
          {recent.length ? (
          <div className="grid gap-1">
            {recent.map((p) => {
              const src = iconSrc(p.lessons.domain_slug, p.lessons.topic);
              return (
                <button key={p.lesson_id} onClick={() => onStartLesson(startParams(p.lessons.domain_slug, p.lessons.topic))}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--fill)]">
                  {src && <img src={src} alt="" aria-hidden="true" loading="lazy" className="h-5 w-5 opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  <span className="min-w-0 flex-1 truncate">{topicName(p.lessons.domain_slug, p.lessons.topic)}</span>
                  <span className="flex-none text-xs text-[var(--text-tertiary)]">
                    {fmtAgo(Math.round((new Date(new Date().setHours(0, 0, 0, 0)) - new Date(new Date(p.completed_at).setHours(0, 0, 0, 0))) / 86400000))}
                  </span>
                </button>
              );
            })}
          </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('dash.empty.lessons')}</p>
          )}
        </motion.section>
      )}
    </motion.div>
  );
}
