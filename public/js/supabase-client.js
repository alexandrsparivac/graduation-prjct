import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4?bundle';
import { t } from './i18n.js';

let client;

export async function getSupabase() {
  if (client) return client;
  const cfg = await fetch('/api/config').then(r => r.json());
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error(t('err.supabase'));
  }
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return client;
}

export async function requireSession() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    return null;
  }
  return session;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
  window.location.replace('/login');
}
