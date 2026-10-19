import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, tp, languageName, langMeta, domainName, domainDescription, topicName, LEVELS } from '../lib/legacy.js';
import { BtnSecondary, Msg, inputCls } from '../components/ui.jsx';
import { useTheme } from '../lib/useTheme.jsx';
import { topicIcon } from '../../../shared/topic-icons.js';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';

const iconSrc = (slug, topic) => {
  const m = topicIcon(slug, topic).match(/src="([^"]+)"/);
  return m ? m[1] : null;
};

export default function Onboarding({ edit = false, add = false, onDone }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [languages, setLanguages] = useState([]);
  const [existingLanguages, setExistingLanguages] = useState([]);
  const [domains, setDomains] = useState([]);
  const [language, setLanguage] = useState(null);
  const [level, setLevel] = useState(null);
  const [topics, setTopics] = useState({});
  const [query, setQuery] = useState('');
  const [dir, setDir] = useState(1);
  const go = (n) => {
    setDir(n >= step ? 1 : -1);
    setStep(n);
  };

  // Step changes feel abrupt on long pages; glide back to the top instead of jumping.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [languagesResult, domainsResult] = await Promise.all([
        supabase.from('languages').select('*').order('name'),
        supabase.from('domains').select('*').order('name'),
      ]);
      if (!alive) return;
      const catalogError = languagesResult.error || domainsResult.error;
      if (catalogError) {
        setError(catalogError.message);
        setLoading(false);
        return;
      }
      setLanguages(languagesResult.data || []);
      setDomains(domainsResult.data || []);
      if (add) {
        const { data: enrolled } = await supabase.from('user_languages').select('language_code').eq('user_id', user.id);
        if (!alive) return;
        setExistingLanguages((enrolled || []).map((row) => row.language_code));
      }
      if (edit) {
        const { data: ul } = await supabase.from('user_languages').select('*').eq('user_id', user.id).limit(1);
        if (!alive) return;
        if (ul?.[0]) {
          setLanguage(ul[0].language_code);
          setLevel(ul[0].level);
          const { data: ud } = await supabase.from('user_domains').select('*').eq('user_id', user.id).eq('language_code', ul[0].language_code);
          if (!alive) return;
          setTopics(Object.fromEntries((ud || []).map((d) => [d.domain_slug, d.topics])));
        }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [edit, add]);

  const topicCount = domains.reduce((s, d) => s + (topics[d.slug]?.length || 0), 0);
  const chosenCount = domains.filter((d) => (topics[d.slug] || []).length > 0).length;

  const toggleTopic = (slug, topic) => {
    setTopics((prev) => {
      const set = new Set(prev[slug] || []);
      if (set.has(topic)) set.delete(topic);
      else set.add(topic);
      return { ...prev, [slug]: [...set] };
    });
  };

  const toggleAll = (slug) => {
    const d = domains.find((x) => x.slug === slug);
    if (!d) return;
    setTopics((prev) => {
      const allOn = (prev[slug] || []).length === d.topics.length;
      return { ...prev, [slug]: allOn ? [] : [...d.topics] };
    });
  };

  const finish = async () => {
    const chosen = domains.filter((d) => (topics[d.slug] || []).length > 0);
    if (!chosen.length) {
      setError(t('ob.noTopics'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_onboarding', {
        p_language: language,
        p_level: level,
        p_domains: chosen.map((d) => ({ domain_slug: d.slug, topics: topics[d.slug] })),
      });
      if (error) {
        setError(error.message);
        return;
      }
      try { localStorage.setItem('activeLanguage', language); } catch { /* next page still works */ }
      onDone(add ? 'dashboard' : 'guide');
    } catch (err) {
      setError(err?.message || t('dash.widgets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingOverlay />;

  const optCls = (on) =>
    `flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all duration-300 active:scale-[0.985] ${
      on ? 'border-[var(--primary)] bg-[var(--fill)]' : 'border-[var(--border)] bg-[var(--bg-container)] hover:border-[var(--text-tertiary)]'
    }`;

  const stepMotion = {
    initial: { opacity: 0, x: 44 * dir },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -44 * dir },
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  };

  const q = query.trim().toLowerCase();
  const visibleDomains = domains
    .map((d) => {
      const nameHit = domainName(d).toLowerCase().includes(q);
      return { d, topics: !q ? d.topics : nameHit ? d.topics : d.topics.filter((topic) => topicName(d.slug, topic).toLowerCase().includes(q)) };
    })
    .filter((x) => x.topics.length > 0);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} className="grid gap-5">
      <div className="flex items-center gap-2" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${n <= step ? 'bg-[var(--primary)]' : 'bg-[var(--fill-strong)]'}`} />
        ))}
      </div>
      <Msg text={error} />

      <AnimatePresence mode="wait" initial={false}>
      {step === 1 && (
        <motion.section key="ob-1" {...stepMotion} className="grid gap-3">
          <h2 className="text-lg font-bold">{t('ob.s1.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s1.sub')}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {languages.filter((l) => !add || !existingLanguages.includes(l.code)).map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)} className={optCls(language === l.code)}>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {langMeta(l.code)?.flag && (
                    <img src={`/img/flags/${langMeta(l.code).flag}.svg`} alt="" aria-hidden="true" loading="lazy" className="h-4 w-6 rounded-[3px] object-cover shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  {languageName(l.code)}
                </span>
                <span className="text-sm text-[var(--text-secondary)]" lang={l.code} dir="auto">{l.native_name}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => go(2)} disabled={!language} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40">
              {t('common.continue')}
            </button>
          </div>
        </motion.section>
      )}

      {step === 2 && (
        <motion.section key="ob-2" {...stepMotion} className="grid gap-3">
          <h2 className="text-lg font-bold">{t('ob.s2.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s2.sub')}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {LEVELS.map((c) => {
              const on = level === c;
              return (
                <button key={c} onClick={() => setLevel(c)} aria-pressed={on} className={`${optCls(on)} ${on ? 'shadow-md' : ''}`}>
                  <span className="flex w-full items-center gap-3">
                    <span aria-hidden="true" className={`grid h-10 w-10 flex-none place-items-center rounded-xl text-sm font-bold transition-colors ${on ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'bg-[var(--fill)] text-[var(--text)]'}`}>
                      {c}
                    </span>
                    <span className="grid flex-1 gap-0.5 text-left">
                      <span className="text-sm font-semibold">{t(`lvl.${c}.name`)}</span>
                      <span className="text-xs leading-relaxed text-[var(--text-secondary)]">{t(`lvl.${c}.desc`)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <BtnSecondary onClick={() => go(1)} className="w-auto px-4">{t('common.back')}</BtnSecondary>
            <button onClick={() => go(3)} disabled={!level} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40">
              {t('common.continue')}
            </button>
          </div>
        </motion.section>
      )}

      {step === 3 && (
        <motion.section key="ob-3" {...stepMotion} className="grid gap-4">
          <h2 className="text-lg font-bold">{t('ob.s4.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s4.sub')}</p>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ob.search')} aria-label={t('ob.search')} className={inputCls}
          />
          {visibleDomains.map(({ d, topics: list }) => {
            const slug = d.slug;
            const picked = topics[slug] || [];
            const allOn = picked.length === d.topics.length;
            return (
              <div key={slug} className="grid gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{domainName(d)}</h3>
                  <button onClick={() => toggleAll(slug)} className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text)]">
                    {t(allOn ? 'ob.deselectAll' : 'ob.selectAll')}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((topic) => {
                    const on = picked.includes(topic);
                    const src = iconSrc(slug, topic);
                    return (
                      <button key={topic} onClick={() => toggleTopic(slug, topic)} aria-pressed={on} className={optCls(on)}>
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {src && <img src={src} alt="" aria-hidden="true" loading="lazy" className={`h-[22px] w-[22px] opacity-80 ${theme === 'dark' ? 'invert' : ''}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                          {topicName(slug, topic)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!visibleDomains.length && (
            <p className="text-sm text-[var(--text-secondary)]">{t('les.page.empty')}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <BtnSecondary onClick={() => go(2)} className="w-auto px-4">{t('common.back')}</BtnSecondary>
            <span className="text-sm text-[var(--text-secondary)]">
              {topicCount ? tp('ob.countLessons', topicCount) : chosenCount ? tp('ob.countDomains', chosenCount) : ''}
            </span>
            <button onClick={finish} disabled={saving} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40">
              {t('ob.finish')}
            </button>
          </div>
        </motion.section>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
