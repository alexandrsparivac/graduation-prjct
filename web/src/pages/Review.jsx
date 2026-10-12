import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import {
  t, tp, topicName, loadCatalogTranslations,
  loadCards, gradeCard, session, schedule, GRADES, AGAIN, HARD, GOOD, EASY,
  speechRate,
} from '../lib/legacy.js';
import { speak, stopSpeaking, toLocale, ttsSupported, prefetchSpeech } from '../lib/speech.js';
import { resolveActiveLanguage, rememberActiveLanguage } from '../lib/lang.js';
import { useToast } from '../components/ui.jsx';

const GRADE_KEYS = { [AGAIN]: 'again', [HARD]: 'hard', [GOOD]: 'good', [EASY]: 'easy' };

export default function Review({ user, onExit }) {
  const [toast, toastNode] = useToast();
  const [phase, setPhase] = useState('loading');
  const [cards, setCards] = useState([]);
  const [queue, setQueue] = useState([]);
  const [done, setDone] = useState(0);
  const [leftOver, setLeftOver] = useState(0);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [language, setLanguage] = useState('en');
  const stateRef = useRef({ queue: [], done: 0, all: [] });
  stateRef.current = { queue, done, all: cards };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userLangs } = await supabase.from('user_languages')
        .select('language_code, level').eq('user_id', user.id);
      if (!alive) return;
      if (!userLangs?.length) {
        onExit('onboarding');
        return;
      }
      let lang = resolveActiveLanguage(userLangs)?.language_code;
      if (!lang) {
        onExit('onboarding');
        return;
      }
      rememberActiveLanguage(lang);
      setLanguage(lang);
      await loadCatalogTranslations(supabase);
      if (!alive) return;
      try {
        const { cards: all } = await loadCards(supabase, { userId: user.id, language: lang });
        if (!alive) return;
        setCards(all);
        const s = session(all);
        setQueue(s.cards.slice());
        setLeftOver(s.remaining);
        setDone(0);
        setCurrent(s.cards[0] || null);
        setRevealed(false);
        setPhase(all.length ? 'ready' : 'empty');
      } catch (err) {
        if (!alive) return;
        setPhase('error');
      }
    })();
    return () => { alive = false; stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const next = useCallback(() => {
    stopSpeaking();
    setQueue((q) => {
      const [, ...rest] = q;
      setCurrent(rest[0] || null);
      return rest;
    });
    setRevealed(false);
  }, []);

  const startSitting = useCallback(() => {
    const s = session(cards);
    setQueue(s.cards.slice());
    setLeftOver(s.remaining);
    setDone(0);
    setCurrent(s.cards[0] || null);
    setRevealed(false);
  }, [cards]);

  const grade = useCallback(async (quality) => {
    const card = stateRef.current.queue[0];
    if (!card) return;
    setDone((d) => d + 1);
    next();
    try {
      await gradeCard(supabase, { userId: user.id, language, card, quality });
    } catch (err) {
      toast(t('rev.saveFailed'), 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, language, user.id]);

  useEffect(() => {
    if (current) prefetchSpeech(current.term, toLocale(language));
  }, [current, language]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (!current) return;
      if (!revealed && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        grade(GRADES[+e.key - 1]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, revealed, grade]);

  if (phase === 'loading') return <p className="text-sm text-[var(--text-secondary)]">{t('common.moment')}</p>;
  if (phase === 'error') return <p className="text-sm text-[var(--danger-text)]">{t('dash.widgets.saveFailed')}</p>;
  if (phase === 'empty' || cards.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 py-10 text-center">
        <h1 className="text-xl font-bold">{t('rev.empty.title')}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t('rev.empty.body')}</p>
        <button onClick={() => onExit('dashboard')} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]">
          {t('rev.toDashboard')}
        </button>
      </div>
    );
  }

  if (!current) {
    const more = leftOver > 0;
    return (
      <div className="grid justify-items-center gap-3 py-10 text-center">
        <h1 className="text-xl font-bold">{t(done ? 'rev.done.title' : 'rev.empty.title')}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {done ? tp('rev.done.body', done, { n: done }) : t('rev.empty.body')}
        </p>
        <div className="flex gap-2">
          {more && (
            <button onClick={startSitting} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]">
              {tp('rev.done.more', leftOver, { n: leftOver })}
            </button>
          )}
          <button
            onClick={() => onExit('dashboard')}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${more ? 'border border-[var(--border)]' : 'bg-[var(--primary)] text-[var(--on-primary)]'}`}
          >
            {t('rev.toDashboard')}
          </button>
        </div>
      </div>
    );
  }

  const total = done + queue.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid gap-4">
      {toastNode}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--fill-strong)]" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
          <motion.div className="h-full rounded-full bg-[var(--primary)]" animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
        </div>
        <span className="flex-none text-xs tabular-nums text-[var(--text-tertiary)]">{t('rev.progress', { done: done + 1, total })}</span>
      </div>

      <motion.div
        key={current.term + done}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid justify-items-center gap-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] px-6 py-8 text-center"
      >
        <div className="flex min-h-[22px] items-center gap-2">
          <span className="rounded-md border border-[var(--border)] bg-[var(--fill)] px-2 py-0.5 text-xs">{t('rev.kind.' + (current.kind || 'word'))}</span>
          {current.topic && <span className="text-xs text-[var(--text-tertiary)]">{topicName(current.domain_slug, current.topic)}</span>}
        </div>
        <div className="flex items-center gap-2 text-3xl font-bold" lang={language} dir="auto">
          <span>{current.term}</span>
          {ttsSupported && (
            <button
              onClick={() => speak(current.term, toLocale(language), { rate: speechRate() })}
              title={t('rev.listen')}
              aria-label={t('rev.listen')}
              className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
            </button>
          )}
        </div>
        {revealed ? (
          <div className="grid gap-2">
            <div className="text-lg" dir="auto">{current.translation}</div>
            {current.example && <p className="text-sm text-[var(--text-secondary)]" lang={language} dir="auto">{current.example}</p>}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{t('rev.recall')}</p>
        )}
      </motion.div>

      {revealed ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label={t('rev.gradeLabel')}>
          {GRADES.map((q, i) => (
            <button
              key={q}
              onClick={() => grade(q)}
              className="grid gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-container)] p-3 text-left transition-colors hover:border-[var(--text-tertiary)]"
            >
              <span className="text-sm font-semibold">{t('rev.grade.' + GRADE_KEYS[q])}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{tp('rev.days', schedule(current, q).interval_days, { n: schedule(current, q).interval_days })}</span>
              <kbd className="text-[11px] text-[var(--text-tertiary)]">{i + 1}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setRevealed(true)}
          className="mx-auto flex items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90"
        >
          {t('rev.reveal')} <kbd className="rounded bg-black/20 px-1.5 text-xs">␣</kbd>
        </button>
      )}
    </div>
  );
}
