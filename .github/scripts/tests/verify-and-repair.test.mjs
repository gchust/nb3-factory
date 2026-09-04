import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

const script = path.resolve(import.meta.dirname, '..', 'verify-and-repair.sh');

test('repair loop keeps retrying until Agent Browser acceptance succeeds', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-repair-'));
  const control = path.join(root, 'control');
  const scripts = path.join(control, '.github', 'scripts');
  const prompts = path.join(control, '.github', 'prompts');
  const workspace = path.join(root, 'workspace');
  const task = path.join(root, 'implement.md');
  const metadata = path.join(root, 'task-metadata.json');
  const artifacts = path.join(root, 'artifacts');
  const state = path.join(root, 'state');

  try {
    mkdirSync(scripts, { recursive: true });
    mkdirSync(prompts, { recursive: true });
    mkdirSync(workspace);
    writeFileSync(task, 'implement the task\n');
    writeFileSync(
      metadata,
      JSON.stringify({ task: { acceptanceCriteria: '1. Works' } }),
    );
    writeFileSync(path.join(prompts, 'repair.md'), 'repair template\n');

    writeExecutable(
      path.join(scripts, 'verify.sh'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'counter="$1/.verification-count"',
        'attempt=0',
        '[[ ! -f "$counter" ]] || attempt="$(cat "$counter")"',
        'attempt=$((attempt + 1))',
        'printf "%s" "$attempt" >"$counter"',
        'echo "verification $attempt"',
        '[[ "${FACTORY_SKIP_BROWSER:-}" == "1" ]]',
        '',
      ].join('\n'),
    );
    writeExecutable(
      path.join(scripts, 'browser-acceptance.sh'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'counter="$2/.browser-count"',
        'attempt=0',
        '[[ ! -f "$counter" ]] || attempt="$(cat "$counter")"',
        'attempt=$((attempt + 1))',
        'printf "%s" "$attempt" >"$counter"',
        'echo "browser acceptance $attempt"',
        '[[ "$attempt" -ge 3 ]] || exit 10',
        '',
      ].join('\n'),
    );
    writeNodeStub(
      path.join(scripts, 'create-runtime-config.mjs'),
      'process.exit(0);',
    );
    writeNodeStub(
      path.join(scripts, 'build-repair-prompt.mjs'),
      [
        "import { writeFileSync } from 'node:fs';",
        "const index = process.argv.indexOf('--output');",
        "writeFileSync(process.argv[index + 1], 'repair\\n');",
      ].join('\n'),
    );
    writeNodeStub(
      path.join(scripts, 'run-pi.mjs'),
      [
        "import { appendFileSync } from 'node:fs';",
        "appendFileSync(process.env.REPAIR_COUNTER, 'repair\\n');",
      ].join('\n'),
    );

    const repairCounter = path.join(root, 'repairs.log');
    execFileSync(
      script,
      [control, workspace, task, metadata, artifacts, state],
      {
        env: { ...process.env, REPAIR_COUNTER: repairCounter },
        stdio: 'pipe',
      },
    );

    assert.equal(
      readFileSync(path.join(workspace, '.verification-count'), 'utf8'),
      '3',
    );
    assert.equal(
      readFileSync(path.join(workspace, '.browser-count'), 'utf8'),
      '3',
    );
    assert.equal(readFileSync(repairCounter, 'utf8'), 'repair\nrepair\n');
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(artifacts, 'repair-summary.json'), 'utf8'),
      ),
      { verificationAttempts: 3, repairAttempts: 2 },
    );
    assert.match(
      readFileSync(path.join(artifacts, 'verify-2.log'), 'utf8'),
      /verification 2/,
    );
    assert.match(
      readFileSync(path.join(artifacts, 'verify-2.log'), 'utf8'),
      /browser acceptance 2/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeExecutable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function writeNodeStub(file, body) {
  writeFileSync(file, `${body}\n`);
}
