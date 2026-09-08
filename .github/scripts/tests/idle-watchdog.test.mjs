import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, '..', 'run-agent.mjs');

for (const activity of ['stdout', 'stderr']) {
  test(`Code Agent idle watchdog resets on ${activity} activity`, () => {
    const fixture = createFixture(`activity-${activity}`);
    try {
      const output =
        activity === 'stdout'
          ? "console.log(JSON.stringify({ type: 'message_update', delta: String(count) }));"
          : 'process.stderr.write(`heartbeat-${count}\\n`);';
      writeFileSync(
        path.join(fixture.bin, 'pi'),
        [
          '#!/usr/bin/env node',
          'let count = 0;',
          'const timer = setInterval(() => {',
          '  count += 1;',
          `  ${output}`,
          '  if (count === 6) {',
          '    clearInterval(timer);',
          '    setTimeout(() => process.exit(0), 100);',
          '  }',
          '}, 300);',
          '',
        ].join('\n'),
        { mode: 0o755 },
      );

      const startedAt = Date.now();
      const result = runFixture(fixture);

      assert.equal(result.status, 0, result.stderr);
      assert.ok(Date.now() - startedAt >= 1_500);
      assert.doesNotMatch(result.stderr, /produced no stdout\/stderr activity/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

test('Code Agent idle watchdog releases a silent invocation to factory verification', () => {
  const fixture = createFixture('silent');
  try {
    writeFileSync(
      path.join(fixture.bin, 'pi'),
      '#!/usr/bin/env node\nsetInterval(() => {}, 1_000);\n',
      { mode: 0o755 },
    );

    const startedAt = Date.now();
    const result = runFixture(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - startedAt < 4_000);
    assert.match(
      result.stderr,
      /produced no stdout\/stderr activity for 1 seconds/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function createFixture(name) {
  const root = mkdtempSync(path.join(os.tmpdir(), `nb3-factory-idle-${name}-`));
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const prompt = path.join(root, 'task.md');
  const log = path.join(root, 'artifacts', 'agent.jsonl');
  const agentDir = path.join(root, 'agent');
  mkdirSync(workspace);
  mkdirSync(bin);
  writeFileSync(prompt, 'test task\n');
  return { root, workspace, bin, prompt, log, agentDir };
}

function runFixture(fixture) {
  return spawnSync(
    process.execPath,
    [
      script,
      '--workspace',
      fixture.workspace,
      '--prompt',
      fixture.prompt,
      '--log',
      fixture.log,
      '--agentDir',
      fixture.agentDir,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        CODE_AGENT_API_ENDPOINT: 'https://proxy.example/v1',
        CODE_AGENT_API_KEY: 'test-key',
        CODE_AGENT_API_TYPE: 'openai-completions',
        CODE_AGENT_MODEL: 'test-model',
        CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: '0',
        CODE_AGENT_IDLE_TIMEOUT_SECONDS: '1',
      },
      timeout: 5_000,
    },
  );
}
