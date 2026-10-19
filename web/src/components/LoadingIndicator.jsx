import { createPortal } from 'react-dom';

export default function LoadingIndicator({ className = '', label = 'Loading' }) {
  return (
    <span role="status" aria-label={label} className={`inline-grid place-items-center ${className}`}>
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-secondary)] border-t-[var(--primary)]" />
    </span>
  );
}

export function LoadingOverlay({ children }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 box-border grid place-items-center pl-[var(--app-sidebar-width,0px)] transition-[padding] duration-300">
      {children || (
        <span role="status" aria-label="Loading" className="grid justify-items-center gap-3">
          <span className="relative grid h-14 w-14 place-items-center" aria-hidden="true">
            <span className="absolute inset-0 rounded-full border border-[var(--border-secondary)]" />
            <span className="loading-orbit absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--primary)]" />
            <img src="/img/logo-ld.svg" alt="" className="h-8 w-8 rounded-lg" />
          </span>
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <i className="loading-dot h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
            <i className="loading-dot h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
            <i className="loading-dot h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
          </span>
        </span>
      )}
    </div>,
    document.body,
  );
}
