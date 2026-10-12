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

export default function Guide({ onGo }) {
  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid gap-6">
      <motion.section variants={rise} className="grid gap-3">
        <h2 className="text-lg font-bold">{t('home.steps.title')}</h2>
        <ol className="grid gap-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex items-start gap-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)]">{i + 1}</span>
              <div>
                <b className="text-sm">{t(s.t)}</b>
                <p className="text-sm text-[var(--text-secondary)]">{t(s.d)}</p>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>
      <motion.section variants={rise} className="grid gap-3">
        <h2 className="text-lg font-bold">{t('home.feat.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATS.map((f) => (
            <div key={f.t} className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
              <b className="text-sm">{t(f.t)}</b>
              <p className="text-sm text-[var(--text-secondary)]">{t(f.d)}</p>
            </div>
          ))}
        </div>
      </motion.section>
      <motion.section variants={rise} className="grid gap-3">
        <h2 className="text-lg font-bold">{t('guide.ai.title')}</h2>
        <ol className="grid gap-3">
          {AI_STEPS.map((s, i) => (
            <li key={s.t} className="flex items-start gap-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)]">{i + 1}</span>
              <div>
                <b className="text-sm">{t(s.t)}</b>
                <p className="text-sm text-[var(--text-secondary)]">{t(s.d)}</p>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>
    </motion.div>
  );
}
