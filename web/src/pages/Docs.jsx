import { useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '../lib/legacy.js';

const DOCS = {
  faq: { titleKey: 'faq.title', subKey: 'faq.sub', prefix: 'faq', count: 5, shape: 'qa' },
  priv: { titleKey: 'priv.title', subKey: 'priv.sub', prefix: 'priv', count: 4, shape: 'section' },
  terms: { titleKey: 'terms.title', subKey: 'terms.sub', prefix: 'terms', count: 4, shape: 'section' },
};

export default function Docs({ doc }) {
  const cfg = DOCS[doc] || DOCS.faq;
  const [hk, bk] = cfg.shape === 'qa' ? ['q', 'a'] : ['h', 'p'];
  const [open, setOpen] = useState(0);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="grid gap-4">
      {Array.from({ length: cfg.count }, (_, n) => {
        if (cfg.shape !== 'qa') {
          return (
            <section key={n} className="grid gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
              <h2 className="text-sm font-semibold">{t(`${cfg.prefix}.${hk}${n + 1}`)}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{t(`${cfg.prefix}.${bk}${n + 1}`)}</p>
              {cfg.prefix === 'priv' && n === 2 && (
                <>
                  <p className="text-sm text-[var(--text-secondary)]">{t('priv.audio')}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{t('priv.recognition')}</p>
                </>
              )}
            </section>
          );
        }
        const isOpen = open === n;
        return (
          <div key={n} className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)]">
            <button
              onClick={() => setOpen(isOpen ? -1 : n)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span className="text-sm font-semibold">{t(`${cfg.prefix}.${hk}${n + 1}`)}</span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className={`flex-none text-[var(--text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">{t(`${cfg.prefix}.${bk}${n + 1}`)}</p>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}
