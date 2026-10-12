import { supabase } from './supabase.js';
import { loadCatalogTranslations, restoreProfileLanguage } from './legacy.js';

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  await restoreProfileLanguage(supabase, userId, data);
  await loadCatalogTranslations(supabase);
  return data;
}

export const missingSession = (error) =>
  error?.name === 'AuthSessionMissingError' ||
  ['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error?.code) ||
  error?.message === 'Auth session missing!';
