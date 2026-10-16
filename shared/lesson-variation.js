const unique = (items, max, length) => [...new Set((Array.isArray(items) ? items : [])
  .filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, length)))].slice(-max);

export function sanitizeLessonHistory(history = {}) {
  return {
    terms: unique(history?.terms, 240, 160), phrases: unique(history?.phrases, 128, 400),
    scenarios: unique(history?.scenarios, 6, 600), focuses: unique(history?.focuses, 5, 160),
  };
}

// Combine several histories (e.g. long-term device history + current lesson),
// keeping the most recent items within the same caps.
export function mergeLessonHistory(...histories) {
  return sanitizeLessonHistory({
    terms: histories.flatMap(h => sanitizeLessonHistory(h).terms),
    phrases: histories.flatMap(h => sanitizeLessonHistory(h).phrases),
    scenarios: histories.flatMap(h => sanitizeLessonHistory(h).scenarios),
    focuses: histories.flatMap(h => sanitizeLessonHistory(h).focuses),
  });
}

// History travels with the saved variant, so a later visit still avoids prior material.
export function previousLessonMaterial(content) {
  if (!content) return sanitizeLessonHistory();
  const old = sanitizeLessonHistory(content.generation?.history);
  return sanitizeLessonHistory({
    terms: [...old.terms, ...(content.vocabulary || []).map(item => item.term)],
    phrases: [...old.phrases, ...(content.phrases || []).map(item => item.phrase)],
    scenarios: [...old.scenarios, [content.title, content.scenario, content.dialogue?.context].filter(Boolean).join(' / ')],
    focuses: [...old.focuses, content.generation?.focus],
  });
}
