const KEY = 'ld:notifications';
const EVENT = 'ld:notifications-changed';

export function getNotifications() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function getUnreadNotificationsCount() {
  return getNotifications().filter(item => !item.readAt).length;
}

function save(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 100))); } catch { /* notifications remain session-local */ }
  window.dispatchEvent(new Event(EVENT));
}

export function addNotification(text, kind = 'success', dedupeKey) {
  if (!text) return;
  const items = getNotifications();
  if (dedupeKey && items.some(item => item.dedupeKey === dedupeKey)) return;
  save([{ id: crypto.randomUUID(), text, kind, createdAt: new Date().toISOString(), dedupeKey, readAt: null }, ...items]);
}

export function deleteNotification(id) {
  save(getNotifications().filter(item => item.id !== id));
}

export function clearNotifications() {
  save([]);
}

export function markNotificationsRead() {
  const items = getNotifications();
  if (!items.some(item => !item.readAt)) return;
  const readAt = new Date().toISOString();
  save(items.map(item => item.readAt ? item : { ...item, readAt }));
}

export const NOTIFICATIONS_CHANGED = EVENT;
