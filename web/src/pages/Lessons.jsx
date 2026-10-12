import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, domainName, topicName, loadCatalogTranslations } from '../lib/legacy.js';
import { useTheme } from '../lib/useTheme.jsx';
import { resolveActiveLanguage, rememberActiveLanguage } from '../lib/lang.js';
import { topicIcon } from '../../../shared/topic-icons.js';

const iconSrc = (domain, topic) => {
  const m = topicIcon(domain, topic).match(/src="([^"]+)"/);
  return m ? m[1] : null;
};

const list = {
  show: { transition: { staggerChildren: 0.04 } },
};
const card = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export default function Lessons({ onStartLesson }) {
  const theme = useTheme();
  const [state, setState] = useState({ loading: true, error: '', items: [], active: null, level: '' });
  const [closed, setClosed] = useState(() => new Set());
  const [query, setQuery] = useState('');
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

  if (state.loading) return <p className="text-sm text-[var(--text-secondary)]">{t('common.moment')}</p>;
  if (state.error) return <p className="text-sm text-[var(--danger-text)]">{state.error}</p>;
  if (!state.items.length) return <p className="text-sm text-[var(--text-secondary)]">{t('les.page.empty')}</p>;

  const q = query.trim().toLocaleLowerCase();
  const byDomain = [];
  for (const item of state.items) {
    if (q) {
      const hay = `${domainName(item.domain)} ${topicName(item.domain, item.topic)}`.toLocaleLowerCase();
      if (!hay.includes(q)) continue;
    }
    let group = byDomain.find((g) => g.domain === item.domain);
    if (!group) {
      group = { domain: item.domain, topics: [] };
      byDomain.push(group);
    }
    group.topics.push(item.topic);
  }

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('les.search')}
        aria-label={t('les.search')}
        className="min-w-0 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-container)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-tertiary)] focus:outline-none"
      />
      {!byDomain.length ? (
        <p className="text-sm text-[var(--text-secondary)]">{q ? t('voc.none') : t('les.page.empty')}</p>
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
              return (
              <motion.button
                key={topic}
                type="button"
                onClick={() => onStartLesson({ lang: state.active, domain: group.domain, topic, level: state.level })}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-container)] p-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--fill)]"
              >
                {src && (
                <img
                  src={src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className={`h-6 w-6 shrink-0 opacity-80 ${theme === 'dark' ? 'invert' : ''}`}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                )}
                <span className="truncate text-[15px] font-semibold">{topicName(group.domain, topic)}</span>
              </motion.button>
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
