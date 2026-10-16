// Battle-tested vanilla modules, reused directly instead of rewritten.
export {
  t, tp, getLang, setLang, onLangChange, initI18n, loadCatalogTranslations,
  languageName, domainName, domainDescription, topicName, UI_LANGS, langMeta,
} from '../../../shared/i18n.js';
export {
  PASS, PROMOTION_TESTS, PROMOTION_THRESHOLD, LEVELS,
  VOCAB_PER_LESSON, PHRASES_PER_LESSON,
  dayKey, addDays, activeDays, currentStreak, longestStreak, daysSinceLast,
  activityGrid, meanAccuracy, pacePerWeek, materialMet, favouriteSlot,
  domainRollup, recentlyCompleted, scoresOverTime, lessonsPerWeek, weekKey,
  currentWeekCount, promotionState,
} from '../../../shared/dash-stats.js';
export {
  SECTIONS, VOCAB_CARDS_PER_PAGE, buildFlow, lessonPlan, estimateMinutes,
  sectionProgress, currentSection, lessonCompletion, cleanTitle, sectionTone,
} from '../../../shared/lesson-plan.js';
export { loadLocalizedLesson, saveLocalizedLesson } from '../../../shared/lesson-cache.js';
export { loadCards, gradeCard, saveLessonVocabulary } from '../../../shared/vocab.js';
export * from '../../../shared/srs.js';
export { fetchAllRows } from '../../../shared/paginated-query.js';
export {
  getPrefs, getPref, setPref, resetPrefs, applyPrefs, onPrefsChange,
  SPEECH_RATES, SPEECH_VOICES, speechRate, speechVoice, DEFAULTS,
} from '../../../shared/prefs.js';
export { profileLanguage, restoreProfileLanguage, saveProfileLanguage } from '../../../shared/profile-language.js';
export { BUILDER_SECTIONS, BUILDER_PRESETS, decodeLessonSelection, filterLessonContent } from '../../../shared/lesson-builder.js';
export { previousLessonMaterial, mergeLessonHistory, sanitizeLessonHistory } from '../../../shared/lesson-variation.js';
export { createLessonResume, latestLessonDrafts, draftCompletion } from '../../../shared/lesson-resume.js';
export { DASHBOARD_WIDGETS, createDashboardWidgets } from '../../../shared/dashboard-widgets.js';
export { buildAccountExport } from '../../../shared/account-export.js';
