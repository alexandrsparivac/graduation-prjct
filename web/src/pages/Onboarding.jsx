import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, tp, languageName, domainName, domainDescription, topicName, LEVELS } from '../lib/legacy.js';
import { BtnPrimary, BtnSecondary, Msg } from '../components/ui.jsx';
import { useTheme } from '../lib/useTheme.jsx';
import { domainIcon } from '../../../shared/domain-icons.js';
import { topicIcon } from '../../../shared/topic-icons.js';

const iconSrc = (slug, topic) => {
  const m = topicIcon(slug, topic).match(/src="([^"]+)"/);
  return m ? m[1] : null;
};

function RawIcon({ html }) {
  return <span className="inline-flex" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Onboarding({ edit = false, onDone }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [languages, setLanguages] = useState([]);
  const [domains, setDomains] = useState([]);
  const [language, setLanguage] = useState(null);
  const [level, setLevel] = useState(null);
  const [pickedDomains, setPickedDomains] = useState([]);
  const [topics, setTopics] = useState({});

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
      if (edit) {
        const { data: ul } = await supabase.from('user_languages').select('*').eq('user_id', user.id).limit(1);
        if (!alive) return;
        if (ul?.[0]) {
          setLanguage(ul[0].language_code);
          setLevel(ul[0].level);
          const { data: ud } = await supabase.from('user_domains').select('*').eq('user_id', user.id).eq('language_code', ul[0].language_code);
          if (!alive) return;
          setPickedDomains((ud || []).map((d) => d.domain_slug));
          setTopics(Object.fromEntries((ud || []).map((d) => [d.domain_slug, d.topics])));
        }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [edit]);

  const topicCount = pickedDomains.reduce((s, d) => s + (topics[d]?.length || 0), 0);

  const toggleDomain = (slug) => {
    setPickedDomains((prev) => (prev.includes(slug) ? prev.filter((d) => d !== slug) : [...prev, slug]));
  };

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
    setTopics((prev) => {
      const allOn = (prev[slug] || []).length === d.topics.length;
      return { ...prev, [slug]: allOn ? [] : [...d.topics] };
    });
  };

  const finish = async () => {
    const chosen = pickedDomains.filter((s) => topics[s]?.length > 0);
    if (!chosen.length) {
      setError(t('ob.noTopics'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_onboarding', {
        p_language: language,
        p_level: level,
        p_domains: chosen.map((domain_slug) => ({ domain_slug, topics: topics[domain_slug] })),
      });
      if (error) {
        setError(error.message);
        return;
      }
      try { localStorage.setItem('activeLanguage', language); } catch { /* next page still works */ }
      onDone('guide');
    } catch (err) {
      setError(err?.message || t('dash.widgets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-[var(--text-secondary)]">{t('common.moment')}</p>;

  const optCls = (on) =>
    `flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
      on ? 'border-[var(--primary)] bg-[var(--fill)]' : 'border-[var(--border)] bg-[var(--bg-container)] hover:border-[var(--text-tertiary)]'
    }`;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="grid gap-5">
      <div className="flex items-center gap-2" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-[var(--primary)]' : 'bg-[var(--fill-strong)]'}`} />
        ))}
      </div>
      <Msg text={error} />

      {step === 1 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold">{t('ob.s1.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s1.sub')}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {languages.map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)} className={optCls(language === l.code)}>
                <span className="text-sm font-semibold">{languageName(l.code)}</span>
                <span className="text-sm text-[var(--text-secondary)]" lang={l.code} dir="auto">{l.native_name}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={!language} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90 disabled:opacity-40">
              {t('common.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold">{t('ob.s2.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s2.sub')}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {LEVELS.map((c) => (
              <button key={c} onClick={() => setLevel(c)} className={optCls(level === c)}>
                <span className="text-sm font-bold">{c}</span>
                <span className="text-sm font-semibold">{t(`lvl.${c}.name`)}</span>
                <span className="text-xs text-[var(--text-secondary)]">{t(`lvl.${c}.desc`)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <BtnSecondary onClick={() => setStep(1)} className="w-auto px-4">{t('common.back')}</BtnSecondary>
            <button onClick={() => setStep(3)} disabled={!level} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90 disabled:opacity-40">
              {t('common.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold">{t('ob.s3.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s3.sub')}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {domains.map((d) => (
              <button key={d.slug} onClick={() => toggleDomain(d.slug)} className={optCls(pickedDomains.includes(d.slug))}>
                <span className="text-[var(--primary)]"><RawIcon html={domainIcon(d.slug)} /></span>
                <span className="text-sm font-semibold">{domainName(d)}</span>
                <span className="text-xs text-[var(--text-secondary)]">{domainDescription(d)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <BtnSecondary onClick={() => setStep(2)} className="w-auto px-4">{t('common.back')}</BtnSecondary>
            <span className="text-sm text-[var(--text-secondary)]">
              {pickedDomains.length ? tp('ob.countDomains', pickedDomains.length) : ''}
            </span>
            <button onClick={() => setStep(4)} disabled={!pickedDomains.length} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90 disabled:opacity-40">
              {t('common.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="grid gap-4">
          <h2 className="text-lg font-bold">{t('ob.s4.h1')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('ob.s4.sub')}</p>
          {pickedDomains.map((slug) => {
            const d = domains.find((x) => x.slug === slug);
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
                  {d.topics.map((topic) => {
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
          <div className="flex items-center justify-between">
            <BtnSecondary onClick={() => setStep(3)} className="w-auto px-4">{t('common.back')}</BtnSecondary>
            <span className="text-sm text-[var(--text-secondary)]">
              {topicCount ? tp('ob.countLessons', topicCount) : ''}
            </span>
            <button onClick={finish} disabled={saving} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90 disabled:opacity-40">
              {t('ob.finish')}
            </button>
          </div>
        </section>
      )}
    </motion.div>
  );
}
