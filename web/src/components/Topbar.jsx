import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, getLang, topicName, domainName, loadCards, loadCatalogTranslations } from '../lib/legacy.js';
import { resolveActiveLanguage } from '../lib/lang.js';
import { resolveAvatarUrl } from '../../../shared/profile-avatar.js';
import { getUnreadNotificationsCount, NOTIFICATIONS_CHANGED } from '../lib/notifications.js';

const icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="11" rx="1.5" /><rect x="15" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="13" width="6" height="8" rx="1.5" /><rect x="3" y="18" width="8" height="3" rx="1.5" /></svg>
  ),
  plan: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>
  ),
  lessons: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
  ),
  pronunciation: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m21 3-6.2 6.2M21 3h-5M21 3v5"/></svg>
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
  notifications: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
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

const learningEventsKey = (userId) => `learningEvents:${userId}`;

function readLearningEvents(user) {
  if (Array.isArray(user?.user_metadata?.learning_events)) return user.user_metadata.learning_events;
  if (!user?.id) return [];
  try {
    const local = JSON.parse(localStorage.getItem(learningEventsKey(user.id)) || '[]');
    return Array.isArray(local) ? local : [];
  } catch {
    return [];
  }
}

function getExpiringEvent(events, now) {
  const soon = events.map((event) => {
    if (!event?.date || !event?.time) return null;
    const startsAt = new Date(`${event.date}T${event.time}:00`);
    if (Number.isNaN(startsAt.getTime())) return null;
    const duration = Math.max(1, Number.parseInt(event.duration, 10) || 30);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const remaining = endsAt.getTime() - now;
    return remaining > 0 && remaining <= 24 * 60 * 60_000 ? { ...event, endsAt, remaining } : null;
  }).filter(Boolean).sort((a, b) => a.endsAt - b.endsAt);
  return soon[0] || null;
}

function getUpcomingEventCount(events, now) {
  const until = now + 24 * 60 * 60_000;
  return Math.min(events.filter((event) => {
    if (!event?.date || !event?.time) return false;
    const startsAt = new Date(`${event.date}T${event.time}:00`).getTime();
    return Number.isFinite(startsAt) && startsAt >= now && startsAt < until;
  }).length, 3);
}

function relativeUntil(date, now) {
  const seconds = Math.max(1, Math.round((date.getTime() - now) / 1000));
  const [value, unit] = seconds < 60
    ? [seconds, 'second']
    : seconds < 3600
      ? [Math.round(seconds / 60), 'minute']
      : [Math.round(seconds / 3600), 'hour'];
  return new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' }).format(value, unit);
}

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

export default function Topbar({ user, profile, view, onNav, layout = 'top', activeLang, onStartLesson, onSearchVocabulary }) {
  const isLeft = layout === 'left';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reviewCount, setReviewCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(getUnreadNotificationsCount);
  const [learningEvents, setLearningEvents] = useState(() => readLearningEvents(user));
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPosition, setSearchPosition] = useState({ top: '12vh', left: '50%', transform: 'translateX(-50%)', width: 'min(576px, calc(100vw - 24px))' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchData, setSearchData] = useState({ loading: false, lessons: [], cards: [], error: false });
  const searchRef = useRef(null);
  const searchTriggerRef = useRef(null);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    const refresh = () => setNotificationCount(getUnreadNotificationsCount());
    refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    const closeMenu = (event) => {
      const menu = accountMenuRef.current;
      if (menu && (event.key === 'Escape' || (event.type === 'pointerdown' && !menu.contains(event.target)))) menu.open = false;
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, []);

  useEffect(() => {
    setLearningEvents(readLearningEvents(user));
    const syncEvents = (event) => {
      if (Array.isArray(event?.detail?.events)) setLearningEvents(event.detail.events);
      else setLearningEvents(readLearningEvents(user));
    };
    window.addEventListener('ld:learning-events-updated', syncEvents);
    window.addEventListener('storage', syncEvents);
    return () => {
      window.removeEventListener('ld:learning-events-updated', syncEvents);
      window.removeEventListener('storage', syncEvents);
    };
  }, [user?.id, user?.user_metadata?.learning_events]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const expiringEvent = getExpiringEvent(learningEvents, clockNow);
  const upcomingEventCount = getUpcomingEventCount(learningEvents, clockNow);

  const openSearch = (event) => {
    const trigger = event?.currentTarget || searchTriggerRef.current;
    const rect = trigger?.getBoundingClientRect();
    if (rect) {
      const panelWidth = Math.min(576, window.innerWidth - 24);
      const sideGap = 28;
      const rightSpace = window.innerWidth - rect.right - sideGap;
      const leftSpace = rect.left - sideGap;
      const left = rightSpace >= panelWidth || rightSpace >= leftSpace
        ? Math.min(window.innerWidth - panelWidth - 12, rect.right + sideGap)
        : Math.max(12, rect.left - panelWidth - sideGap);
      const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - 340));
      setSearchPosition({ top, left, width: panelWidth });
    }
    setSearchOpen(true);
  };

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else openSearch();
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    let alive = true;
    setSearchQuery('');
    setSearchData({ loading: true, lessons: [], cards: [], error: false });
    (async () => {
      const language = activeLang?.language_code;
      if (!language) {
        if (alive) setSearchData({ loading: false, lessons: [], cards: [], error: false });
        return;
      }
      await loadCatalogTranslations(supabase);
      const [domainsRes, cardsRes] = await Promise.all([
        supabase.from('user_domains').select('domain_slug, topics').eq('user_id', user.id).eq('language_code', language),
        loadCards(supabase, { userId: user.id, language }).catch(() => ({ cards: [] })),
      ]);
      if (!alive) return;
      const lessons = (domainsRes.data || []).flatMap((domain) => (domain.topics || []).map((topic) => ({
        id: `${domain.domain_slug}|${topic}`,
        domain_slug: domain.domain_slug,
        topic,
        level: activeLang.level,
      })));
      setSearchData({
        loading: false,
        lessons,
        cards: cardsRes.cards || [],
        error: !!domainsRes.error,
      });
      requestAnimationFrame(() => searchRef.current?.focus());
    })().catch(() => { if (alive) setSearchData({ loading: false, lessons: [], cards: [], error: true }); });
    return () => { alive = false; };
  }, [searchOpen, user?.id, activeLang?.language_code, activeLang?.level]);

  const query = searchQuery.trim().toLocaleLowerCase();
  const lessonResults = query ? searchData.lessons.filter((lesson) => `${topicName(lesson.domain_slug, lesson.topic)} ${domainName(lesson.domain_slug)} ${lesson.topic} ${lesson.domain_slug}`.toLocaleLowerCase().includes(query)).slice(0, 5) : [];
  const vocabResults = query ? searchData.cards.filter((card) => `${card.term || ''} ${card.translation || ''}`.toLocaleLowerCase().includes(query)).slice(0, 5) : [];
  const searchButton = (expanded) => (
    <button ref={searchTriggerRef} type="button" onClick={openSearch} title={`${t('search.open')} (⌘K / Ctrl+K)`} aria-label={t('search.open')} aria-keyshortcuts="Control+k Meta+k"
      className={`flex h-11 items-center gap-2 rounded-lg text-sm text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--fill)] hover:text-[var(--text)] ${expanded ? 'w-full justify-start px-3' : 'w-11 justify-center px-2'}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
      {expanded && <span className="min-w-0 flex-1 truncate text-left">{t('search.open')}</span>}
    </button>
  );

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
  const planEventIndicator = (className = '') => (
    <span aria-hidden="true" className={`top-plan-event-dots ${className}`}>
      {Array.from({ length: upcomingEventCount }, (_, index) => <i key={index} style={{ animationDelay: `${index * 0.18}s` }} />)}
    </span>
  );
  const link = (id, label, href, internal, group = 'desktop') => {
    const hoverable = id !== 'guide' && id !== 'settings';
    const itemLabel = id === 'review' && reviewCount > 0 ? `${label} (${reviewCount})`
      : id === 'notifications' && notificationCount > 0 ? `${label} (${notificationCount})`
      : id === 'plan' && expiringEvent ? `${label} · ${expiringEvent.title} · ${relativeUntil(expiringEvent.endsAt, clockNow)}` : label;
    const icon = icons[id];
    if ((id === 'guide' || id === 'settings' || id === 'notifications') && internal && group !== 'sidebar') {
      return (
        <button
          key={id}
          onClick={() => onNav(id)}
          title={itemLabel}
          aria-label={itemLabel}
          aria-current={view === id ? 'page' : undefined}
          className={`group relative grid h-9 w-9 flex-none place-items-center rounded-full transition-colors ${hoverable && view !== id ? 'hover:bg-[var(--fill)]' : ''} ${
            view === id ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          <span className={(id === 'settings' || id === 'notifications') && view !== id ? 'transition-transform duration-300 ease-out group-hover:rotate-12 group-hover:scale-110' : ''}>{icon}</span>
          {id === 'notifications' && notificationCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger-text)] px-1 text-[9px] font-bold leading-none text-white">{notificationCount}</span>}
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
        className={`${group === 'main' ? 'top-nav-tab ' : ''}relative isolate flex items-center gap-2 rounded-full text-sm whitespace-nowrap transition-colors duration-300 ${hoverable ? 'hover:bg-[var(--fill)]' : ''} ${group === 'sidebar' ? `h-11 w-full ${sidebarOpen ? 'justify-start px-3' : 'justify-center px-2'}` : 'h-9 flex-none gap-1.5 px-2 sm:h-10 sm:px-3 md:px-4'} ${
          view === id
            ? `bg-[var(--primary)] font-semibold text-[var(--on-primary)] ${hoverable ? 'hover:bg-[var(--primary-hover)]' : ''}`
            : `text-[var(--text-secondary)] ${hoverable ? 'hover:text-[var(--text)]' : ''}`
        }`}
      >
        <span className={`relative z-10 flex items-center ${group === 'sidebar' ? `w-full gap-2 ${sidebarOpen ? 'justify-start' : 'justify-center'}` : 'gap-1.5'}`}>
          {icon}
          <span className={group === 'sidebar' ? `${sidebarOpen ? 'inline-flex' : 'hidden'} min-w-0 items-center gap-1.5` : 'top-nav-label hidden md:inline'}>
            <span className="min-w-0 truncate">{label}</span>
            {id === 'plan' && upcomingEventCount > 0 && group === 'sidebar' && sidebarOpen && planEventIndicator('ml-1')}
          </span>
          {id === 'review' && reviewCount > 0 && (group !== 'sidebar' || sidebarOpen) && <span aria-hidden="true" className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${view === id ? 'bg-white/15 text-[var(--on-primary)]' : 'bg-[var(--fill-strong)] text-[var(--text-secondary)]'} ${group === 'sidebar' && sidebarOpen ? 'ml-auto' : 'ml-1'}`}>{reviewCount}</span>}
          {id === 'notifications' && notificationCount > 0 && (group !== 'sidebar' || sidebarOpen) && <span aria-hidden="true" className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${view === id ? 'bg-white/15 text-[var(--on-primary)]' : 'bg-[var(--fill-strong)] text-[var(--text-secondary)]'} ${group === 'sidebar' && sidebarOpen ? 'ml-auto' : 'ml-1'}`}>{notificationCount}</span>}
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
      className={`sticky top-0 z-30 flex-none bg-[var(--bg-layout)]/95 backdrop-blur-xl ${isLeft ? `relative h-screen ${sidebarOpen ? 'w-52' : 'w-16'} border-r border-[var(--border-secondary)] transition-[width] duration-300` : 'top-header w-full border-b border-[var(--border-secondary)]'}`}
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
          <nav aria-label={t('nav.primary')} className="mt-4 grid w-full gap-1">
            {searchButton(sidebarOpen)}
            {link('dashboard', t('nav.dashboard'), null, true, 'sidebar')}
            {link('plan', t('plan.title'), null, true, 'sidebar')}
            {link('lessons', t('les.page.title'), null, true, 'sidebar')}
            {link('pronunciation', t('nav.pronunciation'), null, true, 'sidebar')}
            {link('review', t('dash.review.title'), null, true, 'sidebar')}
            {link('vocab', t('voc.title'), null, true, 'sidebar')}
            {link('notifications', t('notifications.title'), null, true, 'sidebar')}
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
      <div className="top-header-row">
        <motion.div variants={item} className="top-header-brand flex flex-none items-center gap-2">
          <img src="/img/logo-ld.svg" alt="LD Platform" className="h-9 w-9 flex-none rounded-xl" />
          <span className="top-brand-label text-base font-semibold tracking-tight text-[var(--text)]">Platform</span>
        </motion.div>
        <motion.nav variants={item} aria-label={t('nav.primary')} className="top-header-nav">
          {link('dashboard', t('nav.dashboard'), null, true, 'main')}
          {link('plan', t('plan.title'), null, true, 'main')}
          {link('lessons', t('les.page.title'), null, true, 'main')}
          {link('pronunciation', t('nav.pronunciation'), null, true, 'main')}
          {link('review', t('dash.review.title'), null, true, 'main')}
          {link('vocab', t('voc.title'), null, true, 'main')}
        </motion.nav>
        <motion.div variants={item} className="top-header-actions">
          {searchButton(false)}
          <div className="top-desktop-actions">
          {link('guide', t('nav.guide'), null, true)}
          {link('notifications', t('notifications.title'), null, true)}
          {link('settings', t('nav.settings'), null, true)}
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px flex-none bg-[var(--border-secondary)] sm:block" />
          <span className="hidden sm:block"><Avatar user={user} profile={profile} /></span>
          <span className="top-account-name truncate text-sm font-medium text-[var(--text-secondary)]">
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
          </div>
          <details ref={accountMenuRef} className="top-account-menu">
            <summary aria-label={t('nav.menu')} title={t('nav.menu')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </summary>
            <div className="top-account-popover">
              <div className="top-account-profile"><Avatar user={user} profile={profile}/><span>{profile?.full_name || user?.email}</span></div>
              {['guide', 'notifications', 'settings'].map((id) => <button key={id} onClick={() => { accountMenuRef.current.open = false; onNav(id); }} aria-current={view === id ? 'page' : undefined}>{icons[id]}<span>{id === 'notifications' ? t('notifications.title') : t(`nav.${id}`)}</span></button>)}
              <button onClick={() => { accountMenuRef.current.open = false; logout(); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/></svg><span>{t('nav.logout')}</span></button>
            </div>
          </details>
        </motion.div>
      </div>
      </>
      )}
      {searchOpen && createPortal((
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <section style={searchPosition} role="dialog" aria-modal="true" aria-label={t('search.title')} className="fixed max-h-[calc(100dvh-1.5rem)] max-w-xl overflow-hidden rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-container)] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--border-secondary)] px-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
              <input ref={searchRef} autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} className="h-14 min-w-0 flex-1 bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-tertiary)]" />
              <button type="button" onClick={() => setSearchOpen(false)} aria-label={t('common.close')} className="rounded-md px-2 py-1 text-xs text-[var(--text-tertiary)] hover:bg-[var(--fill)]">Esc</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {searchData.loading ? <p className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">{t('search.loading')}</p> : searchData.error ? (
                <p role="alert" className="px-3 py-6 text-center text-sm text-[var(--danger-text)]">{t('search.failed')}</p>
              ) : !query ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">{t('search.hint')}</p>
              ) : (!lessonResults.length && !vocabResults.length) ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">{t('search.empty')}</p>
              ) : <div className="grid gap-2">
                {lessonResults.length > 0 && <div><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{t('search.lessons')}</p>{lessonResults.map((lesson) => <button key={lesson.id} type="button" onClick={() => { setSearchOpen(false); onStartLesson?.({ lang: activeLang.language_code, domain: lesson.domain_slug, topic: lesson.topic, level: lesson.level }); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--fill)]"><span className="grid min-w-0"><span className="truncate text-sm font-medium text-[var(--text)]">{topicName(lesson.domain_slug, lesson.topic)}</span><span className="truncate text-xs text-[var(--text-tertiary)]">{domainName(lesson.domain_slug)} · {lesson.level}</span></span><span aria-hidden="true" className="text-[var(--text-tertiary)]">↗</span></button>)}</div>}
                {vocabResults.length > 0 && <div><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{t('search.vocabulary')}</p>{vocabResults.map((card) => <button key={`${card.kind}:${card.term}`} type="button" onClick={() => { setSearchOpen(false); onSearchVocabulary?.(card.term || searchQuery); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--fill)]"><span className="grid min-w-0"><span className="truncate text-sm font-medium text-[var(--text)]">{card.term}</span><span className="truncate text-xs text-[var(--text-tertiary)]">{card.translation}</span></span><span aria-hidden="true" className="text-[var(--text-tertiary)]">↗</span></button>)}</div>}
              </div>}
            </div>
            <div className="flex justify-between border-t border-[var(--border-secondary)] px-4 py-2 text-[11px] text-[var(--text-tertiary)]"><span>{t('search.scope')}</span><span>{t('search.shortcut')}</span></div>
          </section>
        </div>
      ), document.body)}
    </motion.header>
  );
}
