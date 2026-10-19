import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import {
  t, tp, topicName, loadCatalogTranslations,
  loadCards, gradeCard, session, GOOD,
  speechRate,
} from '../lib/legacy.js';
import { speak, stopSpeaking, toLocale, ttsSupported, prefetchSpeech } from '../lib/speech.js';
import { resolveActiveLanguage, rememberActiveLanguage } from '../lib/lang.js';
import { useToast } from '../components/ui.jsx';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';

export default function Review({ user, onExit }) {
  const [toast, toastNode] = useToast();
  const [phase, setPhase] = useState('loading');
  const [cards, setCards] = useState([]);
  const [queue, setQueue] = useState([]);
  const [done, setDone] = useState(0);
  const [leftOver, setLeftOver] = useState(0);
  const [revealed, setRevealed] = useState([]);
  const [language, setLanguage] = useState('en');
  const advanceLockRef = useRef(false);
  const stateRef = useRef({ queue: [], done: 0, all: [] });
  stateRef.current = { queue, done, all: cards };
  const current = queue[0] || null;

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
        setRevealed([]);
        setPhase(all.length ? 'ready' : 'empty');
      } catch (err) {
        if (!alive) return;
        setPhase('error');
      }
    })();
    return () => { alive = false; stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const startSitting = useCallback(() => {
    const s = session(cards);
    setQueue(s.cards.slice());
    setLeftOver(s.remaining);
    setDone(0);
    setRevealed([]);
  }, [cards]);

  const nextCard = useCallback(async () => {
    if (advanceLockRef.current) return;
    const batch = stateRef.current.queue.slice(0, 3);
    if (!batch.length) return;
    advanceLockRef.current = true;
    stopSpeaking();
    setDone((d) => d + batch.length);
    setQueue((q) => q.slice(batch.length));
    setRevealed([]);
    try {
      // Keep the simple continue action and schedule the shown batch with the
      // default successful recall grade.
      await Promise.all(batch.map((card) => gradeCard(supabase, { userId: user.id, language, card, quality: GOOD })));
    } catch (err) {
      toast(t('rev.saveFailed'), 'error');
    } finally {
      advanceLockRef.current = false;
      window.dispatchEvent(new Event('ld:review-updated'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, user.id]);

  useEffect(() => {
    queue.slice(0, 3).forEach((card) => prefetchSpeech(card.term, toLocale(language)));
  }, [queue, language]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (!current) return;
      const onButton = e.target.matches('button');
      if (!onButton && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault();
        const firstUnrevealed = [0, 1, 2].find((index) => queue[index] && !revealed.includes(index));
        if (firstUnrevealed !== undefined) setRevealed((items) => [...items, firstUnrevealed]);
        return;
      }
      if (!onButton && e.key === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, queue, revealed, nextCard]);

  if (phase === 'loading') return <LoadingOverlay />;
  if (phase === 'error') return <div role="alert" className="mx-auto grid min-h-[35vh] w-full max-w-3xl place-content-center rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-8 text-center text-sm text-[var(--danger-text)]">{t('dash.widgets.saveFailed')}</div>;
  if (phase === 'empty' || cards.length === 0) {
    return <ReviewAvailability total={0} onExit={onExit} />;
  }

  if (!current) {
    if (!done) return <ReviewAvailability total={cards.length} onExit={onExit} />;
    const more = leftOver > 0;
    return (
      <div className="mx-auto grid min-h-[50vh] w-full max-w-2xl content-center justify-items-center gap-4 px-6 py-12 text-center">
        <div className="grid gap-1.5"><h1 className="text-xl font-bold tracking-tight">{t(done ? 'rev.done.title' : 'rev.empty.title')}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {done ? tp('rev.done.body', done, { n: done }) : t('rev.empty.body')}
        </p></div>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {more && (
            <button onClick={startSitting} className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90">
              {tp('rev.done.more', leftOver, { n: leftOver })}
            </button>
          )}
          <button
            onClick={() => onExit('dashboard')}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${more ? 'border border-[var(--border)] bg-[var(--bg-container)] hover:bg-[var(--fill)]' : 'bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90'}`}
          >
            {t('rev.toDashboard')}
          </button>
        </div>
      </div>
    );
  }

  const total = done + queue.length;
  const visibleCards = queue.slice(0, 3);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid w-full gap-4 sm:gap-5">
      {toastNode}
      <div className="grid gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold tracking-tight">{t('dash.review.title')}</h1>
          <span className="text-xs font-medium tabular-nums text-[var(--text-secondary)]">{t('rev.progress', { done, total })}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--fill-strong)]" role="progressbar" aria-label={t('dash.review.title')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
          <motion.div className="h-full rounded-full bg-[var(--primary)]" animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{t('rev.recall')}</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((card, index) => {
          const isRevealed = revealed.includes(index);
          return (
            <motion.article key={`${card.term}-${done}-${index}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`grid content-start gap-3 rounded-2xl border p-4 transition-colors sm:p-4 ${isRevealed ? 'border-[var(--primary)] bg-[var(--fill)]' : 'border-[var(--border-secondary)] bg-[var(--bg-container)] hover:border-[var(--text-tertiary)]'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--fill)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{t('rev.kind.' + (card.kind || 'word'))}</span>
                  {card.topic && <span className="truncate text-[11px] text-[var(--text-tertiary)]">{topicName(card.domain_slug, card.topic)}</span>}
                </div>
                {ttsSupported && <button onClick={() => speak(card.term, toLocale(language), { rate: speechRate() })} title={t('rev.listen')} aria-label={t('rev.listen')}
                  className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-[var(--border-secondary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
                </button>}
              </div>
              <button onClick={() => setRevealed((items) => items.includes(index) ? items : [...items, index])} aria-expanded={isRevealed}
                className="grid min-h-28 content-start gap-2 text-left" lang={language} dir="auto">
                {!isRevealed ? <><span className="text-lg font-bold leading-snug">{card.term}</span><span className="text-xs font-medium text-[var(--text-tertiary)]">{t('rev.reveal')}</span></> : <>
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">{card.term}</span>
                  <span className="text-xl font-bold leading-snug">{card.translation}</span>
                  {card.example && <span className="border-t border-[var(--border-secondary)] pt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{card.example}</span>}
                </>}
              </button>
            </motion.article>
          );
        })}
      </div>
      <div className="flex justify-center pt-1">
        <button onClick={nextCard} className="flex min-h-11 min-w-40 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.98]">
          {t('les.continue')} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

function ReviewAvailability({ total, onExit }) {
  const body = total ? t('dash.review.clear') : t('rev.empty.none');
  return (
    <section className="mx-auto grid min-h-[55vh] w-full max-w-2xl content-center justify-items-center gap-4 px-6 py-12 text-center">
      <h1 className="text-xl font-bold tracking-tight">{t('rev.empty.title')}</h1>
      <p className="flex items-baseline gap-2">
        <span className="text-6xl font-bold tabular-nums tracking-tight">0</span>
        <span className="text-sm text-[var(--text-secondary)]">
          {tp('dash.review.of', total, { n: new Intl.NumberFormat().format(total) })}
        </span>
      </p>
      <p className="max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
      <button onClick={() => onExit('dashboard')} className="mt-1 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90">
        {t('rev.toDashboard')}
      </button>
    </section>
  );
}
