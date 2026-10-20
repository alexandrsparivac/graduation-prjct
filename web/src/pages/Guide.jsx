import { motion } from 'framer-motion';
import { t } from '../lib/legacy.js';
import { list, rise } from '../components/ui.jsx';
import FaqAccordion from '../components/FaqAccordion.jsx';

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
const PRACTICE_GUIDE = [
  { t: 'pron.modeVoice', d: 'guide.practice.voice.d' },
  { t: 'pron.modeChat', d: 'guide.practice.chat.d' },
  { t: 'guide.practice.feedback.t', d: 'guide.practice.feedback.d' },
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

export default function Guide({ onOpenLessons, onOpenDashboard, onOpenPractice }) {
  const sections = [
    { id: 'guide-anatomy', title: t('guide.anatomy.title') },
    { id: 'guide-level', title: t('guide.level.title') },
    { id: 'guide-review', title: t('guide.review.title') },
    { id: 'guide-steps', title: t('home.steps.title') },
    { id: 'guide-features', title: t('home.feat.title') },
    { id: 'guide-practice', title: t('nav.pronunciation') },
    { id: 'guide-ai', title: t('guide.ai.title') },
    { id: 'guide-faq', title: t('faq.title') },
  ];
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="grid gap-6">
      <div className="grid min-w-0 items-start gap-6 pt-4 lg:grid-cols-[minmax(190px,220px)_minmax(0,1fr)] lg:gap-8">
        <nav aria-label={t('nav.guide')} className="grid min-w-0 content-start gap-1 lg:sticky lg:top-20">
          {sections.map((section, i) => (
            <button
              key={section.id}
              onClick={() => go(section.id)}
              className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-1 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]"
            >
              <span className="text-right font-bold tabular-nums text-[var(--text-tertiary)]">{i + 1}.</span>
              <span className="min-w-0">{section.title}</span>
            </button>
          ))}
        </nav>

        <motion.div variants={rise} className="grid min-w-0 gap-10">
          <section id="guide-start" className="grid scroll-mt-24 gap-5">
            <header className="grid gap-2 border-b border-[var(--border-secondary)] pb-5">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{t('guide.start.sub')}</p>
            </header>
            <ol className="grid min-w-0 gap-x-8 md:auto-rows-fr md:grid-cols-3">
              {[1, 2, 3].map((step) => (
                <li key={step} className="grid content-start gap-1.5 border-b border-[var(--border-secondary)] py-3 last:border-b-0 md:border-b-0 md:border-l md:pl-4 md:first:border-l-0 md:first:pl-0">
                  <span aria-hidden="true" className="text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">0{step}</span>
                  <b className="text-sm">{t(`guide.start.${step}.title`)}</b>
                  <p className="text-sm leading-5 text-[var(--text-secondary)]">{t(`guide.start.${step}.sub`)}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <button onClick={onOpenLessons} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90">
                {t('guide.start.cta')} <span aria-hidden="true">→</span>
              </button>
              <button onClick={onOpenDashboard} className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]">
                {t('guide.start.dashboard')}
              </button>
            </div>
          </section>

          <section id="guide-anatomy" className="grid scroll-mt-24 gap-5">
            <SectionHeading n="02" title={t('guide.anatomy.title')} />
            <ul className="grid min-w-0 auto-rows-fr gap-x-8 sm:grid-cols-2">
              {PARTS.map((p) => <InfoItem key={p.t} title={t(p.t)} body={t(p.d)} />)}
            </ul>
          </section>

          <section id="guide-level" className="grid scroll-mt-24 gap-4">
            <SectionHeading n="03" title={t('guide.level.title')} />
            <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">{t('guide.level.d')}</p>
          </section>

          <section id="guide-review" className="grid scroll-mt-24 gap-4">
            <SectionHeading n="04" title={t('guide.review.title')} />
            <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">{t('guide.review.d')}</p>
          </section>

          <section id="guide-steps" className="grid scroll-mt-24 gap-5">
            <SectionHeading n="05" title={t('home.steps.title')} />
            <ol className="grid min-w-0 auto-rows-fr gap-x-8 sm:grid-cols-2 md:grid-cols-3">
              {STEPS.map((s, i) => <InfoItem key={s.t} n={String(i + 1).padStart(2, '0')} title={t(s.t)} body={t(s.d)} />)}
            </ol>
          </section>

          <section id="guide-features" className="grid scroll-mt-24 gap-5">
            <SectionHeading n="06" title={t('home.feat.title')} />
            <ul className="grid min-w-0 auto-rows-fr gap-x-8 sm:grid-cols-2">
              {FEATS.map((f) => <InfoItem key={f.t} title={t(f.t)} body={t(f.d)} />)}
            </ul>
          </section>

          <section id="guide-practice" className="grid scroll-mt-24 gap-5">
            <SectionHeading n="07" title={t('nav.pronunciation')} />
            <ul className="grid min-w-0 auto-rows-fr gap-x-8 sm:grid-cols-2">
              {PRACTICE_GUIDE.map((item) => <InfoItem key={item.t} title={t(item.t)} body={t(item.d)} />)}
            </ul>
            <div>
              <button onClick={onOpenPractice} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90">
                {t('guide.practice.cta')} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <section id="guide-ai" className="grid scroll-mt-24 gap-5">
            <SectionHeading n="08" title={t('guide.ai.title')} />
            <ol className="grid min-w-0 auto-rows-fr gap-x-8 gap-y-4 sm:grid-cols-2">
              {AI_STEPS.map((s, i) => <InfoItem key={s.t} n={String(i + 1).padStart(2, '0')} title={t(s.t)} body={t(s.d)} />)}
            </ol>
          </section>

          <section id="guide-faq" className="grid scroll-mt-24 gap-4">
            <SectionHeading n="09" title={t('faq.title')} />
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{t('faq.sub')}</p>
            <FaqAccordion />
          </section>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SectionHeading({ n, title }) {
  return (
    <div className="grid gap-2 border-b border-[var(--border-secondary)] pb-4">
      <span className="text-xs font-bold tracking-[0.14em] text-[var(--text-tertiary)]">{n}</span>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function InfoItem({ n, title, body }) {
  return (
    <li className="grid content-start gap-1.5 border-b border-[var(--border-secondary)] py-3 last:border-b-0">
      {n && <span aria-hidden="true" className="text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">{n}</span>}
      <b className="text-sm">{title}</b>
      <p className="text-sm leading-5 text-[var(--text-secondary)]">{body}</p>
    </li>
  );
}
