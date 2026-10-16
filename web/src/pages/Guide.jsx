import { useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '../lib/legacy.js';
import { list, rise } from '../components/ui.jsx';

const STEPS = [
  { t: 'home.step1.t', d: 'home.step1.d' },
  { t: 'home.step2.t', d: 'home.step2.d' },
  { t: 'home.step3.t', d: 'home.step3.d' },
];
const FEATS = [
  { t: 'home.feat1.t', d: 'home.feat1.d' },
  { t: 'home.feat2.t', d: 'home.feat2.d' },
  { t: 'home.feat3.t', d: 'home.feat3.d' },
  { t: 'home.feat4.t', d: 'home.feat4.d' },
];
const AI_STEPS = [
  { t: 'guide.ai.1t', d: 'guide.ai.1d' },
  { t: 'guide.ai.2t', d: 'guide.ai.2d' },
  { t: 'guide.ai.3t', d: 'guide.ai.3d' },
  { t: 'guide.ai.4t', d: 'guide.ai.4d' },
  { t: 'guide.ai.5t', d: 'guide.ai.5d' },
];
const PARTS = [
  { t: 'guide.part.vocab.t', d: 'guide.part.vocab.d' },
  { t: 'guide.part.phrases.t', d: 'guide.part.phrases.d' },
  { t: 'guide.part.dialogue.t', d: 'guide.part.dialogue.d' },
  { t: 'guide.part.reading.t', d: 'guide.part.reading.d' },
  { t: 'guide.part.grammar.t', d: 'guide.part.grammar.d' },
  { t: 'guide.part.listening.t', d: 'guide.part.listening.d' },
  { t: 'guide.part.speaking.t', d: 'guide.part.speaking.d' },
  { t: 'guide.part.quiz.t', d: 'guide.part.quiz.d' },
];

function Collapsible({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border-secondary)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-4 text-left"
      >
        <span className="text-[15px] font-semibold">{title}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={`flex-none text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function Guide() {
  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid gap-1 pt-2">
      <motion.section variants={rise} className="grid gap-1">
        <Collapsible title={t('guide.anatomy.title')}>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {PARTS.map((p) => (
              <div key={p.t} className="grid gap-0.5 border-b border-[var(--border-secondary)] py-3">
                <b className="text-sm">{t(p.t)}</b>
                <p className="text-sm text-[var(--text-secondary)]">{t(p.d)}</p>
              </div>
            ))}
          </div>
        </Collapsible>
        <Collapsible title={t('guide.level.title')}>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{t('guide.level.d')}</p>
        </Collapsible>
        <Collapsible title={t('guide.review.title')}>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{t('guide.review.d')}</p>
        </Collapsible>
        <Collapsible title={t('home.steps.title')}>
          <ol className="grid gap-x-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.t} className="grid content-start gap-1.5 border-b border-[var(--border-secondary)] py-3">
                <span aria-hidden="true" className="text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>
                <b className="text-sm">{t(s.t)}</b>
                <p className="text-sm text-[var(--text-secondary)]">{t(s.d)}</p>
              </li>
            ))}
          </ol>
        </Collapsible>
        <Collapsible title={t('home.feat.title')}>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {FEATS.map((f) => (
              <div key={f.t} className="grid gap-0.5 border-b border-[var(--border-secondary)] py-3">
                <b className="text-sm">{t(f.t)}</b>
                <p className="text-sm text-[var(--text-secondary)]">{t(f.d)}</p>
              </div>
            ))}
          </div>
        </Collapsible>
        <Collapsible title={t('guide.ai.title')}>
          <ol className="grid gap-3">
            {AI_STEPS.map((s, i) => (
              <li key={s.t} className="flex items-start gap-3 py-1">
                <span aria-hidden="true" className="text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>
                <div>
                  <b className="text-sm">{t(s.t)}</b>
                  <p className="text-sm text-[var(--text-secondary)]">{t(s.d)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Collapsible>
      </motion.section>
    </motion.div>
  );
}
