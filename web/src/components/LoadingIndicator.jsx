import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function LoadingIndicator({ className = '', label = 'Loading' }) {
  return (
    <span role="status" aria-label={label} className={`inline-grid place-items-center ${className}`}>
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-secondary)] border-t-[var(--primary)]" />
    </span>
  );
}

export function LoadingOverlay({ children, label = 'Loading', message = '' }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 99) return 99;
        const step = value < 52 ? 4 : value < 82 ? 1.2 : value < 95 ? 0.25 : 0.05;
        return Math.min(99, value + step);
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 box-border grid place-items-center pl-[var(--app-sidebar-width,0px)] transition-[padding] duration-300">
      {children || (
        <span role="status" aria-label={label} className="grid justify-items-center gap-3">
          <span aria-hidden="true" className="flex h-6 items-center gap-2">
            <i className="loading-dot h-2 w-2 rounded-full bg-[var(--text)]" />
            <i className="loading-dot h-2 w-2 rounded-full bg-[var(--text)]" />
            <i className="loading-dot h-2 w-2 rounded-full bg-[var(--text)]" />
          </span>
          <span aria-hidden="true" className="text-lg font-semibold tabular-nums text-[var(--text)]">
            {Math.floor(progress)}%
          </span>
          {message && <span className="max-w-xs text-center text-sm text-[var(--text-secondary)]">{message}</span>}
        </span>
      )}
    </div>,
    document.body,
  );
}
