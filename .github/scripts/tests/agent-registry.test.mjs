import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveAgent } from '../agent-registry.mjs';

test('agent registry selects a pinned built-in adapter', () => {
  const adapter = resolveAgent({});
  assert.equal(adapter.id, 'pi');
  assert.equal(adapter.version, '0.86.1');
  assert.equal(
    resolveAgent({ CODE_AGENT_ENGINE: 'pi', CODE_AGENT_VERSION: '0.84.5' })
      .version,
    '0.84.5',
  );
  assert.throws(() => resolveAgent({ CODE_AGENT_VERSION: 'latest' }), /pinned/);
});

test('each engine reads only its own version namespace', () => {
  const codebuddy = resolveAgent({ CODE_AGENT_ENGINE: 'codebuddy' });
  assert.equal(codebuddy.id, 'codebuddy');
  assert.equal(codebuddy.package, '@tencent-ai/codebuddy-code');
  assert.equal(codebuddy.version, '2.150.0');
  assert.equal(
    resolveAgent({ CODE_AGENT_ENGINE: ' codebuddy ' }).id,
    'codebuddy',
  );
  assert.equal(
    resolveAgent({
      CODE_AGENT_ENGINE: 'codebuddy',
      CODEBUDDY_VERSION: '2.151.0',
    }).version,
    '2.151.0',
  );
  // A pin left over from Pi must never be installed for the CodeBuddy engine.
  assert.equal(
    resolveAgent({
      CODE_AGENT_ENGINE: 'codebuddy',
      CODE_AGENT_VERSION: '0.84.5',
      PI_VERSION: '0.84.6',
    }).version,
    '2.150.0',
  );
  assert.throws(
    () =>
      resolveAgent({
        CODE_AGENT_ENGINE: 'codebuddy',
        CODEBUDDY_VERSION: 'latest',
      }),
    /CODEBUDDY_VERSION must be a pinned/,
  );
});

test('unknown engines and arbitrary commands fail closed', () => {
  for (const id of [
    'python',
    '../../application/agent.mjs',
    'constructor',
    'pi; echo unsafe',
    'codebuddy; echo unsafe',
    'CodeBuddy',
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
    for (const [engine, version, expected] of [
      ['pi', '0.84.5', '@earendil-works/pi-coding-agent@0.84.5'],
      ['codebuddy', '2.150.1', '@tencent-ai/codebuddy-code@2.150.1'],
    ]) {
      const record = path.join(root, `${engine}-install.json`);
      writeFileSync(path.join(root, engine),
        `#!/usr/bin/env node\nconsole.log('${version}');\n`, { mode: 0o755 });
      const result = spawnSync(
        process.execPath,
        [path.resolve(import.meta.dirname, '..', 'install-agent.mjs')],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            FACTORY_AGENT_INSTALL_RECORD: record,
            PATH: `${root}:${process.env.PATH}`,
            CODE_AGENT_ENGINE: engine,
            CODE_AGENT_VERSION: engine === 'codebuddy' ? '' : version,
            CODEBUDDY_VERSION: engine === 'codebuddy' ? version : '',
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')), {
        version: 1, engine, configuredVersion: version, actualVersion: version,
      });
      assert.deepEqual(JSON.parse(result.stdout), [
        'install',
        '--global',
        '--ignore-scripts',
        expected,
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
