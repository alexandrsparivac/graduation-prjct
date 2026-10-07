// Dashboard visibility belongs to the account, with a local copy for offline
// edits. Store hidden IDs so newly introduced widgets remain visible by default.
export const DASHBOARD_WIDGETS = [
  { id: 'streak', label: 'dash.streak' },
  { id: 'completed', label: 'dash.stat.done' },
  { id: 'average', label: 'dash.stat.avg' },
  { id: 'words', label: 'dash.kpi.words' },
  { id: 'level', label: 'dash.widgets.level' },
  { id: 'review', label: 'dash.review.title' },
  { id: 'activity', label: 'dash.act.title' },
  { id: 'weak', label: 'dash.rev.title' },
  { id: 'domains', label: 'dash.dom.title' },
  { id: 'recent', label: 'dash.rec.title' },
];

const IDS = new Set(DASHBOARD_WIDGETS.map(widget => widget.id));
const META_KEY = 'dashboard_widgets';
export const normalizeHiddenWidgets = value => Array.isArray(value)
  ? [...new Set(value.filter(id => IDS.has(id)))] : [];

export function createDashboardWidgets({ sb, user, onChange = () => {}, onStatus = () => {}, storage }) {
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { /* browser storage unavailable */ }
  }
  const userId = user.id;
  const key = `dashboardWidgets:${userId}`;
  let cached = null;
  try { cached = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* optional cache */ }
  const remote = user.user_metadata?.[META_KEY];
  let hidden = normalizeHiddenWidgets(cached?.pending ? cached.hidden : remote?.hidden ?? cached?.hidden);
  let pending = cached?.pending === true;
  let revision = 0;
  let saving = null;
  let status = 'idle';

  const persist = () => {
    try { storage?.setItem(key, JSON.stringify({ hidden, pending })); } catch { /* account save still works */ }
  };
  const setStatus = value => { status = value; onStatus(value); };

  async function flush() {
    if (saving) return saving;
    if (!pending) return true;
    setStatus('saving');
    saving = (async () => {
      while (pending) {
        const snapshot = [...hidden];
        const version = revision;
        const session = await sb.auth.getSession();
        if (session.error || session.data?.session?.user?.id !== userId) throw new Error('Dashboard account changed');
        const result = await sb.auth.updateUser({ data: { [META_KEY]: { version: 1, hidden: snapshot } } });
        if (result.error) throw result.error;
        if (result.data?.user?.id !== userId) throw new Error('Dashboard account changed');
        if (revision === version) pending = false;
        persist();
      }
      setStatus('saved');
      return true;
    })().catch(() => { setStatus('error'); return false; }).finally(() => { saving = null; });
    return saving;
  }

  function update(next) {
    const normalized = normalizeHiddenWidgets(next);
    if (normalized.length === hidden.length && normalized.every(id => hidden.includes(id))) return flush();
    hidden = normalized;
    pending = true;
    revision++;
    persist();
    onChange();
    return flush();
  }

  return {
    isVisible: id => !hidden.includes(id),
    getStatus: () => status,
    setVisible(id, visible) {
      if (!IDS.has(id)) return Promise.resolve(false);
      return update(visible ? hidden.filter(key => key !== id) : [...hidden, id]);
    },
    reset: () => update([]),
    retry: flush,
    async init() {
      const version = revision;
      try {
        const result = await sb.auth.getUser();
        if (result.error || result.data?.user?.id !== userId) throw new Error('Dashboard account unavailable');
        // A choice made while this request was in flight takes precedence.
        if (!pending && revision === version) {
          hidden = normalizeHiddenWidgets(result.data.user.user_metadata?.[META_KEY]?.hidden);
          persist();
          onChange();
        }
        if (pending) return flush();
        return true;
      } catch {
        if (pending) return flush();
        return false;
      }
    },
  };
}
