import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, loadCatalogTranslations, loadCards, domainName } from '../lib/legacy.js';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';
import { resolveActiveLanguage } from '../lib/lang.js';
import { setCardSaved } from '../../../shared/vocab.js';
import { speak, stopSpeaking, toLocale } from '../lib/speech.js';
import { speechRate } from '../lib/legacy.js';
import { useToast } from '../components/ui.jsx';

const list = {
  show: { transition: { staggerChildren: 0.04 } },
};
const card = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
};
const SPEAKER = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>;
const BOOKMARK = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4z"/></svg>;

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Vocab({ initialQuery = '' }) {
  const [toast, toastNode] = useToast();
  const [state, setState] = useState({ loading: true, error: '', cards: [], lang: '', userId: '' });
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState('all'); // all | word | phrase | due | saved
  const [playing, setPlaying] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => { if (initialQuery) setQuery(initialQuery); }, [initialQuery]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await loadCatalogTranslations(supabase);
      if (!alive) return;
      const { data: langs } = await supabase.from('user_languages')
        .select('language_code').eq('user_id', user.id).order('created_at');
      const lang = resolveActiveLanguage(langs || [])?.language_code;
      if (!lang) {
        if (alive) setState({ loading: false, error: '', cards: [], lang: '', userId: user.id });
        return;
      }
      try {
        const { cards } = await loadCards(supabase, { userId: user.id, language: lang });
        if (alive) setState({ loading: false, error: '', cards: cards || [], lang, userId: user.id });
      } catch (err) {
        if (alive) setState({ loading: false, error: err.message, cards: [], lang, userId: user.id });
      }
    })();
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const today = todayStr();
    return state.cards.filter((c) => {
      if (filter === 'word' || filter === 'phrase') {
        if (c.kind !== filter) return false;
      } else if (filter === 'due' && !(c.due_on && c.due_on <= today)) {
        return false;
      } else if (filter === 'saved' && !c.is_saved) {
        return false;
      }
      if (!q) return true;
      return (c.term || '').toLocaleLowerCase().includes(q)
        || (c.translation || '').toLocaleLowerCase().includes(q);
    });
  }, [state.cards, query, filter]);

  if (state.loading) return <LoadingOverlay />;
  if (state.error) return <p className="text-sm text-[var(--danger-text)]">{state.error}</p>;

  const playWord = (term) => {
    stopSpeaking();
    setPlaying(term);
    speak(term, toLocale(state.lang), {
      rate: speechRate(),
      onend: () => setPlaying(''),
      oncancel: () => setPlaying(''),
    });
  };

  const toggleSaved = async (word) => {
    const saved = !word.is_saved;
    setSaving(word.term);
    try {
      await setCardSaved(supabase, { userId: state.userId, language: state.lang, term: word.term, saved });
      setState(current => ({ ...current, cards: current.cards.map(item => item.term === word.term ? { ...item, is_saved: saved } : item) }));
      window.dispatchEvent(new Event('ld:vocabulary-updated'));
    } catch {
      toast(t('voc.saveFailed'), 'error');
    } finally { setSaving(''); }
  };

  const tabs = [
    ['all', t('voc.all')],
    ['word', t('voc.words')],
    ['phrase', t('voc.phrases')],
    ['due', t('voc.due')],
    ['saved', t('voc.saved')],
  ];

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid gap-4">
      {toastNode}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('voc.search')}
          aria-label={t('voc.search')}
          className="min-w-0 flex-1 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-container)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-tertiary)] focus:outline-none"
        />
        <span className="text-xs text-[var(--text-tertiary)]">
          {t('voc.showing', { shown: shown.length, total: state.cards.length })}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`rounded-full px-3 py-1.5 text-sm transition-all ${
              filter === id
                ? 'bg-[var(--primary)] font-semibold text-[var(--on-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {!state.cards.length ? (
        <p className="text-sm text-[var(--text-secondary)]">{t('voc.empty')}</p>
      ) : !shown.length ? (
        <p className="text-sm text-[var(--text-secondary)]">{t('voc.none')}</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const due = c.due_on && c.due_on <= todayStr();
            return (
              <motion.div
                key={`${c.kind}:${c.term}`}
                variants={card}
                className="vocab-card flex h-full items-start justify-between gap-3 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-container)] px-4 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{c.term}</span>
                    <button type="button" onClick={() => playWord(c.term)} title={t('les.listen')} aria-label={t('les.listen')} className={`grid h-7 w-7 place-items-center rounded-full border border-[var(--border)] transition-colors hover:text-[var(--primary)] ${playing === c.term ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}>{SPEAKER}</button>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      c.kind === 'phrase'
                        ? 'bg-[var(--fill-strong)] text-[var(--text-secondary)]'
                        : 'bg-[var(--fill)] text-[var(--text-secondary)]'
                    }`}>
                      {c.kind === 'phrase' ? t('voc.phrases') : t('voc.words')}
                    </span>
                    {due && (
                      <span className="rounded-full bg-[var(--fill-strong)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger-text)]">
                        {t('voc.due')}
                      </span>
                    )}
                    <button type="button" onClick={() => toggleSaved(c)} disabled={saving === c.term} title={t(c.is_saved ? 'voc.removeSaved' : 'voc.save')} aria-label={t(c.is_saved ? 'voc.removeSaved' : 'voc.save')} aria-pressed={!!c.is_saved} className={`grid h-7 w-7 place-items-center rounded-full border transition-colors disabled:opacity-50 ${c.is_saved ? 'border-[var(--primary)] bg-[var(--fill)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text)]'}`}>{BOOKMARK}</button>
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">{c.translation}</span>
                  {c.example && (
                    <span className="truncate text-xs text-[var(--text-tertiary)]">{c.example}</span>
                  )}
                  {(c.domain_slug || c.topic) && (
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {[c.domain_slug ? domainName(c.domain_slug) : null, c.topic].filter(Boolean).join(' › ')}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
