export function safeAvatarUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

const LEGACY_PRESET_REPLACEMENTS = Object.freeze({
  deadpool: 'man-adult', homelander: 'man-adult', shrek: 'man-senior',
  trollface: 'man-young', doge: 'man-young', pepe: 'man-adult',
  gigachad: 'man-young', bateman: 'man-adult', joker: 'man-senior',
  minion: 'man-young', amogus: 'man-adult', heisenberg: 'man-senior',
  batman: 'man-adult', spiderman: 'man-young',
});

/** Map saved preset links to the new portrait set without changing profile data. */
export function resolveAvatarImage(value) {
  if (typeof value !== 'string') return null;
  const preset = /(?:^|\/)img\/avatars\/([a-z0-9-]+)\.svg(?:[?#].*)?$/i.exec(value);
  const replacement = preset && LEGACY_PRESET_REPLACEMENTS[preset[1]];
  if (replacement) return `/img/avatars/${replacement}.svg`;
  if (value.startsWith('/img/avatars/')) return value;
  return safeAvatarUrl(value);
}

/**
 * The avatar to show for a session. `profiles.avatar_url` is authoritative,
 * but Google sign-ins expose the photo as `picture` in the auth metadata, so
 * rows created before migration 013 (or any provider gap) fall back to it.
 * Every candidate goes through the same HTTPS validation.
 */
export function resolveAvatarUrl(profile, user) {
  return resolveAvatarImage(profile?.avatar_url)
    || resolveAvatarImage(user?.user_metadata?.avatar_url)
    || resolveAvatarImage(user?.user_metadata?.picture);
}
