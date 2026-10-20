const REQUIRED_CONFIG = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export function isApplicationReady(environment = process.env) {
  const hasAiProvider = ['GEMINI_API_KEY', 'GROQ_API_KEY']
    .some(key => typeof environment[key] === 'string' && environment[key].trim().length > 0);
  return hasAiProvider && REQUIRED_CONFIG.every(key => typeof environment[key] === 'string' && environment[key].trim().length > 0);
}
