import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installedScopedVersions } from '../source-snapshot.mjs';

test('source snapshot includes exact installed non-workspace NocoBase dependencies without allowing a registry fallback', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'snapshot-deps-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, 'node_modules/.pnpm/avatars@1/node_modules/@nocobase/ai-employee-avatars');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: '@nocobase/ai-employee-avatars', version: '1.0.2' }));
  assert.deepEqual(installedScopedVersions(root, { '@nocobase/create-app': '0.1.0-beta.19' }), { '@nocobase/create-app': '0.1.0-beta.19', '@nocobase/ai-employee-avatars': '1.0.2' });
  assert.throws(() => installedScopedVersions(root, { '@nocobase/ai-employee-avatars': '1.0.1' }), /Multiple installed versions/);
});
