import { motion, useReducedMotion } from 'framer-motion';
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
  { t: 'pron.modeMixed', d: 'guide.practice.mixed.d' },
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
  const reducedMotion = useReducedMotion();
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  const content = [
    { items: PARTS },
    { body: 'guide.level.d' },
    { body: 'guide.review.d' },
    { items: STEPS, numbered: true },
    { items: FEATS },
    { items: PRACTICE_GUIDE, action: onOpenPractice, actionLabel: 'guide.practice.cta' },
    { items: AI_STEPS, numbered: true },
    { body: 'faq.sub', faq: true },
  ];

  return (
    <motion.div variants={reducedMotion ? undefined : list} initial={reducedMotion ? false : "hidden"} animate="show" className="guide-page">
      <div className="guide-layout">
        <nav aria-label={t('nav.guide')} className="guide-nav">
          {sections.map((section, i) => (
            <button key={section.id} onClick={() => go(section.id)} className="guide-nav-link">
              <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span>{section.title}</span>
            </button>
          ))}
        </nav>

        <motion.div variants={reducedMotion ? undefined : rise} className="guide-content">
          <section id="guide-start" className="guide-panel guide-intro">
            <p className="guide-body">{t('guide.start.sub')}</p>
            <ol className="guide-items guide-start-steps">
              {[1, 2, 3].map((step) => <InfoItem key={step} n={String(step).padStart(2, '0')} title={t(`guide.start.${step}.title`)} body={t(`guide.start.${step}.sub`)} />)}
            </ol>
            <div className="guide-actions">
              <button onClick={onOpenLessons} className="guide-button guide-button-primary">{t('guide.start.cta')} <span aria-hidden="true">→</span></button>
              <button onClick={onOpenDashboard} className="guide-button guide-button-secondary">{t('guide.start.dashboard')}</button>
            </div>
          </section>

          {sections.map((section, i) => {
            const { items, numbered, body, action, actionLabel, faq } = content[i];
            const List = numbered ? 'ol' : 'ul';
            return <section key={section.id} id={section.id} className="guide-panel" aria-labelledby={`${section.id}-title`}>
              <SectionHeading id={`${section.id}-title`} n={String(i + 1).padStart(2, '0')} title={section.title} />
              {body && <p className="guide-body">{t(body)}</p>}
              {items && <List className="guide-items">{items.map((entry, index) => <InfoItem key={entry.t} n={numbered ? String(index + 1).padStart(2, '0') : undefined} title={t(entry.t)} body={t(entry.d)} />)}</List>}
              {action && <div className="guide-actions"><button onClick={action} className="guide-button guide-button-primary">{t(actionLabel)} <span aria-hidden="true">→</span></button></div>}
              {faq && <div className="guide-faq"><FaqAccordion /></div>}
            </section>;
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}

function SectionHeading({ id, n, title }) {
  return <header className="guide-section-heading"><span aria-hidden="true">{n}</span><h2 id={id}>{title}</h2></header>;
}

function InfoItem({ n, title, body }) {
  return <li className="guide-info-item">
    <div className="guide-item-heading">{n && <span aria-hidden="true">{n}</span>}<h3>{title}</h3></div>
    <p>{body}</p>
  </li>;
}
