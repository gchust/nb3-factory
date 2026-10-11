import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordCreator } from '../template-creator.mjs';

test('creator pin resolves beta once without falling back to latest', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'template-creator-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pnpm = path.join(root, 'pnpm');
  writeFileSync(
    pnpm,
    `#!${process.execPath}
const assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['view', '@nocobase/create-app@beta', 'version', '--json']);
if (process.env.MISSING_BETA) process.exit(1);
console.log(JSON.stringify('0.1.0-beta.30'));
`,
  );
  chmodSync(pnpm, 0o755);
  const envFile = path.join(root, 'github-env');
  const run = (missing) =>
    spawnSync(
      process.execPath,
      [
        path.resolve(import.meta.dirname, '../template-creator.mjs'),
        'pin',
        root,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${root}${path.delimiter}${process.env.PATH}`,
          GITHUB_ENV: envFile,
          MISSING_BETA: missing ? '1' : '',
        },
      },
    );
  const result = run(false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(envFile, 'utf8'),
    'FACTORY_CREATOR_VERSION=0.1.0-beta.30\n',
  );
  assert.notEqual(run(true).status, 0);
  assert.equal(
    readFileSync(envFile, 'utf8'),
    'FACTORY_CREATOR_VERSION=0.1.0-beta.30\n',
  );
  const metadata = path.join(root, 'factory-template.json');
  writeFileSync(metadata, JSON.stringify({ templateVersion: '1.0.0-beta.61' }));
  recordCreator(metadata, '0.1.0-beta.30');
  assert.deepEqual(JSON.parse(readFileSync(metadata, 'utf8')), {
    templateVersion: '1.0.0-beta.61',
    creator: '@nocobase/create-app@0.1.0-beta.30',
    releaseChannel: 'beta',
    registry: 'https://registry.npmjs.org/',
  });
});

test('factory npm configuration uses public npm for both default and scoped packages', () => {
  const config = readFileSync(
    new URL('../../template.npmrc', import.meta.url),
    'utf8',
  );
  assert.match(config, /^registry=https:\/\/registry\.npmjs\.org\/$/m);
  assert.match(
    config,
    /^@nocobase:registry=https:\/\/registry\.npmjs\.org\/$/m,
  );
  assert.doesNotMatch(config, /npm\.nocobase\.ai/);
});
