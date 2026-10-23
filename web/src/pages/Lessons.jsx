import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, domainName, topicName, loadCatalogTranslations } from '../lib/legacy.js';
import { useI18n } from '../lib/i18n.jsx';
import { useTheme } from '../lib/useTheme.jsx';
import { resolveActiveLanguage, rememberActiveLanguage } from '../lib/lang.js';
import { topicIcon } from '../../../shared/topic-icons.js';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';

const iconSrc = (domain, topic) => {
  const m = topicIcon(domain, topic).match(/src="([^"]+)"/);
  return m ? m[1] : null;
};

function CatalogIcon({ name, ...props }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {name === 'mixed' ? <><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/><rect x="10" y="6" width="4" height="7" rx="2"/><path d="M8.5 11a3.5 3.5 0 0 0 7 0m-3.5 4v3m-2 0h4"/></>
      : name === 'voice' ? <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8" /></>
      : name === 'chat' ? <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
        : name === 'arrow' ? <path d="M5 12h14m-6-6 6 6-6 6" />
          : name === 'chevron' ? <path d="m6 9 6 6 6-6" />
            : <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /></>}
  </svg>;
}

function TopicArtwork({ domain, topic, theme }) {
  const src = iconSrc(domain, topic);
  const [failed, setFailed] = useState(false);
  return <span className="catalog-topic-icon">
    {src && !failed ? <img src={src} alt="" loading="lazy" className={theme === 'dark' ? 'invert' : ''}
      onError={() => setFailed(true)} /> : <CatalogIcon />}
  </span>;
}

export default function Lessons({ onStartLesson, variant = 'lesson' }) {
  const isPractice = variant === 'practice';
  const theme = useTheme();
  const { lang } = useI18n();
  const reducedMotion = useReducedMotion();
  const catalogId = useId();
  const [domainFilter, setDomainFilter] = useState(null);
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
  const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
  byDomain.sort((a, b) => collator.compare(domainName(a.domain), domainName(b.domain)));
  byDomain.forEach((group) => group.topics.sort((a, b) => (
    collator.compare(topicName(group.domain, a), topicName(group.domain, b))
  )));

  return (
    <div className={`topic-catalog ${isPractice ? 'topic-catalog--practice' : 'topic-catalog--lessons'}`}>
      <div className="catalog-toolbar">
        <div className="catalog-filters" role="group" aria-label={t('ob.s3.h1')}>
          {[{ domain: null, topics: state.items }, ...byDomain].map((group) => (
            <button key={group.domain || 'all'} type="button" aria-pressed={domainFilter === group.domain}
              onClick={() => setDomainFilter(group.domain)} className="catalog-filter">
              {group.domain ? domainName(group.domain) : t('les.page.filter.all')}
              <span className="catalog-filter-count">{group.topics.length}</span>
            </button>
          ))}
        </div>
        {state.level && <span className="catalog-level">{t('les.level', { level: state.level })}</span>}
      </div>

      {isPractice && <div className="catalog-mode-legend" aria-hidden="true">
        <span><CatalogIcon name="mixed" />{t('pron.modeMixed')}</span>
      </div>}

      <div className="catalog-groups">
        {byDomain.map((group) => {
          if (domainFilter && domainFilter !== group.domain) return null;
          const isOpen = !closed.has(group.domain);
          const groupId = `${catalogId}-${group.domain}`;
          return (
            <motion.section key={group.domain} className="catalog-group" aria-labelledby={`${groupId}-title`}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.25 }}>
              <header className="catalog-group-heading">
                <h2 id={`${groupId}-title`}>
                  <button type="button" onClick={() => toggleGroup(group.domain)} aria-expanded={isOpen}
                    aria-controls={groupId} className="catalog-group-toggle">
                    <span>{domainName(group.domain)}</span>
                    <CatalogIcon name="chevron" className={isOpen ? 'catalog-chevron-open' : ''} />
                  </button>
                </h2>
              </header>

              <div id={groupId} hidden={!isOpen}>
                {isOpen && <div className={isPractice ? 'catalog-practice-list' : 'catalog-lesson-grid'}>
                  {group.topics.map((topic, topicIndex) => {
                    const name = topicName(group.domain, topic);
                    const params = { lang: state.active, domain: group.domain, topic, level: state.level };
                    return isPractice ? (
                      <button key={topic} type="button" className="catalog-practice-row" aria-label={`${t('les.begin')}: ${name}`}
                        onClick={() => onStartLesson(params)}>
                        <span className="catalog-row-number" aria-hidden="true">{String(topicIndex + 1).padStart(2, '0')}</span>
                        <TopicArtwork domain={group.domain} topic={topic} theme={theme} />
                        <span className="catalog-practice-title">{name}</span>
                        <span className="catalog-card-arrow" aria-hidden="true"><CatalogIcon name="arrow" /></span>
                      </button>
                    ) : (
                      <button key={topic} type="button" onClick={() => onStartLesson(params)}
                        aria-label={`${t('les.begin')}: ${name}`} className="catalog-practice-row">
                        <span className="catalog-row-number" aria-hidden="true">{String(topicIndex + 1).padStart(2, '0')}</span>
                        <TopicArtwork domain={group.domain} topic={topic} theme={theme} />
                        <span className="catalog-practice-title">{name}</span>
                        <span className="catalog-card-arrow" aria-hidden="true"><CatalogIcon name="arrow" /></span>
                      </button>
                    );
                  })}
                </div>}
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
