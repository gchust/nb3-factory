import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveAgent } from '../agent-registry.mjs';

test('agent registry selects a pinned built-in adapter', () => {
  const adapter = resolveAgent({});
  assert.equal(adapter.id, 'pi');
  assert.equal(adapter.version, '0.84.4');
  assert.equal(
    resolveAgent({ CODE_AGENT_ENGINE: 'pi', CODE_AGENT_VERSION: '0.84.5' })
      .version,
    '0.84.5',
  );
  assert.throws(() => resolveAgent({ CODE_AGENT_VERSION: 'latest' }), /pinned/);
});

test('unknown engines and arbitrary commands fail closed', () => {
  for (const id of [
    'python',
    '../../application/agent.mjs',
    'constructor',
    'pi; echo unsafe',
  ]) {
    assert.throws(
      () => resolveAgent({ CODE_AGENT_ENGINE: id }),
      /Unsupported CODE_AGENT_ENGINE/,
    );
  }
  const result = spawnSync(
    process.execPath,
    [path.resolve(import.meta.dirname, '..', 'run-agent.mjs')],
    {
      encoding: 'utf8',
      env: { ...process.env, CODE_AGENT_ENGINE: 'unregistered' },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported CODE_AGENT_ENGINE/);
});

test('installer uses the registry package and pinned version without a shell', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-agent-install-'));
  try {
    writeFileSync(
      path.join(root, 'npm'),
      '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n',
      { mode: 0o755 },
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve(import.meta.dirname, '..', 'install-agent.mjs')],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          CODE_AGENT_ENGINE: 'pi',
          CODE_AGENT_VERSION: '0.84.5',
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      'install',
      '--global',
      '--ignore-scripts',
      '@earendil-works/pi-coding-agent@0.84.5',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
