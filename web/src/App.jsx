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

function ChatGPTIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" /></svg>
  );
}

function Footer({ onDoc }) {
  return (
    <footer className="mx-auto w-full max-w-5xl border-t border-[var(--border-secondary)] px-4 pt-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-container)] px-2.5 py-1">
          <ChatGPTIcon />
          <span>{t('foot.generated')}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button onClick={() => onDoc('faq')} className="hover:text-[var(--text-secondary)]">{t('foot.faq')}</button>
          <button onClick={() => onDoc('terms')} className="hover:text-[var(--text-secondary)]">{t('foot.terms')}</button>
          <button onClick={() => onDoc('priv')} className="hover:text-[var(--text-secondary)]">{t('foot.privacy')}</button>
        </span>
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);
  const startLesson = (p) => {
    setLessonParams(p);
    setView('lesson');
  };
  const [doc, setDoc] = useState('faq');
  const [activeLang, setActiveLang] = useState(null);
  const langsRef = useRef([]);
  const [dashTick, setDashTick] = useState(0);
  const firstDash = useRef(true);

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

  // Re-citim profilul la intrarea în setări, ca un flag setat
  // recent (is_admin) să fie văzut imediat, nu doar după re-login.
  useEffect(() => {
    if (view === 'settings' && user) {
      getProfile(user.id).then(setProfile).catch(() => {});
    }
  }, [view, user]);

  // Re-mount the dashboard on every visit (except the first) so it never
  // shows stale numbers: it keeps data in state and only refetches when
  // its key (user/reload) changes, so navigation alone left old values up.
  useEffect(() => {
    if (view !== 'dashboard') return;
    if (firstDash.current) {
      firstDash.current = false;
      return;
    }
    setDashTick((t) => t + 1);
  }, [view]);
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

  // Blocked accounts see only this screen (with a way out).
  if (user && profile?.is_banned) {
    return (
      <div className="flex min-h-screen flex-col">
        <AmbientGL />
        <div className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-4 px-4 py-8">
          <div className="grid justify-items-center gap-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-8 text-center">
            <h1 className="text-xl font-bold text-[var(--danger-text)]">{t('admin.banned.title')}</h1>
            <p className="max-w-md text-sm text-[var(--danger-text)]">
              {profile.banned_reason || t('admin.banned.default')} {t('admin.banned.desc')}
            </p>
            <button
              onClick={() => supabase.auth.signOut().then(() => { setUser(null); setProfile(null); setView('login'); })}
              className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
        <Footer onDoc={goDoc} />
      </div>
    );
  }

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
            <ErrorBoundary key={`dash-boundary-${user.id}-${dashTick}`}>
              <Dashboard key={`${user.id}-${dashTick}`} user={user} onReview={() => setView('review')} onStartLesson={startLesson} />
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
            <Settings key={user.id} user={user} isAdmin={profile?.is_admin === true} initialTab={settingsTab} onSignedOut={() => { setUser(null); setActiveLang(null); setView('login'); }} onProfileSaved={() => { getProfile(user.id).then(setProfile).catch(() => {}); }} />
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
