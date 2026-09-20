import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const verify = readFileSync(
  path.resolve(import.meta.dirname, '..', 'verify.sh'),
  'utf8',
);

// Verification runs against whatever template the refresh generated, so it may only use the
// application's published commands. Reaching into template-owned files broke the beta.22
// refresh, where the migration commands moved behind the application CLI.
test('verification applies migrations and seeds through the application commands', () => {
  assert.match(verify, /^pnpm migrate$/m);
  assert.match(verify, /^pnpm seed$/m);
  assert.doesNotMatch(verify, /scripts\/(migrate|seed)\.ts/);
});
