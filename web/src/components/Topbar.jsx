import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t } from '../lib/legacy.js';

const icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
  ),
  lessons: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
  ),
  guide: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
  ),
  review: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
  ),
  vocab: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1h.09a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
  ),
};

const bar = {
  show: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

function Avatar({ user, profile }) {
  const [failed, setFailed] = useState(false);
  const src = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const initial = ((user?.user_metadata?.full_name || user?.email || '?').trim()[0] || '?').toUpperCase();
  if (!src || failed) {
    return (
      <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--fill-strong)] text-xs font-bold text-[var(--text-secondary)]">
        {initial}
      </span>
    );
  }
  return (
    <img
      src={src} alt="" referrerPolicy="no-referrer" aria-hidden="true"
      onError={() => setFailed(true)}
      className="h-8 w-8 flex-none rounded-full object-cover"
    />
  );
}

export default function Topbar({ user, profile, activeLang, view, onNav, onAddLanguage }) {
  const logout = async () => {
    await supabase.auth.signOut();
  };
  const link = (id, label, href, internal) => {
    if ((id === 'guide' || id === 'settings') && internal) {
      return (
        <button
          key={id}
          onClick={() => onNav(id)}
          title={label}
          aria-label={label}
          aria-current={view === id ? 'page' : undefined}
          className={`grid h-8 w-8 flex-none place-items-center rounded-full transition-all hover:scale-110 ${
            view === id ? 'text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          {icons[id]}
        </button>
      );
    }
    return internal ? (
      <button
        key={id}
        onClick={() => onNav(id)}
        aria-current={view === id ? 'page' : undefined}
        title={label}
        aria-label={label}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-all ${
          view === id
            ? 'bg-[var(--primary)] text-[var(--on-primary)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]'
        }`}
      >
        {icons[id]}
        <span>{label}</span>
      </button>
    ) : (
      <a
        key={id}
        href={href}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-[var(--text-secondary)] transition-all hover:bg-[var(--fill)] hover:text-[var(--text)]"
      >
        {icons[id]}
        <span>{label}</span>
      </a>
    );
  };

  return (
    <motion.header
      variants={bar}
      initial="hidden"
      animate="show"
      className="sticky top-0 z-30 bg-transparent"
    >
      <div className="relative mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <motion.div variants={item} className="flex min-w-0 items-center gap-2">
          <span className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-container)] py-1 pr-4 pl-3 transition-colors hover:border-[var(--text-tertiary)]">
            <img src="/img/logo-ld.svg" alt="LD" className="h-8 w-8 rounded-[10px]" />
            <span className="text-[13px] font-semibold whitespace-nowrap text-[var(--text-secondary)]">
              {activeLang ? `${activeLang.language_code.toUpperCase()} · ${activeLang.level}` : '…'}
            </span>
          </span>
          <button
            onClick={onAddLanguage}
            title={t('dash.addLanguage')}
            aria-label={t('dash.addLanguage')}
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--text-secondary)] transition-all hover:scale-110 hover:text-[var(--text)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
          </button>
        </motion.div>
        <motion.div variants={item} className="hidden min-w-0 flex-1 items-center justify-center sm:flex">
          <nav aria-label={t('nav.primary')} className="flex items-center gap-0.5 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-container)]/70 p-1 backdrop-blur-xl">
          {link('dashboard', t('nav.dashboard'), null, true)}
          {link('lessons', t('les.page.title'), null, true)}
          {link('review', t('dash.review.title'), null, true)}
          {link('vocab', t('voc.title'), null, true)}
          </nav>
        </motion.div>
        <motion.div variants={item} className="flex flex-none items-center gap-1">
          {link('guide', t('nav.guide'), null, true)}
          {link('settings', t('nav.settings'), null, true)}
          <div className="flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-container)]/70 py-1 pr-1 pl-3 backdrop-blur-xl">
          <Avatar user={user} profile={profile} />
          <span className="hidden max-w-32 truncate text-sm text-[var(--text-secondary)] md:inline">
            {profile?.full_name || user?.email}
          </span>
          <button
            onClick={logout}
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
          </div>
        </motion.div>
      </div>
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
        {link('dashboard', 'Panou', null, true)}
        {link('lessons', 'Lecții', null, true)}
        {link('review', t('dash.review.title'), null, true)}
        {link('vocab', t('voc.title'), null, true)}
      </div>
    </motion.header>
  );
}
