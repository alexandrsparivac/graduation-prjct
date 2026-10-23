import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '../lib/legacy.js';
import { useI18n } from '../lib/i18n.jsx';
import { clearNotifications, deleteNotification, getNotifications, markNotificationsRead, NOTIFICATIONS_CHANGED } from '../lib/notifications.js';

export default function Notifications() {
  const { lang } = useI18n();
  const [items, setItems] = useState(getNotifications);

  useEffect(() => {
    const refresh = () => setItems(getNotifications());
    markNotificationsRead();
    refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid w-full max-w-3xl content-start gap-5">
      <header className="flex items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('notifications.title')}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t('notifications.subtitle')}</p>
        </div>
        {items.length > 0 && <button type="button" onClick={clearNotifications} className="shrink-0 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]">{t('notifications.clear')}</button>}
      </header>

      {items.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] px-5 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--fill)] text-[var(--text-secondary)]" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
          </span>
          <p className="text-sm text-[var(--text-secondary)]">{t('notifications.empty')}</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-container)] p-4">
              <span className={['mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full', item.kind === 'error' ? 'bg-[var(--danger-bg)] text-[var(--danger-text)]' : 'bg-[var(--fill)] text-[var(--text-secondary)]'].join(' ')} aria-hidden="true">
                {item.kind === 'error' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6"/></svg>}
              </span>
              <div className="min-w-0 flex-1">
                <p className={['text-sm leading-6', item.kind === 'error' ? 'text-[var(--danger-text)]' : 'text-[var(--text)]'].join(' ')}>{item.text}</p>
                <time dateTime={item.createdAt} className="mt-1 block text-xs text-[var(--text-tertiary)]">{new Date(item.createdAt).toLocaleString(lang)}</time>
              </div>
              <button type="button" onClick={() => deleteNotification(item.id)} aria-label={t('notifications.remove')} title={t('notifications.remove')} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m18 6-12 12M6 6l12 12"/></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
