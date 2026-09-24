import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('session-authenticated Hub mutations provide same-origin headers without bypassing authentication', () => {
  const script = readFileSync(new URL('../hub-smoke.mjs', import.meta.url), 'utf8');
  assert.match(script, /headers: \{ \.\.\.options.headers, origin, referer:/);
  assert.doesNotMatch(script, /disableCSRF|skipOriginCheck/);
  assert.match(script, /json.error\?\.code \?\? json.code/);
});
