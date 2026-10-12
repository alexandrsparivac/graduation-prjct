import { UI_LANGS, getLang, setLang } from './i18n.js';

const PENDING = 'uiLangPending';
const ACCOUNT = 'uiLangAccount';
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
const saves = new Map();

export function profileLanguage(value) {
  return UI_LANGS.find(l => l.code === value || l.label === value)?.code || 'ro';
}

export function saveProfileLanguage(sb, userId, code = getLang()) {
  // Preserve click order even if a previous HTTP request is slow.
  const job = (saves.get(userId) || Promise.resolve()).catch(() => {}).then(async () => {
    const { error } = await sb.from('profiles').update({ native_language: code }).eq('id', userId);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    write(ACCOUNT, userId);
    // A newer click may already be pending while this request is in flight.
    try { if (read(PENDING) === code) localStorage.removeItem(PENDING); } catch { /* storage unavailable */ }
  });
  saves.set(userId, job);
  const clear = () => { if (saves.get(userId) === job) saves.delete(userId); };
  job.then(clear, clear);
  return job;
}

export async function restoreProfileLanguage(sb, userId, profile) {
  if (!profile) return;
  const pending = read(PENDING);
  // Preserve choices saved by earlier app versions, before profile sync existed.
  const legacyChoice = !read(ACCOUNT) ? read('uiLang') : null;
  // A choice made before login takes precedence over the account's last value.
  const chosen = pending || legacyChoice || profileLanguage(profile.native_language);
  await setLang(profileLanguage(chosen), { rememberChoice: false });
  if (pending || legacyChoice || profile.native_language !== getLang()) {
    write(PENDING, getLang());
    try {
      await saveProfileLanguage(sb, userId);
      profile.native_language = getLang();
    } catch (err) {
      console.warn('Language preference not saved:', err.message);
    }
  } else {
    write(ACCOUNT, userId);
  }
}
