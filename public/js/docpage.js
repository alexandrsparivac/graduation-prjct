// The three standing pages — FAQ, terms, privacy — are the same page with
// different text, so they share one renderer. Everything is keyed through i18n,
// and none of them needs an account: they are reachable from the login screen.

import { getSupabase, getProfile, renderTopbar } from '/js/supabase.js';
import { hidePageLoader } from '/js/ui.js';
import { initI18n, applyI18n, onLangChange } from '/js/i18n.js';
import { LOGO_SVG, renderFooter, logoLockup } from '/js/brand.js';
import { applyPrefs } from '/js/prefs.js';

/**
 * @param {object} cfg
 * @param {string} cfg.titleKey  i18n key for the page title
 * @param {string} cfg.subKey    i18n key for the line under it
 * @param {string} cfg.prefix    key prefix for the body, e.g. 'faq'
 * @param {number} cfg.count     how many heading/body pairs to render
 * @param {'qa'|'section'} cfg.shape  question-and-answer, or heading-and-text
 */
export async function mountDocPage({ titleKey, subKey, prefix, count, shape }) {
  applyPrefs();
  document.getElementById('loaderMark').innerHTML = LOGO_SVG;
  await initI18n();

  const [hk, bk] = shape === 'qa' ? ['q', 'a'] : ['h', 'p'];
  document.getElementById('doc-body').innerHTML = Array.from({ length: count }, (_, n) => `
    <section class="doc-item">
      <h2 data-i18n="${prefix}.${hk}${n + 1}"></h2>
      <p data-i18n="${prefix}.${bk}${n + 1}"></p>
    </section>`).join('');
  document.getElementById('doc-title').setAttribute('data-i18n', titleKey);
  document.getElementById('doc-sub').setAttribute('data-i18n', subKey);

  // Signed in you get the full bar; signed out, just the mark, and back goes
  // to the login screen instead of a dashboard you cannot reach.
  let session = null;
  try {
    const sb = await getSupabase();
    ({ data: { session } } = await sb.auth.getSession());
    if (session) {
      const profile = await getProfile(sb, session.user.id);
      renderTopbar({ profile, user: session.user });
    }
  } catch (err) {
    console.warn('Doc page opened without Supabase:', err.message);
  }
  if (!session) {
    document.getElementById('topbar').innerHTML = logoLockup({ href: '/login' });
    document.getElementById('backLink').href = '/login';
  }

  applyI18n();
  onLangChange(() => applyI18n());
  renderFooter();
  hidePageLoader();
}
