export function wordSegments(text, language = 'en') {
  if (typeof text !== 'string' || !text.trim()) return [];
  if (typeof Intl.Segmenter === 'function') {
    try {
      return [...new Intl.Segmenter(language || 'en', { granularity: 'word' }).segment(text)]
        .filter(segment => segment.isWordLike)
        .map(segment => segment.segment);
    } catch {
      // Fall through for runtimes without locale data for the requested language.
    }
  }
  return text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{M}\p{N}]+/gu) || [];
}

export const countWords = (text, language = 'en') => wordSegments(text, language).length;

export function isCjkLanguage(language) {
  return ['zh', 'ja', 'ko'].includes(String(language || '').split('-')[0].toLowerCase());
}
