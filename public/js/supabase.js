import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wireDropdown } from './ui.js';
import { t, applyI18n, onLangChange } from './i18n.js';
import { logoLockup } from './brand.js';
import { ICON_GEAR } from './settings.js';

let client;

export async function getSupabase() {
  if (client) return client;
  const cfg = await fetch('/api/config').then(r => r.json());
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error(t('err.supabase'));
  }
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return client;
}

export async function requireSession() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.replace('/login');
    return null;
  }
  return session;
}

export async function getProfile(sb, userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
  window.location.replace('/login');
}

// antd Alert icons, one per type: info circle, check circle, close circle.
const MSG_ICON_PATHS = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  success: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
};

export function showMsg(el, text, kind = 'error') {
  if (!el) return;
  el.className = `msg msg-${kind} show`;
  const svg = el.querySelector('svg');
  if (svg) svg.innerHTML = MSG_ICON_PATHS[kind] || MSG_ICON_PATHS.info;
  el.querySelector('span').textContent = text;
}
export function hideMsg(el) {
  if (el) el.classList.remove('show');
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

// Top-bar icons share the gear's geometry: 16px, outline, 2px stroke.
const ICON_BOOK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>';
const ICON_CHEVRON = '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICON_LOGOUT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';

export function renderTopbar({ profile, user }) {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const name = profile?.full_name || user?.email || '';
  const avatar = profile?.avatar_url
    ? `<img src="${profile.avatar_url}" alt="" referrerpolicy="no-referrer">`
    : initials(name);
  // The icon for the page you are on is marked, so the bar also says where you are.
  const here = location.pathname.replace(/\/$/, '');
  const current = path => (here === path ? ' is-active" aria-current="page' : '');
  const safeName = String(name).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  bar.innerHTML = `
    <div class="topbar-inner">
      ${logoLockup({ href: '/dashboard' })}
      <nav class="topbar-right">
        <a class="btn-ghost icon-btn${current('/onboarding')}" href="/onboarding?edit=1" data-i18n-attr="aria-label:nav.learning;title:nav.learning">${ICON_BOOK}</a>
        <a class="btn-ghost icon-btn${current('/settings')}" id="settingsBtn" href="/settings" data-i18n-attr="aria-label:nav.settings;title:nav.settings">${ICON_GEAR}</a>
        <div class="user-menu">
          <button type="button" class="user-trigger" id="userBtn" aria-haspopup="menu" aria-expanded="false">
            <span class="avatar" aria-hidden="true">${avatar}</span>
            <span class="topbar-name">${safeName}</span>
            ${ICON_CHEVRON}
          </button>
          <div class="user-drop" id="userDrop" role="menu" hidden>
            <span class="user-drop-head">${safeName}</span>
            <button type="button" class="user-drop-item" id="logoutBtn" role="menuitem">${ICON_LOGOUT}<span data-i18n="nav.logout"></span></button>
          </div>
        </div>
      </nav>
    </div>`;
  applyI18n(bar);
  onLangChange(() => applyI18n(bar));

  // The bar lies flat over the top of the page and only grows an edge once
  // content scrolls under it, so an unscrolled page has no line across it.
  const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 4);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Signing out is the one destructive thing in the bar, so it lives inside the
  // account menu rather than sitting as a bare icon beside the navigation.
  const trigger = document.getElementById('userBtn');
  const drop = document.getElementById('userDrop');
  wireDropdown(trigger, drop);

  document.getElementById('logoutBtn').addEventListener('click', signOut);
}
