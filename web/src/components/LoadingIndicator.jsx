import { createPortal } from 'react-dom';

export default function LoadingIndicator({ className = '', label = 'Loading' }) {
  return (
    <span role="status" aria-label={label} className={`inline-grid place-items-center ${className}`}>
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-secondary)] border-t-[var(--primary)]" />
    </span>
  );
}

export function LoadingOverlay({ children, label = 'Loading', message = '' }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 box-border grid place-items-center pl-[var(--app-sidebar-width,0px)] transition-[padding] duration-300">
      {children || (
        <span role="status" aria-label={label} className="grid justify-items-center gap-3">
          <span aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin rounded-full border-2 border-[var(--border-secondary)] border-t-[var(--text)]" />
          {message && <span className="max-w-xs text-center text-sm text-[var(--text-secondary)]">{message}</span>}
        </span>
      )}
    </div>,
    document.body,
  );
}
