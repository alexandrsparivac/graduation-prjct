import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLesson } from '../lib/lesson-prompt.js';
import { lessonEvaluationCases } from '../evaluation/lesson-cases.js';

test('offline lesson evaluation fixtures match expected validator outcomes', () => {
  const cases = lessonEvaluationCases();
  assert.ok(cases.length >= 5, 'the evaluation set should include positive and negative examples');
  assert.ok(cases.some(item => item.expectedValid));
  assert.ok(cases.some(item => !item.expectedValid));

  for (const item of cases) {
    const result = validateLesson(item.lesson, item.languageCode);
    assert.equal(result.valid, item.expectedValid, `${item.id}: ${result.reason || 'unexpected validation result'}`);
  }
});
