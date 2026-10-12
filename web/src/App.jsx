import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { supabase } from './lib/supabase.js';
import { getProfile } from './lib/auth.js';
import { t, languageName, onPrefsChange } from './lib/legacy.js';
import { applyThemePrefs } from './lib/theme.js';
import { resolveActiveLanguage } from './lib/lang.js';
import { useI18nReady, useI18n } from './lib/i18n.jsx';
import AmbientGL from './components/AmbientGL.jsx';
import Topbar from './components/Topbar.jsx';
import { MotionView, ErrorBoundary } from './components/ui.jsx';import Dashboard from './pages/Dashboard.jsx';
import Lessons from './pages/Lessons.jsx';
import Review from './pages/Review.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Settings from './pages/Settings.jsx';
import Lesson from './pages/Lesson.jsx';
import Guide from './pages/Guide.jsx';
import Docs from './pages/Docs.jsx';
import Vocab from './pages/Vocab.jsx';

const APP_VIEWS = new Set(['dashboard', 'lessons', 'guide', 'docs', 'onboarding', 'settings', 'review', 'lesson', 'vocab']);

function Footer({ onDoc }) {
  return (
    <footer className="mx-auto w-full max-w-5xl border-t border-[var(--border-secondary)] px-4 pt-4 pb-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-tertiary)]">
        <span>{t('foot.generated')}</span>
        <button onClick={() => onDoc('faq')} className="hover:text-[var(--text-secondary)]">{t('foot.faq')}</button>
        <button onClick={() => onDoc('terms')} className="hover:text-[var(--text-secondary)]">{t('foot.terms')}</button>
        <button onClick={() => onDoc('priv')} className="hover:text-[var(--text-secondary)]">{t('foot.privacy')}</button>
      </div>
    </footer>
  );
}

export default function App() {
  const ready = useI18nReady();
  const { lang } = useI18n();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState('dashboard');
  const [obEdit, setObEdit] = useState(false);
  const [lessonParams, setLessonParams] = useState(null);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const nav = (v) => {
    if (v !== 'onboarding') setObEdit(false);
    setView(v);
  };

  // SPA navigation keeps the scroll offset; every view starts at the top.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [view]);
  const startLesson = (p) => {
    setLessonParams(p);
    setView('lesson');
  };
  const [doc, setDoc] = useState('faq');
  const [activeLang, setActiveLang] = useState(null);
  const langsRef = useRef([]);

  useEffect(() => {
    applyThemePrefs();
    const off = onPrefsChange(() => applyThemePrefs());
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => { off(); sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    getProfile(user.id).then(setProfile).catch(() => setProfile(null));
    supabase.from('user_languages').select('language_code, level').eq('user_id', user.id).order('created_at')
      .then(({ data }) => {
        langsRef.current = data || [];
        setActiveLang(resolveActiveLanguage(langsRef.current));
      });
  }, [user]);

  // The language can be switched in Settings; re-resolve on every navigation
  // so the header capsule never shows a stale language.
  useEffect(() => {
    if (langsRef.current.length) setActiveLang(resolveActiveLanguage(langsRef.current));
  }, [view]);

  useEffect(() => {
    if (view === 'lesson') return; // the runner sets its own lesson title
    const raw =
      view === 'dashboard' ? t('nav.dashboard')
      : view === 'lessons' ? t('les.page.title')
      : view === 'guide' ? t('nav.guide')
      : view === 'settings' ? t('set.title')
      : view === 'review' ? t('dash.review.title')
      : view === 'vocab' ? t('voc.title')
      : view === 'onboarding' ? t('ob.pageTitle')
      : view === 'docs' ? t({ faq: 'faq.pageTitle', terms: 'terms.pageTitle', priv: 'priv.pageTitle' }[doc])
      : t('login.pageTitle');
    document.title = raw.includes('LD Platform') ? raw.replace(' · ', ' - ') : `${raw} - LD Platform`;
  }, [view, doc, lang]);

  const goLogin = () => setView('login');
  const goDoc = (d) => { setDoc(d); setView('docs'); };

  if (!ready || checking) return null;

  // Signed out: the login screen owns the page; docs stay reachable.
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <AmbientGL />
        {view === 'docs' ? (
          <>
            <div className="mx-auto w-full max-w-5xl px-4 pt-6">
              <button onClick={goLogin} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
                ← {t('set.back')}
              </button>
            </div>
            <MotionView k={`docs-${doc}`}>
              <Docs doc={doc} />
            </MotionView>
            <Footer onDoc={goDoc} />
          </>
        ) : (
          <>
            <Login
              onAuthed={async (route) => {
                if (route === 'onboarding') {
                  setView('onboarding');
                  return;
                }
                const { data: { user: u } } = await supabase.auth.getUser();
                setUser(u);
                setView('dashboard');
              }}
            />
            {/* No footer on the login screen, like the original. */}
          </>
        )}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
    <div className="flex min-h-screen flex-col">
      <AmbientGL />
      <Topbar user={user} profile={profile} activeLang={activeLang} view={view === 'lesson' ? 'lessons' : APP_VIEWS.has(view) ? view : 'dashboard'} onNav={nav} onAddLanguage={() => { setObEdit(true); setView('onboarding'); }} />
      <AnimatePresence mode="wait">
        {view === 'dashboard' && (
          <MotionView key="dashboard">
            <ErrorBoundary key={`dash-boundary-${user.id}`}>
              <Dashboard key={user.id} user={user} onReview={() => setView('review')} onStartLesson={startLesson} />
            </ErrorBoundary>
          </MotionView>
        )}
        {view === 'review' && (
          <MotionView key="review">
            <div>
              <button onClick={() => setView('dashboard')} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                {t('rev.back')}
              </button>
            </div>
            <Review key={user.id} user={user} onExit={(route) => setView(route === 'onboarding' ? 'onboarding' : 'dashboard')} />
          </MotionView>
        )}
        {view === 'lessons' && (
          <MotionView key="lessons">
            <Lessons key={user.id} onStartLesson={startLesson} />
          </MotionView>
        )}
        {view === 'vocab' && (
          <MotionView key="vocab">
            <Vocab key={user.id} />
          </MotionView>
        )}
        {view === 'guide' && (
          <MotionView key="guide">
            <Guide onGo={() => setView('dashboard')} />
          </MotionView>
        )}
        {view === 'onboarding' && (
          <MotionView key={`onboarding-${obEdit ? 'edit' : 'fresh'}`}>
            <Onboarding key={obEdit ? 'edit' : 'fresh'} edit={obEdit} onDone={(route) => {
              supabase.from('user_languages').select('language_code, level').eq('user_id', user.id).order('created_at')
                .then(({ data }) => {
                  const langs = data || [];
                  const active = localStorage.getItem('activeLanguage');
                  setActiveLang(langs.find((l) => l.language_code === active) || langs[0] || null);
                  setView(route);
                });
            }} />
          </MotionView>
        )}
        {view === 'docs' && (
          <MotionView key={`docs-${doc}`}>
            <Docs doc={doc} />
          </MotionView>
        )}
        {view === 'settings' && (
          <MotionView key="settings">
            <Settings key={user.id} user={user} initialTab={settingsTab} onSignedOut={() => { setUser(null); setActiveLang(null); setView('login'); }} />
          </MotionView>
        )}
        {view === 'lesson' && lessonParams && (
          <MotionView key={`lesson-${lessonParams.lang}-${lessonParams.domain}-${lessonParams.topic}-${lessonParams.level}`}>
            <button onClick={() => setView('lessons')} className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              {t('rev.back')}
            </button>
            <ErrorBoundary key={`lesson-boundary-${lessonParams.lang}-${lessonParams.domain}-${lessonParams.topic}-${lessonParams.level}`}>
            <Lesson
              key={`${lessonParams.lang}|${lessonParams.domain}|${lessonParams.topic}|${lessonParams.level}`}
              user={user}
              params={lessonParams}
              onExit={(route) => {
                if (route === 'login') {
                  setUser(null);
                  setActiveLang(null);
                  setView('login');
                } else {
                  setView('lessons');
                }
              }}
              onCustomize={() => { setSettingsTab('lessons'); setView('settings'); }}
            />
            </ErrorBoundary>
          </MotionView>
        )}
      </AnimatePresence>
      <Footer onDoc={goDoc} />
    </div>
    </MotionConfig>
  );
}
