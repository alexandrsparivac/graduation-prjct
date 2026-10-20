import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { getProfile, missingSession } from '../lib/auth.js';
import { getLang, t } from '../lib/legacy.js';
import { BtnPrimary, BtnSecondary, Field, GoogleBtn, Msg } from '../components/ui.jsx';

const EyeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
);
function PwField({ id, label, placeholder, value, onChange, autoComplete, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <span className="flex items-center gap-2 border-b border-[var(--border-secondary)] transition-colors duration-300 focus-within:border-[var(--text)]">
        <input
          id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} required
          className="w-full bg-transparent py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <button type="button" onClick={() => setShow(!show)} aria-label={t('aria.showPassword')} className="flex-none rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text)]">
          {EyeIcon}
        </button>
      </span>
    </Field>
  );
}

export default function Login({ onAuthed }) {
  const [view, setView] = useState('login');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryUserId, setRecoveryUserId] = useState(null);
  const formKey = view === 'forgot' && recoveryUserId ? 'reset' : view;
  const formTitle = formKey === 'login' ? t('auth.login.title')
    : formKey === 'register' ? t('auth.register.title')
      : formKey === 'forgot' ? t('forgot.h1') : t('reset.h1');
  const formSubtitle = formKey === 'login' ? t('auth.login.sub')
    : formKey === 'register' ? t('auth.register.sub')
      : formKey === 'forgot' ? t('forgot.sub') : t('reset.sub');

  const say = (text, kind = 'error') => setMsg({ kind, text });

  // Password-recovery callback landing in this app (hash params).
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const params = new URLSearchParams(window.location.search);
    const requested = hash.get('type') === 'recovery' || !!sessionStorage.getItem('pw-recovery');
    const failed = hash.get('error') || params.get('error') ||
      (hash.get('error_code') || params.get('error_code')) === 'otp_expired';
    if (!requested && !failed) return;
    setView('forgot');
    if (failed) {
      sessionStorage.removeItem('pw-recovery');
      say(t('reset.expired'));
      return;
    }
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) say(t('reset.expired'));
      else {
        setRecoveryUserId(session.user.id);
        sessionStorage.setItem('pw-recovery', session.user.id);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY' && s?.user) {
        setRecoveryUserId(s.user.id);
        sessionStorage.setItem('pw-recovery', s.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const afterLogin = async (user) => {
    const profile = await getProfile(user.id);
    onAuthed(profile?.onboarding_done ? 'dashboard' : 'onboarding');
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setMsg({ kind: '', text: '' });
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return say(error.message === 'Invalid login credentials' ? t('login.badCredentials') : error.message);
      await afterLogin(data.user);
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) return say(t('reg.mismatch'));
    setMsg({ kind: '', text: '' });
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim(), native_language: getLang() },
          emailRedirectTo: window.location.origin + '/',
        },
      });
      if (error) return say(error.message);
      if (data.session) return afterLogin(data.user);
      say(t('reg.created'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    });
    if (error) {
      setBusy(false);
      say(error.message);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setMsg({ kind: '', text: '' });
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + '/',
      });
      if (error) return say(error.message);
      say(t('forgot.sent'), 'success');
    } catch (err) {
      say(err?.message || t('les.failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) return say(t('reg.mismatch'));
    setMsg({ kind: '', text: '' });
    setBusy(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError && !missingSession(sessionError)) throw sessionError;
      if (!session || !recoveryUserId || session.user.id !== recoveryUserId || sessionError) {
        sessionStorage.removeItem('pw-recovery');
        setRecoveryUserId(null);
        return say(t('reset.expired'));
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (missingSession(error)) {
        sessionStorage.removeItem('pw-recovery');
        setRecoveryUserId(null);
        return say(t('reset.expired'));
      }
      if (error) return say(error.message);
      sessionStorage.removeItem('pw-recovery');
      setRecoveryUserId(null);
      say(t('reset.done'), 'success');
      setTimeout(() => onAuthed('guide'), 1200);
    } catch (err) {
      if (missingSession(err)) {
        sessionStorage.removeItem('pw-recovery');
        setRecoveryUserId(null);
        return say(t('reset.expired'));
      }
      say(err?.message || t('les.failed'));
    } finally {
      setBusy(false);
    }
  };

  const switchView = (v) => {
    setRecoveryUserId(null);
    sessionStorage.removeItem('pw-recovery');
    setMsg({ kind: '', text: '' });
    setView(v);
  };

  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10 sm:py-14"
    >
      <div className="grid w-full gap-8 sm:gap-10">
        <div className="flex items-center justify-center gap-2.5">
          <img src="/img/logo-ld.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-sm font-semibold tracking-tight">LD Platform</span>
        </div>
        <div className="grid min-w-0 gap-7">
          <header className="grid justify-items-center gap-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{formTitle}</h1>
            <p className="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">{formSubtitle}</p>
          </header>
          <section className="grid min-w-0 content-start gap-6">
            {(view === 'login' || view === 'register') && (
              <div role="tablist" aria-label={t('auth.switch.label')} className="flex w-fit justify-self-center rounded-full bg-[var(--fill)] p-0.5">
                {[
                  { id: 'login', label: t('auth.switch.signIn') },
                  { id: 'register', label: t('auth.switch.signUp') },
                ].map((option) => (
                  <motion.button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={view === option.id}
                    onClick={() => view !== option.id && switchView(option.id)}
                    className={`relative rounded-full px-3 py-1.5 text-xs transition-colors ${view === option.id ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
                  >
                    {view === option.id && <motion.span layoutId="auth-active-tab" className="absolute inset-0 rounded-full bg-[var(--bg-container)] shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <span className="relative z-10">{option.label}</span>
                  </motion.button>
                ))}
              </div>
            )}
            <AnimatePresence mode="wait" initial={false}>
      {view === 'login' && (
        <motion.section key="login" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="grid gap-5">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          <form onSubmit={submitLogin} className="grid gap-4">
            <Field label={t('field.email')}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ph.email')} autoComplete="email" required
                className="w-full border-0 border-b border-[var(--border-secondary)] bg-transparent px-0 py-3 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--text)] focus:ring-0 placeholder:text-[var(--text-tertiary)]" />
            </Field>
            <PwField id="login-password" label={t('field.password')} placeholder={t('ph.password')} value={password} onChange={setPassword} autoComplete="current-password" />
            <div className="flex items-center justify-between text-sm">
              <span />
              <button type="button" onClick={() => switchView('forgot')} className="text-[var(--text-secondary)] hover:text-[var(--text)]">
                {t('login.forgot')}
              </button>
            </div>
            <BtnPrimary disabled={busy} className="!rounded-lg !py-2.5">{t('login.submit')}</BtnPrimary>
          </form>
          <div className="text-center text-xs text-[var(--text-tertiary)]">{t('common.or')}</div>
          <GoogleBtn onClick={google} className="!rounded-lg !py-2.5">{t('login.google')}</GoogleBtn>
        </motion.section>
      )}

      {view === 'register' && (
        <motion.section key="register" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="grid gap-5">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          {msg.kind === 'success' && <p className="text-sm text-[var(--ok-text)]">{msg.text}</p>}
          <form onSubmit={submitRegister} className="grid gap-4">
            <Field label={t('field.fullName')}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ph.fullName')} autoComplete="name" required
                className="w-full border-0 border-b border-[var(--border-secondary)] bg-transparent px-0 py-3 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--text)] focus:ring-0 placeholder:text-[var(--text-tertiary)]" />
            </Field>
            <Field label={t('field.email')}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ph.email')} autoComplete="email" required
                className="w-full border-0 border-b border-[var(--border-secondary)] bg-transparent px-0 py-3 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--text)] focus:ring-0 placeholder:text-[var(--text-tertiary)]" />
            </Field>
            <PwField id="reg-password" label={t('field.password')} placeholder={t('ph.min8')} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
            <PwField id="reg-confirm" label={t('field.confirmPassword')} placeholder={t('ph.repeatPassword')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <p className="text-xs text-[var(--text-tertiary)]">{t('reg.terms')}</p>
            <BtnPrimary disabled={busy} className="!rounded-lg !py-2.5">{t('reg.submit')}</BtnPrimary>
          </form>
          <div className="text-center text-xs text-[var(--text-tertiary)]">{t('common.or')}</div>
          <GoogleBtn onClick={google} className="!rounded-lg !py-2.5">{t('login.google')}</GoogleBtn>
        </motion.section>
      )}

      {view === 'forgot' && !recoveryUserId && (
        <motion.section key="forgot" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} className="grid gap-5">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          {msg.kind === 'success' && <p className="text-sm text-[var(--ok-text)]">{msg.text}</p>}
          <form onSubmit={submitForgot} className="grid gap-4">
            <Field label={t('field.email')}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ph.email')} autoComplete="email" required className="w-full border-0 border-b border-[var(--border-secondary)] bg-transparent px-0 py-3 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--text)] focus:ring-0 placeholder:text-[var(--text-tertiary)]" />
            </Field>
            <BtnPrimary disabled={busy} className="!rounded-lg !py-2.5">{t('forgot.submit')}</BtnPrimary>
          </form>
          <BtnSecondary onClick={() => switchView('login')}>{t('reg.back')}</BtnSecondary>
        </motion.section>
      )}

      {view === 'forgot' && recoveryUserId && (
        <motion.section key="reset" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} className="grid gap-5">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          {msg.kind === 'success' && <p className="text-sm text-[var(--ok-text)]">{msg.text}</p>}
          <form onSubmit={submitReset} className="grid gap-4">
            <PwField id="reset-password" label={t('field.newPassword')} placeholder={t('ph.min8')} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
            <PwField id="reset-confirm" label={t('field.confirmNewPassword')} placeholder={t('ph.repeatNewPassword')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <BtnPrimary disabled={busy} className="!rounded-lg !py-2.5">{t('reset.submit')}</BtnPrimary>
          </form>
        </motion.section>
      )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </motion.main>
  );
}
