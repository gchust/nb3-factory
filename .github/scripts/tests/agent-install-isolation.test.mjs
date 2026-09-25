import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('installer tests preserve a running task installation record', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-install-isolation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const record = path.join(root, 'running-task-install.json');
  const original = JSON.stringify({
    version: 1,
    engine: 'pi',
    configuredVersion: '0.86.1',
    actualVersion: '0.86.1',
  });
  writeFileSync(record, original);
  const env = { ...process.env, FACTORY_AGENT_INSTALL_RECORD: record };
  delete env.NODE_TEST_CONTEXT;

  // Reproduce factory:test inside an Agent whose runner owns this record.
  // The selected test uses mock executables and must write only its own file.
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      '--test-name-pattern=^installer uses the registry package',
      path.join(import.meta.dirname, 'agent-registry.test.mjs'),
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      env,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(
    result.stdout,
    /^ok [0-9]+ - installer uses the registry package and pinned version without a shell$/m,
  );
  assert.equal(readFileSync(record, 'utf8'), original);
});
