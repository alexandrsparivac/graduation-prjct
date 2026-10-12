function tokens(value, locale) {
  let text = String(value || '').normalize('NFKC').toLocaleLowerCase(locale || undefined)
    .replace(/[’‘]/g, "'");
  if (String(locale || '').startsWith('en')) {
    text = text.replace(/\b(can't)\b/g, 'cannot').replace(/\bwon't\b/g, 'will not')
      .replace(/n't\b/g, ' not').replace(/'re\b/g, ' are').replace(/'ve\b/g, ' have')
      .replace(/'ll\b/g, ' will').replace(/\bi'm\b/g, 'i am')
      .replace(/\b(it|he|she|that|there|here|what|who)'s\b/g, '$1 is').replace(/\bcan not\b/g, 'cannot');
  }
  // Segment words in languages that do not put spaces between them.
  if (typeof Intl.Segmenter === 'function') return Array.from(new Intl.Segmenter(locale, { granularity: 'word' })
    .segment(text)).filter(part => part.isWordLike).map(part => part.segment);
  return text.match(/[\p{L}\p{N}]+/gu) || [];
}

/** Ordered lexical similarity; this is not a phonetic pronunciation score. */
export function similarity(expected, heard, locale = 'en') {
  const a = tokens(expected, locale), b = tokens(heard, locale);
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1,
      previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return Math.max(0, 1 - previous[b.length] / Math.max(a.length, b.length));
}
