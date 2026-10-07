import test from 'node:test';
import assert from 'node:assert/strict';
import { isApplicationReady } from '../lib/readiness.js';

const configured = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  GROQ_API_KEY: 'groq',
};

test('readiness requires every server integration without exposing its values', () => {
  assert.equal(isApplicationReady(configured), true);
  for (const key of Object.keys(configured)) {
    assert.equal(isApplicationReady({ ...configured, [key]: '' }), false, `${key} is required`);
  }
  assert.equal(isApplicationReady({ ...configured, GROQ_API_KEY: '   ' }), false);
});
