import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(
  import.meta.dirname,
  '..',
  'create-runtime-config.mjs',
);

test('verification config disables duplicate startup migration and seed runs', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-config-'));
  const config = path.join(root, 'verify.yml');
  const database = path.join(root, 'database.sqlite');

  try {
    execFileSync(process.execPath, [
      script,
      '--output',
      config,
      '--database',
      database,
    ]);

    const body = readFileSync(config, 'utf8');
    assert.match(body, /migrations:\n\s+autoRun: false/);
    assert.match(body, /seeds:\n\s+autoRun: false/);
    assert.match(
      body,
      new RegExp(`database: ${escapeRegex(JSON.stringify(database))}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
