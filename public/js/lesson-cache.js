import { profileLanguage } from './profile-language.js';

const needsSetup = error => ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code);
const fail = error => {
  const out = new Error(error.message);
  out.code = needsSetup(error) ? 'localization_setup' : error.code;
  throw out;
};

export async function loadLocalizedLesson(sb, params, nativeLanguage) {
  const { data, error } = await sb.from('lessons').select('*')
    .eq('language_code', params.lang).eq('domain_slug', params.domain)
    .eq('topic', params.topic).eq('level', params.level).maybeSingle();
  if (error) fail(error);
  if (!data || profileLanguage(data.native_language) === nativeLanguage) return data;
  const { data: localized, error: localizationError } = await sb.from('lesson_localizations')
    .select('content, model').eq('lesson_id', data.id).eq('native_language', nativeLanguage).maybeSingle();
  if (localizationError) fail(localizationError);
  // Keep the base language tag and id, even when no variant has been built yet.
  return { ...data, content: localized?.content || null, model: localized?.model || data.model };
}

export async function saveLocalizedLesson(sb, { params, nativeLanguage, content, model, userId, baseRow = null }) {
  const row = { language_code: params.lang, domain_slug: params.domain, topic: params.topic,
    level: params.level, native_language: nativeLanguage, content, model, created_by: userId };
  if (!baseRow?.id) {
    const { data, error } = await sb.from('lessons').insert(row).select().single();
    if (!error) return data;
    if (error.code !== '23505') fail(error);
    // A concurrent visit created the canonical row. Attach this version to it.
    baseRow = await loadLocalizedLesson(sb, params, nativeLanguage);
    if (!baseRow?.id) fail(error);
  }
  const isBase = profileLanguage(baseRow.native_language) === nativeLanguage;
  const { error } = isBase
    ? await sb.from('lessons').update({ content, model }).eq('id', baseRow.id)
    : await sb.from('lesson_localizations').upsert({ lesson_id: baseRow.id, native_language: nativeLanguage,
      content, model, created_by: userId }, { onConflict: 'lesson_id,native_language' });
  if (error) {
    // Shared variants may belong to another learner. RLS protects their cache;
    // the fresh version can still be used for this visit with the same id.
    if (error.code !== '42501') fail(error);
    console.warn('Shared lesson cache kept:', error.message);
  }
  return { ...baseRow, content, model };
}
