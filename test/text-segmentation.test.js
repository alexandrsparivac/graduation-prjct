import assert from 'node:assert/strict';
import test from 'node:test';
import { countWords, wordSegments, isCjkLanguage } from '../public/js/text-segmentation.js';

test('segments punctuation and contractions as language-aware words', () => {
  assert.equal(countWords('The worker checks the report. Don’t stop!', 'en'), 7);
  assert.deepEqual(wordSegments('مرحبا بالعالم، هذا اختبار للنص العربي.', 'ar').length, 6);
});

test('segments Chinese and Japanese without requiring spaces', () => {
  const chinese = '我喜欢学习中文。'.repeat(20);
  const japanese = '日本語を勉強しています。'.repeat(20);
  assert.ok(countWords(chinese, 'zh') >= 80);
  assert.ok(countWords(chinese, 'zh') <= 220);
  assert.ok(countWords(japanese, 'ja') > 20);
  assert.equal(isCjkLanguage('zh-Hans'), true);
  assert.equal(isCjkLanguage('ar'), false);
});
