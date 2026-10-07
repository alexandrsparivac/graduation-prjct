// The settings panel: theme, interface language, lesson behaviour, background.
// It is rendered into the /settings page; the top bar only links to it.

import { UI_LANGS, getLang, setLang, t, applyI18n, onLangChange, loadCatalogTranslations } from './i18n.js';
import { saveProfileLanguage } from './profile-language.js';
import { getPrefs, setPref, resetPrefs, applyPrefs, SPEECH_VOICES } from './prefs.js';
import { speak, stopSpeaking, toLocale, ttsSupported } from './speech.js';
import { toast, setLoading } from './ui.js';
import { buildAccountExport } from './account-export.js';
import { signOut } from './supabase-client.js';

export const ICON_GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';

const THEMES = ['system', 'light', 'dark'];
const RATES = ['slow', 'normal', 'fast'];

const toggleRow = (key, on) => `
  <label class="set-row">
    <span class="set-row-text">
      <span class="set-row-label" data-i18n="set.${key}"></span>
      <span class="set-row-hint" data-i18n="set.${key}.hint"></span>
    </span>
    <input type="checkbox" class="switch" data-pref="${key}" ${on ? 'checked' : ''}>
  </label>`;

/**
 * Fill `host` with the settings sections and wire them up.
 * `showLessonPrefs` is false when signed out, where they mean nothing yet.
 * `account` carries the Supabase client and user when signed in, which is what
 * the export and deletion controls need; without it that section is left out.
 */
export function renderSettingsPanel(host, { showLessonPrefs = true, account = null } = {}) {
  applyPrefs();
  const p = getPrefs();

  host.innerHTML = `
    <section class="set-section">
      <h2 class="set-head" data-i18n="set.appearance"></h2>
      <div class="set-block">
        <span class="set-row-label" data-i18n="set.theme"></span>
        <div class="option-grid option-grid-3" role="radiogroup">
          ${THEMES.map(x => `
          <button type="button" class="option ${p.theme === x ? 'active' : ''}" data-theme="${x}" role="radio" aria-checked="${p.theme === x}">
            <span class="swatch swatch-${x}" aria-hidden="true"></span>
            <span class="name" data-i18n="set.theme.${x}"></span>
          </button>`).join('')}
        </div>
      </div>
      ${toggleRow('bgWords', p.bgWords)}
    </section>

    <section class="set-section">
      <h2 class="set-head" data-i18n="set.language"></h2>
      <p class="set-row-hint set-block-hint" data-i18n="set.language.hint"></p>
      <div class="option-grid lang-grid" role="radiogroup">
        ${UI_LANGS.map(l => `
          <button type="button" class="option ${l.code === getLang() ? 'active' : ''}" data-lang="${l.code}" role="radio" aria-checked="${l.code === getLang()}" lang="${l.code}">
            <span class="name"><span class="lang-flag" aria-hidden="true">${l.flag}</span> ${l.label}</span>
            <span class="desc">${l.country || ''}</span>
          </button>`).join('')}
      </div>
    </section>

    ${showLessonPrefs ? `
    <section class="set-section">
      <h2 class="set-head" data-i18n="set.lessons"></h2>
      ${toggleRow('showTranslations', p.showTranslations)}
      <div class="set-block">
        <span class="set-row-text">
          <span class="set-row-label" id="set-voice-label" data-i18n="set.speechVoice"></span>
          <span class="set-row-hint" data-i18n="set.speechVoice.hint"></span>
        </span>
        <div class="option-grid option-grid-2" role="radiogroup" aria-labelledby="set-voice-label">
          ${SPEECH_VOICES.map(x => `
          <button type="button" class="option ${p.speechVoice === x ? 'active' : ''}" data-voice="${x}" role="radio" aria-checked="${p.speechVoice === x}">
            <span class="name" data-i18n="set.speechVoice.${x}"></span>
          </button>`).join('')}
        </div>
        <div class="voice-preview-controls">
          <button type="button" class="btn-secondary auto voice-preview" id="set-voice-preview" aria-pressed="false" ${ttsSupported ? '' : 'disabled'}>
            <svg class="voice-preview-speaker" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>
            <span class="btn-spinner voice-preview-spinner" aria-hidden="true" hidden></span>
            <span class="voice-preview-label" data-i18n="set.speechVoice.preview"></span>
          </button>
          <span class="set-row-hint voice-preview-status" id="set-voice-status" role="status" aria-live="polite" hidden></span>
        </div>
      </div>
      <div class="set-block">
        <span class="set-row-text">
          <span class="set-row-label" data-i18n="set.speechRate"></span>
          <span class="set-row-hint" data-i18n="set.speechRate.hint"></span>
        </span>
        <div class="option-grid option-grid-3" role="radiogroup">
          ${RATES.map(x => `
          <button type="button" class="option ${p.speechRate === x ? 'active' : ''}" data-rate="${x}" role="radio" aria-checked="${p.speechRate === x}">
            <span class="name" data-i18n="set.speechRate.${x}"></span>
          </button>`).join('')}
        </div>
      </div>
    </section>` : ''}

    ${account ? accountSection() : ''}

    <div class="set-foot">
      <button type="button" class="btn-ghost" id="set-reset" data-i18n="set.reset"></button>
    </div>`;

  const pick = (selector, prefKey, dataKey) => host.querySelectorAll(selector).forEach(b => b.addEventListener('click', () => {
    if (prefKey === 'speechVoice' || prefKey === 'speechRate') stopSpeaking();
    setPref(prefKey, b.dataset[dataKey]);
    host.querySelectorAll(selector).forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', x === b); });
  }));
  pick('[data-theme]', 'theme', 'theme');
  pick('[data-rate]', 'speechRate', 'rate');
  pick('[data-voice]', 'speechVoice', 'voice');

  const preview = host.querySelector('#set-voice-preview');
  const previewStatus = host.querySelector('#set-voice-status');
  let previewActive = false;
  const previewState = (active, loading = false, statusKey = '') => {
    previewActive = active;
    if (!preview) return;
    preview.setAttribute('aria-pressed', String(active));
    if (loading) preview.setAttribute('aria-busy', 'true');
    else preview.removeAttribute('aria-busy');
    preview.querySelector('.voice-preview-label').dataset.i18n = active ? 'set.speechVoice.stop' : 'set.speechVoice.preview';
    preview.querySelector('.voice-preview-spinner').hidden = !loading;
    preview.querySelector('.voice-preview-speaker').classList.toggle('is-hidden', loading);
    previewStatus.hidden = !statusKey;
    previewStatus.dataset.i18n = statusKey;
    previewStatus.classList.toggle('is-error', statusKey === 'audio.error');
    applyI18n(preview);
    applyI18n(previewStatus);
  };
  preview?.addEventListener('click', () => {
    if (previewActive) { stopSpeaking(); return; }
    previewState(true, true, 'common.moment');
    speak(t('set.speechVoice.sample'), toLocale(getLang()), {
      onstart: () => previewState(true, false, 'set.speechVoice.playing'),
      onend: () => previewState(false, false, 'set.speechVoice.finished'),
      oncancel: () => previewState(false),
      onerror: () => previewState(false, false, 'audio.error')
    });
  });

  host.querySelectorAll('[data-pref]').forEach(input => input.addEventListener('change', () => {
    setPref(input.dataset.pref, input.checked);
  }));

  host.querySelector('.lang-grid').addEventListener('click', async e => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.classList.contains('active')) return;
    await setLang(b.dataset.lang);
    if (account) {
      try {
        await saveProfileLanguage(account.sb, account.user.id);
        await loadCatalogTranslations(account.sb);
      } catch (err) {
        console.warn('Language preference not saved:', err.message);
        toast(t('set.language.saveFailed'), 'error');
      }
    }
    host.querySelectorAll('[data-lang]').forEach(x => {
      const on = x.dataset.lang === getLang();
      x.classList.toggle('active', on);
      x.setAttribute('aria-checked', on);
    });
  });

  if (account) wireAccount(host, account);

  host.querySelector('#set-reset').addEventListener('click', () => {
    stopSpeaking();
    resetPrefs();
    syncFromPrefs(host);
    toast(t('set.resetDone'), 'success');
  });

  applyI18n(host);
  onLangChange(() => { stopSpeaking(); applyI18n(host); });
}

/** Push stored preferences back onto the controls (used after a reset). */
function syncFromPrefs(host) {
  const p = getPrefs();
  host.querySelectorAll('[data-theme]').forEach(x => { const on = x.dataset.theme === p.theme; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
  host.querySelectorAll('[data-rate]').forEach(x => { const on = x.dataset.rate === p.speechRate; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
  host.querySelectorAll('[data-voice]').forEach(x => { const on = x.dataset.voice === p.speechVoice; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
  host.querySelectorAll('[data-pref]').forEach(x => { x.checked = !!p[x.dataset.pref]; });
}

// ---------------------------------------------------------------------------
// Your data
//
// The privacy page promises a copy on request and deletion on request. These
// two buttons are that promise, in the product rather than in an email thread.
// ---------------------------------------------------------------------------

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const accountSection = () => `
  <section class="set-section">
    <h2 class="set-head" data-i18n="set.data"></h2>

    <div class="set-row">
      <span class="set-row-text">
        <span class="set-row-label" data-i18n="set.data.export"></span>
        <span class="set-row-hint" data-i18n="set.data.export.hint"></span>
      </span>
      <button type="button" class="btn-secondary auto" id="set-export" data-i18n="set.data.export.btn"></button>
    </div>

    <div class="set-row set-row-danger">
      <span class="set-row-text">
        <span class="set-row-label" data-i18n="set.data.delete"></span>
        <span class="set-row-hint" data-i18n="set.data.delete.hint"></span>
      </span>
      <button type="button" class="btn-secondary auto danger" id="set-delete" data-i18n="set.data.delete.btn"></button>
    </div>

    <div class="set-danger" id="set-delete-confirm" hidden>
      <p class="set-danger-body" data-i18n="set.data.delete.body"></p>
      <label class="set-danger-label" for="set-delete-email"></label>
      <div class="input-wrap">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
        <input type="email" id="set-delete-email" autocomplete="off" spellcheck="false">
      </div>
      <div class="actions">
        <button type="button" class="btn-secondary auto" id="set-delete-cancel" data-i18n="set.data.delete.cancel"></button>
        <button type="button" class="btn-primary auto danger" id="set-delete-go" data-i18n="set.data.delete.go"></button>
      </div>
    </div>
  </section>`;

function wireAccount(host, { sb, user }) {
  const exportBtn = host.querySelector('#set-export');
  exportBtn?.addEventListener('click', async () => {
    setLoading(exportBtn, true, t('common.moment'));
    try {
      const payload = await buildAccountExport(sb, user);
      const stamp = new Date().toISOString().slice(0, 10);
      download(`ld-platform-${stamp}.json`, JSON.stringify(payload, null, 2));
      toast(t('set.data.export.done'), 'success');
    } catch (err) {
      console.warn('Export failed:', err.message);
      toast(t('set.data.export.failed'), 'error');
    } finally {
      setLoading(exportBtn, false);
    }
  });

  const box = host.querySelector('#set-delete-confirm');
  const email = host.querySelector('#set-delete-email');
  const go = host.querySelector('#set-delete-go');
  const label = host.querySelector('.set-danger-label');

  const close = () => { box.hidden = true; email.value = ''; };

  host.querySelector('#set-delete')?.addEventListener('click', () => {
    box.hidden = !box.hidden;
    if (!box.hidden) {
      // Typing the address is the confirmation: it cannot be clicked through by
      // habit, and unlike a translated keyword it means the same in every
      // interface language.
      label.textContent = t('set.data.delete.typeEmail', { email: user.email || '' });
      email.placeholder = user.email || '';
      email.focus();
    }
  });
  host.querySelector('#set-delete-cancel')?.addEventListener('click', close);

  go?.addEventListener('click', async () => {
    if (email.value.trim().toLowerCase() !== String(user.email || '').toLowerCase()) {
      toast(t('set.data.delete.mismatch'), 'error');
      email.focus();
      return;
    }
    setLoading(go, true, t('set.data.delete.working'));
    try {
      const { error } = await sb.rpc('delete_account');
      if (error) throw error;
      await signOut();
    } catch (err) {
      console.warn('Account deletion failed:', err.message);
      // PGRST202 is "function not found": migration 004 has not been run.
      toast(err.code === 'PGRST202' ? t('set.data.delete.needsSetup') : t('set.data.delete.failed'), 'error');
      setLoading(go, false);
    }
  });
}
