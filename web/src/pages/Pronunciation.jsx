import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Lessons from './Lessons.jsx';
import { supabase } from '../lib/supabase.js';
import { languageName, domainName, topicName, langMeta, t } from '../lib/legacy.js';
import { useI18n } from '../lib/i18n.jsx';
import { listenWithWhisper, speak, stopSpeaking, sttSupported, toLocale } from '../lib/speech.js';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';
import { isAiQuotaReached, markAiQuotaReached } from '../lib/ai-quota.js';

function PracticeAnswer({ item, locale, selected, interfaceLang, history, turn, onEvaluated }) {
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const sessionRef = useRef(null);

  useEffect(() => () => {
    try { sessionRef.current?.rec?.stop(); } catch { /* already ended */ }
    stopSpeaking();
  }, []);

  const toggleRecording = () => {
    if (sessionRef.current) {
      try { sessionRef.current.rec?.stop(); } catch { /* already ended */ }
      setTranscribing(true);
      return;
    }
    stopSpeaking();
    const session = { rec: null, gotResult: false, failed: false, dead: false };
    sessionRef.current = session;
    const alive = () => sessionRef.current === session && !session.dead;
    session.rec = listenWithWhisper(locale, {
      onstart: () => { if (alive()) setRecording(true); },
      onprocessing: () => { if (alive()) { setRecording(false); setTranscribing(true); } },
      onresult: (alternatives) => {
        if (!alive()) return;
        const clean = alternatives.filter(value => typeof value === 'string' && value.trim());
        if (!clean.length) return;
        session.gotResult = true;
        setAnswer(clean[0].trim());
        setRecording(false);
        setTranscribing(false);
      },
      onerror: error => {
        if (!alive()) return;
        session.failed = true;
        setRecording(false);
        setTranscribing(false);
        setError(['not-allowed', 'permission-timeout'].includes(error) ? t('les.speak.noMic')
          : ['no-speech', 'no_speech'].includes(error) ? t('les.speak.noResult') : t('les.speak.error'));
      },
      onend: () => {
        if (!alive()) return;
        sessionRef.current = null;
        setRecording(false);
        setTranscribing(false);
        if (!session.gotResult && !session.failed) setError(t('les.speak.noResult'));
      },
    });
    if (!session.rec) {
      sessionRef.current = null;
      setError(t('les.speak.noMic'));
    }
  };

  const evaluate = async () => {
    if (!answer.trim() || evaluating) return;
    if (isAiQuotaReached(t('les.quota'))) return;
    setEvaluating(true);
    setError('');
    setEvaluation(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('unauthorized');
      const response = await fetch('/api/practice/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          language: languageName(selected.lang, 'en'), domain: domainName(selected.domain),
          topic: topicName(selected.domain, selected.topic), level: selected.level,
          languageCode: selected.lang, domainSlug: selected.domain, topicKey: selected.topic,
          nativeLanguage: langMeta(interfaceLang)?.label || interfaceLang, nativeLanguageCode: interfaceLang,
          question: item.question, criteria: item.criteria, answer: answer.trim(), history, turn,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.evaluation) {
        if (payload.quota || payload.error === 'practice_quota') {
          markAiQuotaReached(t('les.quota'));
          throw new Error('quota');
        }
        if (payload.error === 'practice_not_configured') throw new Error('not_configured');
        throw new Error('evaluation');
      }
      setEvaluation(payload.evaluation);
      onEvaluated?.(payload.evaluation, answer.trim());
    } catch (err) {
      if (err.message !== 'quota') setError(err.message === 'not_configured' ? t('pron.aiNotConfigured') : t('pron.analysisFailed'));
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="practice-answer">
      <>{evaluation ? <p className="practice-submitted-answer practice-chat-user">{answer}</p> : <div className="practice-composer">
        <textarea value={answer} onChange={event => setAnswer(event.target.value)} rows={3} disabled={evaluating}
          aria-label={t('pron.answerPlaceholder')} placeholder={t('pron.answerPlaceholder')} className="practice-answer-input" />
        <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!sttSupported || transcribing || evaluating} onClick={toggleRecording}
          aria-label={recording ? t('pron.stop') : t('pron.record')} title={recording ? t('pron.stop') : t('pron.record')}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--fill)] disabled:cursor-not-allowed disabled:opacity-50">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>
          {recording ? t('pron.stop') : t('pron.record')}
        </button>
        {recording && <span className="text-sm text-[var(--text-secondary)]">{t('pron.recording')}</span>}
        {transcribing && <span role="status" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="loading-dot h-2 w-2 rounded-full bg-[var(--text-secondary)]"/>{t('les.speak.processing')}</span>}
        {!sttSupported && <span className="text-xs text-[var(--text-tertiary)]">{t('les.speak.noMic')}</span>}
        </div>
      </div>}</>
      {!evaluation && <div className="flex justify-end"><button type="button" onClick={evaluate} disabled={!answer.trim() || evaluating || recording || transcribing}
        className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-50">{t('pron.checkAnswer')}</button></div>}
      {evaluating && <p role="status" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="loading-dot h-2 w-2 rounded-full bg-[var(--text-secondary)]"/>{t('pron.analyzingAnswer')}</p>}
      {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}
      {evaluation && <div className="practice-feedback practice-chat-coach" aria-live="polite">
        <div className="practice-score"><span>{evaluation.score}%</span><div className="practice-score-track" aria-hidden="true"><div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500" style={{ width: `${evaluation.score}%` }}/></div></div>
        <p className="practice-feedback-text">{evaluation.feedback}</p>
        <div className="practice-improved-answer"><p>{evaluation.improvedAnswer}</p><p>{evaluation.improvedTranslation}</p></div>
      </div>}
    </div>
  );
}

export default function Pronunciation() {
  const { lang: interfaceLang } = useI18n();
  const [phase, setPhase] = useState('topics');
  const [practice, setPractice] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [turn, setTurn] = useState(1);
  const [lastEvaluation, setLastEvaluation] = useState(null);
  const [lastAnswer, setLastAnswer] = useState('');
  const [exchanges, setExchanges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [evaluated, setEvaluated] = useState(false);
  const [error, setError] = useState('');

  const generatePractice = async (params) => {
    if (isAiQuotaReached(t('les.quota'))) {
      setError('');
      setPhase('topics');
      return;
    }
    setSelected(params);
    setError('');
    setPractice(null);
    setPhase('loading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('unauthorized');
      const nativeLanguage = langMeta(interfaceLang)?.label || interfaceLang;
      const response = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          language: languageName(params.lang, 'en'),
          domain: domainName(params.domain),
          topic: topicName(params.domain, params.topic),
          level: params.level,
          languageCode: params.lang,
          domainSlug: params.domain,
          topicKey: params.topic,
          nativeLanguage,
          nativeLanguageCode: interfaceLang,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.practice?.firstQuestion) {
        if (payload.quota || payload.error === 'practice_quota') {
          markAiQuotaReached(t('les.quota'));
          throw new Error('quota');
        }
        if (payload.error === 'practice_not_configured') throw new Error('not_configured');
        throw new Error('generation');
      }
      setPractice(payload.practice);
      setCurrentQuestion(payload.practice.firstQuestion);
      setConversationHistory([]);
      setExchanges([]);
      setTurn(1);
      setLastEvaluation(null);
      setLastAnswer('');
      setEvaluated(false);
      setPhase('session');
    } catch (err) {
      if (err.message !== 'quota') setError(err.message === 'not_configured' ? t('pron.aiNotConfigured') : t('pron.generateError'));
      setPhase('topics');
    }
  };

  const backToTopics = () => {
    stopSpeaking();
    setPractice(null);
    setCurrentQuestion(null);
    setConversationHistory([]);
    setSelected(null);
    setError('');
    setPhase('topics');
  };

  const locale = toLocale(selected?.lang || 'en');
  const isComplete = phase === 'complete';

  if (phase === 'loading') return <LoadingOverlay message={t('pron.generatingHint')} label={t('pron.generating')} />;
  if (phase === 'topics') return <div className="grid gap-4">
    {error && error !== t('les.quota') && <p role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--bg-container)] px-4 py-3 text-sm text-[var(--danger-text)]">{error}</p>}
    <Lessons variant="practice" onStartLesson={generatePractice} />
  </div>;

  return <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="practice-session mx-auto grid w-full max-w-3xl gap-6">
    <div className="flex items-center justify-between gap-4">
      <button type="button" onClick={backToTopics} className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]">← {t('rev.back')}</button>
      <span className="text-sm text-[var(--text-tertiary)]">{topicName(selected.domain, selected.topic)} · {selected.level}</span>
    </div>
    {isComplete ? <>
      <PracticeThread exchanges={exchanges} locale={locale} />
      <div className="grid justify-items-center gap-4 py-12 text-center">
      <h2 className="text-2xl font-bold">{t('pron.completeTitle')}</h2>
      <p className="max-w-lg text-[var(--text-secondary)]">{t('pron.completeHint')}</p>
      <button type="button" onClick={backToTopics} className="mt-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--on-primary)]">{t('pron.generateAnother')}</button>
      </div>
    </> : <>
      <header className="grid gap-2 border-b border-[var(--border-secondary)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{practice.title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{practice.intro}</p>
      </header>
      <div className="practice-exercise">
        <div className="flex items-center justify-between text-sm text-[var(--text-tertiary)]"><span>{t('pron.modeMixed')}</span><span>{turn} / {practice.turnLimit}</span></div>
        <div className="practice-turn-track" aria-hidden="true"><div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300" style={{ width: `${(turn / practice.turnLimit) * 100}%` }} /></div>
        <PracticeThread exchanges={exchanges} locale={locale} />
        <PracticeQuestion question={currentQuestion} locale={locale} />
        <PracticeAnswer key={`${selected.topic}-${turn}`} item={currentQuestion} locale={locale} selected={selected} interfaceLang={interfaceLang} history={conversationHistory} turn={turn} onEvaluated={(result, answer) => {
          setEvaluated(true);
          setLastEvaluation(result);
          setLastAnswer(answer);
        }} />
      </div>
      {evaluated && <div className="flex justify-end">
        <button type="button" onClick={() => {
          const exchange = { question: currentQuestion, answer: lastAnswer, evaluation: lastEvaluation };
          if (turn >= practice.turnLimit || !lastEvaluation?.followUp) {
            setExchanges(previous => [...previous, exchange]);
            setPhase('complete');
          }
          else {
            setExchanges(previous => [...previous, exchange]);
            setConversationHistory(previous => [...previous, { question: currentQuestion.question, answer: lastAnswer }]);
            setCurrentQuestion(lastEvaluation.followUp);
            setTurn(value => value + 1);
            setLastEvaluation(null);
            setLastAnswer('');
            setEvaluated(false);
          }
        }} className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-50">
          {turn >= practice.turnLimit ? t('pron.finish') : t('pron.next')}
        </button>
      </div>}
    </>}
  </motion.section>;
}

function PracticeQuestion({ question, locale }) {
  return <div className="practice-chat-assistant">
    <div className="practice-chat-bubble">
      <div className="practice-question">
        <p className="practice-question-text">{question.question}</p>
        <button type="button" onClick={() => speak(question.question, locale)} title={t('les.listen')} aria-label={t('les.listen')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/></svg>
        </button>
      </div>
      <p className="practice-question-translation">{question.translation}</p>
    </div>
  </div>;
}

function PracticeThread({ exchanges, locale }) {
  const threadRef = useRef(null);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  }, [exchanges]);
  if (!exchanges.length) return null;
  return <div ref={threadRef} className="practice-chat-thread" aria-label={t('pron.conversation')}>
    {exchanges.map((exchange, index) => <div className="practice-chat-exchange" key={`${index}-${exchange.question.question}`}>
      <PracticeQuestion question={exchange.question} locale={locale} />
      <p className="practice-chat-user">{exchange.answer}</p>
      <div className="practice-chat-coach" aria-live="polite">
        <div className="practice-score"><span>{exchange.evaluation.score}%</span><div className="practice-score-track" aria-hidden="true"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${exchange.evaluation.score}%` }}/></div></div>
        <p className="practice-feedback-text">{exchange.evaluation.feedback}</p>
        <div className="practice-improved-answer"><p>{exchange.evaluation.improvedAnswer}</p><p>{exchange.evaluation.improvedTranslation}</p></div>
      </div>
    </div>)}
  </div>;
}
