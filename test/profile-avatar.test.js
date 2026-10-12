import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAvatarUrl, resolveAvatarUrl } from '../shared/profile-avatar.js';

test('avatar URLs accept normalized HTTPS image locations only', () => {
  assert.equal(safeAvatarUrl('https://lh3.googleusercontent.com/avatar?id=1'),
    'https://lh3.googleusercontent.com/avatar?id=1');
  assert.equal(safeAvatarUrl('javascript:alert(1)'), null);
  assert.equal(safeAvatarUrl('data:image/svg+xml,<svg/>'), null);
  assert.equal(safeAvatarUrl('//attacker.example/avatar'), null);
  assert.equal(safeAvatarUrl('https://user:pass@example.com/avatar'), null);
  assert.equal(safeAvatarUrl(`https://${'a'.repeat(2049)}.example/avatar`), null);
  assert.equal(safeAvatarUrl(null), null);
});

test('the Google picture metadata fills in when the profile has no avatar', () => {
  const photo = 'https://lh3.googleusercontent.com/a-/google-photo-id';
  assert.equal(resolveAvatarUrl({ avatar_url: null }, { user_metadata: { picture: photo } }), photo);
  assert.equal(resolveAvatarUrl(null, { user_metadata: { picture: photo } }), photo);
  // The stored profile photo always wins over the auth metadata.
  assert.equal(
    resolveAvatarUrl({ avatar_url: 'https://example.com/me.png' }, { user_metadata: { picture: photo } }),
    'https://example.com/me.png');
  // Unsafe candidates are rejected at every level, never rendered.
  assert.equal(resolveAvatarUrl({ avatar_url: 'javascript:alert(1)' }, { user_metadata: { picture: photo } }), photo);
  assert.equal(resolveAvatarUrl(null, { user_metadata: { picture: 'http://insecure.example/me.png' } }), null);
  assert.equal(resolveAvatarUrl(null, {}), null);
  assert.equal(resolveAvatarUrl(null, null), null);
});
