import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, domainName, topicName, loadCatalogTranslations } from '../lib/legacy.js';
import { useTheme } from '../lib/useTheme.jsx';
import { resolveActiveLanguage, rememberActiveLanguage } from '../lib/lang.js';
import { topicIcon } from '../../../shared/topic-icons.js';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';

const iconSrc = (domain, topic) => {
  const m = topicIcon(domain, topic).match(/src="([^"]+)"/);
  return m ? m[1] : null;
};

const list = {
  show: { transition: { staggerChildren: 0.04 } },
};
const card = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
};

export default function Lessons({ onStartLesson, variant = 'lesson' }) {
  const isPractice = variant === 'practice';
  const theme = useTheme();
  const [state, setState] = useState({ loading: true, error: '', items: [], active: null, level: '' });
  const [closed, setClosed] = useState(() => new Set());
  const closedStoreKey = (lang) => `closedGroups:${lang || ''}`;
  const toggleGroup = (domain) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      try { localStorage.setItem(closedStoreKey(state.active), JSON.stringify([...next])); } catch { /* list still works */ }
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await loadCatalogTranslations(supabase);
      if (!alive) return;
      const langsRes = await supabase.from('user_languages').select('language_code, level').eq('user_id', user.id).order('created_at');
      const langs = langsRes.data || [];
      if (!langs.length) {
        if (alive) setState({ loading: false, error: '', items: [], active: null, level: '' });
        return;
      }
      const resolved = resolveActiveLanguage(langs);
      const active = resolved.language_code;
      rememberActiveLanguage(active);
      const { data, error } = await supabase
        .from('user_domains')
        .select('domain_slug, topics')
        .eq('user_id', user.id)
        .eq('language_code', active)
        .order('domain_slug');
      if (!alive) return;
      if (error) {
        setState({ loading: false, error: error.message, items: [], active: null, level: '' });
        return;
      }
      const items = (data || [])
        .flatMap((d) => (d.topics || []).map((topic) => ({ domain: d.domain_slug, topic })));
      let restored = [];
      try { restored = JSON.parse(localStorage.getItem(closedStoreKey(active)) || '[]'); } catch { /* start open */ }
      if (alive) setClosed(new Set(Array.isArray(restored) ? restored : []));
      setState({ loading: false, error: '', items, active, level: resolved.level });
    })();
    return () => { alive = false; };
  }, []);

  if (state.loading) return <LoadingOverlay />;
  if (state.error) return <p className="text-sm text-[var(--danger-text)]">{state.error}</p>;
  if (!state.items.length) return <p className="text-sm text-[var(--text-secondary)]">{t('les.page.empty')}</p>;

  const byDomain = [];
  for (const item of state.items) {
    let group = byDomain.find((g) => g.domain === item.domain);
    if (!group) {
      group = { domain: item.domain, topics: [] };
      byDomain.push(group);
    }
    group.topics.push(item.topic);
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  byDomain.sort((a, b) => collator.compare(domainName(a.domain), domainName(b.domain)));
  byDomain.forEach((group) => group.topics.sort((a, b) => (
    collator.compare(topicName(group.domain, a), topicName(group.domain, b))
  )));

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid gap-4">
      {!byDomain.length ? (
        <p className="text-sm text-[var(--text-secondary)]">{t('les.page.empty')}</p>
      ) : null}
      {byDomain.map((group) => {
        const isOpen = !closed.has(group.domain);
        return (
        <motion.section key={group.domain} variants={card} className="grid gap-2.5">
          <button
            onClick={() => toggleGroup(group.domain)}
            aria-expanded={isOpen}
            className="flex w-fit items-center gap-2 text-left"
          >
            <h2 className="text-[15px] font-bold">{domainName(group.domain)}</h2>
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              className={`text-[var(--text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {isOpen && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {group.topics.map((topic) => {
              const src = iconSrc(group.domain, topic);
              const params = { lang: state.active, domain: group.domain, topic, level: state.level };
              return (
              isPractice ? (
              <motion.div
                key={topic}
                variants={card}
                whileHover={{ y: -1 }}
                className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-container)] p-4 transition-colors hover:border-[var(--primary)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {src && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--fill)]">
                    <img src={src} alt="" aria-hidden="true" loading="lazy" className={`h-5 w-5 opacity-80 ${theme === 'dark' ? 'invert' : ''}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </span>}
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{topicName(group.domain, topic)}</span>
                  <button type="button" title={t('pron.modeVoice')} aria-label={t('pron.modeVoice')} onClick={() => onStartLesson({ ...params, mode: 'voice' })} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--fill)] text-[var(--text)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--on-primary)]">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>
                  </button>
                  <button type="button" title={t('pron.modeChat')} aria-label={t('pron.modeChat')} onClick={() => onStartLesson({ ...params, mode: 'chat' })} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--fill)] hover:text-[var(--text)]">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>
                  </button>
                </div>
              </motion.div>
              ) : (
              <motion.button
                key={topic}
                type="button"
                onClick={() => onStartLesson(params)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={`group flex items-center gap-3 border border-[var(--border)] bg-[var(--bg-container)] p-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--fill)] ${isPractice ? 'rounded-2xl' : 'rounded-xl'}`}
              >
                {src && (
                isPractice ? (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--fill)] transition-colors group-hover:bg-[var(--primary)]/10">
                    <img
                      src={src}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className={`h-5 w-5 opacity-80 ${theme === 'dark' ? 'invert' : ''}`}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </span>
                ) : (
                <img
                  src={src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className={`h-6 w-6 shrink-0 opacity-80 ${theme === 'dark' ? 'invert' : ''}`}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                )
                )}
                <span className="truncate text-[15px] font-semibold">{topicName(group.domain, topic)}</span>
              </motion.button>
              )
              );
            })}
          </div>
          )}
        </motion.section>
        );
      })}
    </motion.div>
  );
}
