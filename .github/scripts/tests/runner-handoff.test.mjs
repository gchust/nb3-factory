import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');

test('Code Agent exits with the handoff status when the runner deadline is reached', () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'nb3-factory-handoff-agent-'),
  );
  try {
    const workspace = path.join(root, 'workspace');
    const bin = path.join(root, 'bin');
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(path.join(root, 'task.md'), 'keep working\n');
    writeFileSync(
      path.join(bin, 'pi'),
      '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n',
      { mode: 0o755 },
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(scripts, 'run-agent.mjs'),
        '--workspace',
        workspace,
        '--prompt',
        path.join(root, 'task.md'),
        '--log',
        path.join(root, 'agent.jsonl'),
        '--agentDir',
        path.join(root, 'agent'),
      ],
      {
        encoding: 'utf8',
        timeout: 8_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          CODE_AGENT_API_ENDPOINT: 'https://proxy.example/v1',
          CODE_AGENT_API_KEY: 'test-key',
          CODE_AGENT_MODEL: 'test-model',
          CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: '0',
          FACTORY_RUN_DEADLINE_EPOCH_SECONDS: String(
            Math.floor(Date.now() / 1000) + 1,
          ),
        },
      },
    );

    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /workspace can be handed off/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repair loop forwards the handoff status instead of treating it as a failed repair', () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'nb3-factory-handoff-repair-'),
  );
  try {
    const control = path.join(root, 'control');
    const controlScripts = path.join(control, '.github', 'scripts');
    const prompts = path.join(control, '.github', 'prompts');
    const workspace = path.join(root, 'workspace');
    const artifacts = path.join(root, 'artifacts');
    const state = path.join(root, 'state');
    mkdirSync(controlScripts, { recursive: true });
    mkdirSync(prompts, { recursive: true });
    mkdirSync(workspace);
    writeFileSync(path.join(root, 'task.md'), 'implement\n');
    writeFileSync(path.join(root, 'metadata.json'), '{}\n');
    writeFileSync(path.join(prompts, 'repair.md'), 'repair\n');

    writeExecutable(
      path.join(controlScripts, 'verify.sh'),
      '#!/usr/bin/env bash\nexit 1\n',
    );
    writeExecutable(
      path.join(controlScripts, 'browser-acceptance.sh'),
      '#!/usr/bin/env bash\nexit 10\n',
    );
    writeFileSync(
      path.join(controlScripts, 'create-runtime-config.mjs'),
      'process.exit(0);\n',
    );
    writeFileSync(
      path.join(controlScripts, 'build-repair-prompt.mjs'),
      "import { writeFileSync } from 'node:fs'; const i=process.argv.indexOf('--output'); writeFileSync(process.argv[i+1], 'repair\\n');\n",
    );
    writeFileSync(
      path.join(controlScripts, 'run-agent.mjs'),
      'process.exit(75);\n',
    );

    const result = spawnSync(
      path.join(scripts, 'verify-and-repair.sh'),
      [
        control,
        workspace,
        path.join(root, 'task.md'),
        path.join(root, 'metadata.json'),
        artifacts,
        state,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stdout, /requesting handoff/);
    const summary = JSON.parse(
      readFileSync(path.join(artifacts, 'repair-summary.json'), 'utf8'),
    );
    assert.equal(summary.handoff, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('handoff metadata records the continuation run source', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-handoff-meta-'));
  try {
    const output = path.join(root, 'handoff.json');
    execFileSync(
      process.execPath,
      [
        path.join(scripts, 'handoff.mjs'),
        'prepare',
        '--issue',
        '6',
        '--run-id',
        '12345',
        '--continuation',
        '2',
        '--phase',
        'agent',
        '--output',
        output,
      ],
      { stdio: 'pipe' },
    );
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
      schemaVersion: 1,
      issueNumber: 6,
      previousRunId: 12345,
      continuation: 2,
      phase: 'agent',
      reason: 'runner-budget',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeExecutable(file, contents) {
  writeFileSync(file, contents);
  chmodSync(file, 0o755);
}
