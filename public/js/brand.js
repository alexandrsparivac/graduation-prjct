// Brand assets in one place: the LD mark, the lockup, and the page footer.
// The mark is drawn with currentColor so it inverts with the theme.

import { applyI18n, onLangChange } from './i18n.js';

// The mark carries the "LD"; the wordmark next to it is the plain word.
export const BRAND_NAME = 'Platform';
export const BRAND_FULL = 'LD Platform';

/** The bare LD ligature. Sized by CSS, coloured by currentColor. */
export const LOGO_SVG = `<svg class="logo-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 5V19h4"/><path d="M11 19V5h2.5C17.1 5 19.5 8.1 19.5 12s-2.4 7-6 7H11Z"/></svg>`;

/** Mark inside the dark rounded tile, as used in the top bar and the loader. */
export const LOGO_TILE = `<span class="brand-mark">${LOGO_SVG}</span>`;

/** Tile + wordmark, linking home unless `as` says otherwise. */
export function logoLockup({ href = '/dashboard', className = 'brand' } = {}) {
  const inner = `${LOGO_TILE}<span class="brand-name">${BRAND_NAME}</span>`;
  return href
    ? `<a class="${className}" href="${href}">${inner}</a>`
    : `<span class="${className}">${inner}</span>`;
}

/**
 * Append the site footer. Every page gets it except login, which is a single
 * centred card and reads better without one.
 */
export function renderFooter() {
  const existing = document.querySelector('.site-footer');
  if (existing) return existing;
  const el = document.createElement('footer');
  el.className = 'site-footer';
  // One quiet line: the mark, the legal pages, the year. Nothing that competes
  // with the page above it.
  el.innerHTML = `
    <div class="footer-inner">
      <span class="footer-brand">${LOGO_SVG}<span>${BRAND_NAME}</span></span>
      <nav class="footer-nav">
        <a href="/faq" data-i18n="foot.faq"></a>
        <a href="/terms" data-i18n="foot.terms"></a>
        <a href="/privacy" data-i18n="foot.privacy"></a>
      </nav>
      <span class="footer-year">© ${new Date().getFullYear()}</span>
    </div>`;
  document.body.appendChild(el);
  // Turns the body into a column so the footer sinks to the bottom instead of
  // sitting next to the card.
  document.body.classList.add('has-footer');
  applyI18n(el);
  onLangChange(() => applyI18n(el));
  return el;
}
