export function setLoading(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${label ? `<span>${label}</span>` : ''}`;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function skeletonCards(count, cls = 'option') {
  return Array.from({ length: count }, () => `
    <div class="${cls} skeleton-card" aria-hidden="true">
      <span class="sk sk-icon"></span>
      <span class="sk sk-line" style="width:70%"></span>
      <span class="sk sk-line sk-thin" style="width:50%"></span>
    </div>`).join('');
}

export function skeletonStats(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="stat" aria-hidden="true"><span class="sk sk-line" style="width:40%;height:22px"></span><span class="sk sk-line sk-thin" style="width:65%"></span></div>`).join('');
}

export function skeletonDomains(count = 2) {
  return Array.from({ length: count }, () => `
    <div class="domain-block" aria-hidden="true">
      <div class="domain-head"><span class="sk sk-icon"></span><div class="meta" style="display:grid;gap:6px"><span class="sk sk-line" style="width:35%"></span><span class="sk sk-line sk-thin" style="width:20%"></span></div></div>
      <div class="topic-list">${Array.from({ length: 4 }, () => `<span class="sk sk-line" style="height:38px;border-radius:10px"></span>`).join('')}</div>
    </div>`).join('');
}

export function stagger(container, selector = ':scope > *') {
  container.querySelectorAll(selector).forEach((el, i) => {
    el.style.setProperty('--i', i);
    el.classList.add('enter');
  });
}

export function hidePageLoader() {
  const el = document.getElementById('pageLoader');
  if (!el) return;
  el.classList.add('hide');
  setTimeout(() => el.remove(), 350);
}

// These are thrown on purpose to stop a page that is already redirecting.
const EXPECTED_ABORTS = new Set(['redirect', 'no supabase']);

/**
 * A page that throws while booting used to sit on the loading animation for
 * ever, with nothing on screen to explain it. Drop the loader and say what
 * broke instead.
 */
function reportBootFailure(message) {
  if (!message || EXPECTED_ABORTS.has(message)) return;
  const loader = document.getElementById('pageLoader');
  if (loader && !loader.classList.contains('hide')) hidePageLoader();
  toast(message, 'error', 9000);
}

window.addEventListener('error', e => reportBootFailure(e.message));
window.addEventListener('unhandledrejection', e => reportBootFailure(e.reason?.message || String(e.reason ?? '')));

export function toast(text, kind = 'info', ms = 2600) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = text;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, ms);
}

/**
 * A trigger button and the panel it opens, with antd's slide-up motion.
 *
 * Closing has to outlive the click that caused it: the panel stays in the page
 * until the outgoing animation ends, otherwise it would just blink out. Nothing
 * guarantees `animationend` arrives — reduced motion cuts the animation to
 * almost nothing, and a panel removed mid-flight never fires it — so a timer
 * finishes the job either way and the panel can never be left stuck open.
 *
 * @returns {{open: () => void, close: () => void, isOpen: () => boolean}}
 */
export function wireDropdown(trigger, drop) {
  let timer = 0;
  let onEnd = null;
  const isOpen = () => !drop.hidden && !drop.classList.contains('is-closing');

  const settle = () => {
    clearTimeout(timer);
    if (onEnd) { drop.removeEventListener('animationend', onEnd); onEnd = null; }
  };

  const open = () => {
    settle();
    drop.classList.remove('is-closing');
    drop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };

  const close = () => {
    if (!isOpen()) return;
    trigger.setAttribute('aria-expanded', 'false');
    drop.classList.add('is-closing');
    const finish = () => { settle(); drop.hidden = true; drop.classList.remove('is-closing'); };
    // Children do not animate, but guard anyway so a stray bubbled event
    // cannot cut the panel short.
    onEnd = e => { if (e.target === drop) finish(); };
    drop.addEventListener('animationend', onEnd);
    timer = setTimeout(finish, 400);
  };

  trigger.addEventListener('click', e => { e.stopPropagation(); if (isOpen()) close(); else open(); });

  // Panels are rebuilt whenever their section re-renders, so these document
  // listeners retire themselves once their panel has left the page. Without
  // that they would pile up, one pair per render, all pointing at dead nodes.
  const onDocClick = e => {
    if (!drop.isConnected) return document.removeEventListener('click', onDocClick);
    if (isOpen() && !drop.contains(e.target)) close();
  };
  const onKey = e => {
    if (!drop.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.key === 'Escape' && isOpen()) { close(); trigger.focus(); }
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  return { open, close, isOpen };
}
