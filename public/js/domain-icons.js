// One line icon per field, drawn on the same grid as the rest of the app:
// 24x24, no fill, currentColor, 2px round strokes. They replace the initials
// that stood in for the emoji the database ships.

const PATHS = {
  it: '<polyline points="8 9 5 12 8 15"/><polyline points="16 9 19 12 16 15"/><line x1="13.5" y1="7" x2="10.5" y2="17"/>',
  medical: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/><path d="M3.2 13h6.3l.5-1 2 4.5 2-7 1.5 3.5h5.3"/>',
  business: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/><path d="M3 12h18"/>',
  finance: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>',
  legal: '<path d="M11.4 5.4 8.6 2.6 3.6 7.6l2.8 2.8z"/><path d="M8.9 7.9 17 16"/><rect x="2" y="17.5" width="11" height="3" rx="1.5"/>',
  marketing: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M17 9.5a4 4 0 0 1 0 5"/>',
  tourism: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  horeca: '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 11v10"/><path d="M17 3c-1.4 2-2 4-2 6 0 1.4.8 2 2 2v10"/>',
  engineering: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  automotive: '<path d="M4 17v-4l2-5.5A1 1 0 0 1 7 7h10a1 1 0 0 1 1 .5L20 13v4"/><path d="M4 13h16"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  education: '<path d="M22 9 12 5 2 9l10 4 10-4Z"/><path d="M6 11v5c0 1.3 2.7 3 6 3s6-1.7 6-3v-5"/>',
  science: '<path d="M9 3h6"/><path d="M10 3v6.5L5 18a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8.5V3"/><path d="M7.5 14h9"/>',
  agriculture: '<path d="M12 21v-9"/><path d="M12 12c0-4 2-6.5 5.5-7.5C17.5 8.5 15.5 11 12 12Z"/><path d="M12 15c0-4-2-6.5-5.5-7.5C6.5 11.5 8.5 14 12 15Z"/>',
  retail: '<circle cx="9.5" cy="20" r="1.2"/><circle cx="17.5" cy="20" r="1.2"/><path d="M2 4h3l2.5 11h11L21 8H6.2"/>',
  realestate: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  sports: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
  gaming: '<rect x="2" y="8" width="20" height="10" rx="4"/><path d="M7 11.5v3M5.5 13h3"/><circle cx="16" cy="12" r="1"/><circle cx="18.5" cy="14.5" r="1"/>',
  arts: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-.4-.2-.7-.4-1a1.4 1.4 0 0 1 1-2.4H16a5 5 0 0 0 5-5c0-4.4-4-8.1-9-8.1Z"/><circle cx="8" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10.5" r="1"/>',
  media: '<path d="M4 5h13v15H4z"/><path d="M17 9h3v9a2 2 0 0 1-3 1.7"/><path d="M7 9h7M7 12.5h7M7 16h4"/>',
  psychology: '<path d="M12 5.5A3 3 0 0 0 6.4 4 3 3 0 0 0 4 6.6 3 3 0 0 0 5 12a3 3 0 0 0 2 4.8A3 3 0 0 0 12 18"/><path d="M12 5.5A3 3 0 0 1 17.6 4 3 3 0 0 1 20 6.6 3 3 0 0 1 19 12a3 3 0 0 1-2 4.8A3 3 0 0 1 12 18"/><path d="M12 5.5V20"/>',
  beauty: '<path d="M12 3c1.4 3.2 2.8 4.6 6 6-3.2 1.4-4.6 2.8-6 6-1.4-3.2-2.8-4.6-6-6 3.2-1.4 4.6-2.8 6-6Z"/><path d="M18 15.5 18.7 17l1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7Z"/>',
  aviation: '<path d="M21 15.5v-2l-7.5-4.5V4a1.5 1.5 0 0 0-3 0v5L3 13.5v2l7.5-2.3v4.3L8 19.3V21l3.9-1.1L15.8 21v-1.7l-2.3-1.8v-4.3Z"/>',
  military: '<path d="M12 3 4 6v6c0 4.9 3.4 8.4 8 9 4.6-.6 8-4.1 8-9V6l-8-3Z"/>',
  everyday: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2M20 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>',
  religion: '<path d="M12 6.5C10.5 5 8.5 4.5 6 4.5H3v13h3c2.5 0 4.5.5 6 2 1.5-1.5 3.5-2 6-2h3v-13h-3c-2.5 0-4.5.5-6 2Z"/><path d="M12 6.5v13"/>',
};

// Each icon was drawn freehand, so its ink sat in a different part of the box:
// centres were off by up to 1.1 units and the painted size ranged from 13 to 22.
// Side by side they read as crooked. These are the measured corrections —
// [scale, translateX, translateY] — that put every icon's painted box dead
// centre and make its longest side exactly 20 units. Stroke width is divided by
// the scale, so the rendered line stays 2px whatever the correction.
const NORM = {  it: [1.2857, -3.429, -3.429],
  medical: [0.9, 1.2, 1.2],
  business: [1, 0, 0],
  finance: [1.125, -1.5, -1.5],
  legal: [1.0056, 2.447, 0.385],
  marketing: [1.2857, -2.064, -3.429],
  tourism: [0.9, 1.2, 1.2],
  horeca: [1, 0.5, 0],
  engineering: [0.9471, 0.16, 1.109],
  automotive: [1.125, -1.5, -2.339],
  education: [0.9, 1.2, 1.2],
  science: [1, 0, 0],
  agriculture: [1.0909, -1.091, -1.909],
  retail: [0.9474, 1.105, 0.063],
  realestate: [1, 0, 0.5],
  sports: [1.0588, -0.706, -0.706],
  gaming: [0.9, 1.2, 0.3],
  arts: [0.9998, 0.004, 0.002],
  media: [1.125, -1.5, -2.063],
  psychology: [0.9665, 0.402, 1.128],
  beauty: [1.0651, -1.953, -0.195],
  aviation: [0.973, 0.324, 0.568],
  military: [1, 0, 0],
  everyday: [0.9, 1.2, 1.2],
  religion: [1, 0, 0],
};

// Same treatment for the fallback mark: circle r8 at centre, so 16 units wide.
const NORM_FALLBACK = [1.125, -1.5, -1.5];

// Anything not in the list still gets a mark rather than an empty box.
const FALLBACK = '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>';

/** @returns {string} an inline <svg> for the field, coloured by currentColor. */
export function domainIcon(slug) {
  const paths = PATHS[slug] || FALLBACK;
  const [s, tx, ty] = NORM[slug] || NORM_FALLBACK;
  return `<svg class="dom-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g transform="translate(${tx} ${ty}) scale(${s})" stroke="currentColor" stroke-width="${+(2 / s).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

/**
 * The antd preset palette each field is tinted with. Chosen for what the field
 * suggests (medicine red, finance gold, the outdoors green), not assigned in
 * rotation, so neighbours may share one. Unknown fields stay neutral.
 */
const DOMAIN_TONE = {
  it: 'blue', medical: 'red', business: 'geekblue', finance: 'gold', legal: 'purple',
  marketing: 'magenta', tourism: 'cyan', horeca: 'orange', engineering: 'volcano',
  automotive: 'geekblue', education: 'purple', science: 'cyan', agriculture: 'lime',
  retail: 'magenta', realestate: 'orange', sports: 'green', gaming: 'purple', arts: 'magenta',
  media: 'volcano', psychology: 'purple', beauty: 'magenta', aviation: 'blue',
  military: 'green', everyday: 'gold', religion: 'geekblue',
};
export const domainTone = slug => DOMAIN_TONE[slug] ?? null;
