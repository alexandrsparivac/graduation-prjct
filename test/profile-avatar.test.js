import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAvatarUrl } from '../public/js/profile-avatar.js';

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
