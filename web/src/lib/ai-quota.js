import { addNotification } from './notifications.js';

const quotaKey = () => `ld:ai-quota:${new Date().toISOString().slice(0, 10)}`;

export function isAiQuotaReached(message) {
  try {
    const reached = localStorage.getItem(quotaKey()) === '1';
    if (reached) {
      addNotification(message || 'Daily AI limit reached. Try again later.', 'error', quotaKey());
      window.dispatchEvent(new Event('ld:ai-quota-reached'));
    }
    return reached;
  }
  catch { return false; }
}

export function markAiQuotaReached(message) {
  let alreadyReached = false;
  try {
    alreadyReached = localStorage.getItem(quotaKey()) === '1';
    localStorage.setItem(quotaKey(), '1');
  } catch { /* the current app session still receives the event */ }
  if (!alreadyReached) {
    addNotification(message || 'Daily AI limit reached. Try again later.', 'error', quotaKey());
    window.dispatchEvent(new Event('ld:ai-quota-reached'));
  }
}
