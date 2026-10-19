import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { t } from '../lib/legacy.js';
import FaqAccordion from '../components/FaqAccordion.jsx';

/* ---------- FAQ: accordion ---------- */

function FaqDocs() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} className="grid gap-4 pt-6">
      <div className="grid gap-2"><h1 className="text-2xl font-bold tracking-tight">{t('faq.title')}</h1><p className="text-sm text-[var(--text-secondary)]">{t('faq.sub')}</p></div>
      <FaqAccordion />
    </motion.div>
  );
}

/* ---------- Terms + Privacy: one legal article with side table of contents ---------- */

function TermsDocs({ autoPrivacy = false }) {
  const groups = [
    {
      badge: 'Terms',
      title: t('terms.title'),
      sub: t('terms.sub'),
      items: Array.from({ length: 6 }, (_, n) => ({ prefix: 'terms', n: n + 1 })),
    },
    {
      badge: 'Privacy',
      title: t('priv.title'),
      sub: t('priv.sub'),
      items: Array.from({ length: 5 }, (_, n) => ({ prefix: 'priv', n: n + 1 })),
    },
  ];
  let num = 0;
  const numbered = groups.map((g) => ({
    ...g,
    items: g.items.map((s) => ({ ...s, num: ++num })),
  }));
  const go = (target) => {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (autoPrivacy) {
      const timer = window.setTimeout(() => {
        document.getElementById('legal-group-priv')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 380);
      return () => window.clearTimeout(timer);
    }
  }, [autoPrivacy]);
  return (
    <div className="grid gap-6">
      <div className="grid items-start gap-6 pt-4 lg:grid-cols-[220px_1fr]">
        <nav aria-label={t('faq.legalNav')} className="grid gap-3 lg:sticky lg:top-20">
          {numbered.map((g) => (
            <div key={g.badge} className="grid gap-1">
              <p className="px-3 text-[11px] font-bold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{g.badge}</p>
              {g.items.map((s) => (
                <button
                  key={`${s.prefix}-${s.n}`}
                  onClick={() => go(`terms-sec-${s.num}`)}
                  className="rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]"
                >
                  <span className="mr-2 font-bold text-[var(--text-tertiary)]">{s.num}.</span>
                  {t(`${s.prefix}.h${s.n}`)}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="grid gap-10">
          {numbered.map((g) => (
            <section key={g.badge} id={g.badge === 'Privacy' ? 'legal-group-priv' : undefined} className="grid scroll-mt-24 gap-6">
              <div className="grid gap-2 border-b border-[var(--border-secondary)] pb-5">
                <h2 className="text-2xl font-bold tracking-tight">{g.title}</h2>
                <p className="text-xs text-[var(--text-tertiary)]">{g.sub}</p>
              </div>
              {g.items.map((s) => (
                <div key={`${s.prefix}-${s.n}`} id={`terms-sec-${s.num}`} className="grid scroll-mt-24 gap-2">
                  <p className="text-xs font-bold tracking-[0.14em] text-[var(--text-tertiary)]">
                    {String(s.num).padStart(2, '0')}
                  </p>
                  <h3 className="text-xl font-bold tracking-tight">{t(`${s.prefix}.h${s.n}`)}</h3>
                  <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)]">{t(`${s.prefix}.p${s.n}`)}</p>
                  {s.prefix === 'priv' && s.n === 3 && (
                    <>
                      <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)]">{t('priv.audio')}</p>
                      <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)]">{t('priv.recognition')}</p>
                    </>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Docs({ doc }) {
  if (doc === 'priv') return <TermsDocs autoPrivacy />;
  if (doc === 'terms') return <TermsDocs />;
  return <FaqDocs />;
}
