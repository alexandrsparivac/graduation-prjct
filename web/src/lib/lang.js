// Single source of truth for the learner's active study language.
// Every page resolves through here so dashboard, lessons, review and
// vocabulary always show the same language the header capsule shows.
export function resolveActiveLanguage(langs) {
  const rows = langs || [];
  if (!rows.length) return null;
  try {
    const saved = localStorage.getItem('activeLanguage');
    if (saved) {
      const hit = rows.find((l) => l.language_code === saved);
      if (hit) return hit;
    }
  } catch { /* storage unavailable: first language wins */ }
  return rows[0] || null;
}

export function rememberActiveLanguage(code) {
  try {
    if (code) localStorage.setItem('activeLanguage', code);
  } catch { /* list still renders */ }
}
