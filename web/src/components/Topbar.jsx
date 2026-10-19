import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t } from '../lib/legacy.js';
import { resolveActiveLanguage } from '../lib/lang.js';
import { resolveAvatarUrl } from '../../../shared/profile-avatar.js';

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
  show: { opacity: 1, y: 0, transition: { duration: 0.46, ease: [0.22, 1, 0.36, 1] } },
};

function Avatar({ user, profile }) {
  const [failed, setFailed] = useState(false);
  const src = resolveAvatarUrl(profile, user);
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

export default function Topbar({ user, profile, view, onNav, layout = 'top' }) {
  const isLeft = layout === 'left';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    if (isLeft) root.style.setProperty('--app-sidebar-width', sidebarOpen ? '13rem' : '4rem');
    else root.style.removeProperty('--app-sidebar-width');
    return () => root.style.removeProperty('--app-sidebar-width');
  }, [isLeft, sidebarOpen]);

  useEffect(() => {
    let alive = true;
    const refreshReviewCount = async () => {
      if (!user?.id) {
        setReviewCount(0);
        return;
      }
      try {
        const { data: langs } = await supabase.from('user_languages')
          .select('language_code').eq('user_id', user.id).order('created_at');
        const language = resolveActiveLanguage(langs || [])?.language_code;
        if (!language) {
          if (alive) setReviewCount(0);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const { count, error } = await supabase.from('user_vocabulary')
          .select('term', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('language_code', language)
          .lte('due_on', today);
        if (alive) setReviewCount(error ? 0 : (count || 0));
      } catch {
        if (alive) setReviewCount(0);
      }
    };
    refreshReviewCount();
    window.addEventListener('ld:review-updated', refreshReviewCount);
    return () => {
      alive = false;
      window.removeEventListener('ld:review-updated', refreshReviewCount);
    };
  }, [user?.id, view]);

  const logout = async () => {
    await supabase.auth.signOut();
  };
  const link = (id, label, href, internal, group = 'desktop') => {
    const hoverable = id !== 'guide' && id !== 'settings';
    const itemLabel = id === 'review' ? `${label} (${reviewCount})` : label;
    const icon = id === 'review' ? (
      <span className="relative inline-flex">
        {icons.review}
        {group === 'sidebar' && !sidebarOpen && <span aria-hidden="true" className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[var(--bg-layout)]">{reviewCount}</span>}
      </span>
    ) : icons[id];
    if ((id === 'guide' || id === 'settings') && internal && group !== 'sidebar') {
      return (
        <button
          key={id}
          onClick={() => onNav(id)}
          title={itemLabel}
          aria-label={itemLabel}
          aria-current={view === id ? 'page' : undefined}
          className={`grid h-9 w-9 flex-none place-items-center rounded-lg transition-colors ${hoverable ? 'hover:bg-[var(--fill)]' : ''} ${
            view === id ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          {icon}
        </button>
      );
    }
    return internal ? (
      <motion.button
        key={id}
        onClick={() => onNav(id)}
        aria-current={view === id ? 'page' : undefined}
        title={itemLabel}
        aria-label={itemLabel}
        whileHover={group === 'sidebar' && hoverable ? { scale: 1.02 } : undefined}
        whileTap={group === 'sidebar' ? { scale: 0.97 } : undefined}
        transition={group === 'sidebar' ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] } : undefined}
        className={`relative isolate flex items-center gap-2 ${group === 'sidebar' ? 'rounded-lg' : 'rounded-full'} text-sm whitespace-nowrap transition-colors duration-300 ${hoverable ? 'hover:bg-[var(--fill)]' : ''} ${group === 'sidebar' ? `h-11 w-full ${sidebarOpen ? 'justify-start px-3' : 'justify-center px-2'}` : 'h-9 flex-none gap-1.5 px-2 sm:h-10 sm:px-3 md:px-4'} ${
          view === id
            ? `bg-[var(--primary)] font-semibold text-[var(--on-primary)] ${hoverable ? 'hover:bg-[var(--primary-hover)]' : ''}`
            : `text-[var(--text-secondary)] ${hoverable ? 'hover:text-[var(--text)]' : ''}`
        }`}
      >
        <span className={`relative z-10 flex items-center ${group === 'sidebar' ? `w-full gap-2 ${sidebarOpen ? 'justify-start' : 'justify-center'}` : 'gap-1.5'}`}>
          {icon}<span className={group === 'sidebar' ? `${sidebarOpen ? 'inline' : 'hidden'} min-w-0 truncate` : 'hidden md:inline'}>{label}</span>
          {id === 'review' && (group !== 'sidebar' || sidebarOpen) && <span aria-hidden="true" className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${view === id ? 'bg-white/15 text-[var(--on-primary)]' : 'bg-[var(--fill-strong)] text-[var(--text-secondary)]'} ${group === 'sidebar' && sidebarOpen ? 'ml-auto' : 'ml-1'}`}>{reviewCount}</span>}
        </span>
      </motion.button>
    ) : (
      <a
        key={id}
        href={href}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-[var(--text-secondary)] transition-all hover:bg-[var(--fill)] hover:text-[var(--text)]"
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  };

  return (
    <motion.header
      variants={bar}
      initial="hidden"
      animate="show"
      className={`sticky top-0 z-30 flex-none bg-[var(--bg-layout)]/95 backdrop-blur-xl ${isLeft ? `relative h-screen ${sidebarOpen ? 'w-52' : 'w-16'} border-r border-[var(--border-secondary)] transition-[width] duration-300` : 'w-full border-b border-[var(--border-secondary)]'}`}
    >
      {isLeft ? (
        <div className={`flex h-full flex-col pt-4 pb-2 ${sidebarOpen ? 'px-4' : 'items-center px-2'}`}>
          <motion.div variants={item} className={`flex w-full items-center gap-3 ${sidebarOpen ? 'justify-start' : 'justify-center'}`}>
            <img src="/img/logo-ld.svg" alt="LD Platform" className="h-9 w-9 flex-none rounded-xl" />
            {sidebarOpen && <span className="text-base font-semibold tracking-tight text-[var(--text)]">Platform</span>}
          </motion.div>
          <button
            type="button"
            onClick={() => setSidebarOpen(open => !open)}
            title={t('nav.primary')}
            aria-label={t('nav.primary')}
            aria-expanded={sidebarOpen}
            className="absolute -right-3 top-5 z-10 grid h-6 w-6 place-items-center rounded-full border border-[var(--border-secondary)] bg-[var(--bg-container)] text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--fill-strong)] hover:text-[var(--text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {sidebarOpen ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
            </svg>
          </button>
          <nav aria-label={t('nav.primary')} className="mt-8 grid w-full gap-1">
            {link('dashboard', t('nav.dashboard'), null, true, 'sidebar')}
            {link('lessons', t('les.page.title'), null, true, 'sidebar')}
            {link('review', t('dash.review.title'), null, true, 'sidebar')}
            {link('vocab', t('voc.title'), null, true, 'sidebar')}
            <span aria-hidden="true" className="my-2 h-px bg-[var(--border)]" />
            {link('guide', t('nav.guide'), null, true, 'sidebar')}
            {link('settings', t('nav.settings'), null, true, 'sidebar')}
          </nav>
          <div className={`mt-auto pt-4 ${sidebarOpen ? 'grid grid-cols-[auto_1fr_auto] items-center gap-3' : 'flex flex-col items-center gap-2'}`}>
            <Avatar user={user} profile={profile} />
            {sidebarOpen && <span className="min-w-0 truncate text-sm font-medium text-[var(--text-secondary)]">{profile?.full_name || user?.email}</span>}
            <button onClick={logout} title={t('nav.logout')} aria-label={t('nav.logout')}
              className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
            </button>
          </div>
        </div>
      ) : (
      <>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3">
        <motion.div variants={item} className="flex flex-none items-center gap-2 sm:gap-3">
          <img src="/img/logo-ld.svg" alt="LD Platform" className="h-9 w-9 flex-none rounded-xl" />
          <span className="text-sm font-semibold tracking-tight text-[var(--text)] sm:text-base">Platform</span>
        </motion.div>
        <motion.nav variants={item} aria-label={t('nav.primary')} className="flex min-w-0 flex-1 items-center justify-center gap-0 overflow-x-auto sm:gap-0.5">
          {link('dashboard', t('nav.dashboard'), null, true, 'main')}
          {link('lessons', t('les.page.title'), null, true, 'main')}
          {link('review', t('dash.review.title'), null, true, 'main')}
          {link('vocab', t('voc.title'), null, true, 'main')}
        </motion.nav>
        <motion.div variants={item} className="flex flex-none items-center gap-0.5 sm:gap-1">
          {link('guide', t('nav.guide'), null, true)}
          {link('settings', t('nav.settings'), null, true)}
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px flex-none bg-[var(--border-secondary)] sm:block" />
          <span className="hidden sm:block"><Avatar user={user} profile={profile} /></span>
          <span className="hidden max-w-40 truncate text-sm font-medium text-[var(--text-secondary)] lg:inline">
            {profile?.full_name || user?.email}
          </span>
          <button
            onClick={logout}
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)] sm:h-9 sm:w-9"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </motion.div>
      </div>
      </>
      )}
    </motion.header>
  );
}
