import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { t, getLang, topicName, domainName } from '../lib/legacy.js';
import { resolveActiveLanguage } from '../lib/lang.js';
import { LoadingOverlay } from '../components/LoadingIndicator.jsx';

const eventKey = (id) => `learningEvents:${id}`;
const hiddenEventKey = (id) => `hiddenLearningEvent:${id}`;
const todayDate = () => new Date();
const todayKey = () => dateKey(todayDate());
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const mondayOf = (date) => {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};
const eventId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const notifyLearningEvents = (events) => window.dispatchEvent(new CustomEvent('ld:learning-events-updated', { detail: { events } }));

function savedEvents(user) {
  if (Array.isArray(user?.user_metadata?.learning_events)) return user.user_metadata.learning_events;
  try {
    const local = JSON.parse(localStorage.getItem(eventKey(user.id)) || 'null');
    if (Array.isArray(local)) return local;
  } catch { /* use the account copy */ }
  return [];
}

function savedHiddenEvents(user) {
  try {
    const ids = JSON.parse(localStorage.getItem(hiddenEventKey(user.id)) || '[]');
    return new Set(Array.isArray(ids) ? ids : []);
  } catch { return new Set(); }
}

const dateFormat = (options) => new Intl.DateTimeFormat(getLang(), options);

export default function Plan({ user, onStartLesson }) {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState(() => savedEvents(user));
  const [hiddenEventIds, setHiddenEventIds] = useState(() => savedHiddenEvents(user));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [activeTab, setActiveTab] = useState('calendar');
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('18:00');
  const [eventDuration, setEventDuration] = useState('30');
  const [eventTopic, setEventTopic] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      setData(null);
      const { data: langs } = await supabase.from('user_languages').select('*').eq('user_id', user.id).order('created_at');
      const active = resolveActiveLanguage(langs || []);
      if (!active) {
        if (alive) setData({ empty: true });
        return;
      }
      const language = active.language_code;
      const { data: domains } = await supabase.from('user_domains')
        .select('domain_slug, topics').eq('user_id', user.id).eq('language_code', language).order('domain_slug');
      if (!alive) return;
      setData({
        active,
        domains: domains || [],
      });
    })().catch(() => { if (alive) setData({ error: true }); });
    return () => { alive = false; };
  }, [user.id]);

  const persistEvents = async (next) => {
    const previous = events;
    setEvents(next);
    notifyLearningEvents(next);
    setEventError('');
    try { localStorage.setItem(eventKey(user.id), JSON.stringify(next)); } catch { /* account copy still syncs */ }
    setSavingEvent(true);
    const { error } = await supabase.auth.updateUser({ data: { learning_events: next } });
    setSavingEvent(false);
    if (error) {
      setEvents(previous);
      notifyLearningEvents(previous);
      setEventError(t('plan.eventsSyncError'));
      try { localStorage.setItem(eventKey(user.id), JSON.stringify(previous)); } catch { /* storage may be unavailable */ }
      return false;
    }
    return true;
  };

  const showEventInSidebar = (id) => {
    setHiddenEventIds((current) => {
      const next = new Set(current);
      next.delete(id);
      try { localStorage.setItem(hiddenEventKey(user.id), JSON.stringify([...next])); } catch { /* the current page still updates */ }
      window.dispatchEvent(new Event('ld:hidden-learning-events-updated'));
      return next;
    });
  };

  if (!data) return <LoadingOverlay />;
  if (data.empty) return <p className="py-10 text-center text-sm text-[var(--text-secondary)]">{t('plan.noLanguage')}</p>;
  if (data.error) return <p className="py-10 text-center text-sm text-[var(--danger-text)]">{t('plan.loadError')}</p>;

  const topics = data.domains.flatMap((domain) => (domain.topics || []).map((topic) => ({ domain: domain.domain_slug, topic })));
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = mondayOf(firstOfMonth);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const monthName = dateFormat({ month: 'long', year: 'numeric' }).format(month);
  const selectedEvents = events.filter((event) => event.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const upcomingEvents = events
    .map((event) => ({ ...event, startsAt: new Date(`${event.date}T${event.time || '00:00'}:00`) }))
    .filter((event) => event.startsAt.getTime() >= Date.now())
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, 5);
  const eventCounts = events.reduce((counts, event) => ({ ...counts, [event.date]: (counts[event.date] || 0) + 1 }), {});
  const saveEvent = async (event) => {
    event.preventDefault();
    if (!eventTitle.trim()) return;
    const existingEvent = events.find((item) => item.id === editingEventId);
    const topic = topics.find((item) => `${item.domain}|${item.topic}` === eventTopic);
    const savedEvent = {
      id: editingEventId || eventId(),
      title: eventTitle.trim().slice(0, 100),
      date: selectedDate,
      time: eventTime,
      duration: Number(eventDuration) || 30,
      language: topic ? data.active.language_code : (existingEvent?.language || data.active.language_code),
      level: topic ? data.active.level : (existingEvent?.level || data.active.level),
      domain: topic?.domain || null,
      topic: topic?.topic || null,
    };
    const next = [...events.filter((item) => item.id !== editingEventId), savedEvent]
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    if (!await persistEvents(next)) return;
    setEventTitle('');
    setEventTopic('');
    setEditingEventId(null);
    setShowEventForm(false);
  };

  const startAddEvent = () => {
    setEditingEventId(null);
    setEventTitle('');
    setEventTime('18:00');
    setEventDuration('30');
    setEventTopic('');
    setShowEventForm(true);
    setEventError('');
  };

  const startEditEvent = (event) => {
    setEditingEventId(event.id);
    setEventTitle(event.title || '');
    setSelectedDate(event.date);
    setEventTime(event.time || '18:00');
    setEventDuration(String(event.duration || 30));
    setEventTopic(event.domain && event.topic ? `${event.domain}|${event.topic}` : '');
    setShowEventForm(true);
    setEventError('');
  };

  const cancelEventEdit = () => {
    setShowEventForm(false);
    setEditingEventId(null);
    setEventError('');
  };

  const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:opacity-90';
  const softButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border-secondary)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]';
  const eventForm = showEventForm && <form onSubmit={saveEvent} className="plan-event-form">
    <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--text-secondary)]">{t('plan.eventTitle')}<input required maxLength={100} value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder={t('plan.eventTitlePlaceholder')} className="h-10 w-full min-w-0 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-container)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--text-tertiary)]" /></label>
    <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--text-secondary)]">{t('plan.eventDate')}<input type="date" required value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-container)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--text-tertiary)]" /></label>
    <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--text-secondary)]">{t('plan.eventTime')}<input type="time" required value={eventTime} onChange={(event) => setEventTime(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-container)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--text-tertiary)]" /></label>
    <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--text-secondary)]">{t('plan.eventDuration')}<select value={eventDuration} onChange={(event) => setEventDuration(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-container)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--text-tertiary)]">{['15', '30', '45', '60', '90'].map((n) => <option key={n} value={n}>{t('plan.minutes', { n })}</option>)}</select></label>
    {topics.length > 0 && <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--text-secondary)] sm:col-span-2">{t('plan.eventTopic')}<select value={eventTopic} onChange={(event) => { setEventTopic(event.target.value); const selected = topics.find((item) => `${item.domain}|${item.topic}` === event.target.value); if (selected) setEventTitle(topicName(selected.domain, selected.topic)); }} className="h-10 w-full min-w-0 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-container)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--text-tertiary)]"><option value="">{t('plan.eventNoTopic')}</option>{topics.map((item) => <option key={`${item.domain}|${item.topic}`} value={`${item.domain}|${item.topic}`}>{topicName(item.domain, item.topic)} · {domainName(item.domain)}</option>)}</select></label>}
    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={cancelEventEdit} className={softButton}>{t('common.cancel')}</button><button type="submit" disabled={savingEvent} className={buttonClass}>{savingEvent ? t('common.saving') : t('plan.saveEvent')}</button></div>
  </form>;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="plan-page grid gap-6">
      <div className="plan-view-switch" role="tablist" aria-label={t('plan.title')}>
        {[
          { id: 'calendar', label: t('plan.calendarEyebrow') },
          { id: 'upcoming', label: t('plan.upcomingEvents') },
        ].map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)} className={`plan-view-tab ${activeTab === tab.id ? 'is-active' : ''}`}>
            {tab.label}
            {tab.id === 'upcoming' && upcomingEvents.length > 0 && <span className="plan-view-tab-count">{upcomingEvents.length}</span>}
          </button>
        ))}
      </div>
      {activeTab === 'calendar' && <div className="plan-main-grid">
        <section className="plan-panel plan-calendar-panel" aria-labelledby="plan-calendar-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="plan-section-title"><span className="plan-eyebrow">{t('plan.calendarEyebrow')}</span><h2 id="plan-calendar-title" className="capitalize tracking-tight">{monthName}</h2></div>
            <div className="plan-calendar-controls">
              <button type="button" className={softButton} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label={t('plan.previousMonth')}>‹</button>
              <button type="button" className={softButton} onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(todayKey()); }}>{t('plan.today')}</button>
              <button type="button" className={softButton} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label={t('plan.nextMonth')}>›</button>
            </div>
          </div>
          <div className="plan-calendar-grid">
            {Array.from({ length: 7 }, (_, index) => { const date = new Date(2024, 0, 1 + index); return <span key={index} className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] sm:text-xs">{dateFormat({ weekday: 'short' }).format(date)}</span>; })}
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const inMonth = date.getMonth() === month.getMonth();
              const selected = key === selectedDate;
              const today = key === todayKey();
              const count = eventCounts[key] || 0;
              return <button key={key} type="button" onClick={() => { setSelectedDate(key); setEventError(''); }} aria-pressed={selected} aria-label={dateFormat({ dateStyle: 'full' }).format(date)} className={`relative grid h-9 min-h-9 place-items-center rounded-md text-sm tabular-nums transition-colors ${selected ? 'bg-[var(--primary)] font-semibold text-[var(--on-primary)]' : today ? 'border border-[var(--text)] font-semibold text-[var(--text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--fill)]'} ${!inMonth ? 'opacity-35' : ''}`}>
                <span>{date.getDate()}</span><span className="absolute bottom-1 flex items-center gap-0.5">{count > 0 && <i className={`h-1 w-1 rounded-full ${selected ? 'bg-[var(--on-primary)]' : 'bg-[var(--primary)]'}`} />}</span>
              </button>;
            })}
          </div>
        </section>

        <section className="plan-panel plan-agenda-panel" aria-labelledby="plan-events-title">
          <div className="plan-agenda-header">
            <div className="min-w-0"><span className="plan-eyebrow">{t('plan.agendaEyebrow')}</span><h2 id="plan-events-title">{dateFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDate}T12:00:00`))}</h2><p>{t('plan.eventsOnDay', { n: selectedEvents.length })}</p></div>
            <button type="button" onClick={() => showEventForm ? cancelEventEdit() : startAddEvent()} className="plan-add-event-button"><span aria-hidden="true">+</span>{t('plan.addEvent')}</button>
          </div>
            {eventForm}
            {eventError && <p role="alert" className="mb-3 text-xs text-[var(--danger-text)]">{eventError}</p>}
            {!selectedEvents.length ? <p className="plan-empty-day">{t('plan.noEvents')}</p> : <div className="plan-event-list">{selectedEvents.map((event) => <div key={event.id} className="plan-event-row">
              <div className="flex min-w-0 items-center gap-3"><span className="w-12 flex-none text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{event.time}</span><span className="h-8 w-0.5 flex-none rounded-full bg-[var(--primary)]" /><span className="grid min-w-0 gap-0.5"><span className="truncate text-sm font-medium">{event.title}</span><span className="truncate text-xs text-[var(--text-tertiary)]">{t('plan.minutes', { n: event.duration })}{event.topic ? ` · ${domainName(event.domain)} · ${event.level}` : ''}</span></span></div>
              <span className="flex flex-none items-center gap-1">{hiddenEventIds.has(event.id) && <button type="button" title={t('plan.showSidebarEvent')} onClick={() => showEventInSidebar(event.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]" aria-label={`${t('plan.showSidebarEvent')}: ${event.title}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>}{event.topic && <button type="button" title={t('plan.startEventLesson')} onClick={() => onStartLesson({ lang: event.language || data.active.language_code, domain: event.domain, topic: event.topic, level: event.level || data.active.level })} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--fill)]" aria-label={t('plan.startEventLesson')}>→</button>}<button type="button" title={t('plan.deleteEvent')} onClick={() => persistEvents(events.filter((item) => item.id !== event.id))} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--fill)] hover:text-[var(--danger-text)]" aria-label={`${t('plan.deleteEvent')}: ${event.title}`}>×</button></span>
            </div>)}</div>}
        </section>

      </div>}
      {activeTab === 'upcoming' && <section className="plan-upcoming-section plan-upcoming-view" aria-labelledby="plan-upcoming-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="plan-upcoming-title" className="text-lg font-semibold tracking-tight">{t('plan.upcomingEvents')}</h2>
          <div className="flex items-center gap-2">
            {upcomingEvents.length > 0 && <span className="plan-upcoming-count">{upcomingEvents.length}</span>}
            <button type="button" onClick={() => showEventForm ? cancelEventEdit() : startAddEvent()} className="plan-add-event-button"><span aria-hidden="true">+</span>{t('plan.addEvent')}</button>
          </div>
        </div>
        {eventForm}
        {!upcomingEvents.length ? (
          <p className="plan-empty-upcoming">{t('plan.noUpcomingEvents')}</p>
        ) : (
          <div className="plan-upcoming-grid">
            {upcomingEvents.map((event) => (
              <article key={event.id} className="plan-upcoming-card">
                <button type="button" onClick={() => { setMonth(new Date(event.startsAt.getFullYear(), event.startsAt.getMonth(), 1)); setSelectedDate(event.date); setActiveTab('calendar'); }} className="plan-upcoming-open">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[var(--fill)] text-center leading-tight">
                    <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">{dateFormat({ month: 'short' }).format(event.startsAt)}</span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{event.startsAt.getDate()}</span>
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-medium text-[var(--text)]">{event.title}</span>
                    <span className="truncate text-xs text-[var(--text-tertiary)]">{dateFormat({ weekday: 'short' }).format(event.startsAt)} · {event.time}{event.topic ? ` · ${topicName(event.domain, event.topic)}` : ''}</span>
                  </span>
                </button>
                <span className="plan-upcoming-actions">
                  <button type="button" onClick={() => startEditEvent(event)} aria-label={`${t('plan.editEvent')}: ${event.title}`} title={t('plan.editEvent')} className="plan-event-action">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21v-7m0-4V3M12 21v-9m0-4V3M20 21v-5m0-4V3M2 14h4m4-4h4m4 6h4" /></svg>
                  </button>
                  <button type="button" onClick={() => persistEvents(events.filter((item) => item.id !== event.id))} aria-label={`${t('plan.deleteEvent')}: ${event.title}`} title={t('plan.deleteEvent')} className="plan-event-action plan-event-action-delete">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>}
    </motion.div>
  );
}
