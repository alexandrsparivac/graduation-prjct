import { motion } from 'framer-motion';
import React, { useCallback, useState } from 'react';

export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.46, ease: [0.22, 1, 0.36, 1] } },
};
export const list = { show: { transition: { staggerChildren: 0.045 } } };

export function PageHead({ title, sub }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {sub && <p className="text-sm text-[var(--text-secondary)]">{sub}</p>}
    </div>
  );
}

export function Panel({ children, className = '' }) {
  return (
    <section className={`grid content-start gap-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4 ${className}`}>
      {children}
    </section>
  );
}

export function PanelTitle({ children }) {
  return <h2 className="border-b border-[var(--border-secondary)] pb-3 text-sm font-semibold">{children}</h2>;
}

export function Msg({ text }) {
  if (!text) return null;
  return (
    <div role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      <span>{text}</span>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-container)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-tertiary)] focus:outline-none';

export function BtnPrimary({ children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-3 text-sm font-semibold text-[var(--on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({ children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      className={`flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-container)] px-3 py-2 text-sm transition-colors hover:border-[var(--text-tertiary)] ${className}`}
    >
      {children}
    </button>
  );
}

export function BackLink({ children, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      {children}
    </button>
  );
}

export function GoogleBtn({ children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-container)] px-3 py-3 text-sm transition-colors duration-300 hover:border-[var(--text-tertiary)] hover:bg-[var(--fill)] ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.1 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.8 6.8-17.4z" /><path fill="#FBBC05" d="M10.5 19.3c-.5 1.4-.7 2.9-.7 4.7s.3 3.3.7 4.7l-7.9 6.1C1 31.6 0 27.9 0 24s1-7.6 2.6-10.8l7.9 6.1z" /><path fill="#34A853" d="M24 48c6.3 0 11.9-2.1 15.8-5.6l-7.3-5.7c-2 1.4-4.7 2.2-8.5 2.2-6.3 0-11.6-3.6-13.5-9.7l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
      <span>{children}</span>
    </button>
  );
}

export function MotionView({ k, children }) {
  return (
    <motion.main
      key={k}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3, transition: { duration: 0.1, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-4 px-4 py-8"
    >
      {children}
    </motion.main>
  );
}

export function useToast() {  const [toast, setToast] = useState(null);
  const show = useCallback((text, kind = 'success') => {
    setToast({ text, kind, id: Date.now() });
  }, []);
  const node = toast ? (
    <motion.div
      key={toast.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-xl ${
        toast.kind === 'error'
          ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]'
          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]'
      }`}
    >
      {toast.text}
    </motion.div>
  ) : null;
  return [show, node];
}

// Catches a crashed view so one bad screen never blanks the whole app.
// Shows the actual error with a retry instead of a white page.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('View crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <p className="max-w-md text-sm text-[var(--danger-text)]">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]"
          >
            {this.props.retryLabel || 'Retry'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
