import { lessonEvaluationCases } from '../evaluation/lesson-cases.js';
import { validateLesson } from '../lib/lesson-prompt.js';

const cases = lessonEvaluationCases();
const results = cases.map(({ id, languageCode, lesson, expectedValid }) => {
  const evaluation = validateLesson(lesson, languageCode);
  return { id, expectedValid, actualValid: evaluation.valid, reason: evaluation.reason || null };
});
const expectedValid = results.filter(result => result.expectedValid);
const expectedInvalid = results.filter(result => !result.expectedValid);
const correctlyClassified = results.filter(result => result.expectedValid === result.actualValid);
const rate = (count, total) => total ? Number((count / total).toFixed(3)) : null;
const metrics = {
  datasetCases: results.length,
  validLessonAcceptanceRate: rate(expectedValid.filter(result => result.actualValid).length, expectedValid.length),
  invalidLessonRejectionRate: rate(expectedInvalid.filter(result => !result.actualValid).length, expectedInvalid.length),
  contractClassificationAccuracy: rate(correctlyClassified.length, results.length),
};

console.log(JSON.stringify({ metrics, cases: results }, null, 2));
if (correctlyClassified.length !== results.length) process.exitCode = 1;
