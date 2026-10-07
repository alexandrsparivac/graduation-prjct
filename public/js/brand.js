// Brand assets in one place: the LD mark, the lockup, and the page footer.
// Variant 3 keeps its original light tile and dark negative-space LD mark.

import { applyI18n, onLangChange } from './i18n.js';

// The mark carries the "LD"; the wordmark next to it is the plain word.
export const BRAND_NAME = 'Platform';
export const BRAND_FULL = 'LD Platform';

export const LOGO_SVG = '<img class="logo-mark logo-mark-inverted" src="/img/logo-inverted.svg" alt=""><img class="logo-mark logo-mark-original" src="/img/logo.svg" alt="">';

// Generic AI symbol, styled like the other outline icons.
const AI_MARK = `<svg class="ai-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="m12 4 2.4 6.6L21 13l-6.6 2.4L12 22l-2.4-6.6L3 13l6.6-2.4L12 4Z"/><path d="M20 2v4m-2-2h4M4 2v4M2 4h4"/></svg>`;

/** The complete logo tile, as used in the top bar and login. */
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
      <span class="footer-brand footer-powered"><span data-i18n="foot.generated"></span>${AI_MARK}</span>
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
