import { useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '../lib/legacy.js';

export default function FaqAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }} className="grid border-t border-[var(--border-secondary)]">
      {Array.from({ length: 8 }, (_, n) => {
        const isOpen = open === n;
        return (
          <div key={n} className="border-b border-[var(--border-secondary)] last:border-b-0">
            <button
              onClick={() => setOpen(isOpen ? -1 : n)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 py-4 text-left"
            >
              <span className="text-sm font-semibold sm:text-[15px]">{t(`faq.q${n + 1}`)}</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className={`flex-none text-[var(--text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="max-w-2xl pb-5 text-sm leading-relaxed text-[var(--text-secondary)]">{t(`faq.a${n + 1}`)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
