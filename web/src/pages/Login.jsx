import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { getProfile, missingSession } from '../lib/auth.js';
import { getLang, t } from '../lib/legacy.js';
import { BtnPrimary, BtnSecondary, Field, GoogleBtn, Msg, inputCls } from '../components/ui.jsx';

const EyeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
);
const MailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
);
const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const UserIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);

function PwField({ id, label, placeholder, value, onChange, autoComplete, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-layout)] px-3 transition-colors duration-300 focus-within:border-[var(--text-tertiary)] focus-within:ring-2 focus-within:ring-[var(--fill-strong)]">
        <span className="flex-none text-[var(--text-tertiary)]">{LockIcon}</span>
        <input
          id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} required
          className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-tertiary)]"
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
      className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-4 sm:py-6"
    >
      <div className="w-full max-w-md">
            <div className="mb-5 flex flex-col items-center gap-1.5 text-center">
              <img src="/img/logo-ld.svg" alt="" className="h-9 w-9 rounded-xl" />
              <span className="text-sm font-semibold tracking-[0.04em]">LD Platform</span>
            </div>
            {(view === 'login' || view === 'register') && (
              <div role="tablist" aria-label={t('auth.switch.label')} className="mb-5 grid grid-cols-2 rounded-full border border-[var(--border)] bg-[var(--fill)] p-0.5">
                <button
                  type="button" role="tab" aria-selected={view === 'login'} onClick={() => view !== 'login' && switchView('login')}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${view === 'login' ? 'bg-[var(--bg-elevated)] font-semibold text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
                >{t('auth.switch.signIn')}</button>
                <button
                  type="button" role="tab" aria-selected={view === 'register'} onClick={() => view !== 'register' && switchView('register')}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${view === 'register' ? 'bg-[var(--bg-elevated)] font-semibold text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
                >{t('auth.switch.signUp')}</button>
              </div>
            )}
            <div className="mb-4 grid gap-1">
              <h1 className="text-xl font-semibold tracking-tight">{formTitle}</h1>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{formSubtitle}</p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
      {view === 'login' && (
        <motion.section key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} className="grid gap-4">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          <form onSubmit={submitLogin} className="grid gap-3">
            <Field label={t('field.email')}>
              <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-layout)] px-3 transition-colors duration-300 focus-within:border-[var(--text-tertiary)] focus-within:ring-2 focus-within:ring-[var(--fill-strong)]">
                <span className="flex-none text-[var(--text-tertiary)]">{MailIcon}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ph.email')} autoComplete="email" required
                  className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-tertiary)]" />
              </span>
            </Field>
            <PwField id="login-password" label={t('field.password')} placeholder={t('ph.password')} value={password} onChange={setPassword} autoComplete="current-password" />
            <div className="flex items-center justify-between text-sm">
              <span />
              <button type="button" onClick={() => switchView('forgot')} className="text-[var(--text-secondary)] hover:text-[var(--text)]">
                {t('login.forgot')}
              </button>
            </div>
            <BtnPrimary disabled={busy} className="!py-2">{t('login.submit')}</BtnPrimary>
          </form>
          <div className="text-center text-xs text-[var(--text-tertiary)]">{t('common.or')}</div>
          <GoogleBtn onClick={google} className="!py-2">{t('login.google')}</GoogleBtn>
        </motion.section>
      )}

      {view === 'register' && (
        <motion.section key="register" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} className="grid gap-4">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          {msg.kind === 'success' && <p className="text-sm text-[var(--ok-text)]">{msg.text}</p>}
          <form onSubmit={submitRegister} className="grid gap-3 sm:grid-cols-2">
            <Field label={t('field.fullName')}>
              <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-layout)] px-3 transition-colors duration-300 focus-within:border-[var(--text-tertiary)] focus-within:ring-2 focus-within:ring-[var(--fill-strong)]">
                <span className="flex-none text-[var(--text-tertiary)]">{UserIcon}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ph.fullName')} autoComplete="name" required
                  className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-tertiary)]" />
              </span>
            </Field>
            <Field label={t('field.email')}>
              <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-layout)] px-3 transition-colors duration-300 focus-within:border-[var(--text-tertiary)] focus-within:ring-2 focus-within:ring-[var(--fill-strong)]">
                <span className="flex-none text-[var(--text-tertiary)]">{MailIcon}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ph.email')} autoComplete="email" required
                  className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-tertiary)]" />
              </span>
            </Field>
            <PwField id="reg-password" label={t('field.password')} placeholder={t('ph.min8')} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
            <PwField id="reg-confirm" label={t('field.confirmPassword')} placeholder={t('ph.repeatPassword')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <p className="text-xs text-[var(--text-tertiary)] sm:col-span-2">{t('reg.terms')}</p>
            <div className="sm:col-span-2"><BtnPrimary disabled={busy} className="!py-2">{t('reg.submit')}</BtnPrimary></div>
          </form>
          <div className="text-center text-xs text-[var(--text-tertiary)]">{t('common.or')}</div>
          <GoogleBtn onClick={google} className="!py-2">{t('login.google')}</GoogleBtn>
        </motion.section>
      )}

      {view === 'forgot' && !recoveryUserId && (
        <motion.section key="forgot" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} className="grid gap-5">
          <Msg text={msg.kind === 'error' ? msg.text : ''} />
          {msg.kind === 'success' && <p className="text-sm text-[var(--ok-text)]">{msg.text}</p>}
          <form onSubmit={submitForgot} className="grid gap-4">
            <Field label={t('field.email')}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ph.email')} autoComplete="email" required className={`${inputCls} rounded-xl bg-[var(--bg-layout)] px-3 py-2 transition-colors duration-300 focus:border-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--fill-strong)]`} />
            </Field>
            <BtnPrimary disabled={busy} className="!py-2">{t('forgot.submit')}</BtnPrimary>
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
            <BtnPrimary disabled={busy} className="!py-2">{t('reset.submit')}</BtnPrimary>
          </form>
        </motion.section>
      )}
            </AnimatePresence>
      </div>
    </motion.main>
  );
}
