import { profileLanguage } from './profile-language.js';

const needsSetup = error => ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code);
const fail = error => {
  const out = new Error(error.message);
  out.code = needsSetup(error) ? 'localization_setup' : error.code;
  throw out;
};

export async function loadLocalizedLesson(sb, params, nativeLanguage, userId = null) {
  const { data, error } = await sb.from('lessons').select('*')
    .eq('language_code', params.lang).eq('domain_slug', params.domain)
    .eq('topic', params.topic).eq('level', params.level).maybeSingle();
  if (error) fail(error);
  if (data && userId) {
    const { data: progress, error: variantError } = await sb.from('user_progress').select('lesson_variant')
      .eq('user_id', userId).eq('lesson_id', data.id).maybeSingle();
    if (variantError) fail(variantError);
    const variant = progress?.lesson_variant;
    if (variant?.native_language === nativeLanguage && variant.content) {
      return { ...data, content: variant.content, model: variant.model, personal: true };
    }
  }
  if (!data || profileLanguage(data.native_language) === nativeLanguage) return data;
  const { data: localized, error: localizationError } = await sb.from('lesson_localizations')
    .select('content, model').eq('lesson_id', data.id).eq('native_language', nativeLanguage).maybeSingle();
  if (localizationError) fail(localizationError);
  // Keep the base language tag and id, even when no variant has been built yet.
  return { ...data, content: localized?.content || null, model: localized?.model || data.model };
}

async function saveSharedCache(sb, payload, fetchImpl) {
  const { data: { session }, error: sessionError } = await sb.auth.getSession();
  if (sessionError) fail(sessionError);
  if (!session?.access_token) throw new Error('Lesson cache requires an authenticated session');
  const response = await fetchImpl('/api/lesson-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Lesson cache could not be saved');
    error.code = result.error;
    throw error;
  }
  return result;
}

export async function saveLocalizedLesson(sb, {
  params, nativeLanguage, content, model, userId, baseRow = null, personal = false,
  cacheProof, cacheIssuedAt, fetchImpl = fetch,
}) {
  if (!baseRow?.id) {
    const result = await saveSharedCache(sb, {
      kind: 'lesson', languageCode: params.lang, domainSlug: params.domain, topic: params.topic,
      level: params.level, nativeLanguageCode: nativeLanguage, content, model,
      cacheProof, issuedAt: cacheIssuedAt,
    }, fetchImpl);
    if (result.created) return result.row;
    baseRow = result.row;
  }
  if (personal || baseRow.personal || profileLanguage(baseRow.native_language) === nativeLanguage) {
    await saveSharedCache(sb, {
      kind: 'personal', lessonId: baseRow.id, languageCode: params.lang,
      domainSlug: params.domain, topic: params.topic, level: params.level,
      nativeLanguageCode: nativeLanguage, content, model, cacheProof, issuedAt: cacheIssuedAt,
    }, fetchImpl);
    return { ...baseRow, content, model, personal: true };
  }
  await saveSharedCache(sb, {
    kind: 'localization', lessonId: baseRow.id, languageCode: params.lang,
    domainSlug: params.domain, topic: params.topic, level: params.level,
    nativeLanguageCode: nativeLanguage, content, model, cacheProof, issuedAt: cacheIssuedAt,
  }, fetchImpl);
  return { ...baseRow, content, model };
}
