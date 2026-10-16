import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import {
  t, tp, getLang, languageName, domainName, topicName, langMeta,
  buildFlow, lessonPlan, estimateMinutes, sectionProgress, currentSection,
  cleanTitle, sectionTone, SECTIONS, VOCAB_CARDS_PER_PAGE,
  decodeLessonSelection, filterLessonContent, createLessonResume,
  previousLessonMaterial, mergeLessonHistory, sanitizeLessonHistory, loadLocalizedLesson, saveLocalizedLesson,
  getPref, speechRate, saveLessonVocabulary,
} from '../lib/legacy.js';
import { speak, stopSpeaking, listen, similarity, toLocale, ttsSupported, sttSupported, prefetchSpeech } from '../lib/speech.js';
import { domainIcon } from '../../../shared/domain-icons.js';
import { useToast } from '../components/ui.jsx';
import Confetti from '../components/Confetti.jsx';
const SECTION_ICON = {
  vocab: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  phrases: '<path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/>',
  dialogue: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  reading: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  grammar: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8.8-2.9a2 2 0 0 1 .5-.9z"/>',
  listening: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  speaking: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>',
  quiz: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  tips: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
};
const sectionIcon = (key) => (
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SECTION_ICON[key] || ''}</svg>`
);
const ICON_ARROW = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const ICON_MIC = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
);
const SPEAKER_SM = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
);
const SPEAKER = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
);

const READING_MIN_WORDS = 80;
const READING_MAX_WORDS = 220;

function isCompleteLesson(c) {
  const text = (v) => typeof v === 'string' && v.trim();
  const exact = (items, count) => Array.isArray(items) && items.length === count;
  const fields = (item, names) => item && names.every((name) => text(item[name]));
  const words = (v) => v.trim().split(/\s+/).filter(Boolean).length;
  const choice = (item, names = []) => fields(item, ['question', ...names])
    && exact(item.options, 4) && item.options.every(text)
    && Number.isInteger(item.answer) && item.answer >= 0 && item.answer <= 3;
  return c && text(c.title) && text(c.intro)
    && exact(c.objectives, 3) && c.objectives.every(text)
    && exact(c.vocabulary, 15) && c.vocabulary.every((item) => fields(item, ['term', 'translation', 'partOfSpeech', 'example', 'exampleTranslation']))
    && exact(c.phrases, 8) && c.phrases.every((item) => fields(item, ['phrase', 'translation', 'usage']))
    && c.dialogue && text(c.dialogue.context) && Array.isArray(c.dialogue.lines) && c.dialogue.lines.length >= 12 && c.dialogue.lines.length <= 14 && c.dialogue.lines.every((item) => fields(item, ['speaker', 'text', 'translation']))
    && c.reading && fields(c.reading, ['title', 'passage', 'translation']) && words(c.reading.passage) >= READING_MIN_WORDS && words(c.reading.passage) <= READING_MAX_WORDS && exact(c.reading.questions, 3) && c.reading.questions.every((q) => choice(q))
    && c.grammar && fields(c.grammar, ['title', 'explanation']) && exact(c.grammar.examples, 4) && c.grammar.examples.every(text) && exact(c.grammar.practice, 4) && c.grammar.practice.every((item) => fields(item, ['sentence', 'answer', 'hint']) && /_{3,}/.test(item.sentence))
    && exact(c.listening, 5) && c.listening.every((item) => choice(item, ['text']))
    && exact(c.speaking, 6) && c.speaking.every((item) => fields(item, ['text', 'translation', 'tip']))
    && exact(c.quiz, 8) && c.quiz.every((item) => choice(item, ['explanation']))
    && exact(c.tips, 4) && c.tips.every(text);
}

function SayButton({ text, locale, slowable = false, small = false }) {
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  return (
    <button
      onClick={() => {
        stopSpeaking();
        setPlaying(true);
        speak(text, locale, {
          rate: (slow ? speechRate() * 0.75 : speechRate()),
          onend: () => setPlaying(false),
          oncancel: () => setPlaying(false),
        });
      }}
      onContextMenu={(e) => { if (slowable) { e.preventDefault(); setSlow(!slow); } }}
      title={t('les.listen')}
      aria-label={t('les.listen')}
      className={`grid flex-none place-items-center rounded-full border transition-colors ${small ? 'h-7 w-7' : 'h-8 w-8'} ${playing ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
    >
      {small ? SPEAKER_SM : SPEAKER}
    </button>
  );
}

// Cumulative novelty memory: every lesson the user actually opens adds its
// material here, so the next topic starts with the previous topics excluded.
const avoidKey = (lang, level) => `ld-avoid:${lang}:${level}`;
const loadAvoidHistory = (lang, level) => {
  try {
    return sanitizeLessonHistory(JSON.parse(localStorage.getItem(avoidKey(lang, level))));
  } catch { return sanitizeLessonHistory(); }
};
const storeAvoidHistory = (lang, level, history) => {
  try { localStorage.setItem(avoidKey(lang, level), JSON.stringify(history)); } catch { /* private mode */ }
};

export default function Lesson({ user, params, onExit, onCustomize }) {
  const [toast, toastNode] = useToast();
  const [phase, setPhase] = useState('loading');
  const [loadMsg, setLoadMsg] = useState(t('les.loading'));
  const [loadPct, setLoadPct] = useState(0);
  const [error, setError] = useState('');
  const domainRef = useRef(null);
  const [, bump] = useState(0);
  const S = useRef({ mcq: {}, gap: {}, deck: { i: 0, flipped: false, flippedCards: [] } });
  const flowRef = useRef([]);
  const stepRef = useRef(0);
  const contentRef = useRef(null);
  const fullRef = useRef(null);
  const rowRef = useRef(null);
  const savedRef = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const resumeRef = useRef(null);
  const bgJob = useRef(null);
  const speakRef = useRef(null);
  const contentLang = useMemo(() => getLang(), []);
  const locale = useMemo(() => toLocale(params.lang), [params.lang]);

  const rerender = () => bump((x) => x + 1);
  const stepIdx = stepRef.current;
  const flow = flowRef.current;
  const st = flow[stepIdx];
  const content = contentRef.current;

  const checkpoint = useCallback(() => {
    resumeRef.current?.checkpoint(stepRef.current, S.current);
  }, []);

  const next = useCallback(() => {
    if (stepRef.current >= flowRef.current.length - 1) return;
    stepRef.current += 1;
    setSaveFailed(false);
    checkpoint();
    window.scrollTo({ top: 0 });
    bump((x) => x + 1);
  }, [checkpoint]);

  // Keyboard shortcuts: → / Enter advances (never while typing or when a
  // button has focus — native click already handles that), 1–4 answers the
  // current multiple-choice question.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = document.activeElement;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
        || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === 'ArrowRight' && !typing) || (e.key === 'Enter' && !typing && (!el || el.tagName !== 'BUTTON'))) {
        e.preventDefault();
        next();
        return;
      }
      const n = ['1', '2', '3', '4'].indexOf(e.key);
      if (n >= 0 && !typing && st && (st.kind === 'rmcq' || st.kind === 'quiz' || st.kind === 'listen') && content) {
        const key = (st.kind === 'rmcq' ? 'r' : st.kind === 'quiz' ? 'q' : 'l') + st.index;
        S.current.mcq[key] = { selected: n, checked: true };
        checkpoint();
        bump((x) => x + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st, content, next, checkpoint]);

  const askForLesson = useCallback(async (session) => {
    const D = domainRef.current;
    const stored = loadAvoidHistory(params.lang, params.level);
    const payload = JSON.stringify({
      language: languageName(params.lang, 'en'),
      domain: domainName(D || params.domain),
      topic: topicName(params.domain, params.topic),
      level: params.level,
      nativeLanguage: langMeta(contentLang)?.label || contentLang,
      languageCode: params.lang, domainSlug: params.domain, topicKey: params.topic, nativeLanguageCode: contentLang,
      variationId: crypto.randomUUID(),
      avoid: mergeLessonHistory(stored, previousLessonMaterial(fullRef.current)),
    });
    // The free tier saturates for minutes at a time: retry 429s and dropped
    // connections for a while instead of failing fast. The loader message
    // already promises exactly this ("we keep trying").
    const maxRetries = 8;
    for (let round = 1; ; round++) {
      let r;
      try {
        r = await fetch('/api/lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: payload,
          signal: AbortSignal.timeout(270_000),
        });
      } catch (err) {
        if (err.name === 'TimeoutError' || round > maxRetries) throw new Error(t('les.failed'));
        setLoadMsg(t('les.stillWorking'));
        await new Promise((done) => setTimeout(done, Math.min(3000 * round, 15000)));
        continue;
      }
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.lesson) return body;
      if (body.quota) throw new Error(t('les.quota'));
      // 503 without quota is transient (deadline race, brief provider outage):
      // keep trying like we do for 429 instead of failing to the error screen.
      const transient = r.status === 429 || (r.status === 503 && !body.quota);
      if (!transient || round > maxRetries) throw new Error(t('les.failed'));
      setLoadMsg(t('les.stillWorking'));
      await new Promise((done) => setTimeout(done, Math.min(3000 * round, 15000)));
    }
  }, [contentLang, params]);

  const generate = useCallback(async () => {
    setPhase('loading');
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setLoadPct(Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / 25)))));
    }, 250);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) {
        onExit('login');
        return null;
      }
      const body = await askForLesson(s);
      try {
        return await saveLocalizedLesson(supabase, {
          params, nativeLanguage: contentLang, content: body.lesson, model: body.model,
          userId: user.id, baseRow: rowRef.current,
          personal: !!(fullRef.current || rowRef.current?.personal),
          cacheProof: body.cacheProof, cacheIssuedAt: body.cacheIssuedAt,
        });
      } catch (err) {
        return {
          id: crypto.randomUUID(), content: body.lesson, model: body.model,
          native_language: contentLang, personal: true, localOnly: true,
        };
      }
    } finally {
      clearInterval(timer);
      setLoadPct(100);
    }
  }, [askForLesson, contentLang, onExit, params, user.id]);

  const applyFlow = useCallback((row) => {
    const selection = decodeLessonSelection(params.custom) || decodeLessonSelection((getPref('lessonSections') || []).join(','));
    const c = filterLessonContent(row.content, selection);
    fullRef.current = row.content;
    // Remember what this lesson taught, so the next topic avoids repeating it.
    if (isCompleteLesson(row.content)) {
      storeAvoidHistory(params.lang, params.level,
        mergeLessonHistory(loadAvoidHistory(params.lang, params.level), previousLessonMaterial(row.content)));
    }
    contentRef.current = c;
    flowRef.current = buildFlow(c);
    stepRef.current = 0;
    savedRef.current = false;
    S.current = { mcq: {}, gap: {}, deck: { i: 0, flipped: false, flippedCards: [] } };
    resumeRef.current = row.localOnly ? null : createLessonResume(supabase, {
      userId: user.id, lessonId: row.id, nativeLanguage: contentLang, content: c, flow: flowRef.current, params,
    });
    document.title = `${cleanTitle(c.title, params.level, params.lang)} - LD Platform`;
    setPhase('ready');
    bump((x) => x + 1);
  }, [contentLang, params, user.id]);

  const startFlow = useCallback(async (row) => {
    if (resumeRef.current) await resumeRef.current.discard();
    rowRef.current = row;
    applyFlow(row);
  }, [applyFlow]);

  const regen = useCallback(async () => {
    if (bgJob.current) bgJob.current.cancelled = true;
    try {
      const row = await generate();
      if (row) {
        await startFlow(row);
        toast(t('les.regen.done'));
      }
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate, startFlow]);

  // Rotation: the cached lesson shows instantly while a fresh variation
  // generates silently for next time. Never touches the running lesson —
  // it only upserts the shared cache row afterwards.
  const refreshInBackground = useCallback(() => {
    const id = rowRef.current?.id;
    if (!id || bgJob.current?.id === id) return;
    const job = (bgJob.current = { id, cancelled: false });
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s || job.cancelled) return;
        const body = await askForLesson(s);
        if (job.cancelled) return;
        await saveLocalizedLesson(supabase, {
          params, nativeLanguage: contentLang, content: body.lesson, model: body.model,
          userId: user.id, baseRow: null, personal: false,
          cacheProof: body.cacheProof, cacheIssuedAt: body.cacheIssuedAt,
        });
      } catch (err) {
        console.warn('Background lesson refresh failed:', err?.message || err);
      }
    })();
  }, [askForLesson, contentLang, params, user.id]);

  // Boot: cached lesson or generate.
  const [bootKey, setBootKey] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: D } = await supabase.from('domains').select('*').eq('slug', params.domain).maybeSingle();
        if (!alive) return;
        domainRef.current = D;
        let row = null;
        try {
          row = await loadLocalizedLesson(supabase, params, contentLang, user.id);
        } catch (err) {
          if (err.code === 'localization_setup') throw new Error(t('les.language.needsSetup'));
          throw err;
        }
        if (!alive) return;
        if (row && isCompleteLesson(row.content)) {
          await startFlow(row);
          if (!alive) return;
          refreshInBackground();
        } else {
          const fresh = await generate();
          if (!alive) return;
          if (fresh) await startFlow(fresh);
        }
      } catch (err) {
        if (!alive) return;
        setError(err.message);
        setPhase('error');
      }
    })();
    const flush = () => resumeRef.current?.flush().catch(() => {});
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      stopSpeaking();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, bootKey]);

  // Retry from the error screen stays inside the lesson: same topic, fresh
  // generation — never a reload back to the dashboard.
  const retryBoot = () => {
    setError('');
    setLoadPct(0);
    setLoadMsg(t('les.loading'));
    setPhase('loading');
    setBootKey((k) => k + 1);
  };

  useEffect(() => { checkpoint(); }, [stepIdx, checkpoint]);

  if (phase === 'loading') {
    const R = 44;
    const CIRC = 2 * Math.PI * R;
    return (
      <div className="grid min-h-[70vh] place-content-center justify-items-center gap-3 text-center">
        <div className="relative h-8 w-8" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadPct} aria-label={loadMsg}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border-secondary)" strokeWidth="12" />
            <circle
              cx="50" cy="50" r={R} fill="none" stroke="var(--primary)" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - loadPct / 100)}
              style={{ transition: 'stroke-dashoffset 0.25s ease-out' }}
            />
          </svg>
        </div>
        <span className="text-sm font-semibold tabular-nums">{loadPct}%</span>
        <span className="max-w-xs text-sm text-[var(--text-secondary)]">{loadMsg}</span>
      </div>
    );
  }

  if (phase === 'error' || !content || !st) {
    return (
      <div className="grid justify-items-center gap-3 py-10 text-center">
        <p className="text-sm text-[var(--danger-text)]">{error || t('les.failed')}</p>
        <button onClick={retryBoot} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]">
          {t('les.regen')}
        </button>
        <button onClick={() => onExit('lessons')} className="text-sm text-[var(--text-secondary)] underline">{t('les.back')}</button>
      </div>
    );
  }

  const segs = sectionProgress(flow, stepIdx);
  const here = currentSection(flow, stepIdx);
  const sectionTab = (key) => t(SECTIONS.find((s) => s.key === key)?.tab || '');
  const counter = t('les.stepOf', { n: stepIdx + 1, total: flow.length });

  return (
    <div className="grid gap-4">
      {toastNode}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" role="progressbar" aria-label={t('les.progressLabel')} aria-valuemin="0" aria-valuemax={flow.length} aria-valuenow={stepIdx + 1}>
          {segs.map((sg) => {
            const shown = sg.key === here ? sg.done + 1 : sg.done;
            return (
              <span key={sg.key} title={sectionTab(sg.key)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--fill-strong)]" style={{ flexGrow: sg.steps }}>
                <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.round((shown / sg.steps) * 100)}%` }} />
              </span>
            );
          })}
        </div>
        <span className="flex-none text-xs text-[var(--text-tertiary)]">
          {here ? `${sectionTab(here)} · ${counter}` : counter}
        </span>
      </div>

      <motion.div
        key={stepIdx}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid content-start gap-4"
      >
        <StepBody
          st={st} content={content} params={params} locale={locale} contentLang={contentLang}
          flowLen={flow.length}
          S={S} next={next} rerender={rerender} checkpoint={checkpoint}
          toast={toast} onExit={onExit} onCustomize={onCustomize} regen={regen}
          rowRef={rowRef} savedRef={savedRef} resumeRef={resumeRef} user={user}
          saveFailed={saveFailed} retrySave={() => { savedRef.current = false; setSaveFailed(false); setSaveAttempt((a) => a + 1); }} saveAttempt={saveAttempt}
        />
      </motion.div>
    </div>
  );
}

function FootButton({ label, onClick, disabled }) {
  if (!label) return null;
  return (
    <div className="sticky bottom-0 flex justify-center bg-gradient-to-t from-[var(--bg-layout)] via-[color-mix(in_srgb,var(--bg-layout)_85%,transparent)] to-transparent pt-6 pb-1">
      <button
        onClick={onClick} disabled={disabled}
        className="flex min-w-44 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-8 py-3 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <span>{label}</span>
        {ICON_ARROW}
      </button>
    </div>
  );
}

function Eyebrow({ children }) {
  return <div className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">{children}</div>;
}

function Mcq({ q, mst, transcript, onChecked, onDone, rerender }) {
  const doCheck = () => {
    if (mst.selected == null || mst.checked) return;
    mst.checked = true;
    onChecked?.(mst.selected === q.answer);
    rerender();
  };
  return (
    <div className="grid gap-3">
      <p className="text-base font-medium">{q.question}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {q.options.map((o, j) => (
          <button
            key={j} disabled={mst.checked}
            onClick={() => { if (!mst.checked) { mst.selected = j; doCheck(); } }}
            className={`rounded-xl border p-4 text-left text-sm transition-colors ${
              mst.checked
                ? j === q.answer
                  ? 'border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-text)]'
                  : mst.selected === j
                    ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]'
                    : 'border-[var(--border)] opacity-60'
                : mst.selected === j
                  ? 'border-[var(--primary)] bg-[var(--fill)]'
                  : 'border-[var(--border)] bg-[var(--bg-container)] hover:border-[var(--text-tertiary)]'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      {mst.checked && transcript && <p className="text-sm text-[var(--text-secondary)]">{t('les.listening.said')} <i>{transcript}</i></p>}
      {mst.checked && q.explanation && <p className="text-sm text-[var(--text-secondary)]">{q.explanation}</p>}
      {mst.checked && <FootButton label={t('les.continue')} onClick={onDone} />}
    </div>
  );
}

function MicButton({ expected, locale, toast }) {
  const [status, setStatus] = useState(null); // null | recording | processing | {pct, heard} | errorKey
  const sessionRef = useRef(null);

  useEffect(() => () => {
    try { sessionRef.current?.rec?.stop(); } catch { /* already ended */ }
  }, []);

  const stopRec = (rec) => { try { rec.stop(); } catch { /* already ended */ } };

  const start = () => {
    if (sessionRef.current) {
      stopRec(sessionRef.current.rec);
      sessionRef.current = null;
      setStatus(null);
      return;
    }
    stopSpeaking();
    setStatus('recording');
    const session = { rec: null, gotResult: false, failed: false, dead: false };
    sessionRef.current = session;
    const alive = () => sessionRef.current === session && !session.dead;
    session.rec = listen(locale, {
      onstart: () => { if (alive()) setStatus('recording'); },
      onprocessing: () => { if (alive()) setStatus('processing'); },
      onresult: (alts) => {
        if (!alive()) return;
        const clean = alts.filter((a) => typeof a === 'string' && a.trim());
        if (!clean.length) return;
        session.gotResult = true;
        const best = clean.map((a) => ({ a, s: similarity(expected, a, locale) })).sort((x, y) => y.s - x.s)[0];
        const pct = Math.round(best.s * 100);
        setStatus({ pct, heard: best.a });
      },
      onerror: (err) => {
        if (!alive()) return;
        session.failed = true;
        setStatus(['not-allowed', 'permission-timeout'].includes(err) ? 'les.speak.noMic'
          : ['no-speech', 'no_speech'].includes(err) ? 'les.speak.noResult' : 'les.speak.error');
      },
      onend: () => {
        if (!alive()) return;
        sessionRef.current = null;
        if (!session.gotResult && !session.failed) setStatus('les.speak.noResult');
      },
    });
    if (!session.rec) {
      sessionRef.current = null;
      setStatus(null);
    }
  };

  return (
    <>
      <button
        onClick={start}
        disabled={!sttSupported}
        title={t('les.sayIt')}
        aria-label={t('les.sayIt')}
        className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
          status === 'recording'
            ? 'border-red-500 text-[var(--danger-text)]'
            : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
        }`}
      >
        {ICON_MIC}
      </button>
      <div role="status" aria-live="polite">
        {status === 'recording' && <span className="text-xs text-[var(--text-secondary)]">{t('common.moment')}</span>}
        {status === 'processing' && <span className="text-xs text-[var(--text-secondary)]">{t('les.speak.processing')}</span>}
        {typeof status === 'string' && status.startsWith('les.') && (
          <span className="text-xs text-[var(--text-secondary)]">{t(status)}</span>
        )}
        {status && typeof status === 'object' && (
          <div className="grid gap-1">
            <div className={`text-sm font-semibold ${status.pct >= 80 ? 'text-[var(--ok-text)]' : status.pct >= 50 ? 'text-[var(--warn-text)]' : 'text-[var(--danger-text)]'}`}>
              {t(status.pct >= 80 ? 'les.speak.good' : status.pct >= 50 ? 'les.speak.close' : 'les.speak.again')} · {status.pct}%
            </div>
            <div className="text-xs text-[var(--text-secondary)]">{t('les.speak.heard', { text: status.heard })}</div>
          </div>
        )}
      </div>
    </>
  );
}

export function StepBody(props) {
  const { st, content, params, locale, contentLang, flowLen, S, next, rerender, checkpoint, toast, onExit, onCustomize, regen, rowRef, savedRef, resumeRef, user, saveFailed, retrySave, saveAttempt } = props;
  const [showTr, setShowTr] = useState(null);
  const [gapValue, setGapValue] = useState('');
  const c = content;

  // Warm the speech cache the moment a speaking screen appears, so the
  // first playback starts at once instead of paying synthesis latency.
  useEffect(() => {
    if (st.kind === 'speak' && st.it) prefetchSpeech(st.it.text, locale);
  }, [st, locale]);

  // Results save-once side effect
  const isResults = st.kind === 'results';
  const hasQuiz = !!(c.quiz?.length);
  useEffect(() => {
    if (!isResults || savedRef.current) return;
    savedRef.current = true;
    (async () => {
      try {
        if (hasQuiz) {
          const answers = c.quiz.map((_, i) => (S.current.mcq['q' + i]?.checked ? S.current.mcq['q' + i].selected : null));
          if (!rowRef.current.localOnly) {
            await resumeRef.current.complete(answers);
            toast(t('les.result.saved'));
          } else {
            toast(t('les.cache.localOnly'), 'error');
          }
        } else {
          try { await resumeRef.current?.discard(); } catch (err) { console.warn('Practice draft was not cleared:', err.message); }
        }
      } catch (err) {
        savedRef.current = false;
        toast(t('les.result.saveFailed'), 'error');
        setSaveFailed(true);
        return;
      }
      try {
        const { added, skipped } = await saveLessonVocabulary(supabase, {
          userId: user.id, language: params.lang, domain: params.domain,
          topic: params.topic, content: hasQuiz ? rowRef.current.content : c,
        });
        if (added && !skipped) toast(tp('les.result.vocab', added, { n: added }));
      } catch (err) {
        console.warn('Vocabulary was not saved:', err.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResults, saveAttempt]);

  if (st.kind === 'intro') {
    const title = cleanTitle(c.title, params.level, params.lang);
    const squash = (v) => String(v || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const localizedTopic = topicName(params.domain, params.topic);
    const topic = squash(title).includes(squash(localizedTopic)) ? '' : localizedTopic;
    const plan = lessonPlan(c, params.lang);
    const facts = [
      [t('les.fact.level'), params.level],
      [t('les.fact.language'), languageName(params.lang)],
      [t('les.fact.duration'), t('les.minutes', { n: estimateMinutes(c, params.lang) })],
      [t('les.fact.steps'), String(flowLen)],
    ];
    return (
      <div className="grid gap-4">
        <header className="grid gap-2">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span className="inline-flex" aria-hidden="true" dangerouslySetInnerHTML={{ __html: domainIcon(params.domain) }} />
            <span>{domainName(rowRef.current?.domainRow || params.domain)}</span>
            {topic ? <><span aria-hidden="true">/</span><span>{topic}</span></> : null}
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{c.intro || ''}</p>
          {rowRef.current?.localOnly && <p className="text-sm text-[var(--text-secondary)]">{t('les.cache.localOnly')}</p>}
        </header>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-3">
              <dt className="text-xs text-[var(--text-tertiary)]">{k}</dt>
              <dd className="text-sm font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
            <h2 className="mb-2 text-sm font-semibold">{t('les.goals')}</h2>
            <ol className="grid gap-2">
              {(c.objectives || []).map((o, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[var(--fill-strong)] text-xs font-bold">{i + 1}</span>
                  <span>{o}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
            <h2 className="mb-2 text-sm font-semibold">{t('les.plan')}</h2>
            <ol className="grid gap-2">
              {plan.map((p) => (
                <li key={p.key} className="flex items-center gap-2.5 text-sm">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[var(--fill)]" aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SECTION_ICON[p.key] || ''}</svg>` }} />
                  <span className="flex-1">{t(p.tab)}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{tp(p.unit, p.count)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="flex gap-2">
          <button onClick={regen} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--text-tertiary)]">{t('les.regen')}</button>
          <button onClick={onCustomize} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--text-tertiary)]">{t('les.custom.modify')}</button>
        </div>
        <FootButton label={t('les.begin')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'deck') {
    const items = c.vocabulary;
    const ds = S.current.deck;
    const visible = items.slice(ds.i, ds.i + VOCAB_CARDS_PER_PAGE);
    const end = ds.i + visible.length;
    const flip = (index) => {
      const flipped = ds.flippedCards.includes(index) || (ds.flipped && index === ds.i);
      ds.flippedCards = flipped ? ds.flippedCards.filter((i) => i !== index) : [...ds.flippedCards, index];
      ds.flipped = false;
      checkpoint();
      rerender();
    };
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.vocab')} · {ds.i + 1}–{end}/{items.length}</Eyebrow>
        <p className="text-sm text-[var(--text-secondary)]">{t('les.deckHint')}</p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((v, offset) => {
            const index = ds.i + offset;
            const flipped = ds.flippedCards.includes(index) || (ds.flipped && index === ds.i);
            return (
              <div
                key={index} tabIndex={0} role="button" aria-pressed={flipped} aria-label={v.term}
                onClick={(e) => { if (!e.target.closest('button')) flip(index); }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); flip(index); } }}
                className={`grid min-h-36 cursor-pointer gap-1 rounded-2xl border p-4 transition-colors ${flipped ? 'border-[var(--primary)] bg-[var(--fill)]' : 'border-[var(--border)] bg-[var(--bg-container)] hover:border-[var(--text-tertiary)]'}`}
              >
                {!flipped ? (
                  <>
                    <div className="text-lg font-bold">{v.term}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{v.translation}{v.partOfSpeech ? <em> · {v.partOfSpeech}</em> : null}</div>
                    <SayButton text={v.term} locale={locale} />
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-[var(--text-secondary)]">{v.term}</div>
                    <div className="text-sm">„{v.example}” <SayButton text={v.example} locale={locale} small /></div>
                    <div className="text-xs text-[var(--text-tertiary)]">{v.exampleTranslation}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <FootButton
          label={end < items.length ? t('les.nextCard') : t('les.continue')}
          onClick={() => { if (end < items.length) { ds.i = end; ds.flipped = false; checkpoint(); rerender(); } else next(); }}
        />
      </div>
    );
  }

  if (st.kind === 'phrases') {
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.phrases')}</Eyebrow>
        <p className="text-sm text-[var(--text-secondary)]">{t('les.phrases.sub')}</p>
        <div className="grid gap-2.5">
          {(c.phrases || []).map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
              className="grid gap-1 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-semibold">{p.phrase}</div>
                <SayButton text={p.phrase} locale={locale} small />
              </div>
              <div className="text-sm text-[var(--text-secondary)]">{p.translation}</div>
              <div className="text-xs text-[var(--text-tertiary)]">{p.usage}</div>
            </motion.div>
          ))}
        </div>
        <FootButton label={t('les.continue')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'dialogue') {
    const lines = c.dialogue?.lines || [];
    const speakers = [...new Set(lines.map((l) => l.speaker))];
    const playAll = () => {
      let i = 0;
      const txs = lines.map((l) => l.text);
      const play = () => { if (i < txs.length) speak(txs[i++], locale, { rate: speechRate(), onend: play }); };
      play();
    };
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.dialogue')}</Eyebrow>
        <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-3.5 text-sm text-[var(--text-secondary)]">{c.dialogue?.context || ''}</div>
        <div className="flex justify-end">
          <button onClick={playAll} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--text-tertiary)]">{t('les.dialogue.all')}</button>
        </div>
        <div className="grid gap-2.5">
          {lines.map((l, i) => (
            <div key={i} className={`flex gap-2.5 ${speakers.indexOf(l.speaker) % 2 ? 'flex-row-reverse' : ''}`}>
              <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--fill-strong)] text-xs font-bold">{(l.speaker || '?')[0]}</div>
              <div className="grid max-w-[85%] gap-1 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-3">
                <div className="text-xs font-semibold text-[var(--text-tertiary)]">{l.speaker}</div>
                <div className="flex items-start justify-between gap-2 text-sm">{l.text}<SayButton text={l.text} locale={locale} small /></div>
                <div className="text-xs text-[var(--text-secondary)]">{l.translation}</div>
              </div>
            </div>
          ))}
        </div>
        <FootButton label={t('les.continue')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'reading') {
    const show = showTr ?? getPref('showTranslations');
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.reading')}</Eyebrow>
        <div className="grid gap-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{c.reading?.title || ''}</h3>
            <div className="flex gap-2">
              <button onClick={() => speak(c.reading?.passage || '', locale, { rate: speechRate() })} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--text-tertiary)]">{t('les.reading.play')}</button>
              <button onClick={() => setShowTr(!show)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--text-tertiary)]">
                {t(show ? 'les.reading.hideTr' : 'les.reading.showTr')}
              </button>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed">{c.reading?.passage || ''}</p>
          {show && <p className="text-sm text-[var(--text-secondary)]">{c.reading?.translation || ''}</p>}
        </div>
        <FootButton label={t('les.continue')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'rmcq' || st.kind === 'quiz' || st.kind === 'listen') {
    const key = (st.kind === 'rmcq' ? 'r' : st.kind === 'quiz' ? 'q' : 'l') + st.index;
    if (!S.current.mcq[key]) S.current.mcq[key] = { selected: null, checked: false };
    const mst = S.current.mcq[key];
    const total = st.kind === 'rmcq' ? 0 : (st.kind === 'quiz' ? c.quiz.length : c.listening.length);
    const q = st.kind === 'rmcq' ? st.q
      : st.kind === 'quiz' ? st.q
      : { question: st.it.question, options: st.it.options, answer: st.it.answer };
    const check = (right) => { checkpoint(); };
    return (
      <div className="grid gap-3">
        <Eyebrow>
          {st.kind === 'rmcq' ? `${t('tab.reading')} · ${t('les.reading.q')}`
            : st.kind === 'quiz' ? `${t('tab.quiz')} · ${st.index + 1}/${total}`
            : `${t('tab.listening')} · ${st.index + 1}/${total}`}
        </Eyebrow>
        {st.kind === 'listen' && (
          <>
            <p className="text-sm text-[var(--text-secondary)]">{t('les.listening.sub')}</p>
            {!ttsSupported && <p className="text-xs text-[var(--warn-text)]">{t('les.ttsWarn')}</p>}
            <div className="flex gap-2">
              <button onClick={() => speak(st.it.text, locale, { rate: speechRate() })} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
                {t('les.listening.play', { n: st.index + 1 })}
              </button>
              <button onClick={() => speak(st.it.text, locale, { rate: speechRate() * 0.75 })} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
                {t('les.listening.slow')}
              </button>
            </div>
          </>
        )}
        <Mcq
          q={q} mst={mst} transcript={st.kind === 'listen' ? st.it.text : null}
          onChecked={check}
          onDone={next}
          rerender={() => { checkpoint(); rerender(); }}
        />
      </div>
    );
  }

  if (st.kind === 'grammar') {
    const g = c.grammar || {};
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.grammar')}</Eyebrow>
        <div className="grid gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
          <h3 className="text-base font-semibold">{g.title || ''}</h3>
          <p className="text-sm leading-relaxed">{g.explanation || ''}</p>
          <ul className="grid gap-1.5">
            {(g.examples || []).map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>{x}</span>
                <SayButton text={x} locale={locale} small />
              </li>
            ))}
          </ul>
        </div>
        <FootButton label={t('les.continue')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'gap') {
    const key = 'g' + st.index;
    if (!S.current.gap[key]) S.current.gap[key] = { value: gapValue, checked: false, ok: false };
    const gst = S.current.gap[key];
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.grammar')} · {st.index + 1}/{c.grammar.practice.length}</Eyebrow>
        <h2 className="text-lg font-semibold">{t('les.grammar.q')}</h2>
        <div className={`grid gap-3 rounded-2xl border p-4 ${gst.checked ? (gst.ok ? 'border-[var(--ok-border)] bg-[var(--ok-bg)]' : 'border-[var(--danger-border)] bg-[var(--danger-bg)]') : 'border-[var(--border-secondary)] bg-[var(--bg-container)]'}`}>
          <label htmlFor="gap-in" lang={params.lang} dir="auto" className="text-[15px]">{st.p.sentence}</label>
          <div className="flex gap-2">
            <input
              id="gap-in" type="text" lang={params.lang} dir="auto" autoComplete="off"
              placeholder={t('les.gap.ph')} value={gst.value} readOnly={gst.checked}
              onChange={(e) => { gst.value = e.target.value; setGapValue(e.target.value); checkpoint(); }}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--fill)] px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-tertiary)]"
            />
            {st.p.hint && <span title={st.p.hint} className="grid h-10 w-10 flex-none cursor-help place-items-center rounded-lg border border-[var(--border)] text-sm">?</span>}
          </div>
          {gst.checked && <p className="text-sm">{t('les.gap.answer')} <b>{st.p.answer}</b>{st.p.hint ? ` · ${st.p.hint}` : ''}</p>}
        </div>
        {!gst.checked ? (
          <FootButton
            label={t('les.check')}
            onClick={() => {
              const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
              gst.checked = true;
              gst.ok = norm(gst.value) === norm(st.p.answer);
              checkpoint();
              rerender();
            }}
          />
        ) : (
          <FootButton label={t('les.continue')} onClick={next} />
        )}
      </div>
    );
  }

  if (st.kind === 'speak') {
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.speaking')} · {st.index + 1}/{c.speaking.length}</Eyebrow>
        <p className="text-sm text-[var(--text-secondary)]">{t('les.speaking.sub')}</p>
        {!sttSupported && <p className="text-xs text-[var(--warn-text)]">{t('les.sttWarn')}</p>}
        <div className="grid gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold">{st.it.text}</div>
              <div className="text-sm text-[var(--text-secondary)]">{st.it.translation}</div>
            </div>
            <div className="flex gap-2">
              <SayButton text={st.it.text} locale={locale} />
              {sttSupported && <MicButton expected={st.it.text} locale={locale} toast={toast} />}
            </div>
          </div>
          <div className="text-xs text-[var(--text-secondary)]">{st.it.tip}</div>
          <p className="text-[11px] text-[var(--text-tertiary)]">{t('les.speak.privacy')}</p>
        </div>
        <FootButton label={t('les.continue')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'tips') {
    return (
      <div className="grid gap-3">
        <Eyebrow>{t('tab.tips')}</Eyebrow>
        <ul className="grid gap-2">
          {(c.tips || []).map((x, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-3.5 text-sm">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[var(--fill-strong)] text-xs font-bold">{i + 1}</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
        <FootButton label={t('les.continue')} onClick={next} />
      </div>
    );
  }

  if (st.kind === 'results') {
    if (!(c.quiz?.length)) {
      let checked = 0, right = 0;
      (c.reading?.questions || []).forEach((qq, i) => {
        const s8 = S.current.mcq['r' + i];
        if (s8?.checked) { checked++; if (s8.selected === qq.answer) right++; }
      });
      (c.listening || []).forEach((it, i) => {
        const s8 = S.current.mcq['l' + i];
        if (s8?.checked) { checked++; if (s8.selected === it.answer) right++; }
      });
      (c.grammar?.practice || []).forEach((_, i) => {
        const s8 = S.current.gap['g' + i];
        if (s8?.checked) { checked++; if (s8.ok) right++; }
      });
      return (
        <ResultsShell
          title={t('les.custom.done.title')}
          body={[t('les.custom.done.body'), checked ? t('les.custom.done.practice', { n: checked, right }) : null].filter(Boolean)}
          onExit={onExit} regen={regen} hasQuiz={false}
        />
      );
    }
    const total = c.quiz.length;
    let score = 0;
    c.quiz.forEach((qq, i) => { if (S.current.mcq['q' + i]?.checked && S.current.mcq['q' + i]?.selected === qq.answer) score++; });
    const pctR = Math.round((score / total) * 100);
    return (
      <ResultsShell
        score={`${score}/${total}`}
        perfect={score === total}
        title={pctR === 100 ? t('les.result.perfect') : pctR >= 70 ? t('les.result.good') : t('les.result.low', { pass: 70 })}
        onExit={onExit} regen={regen} hasQuiz
        extra={saveFailed ? (
          <button onClick={retrySave} className="rounded-lg border border-red-800 px-5 py-2.5 text-sm text-red-300 hover:border-red-500">
            {t('les.result.retry')}
          </button>
        ) : null}
      />
    );
  }

  return null;
}

function ResultsShell({ score, title, body, onExit, regen, hasQuiz, extra, perfect }) {
  return (
    <div className="grid justify-items-center gap-3 py-6 text-center">
      {perfect && <Confetti />}
      {score && <div className="text-5xl font-bold">{score}</div>}
      <div className="text-lg font-semibold">{title}</div>
      {(body || []).map((b, i) => (
        <p key={i} className="max-w-md text-sm text-[var(--text-secondary)]">{b}</p>
      ))}
      {extra}
      <div className="flex gap-2">
        <button onClick={() => onExit('lessons')} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]">
          {t('les.back')}
        </button>
        <button onClick={regen} className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm hover:border-[var(--text-tertiary)]">
          {t('les.regen')}
        </button>
      </div>
    </div>
  );
}
