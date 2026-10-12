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

/**
 * The avatar to show for a session. `profiles.avatar_url` is authoritative,
 * but Google sign-ins expose the photo as `picture` in the auth metadata, so
 * rows created before migration 013 (or any provider gap) fall back to it.
 * Every candidate goes through the same HTTPS validation.
 */
export function resolveAvatarUrl(profile, user) {
  return safeAvatarUrl(profile?.avatar_url)
    || safeAvatarUrl(user?.user_metadata?.avatar_url)
    || safeAvatarUrl(user?.user_metadata?.picture);
}
