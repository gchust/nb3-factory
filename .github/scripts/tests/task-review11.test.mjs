// Round-11 review of the task workflow: a handoff that interrupts a repair,
// restored work with an outdated lockfile, one retry of a failed final test
// check, and Issue events of preset and maintenance Issues.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');
const root = path.resolve(scripts, '..', '..');
const workflow = readFileSync(
  path.join(root, '.github/workflows/code-agent-task.yml'),
  'utf8',
);
const jobOf = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `missing job ${name}`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
const stepOf = (name, text = workflow) => {
  const start = text.indexOf(`- name: ${name}\n`);
  assert.ok(start >= 0, `missing step ${name}`);
  return text.slice(start).split(/\n {6}- (?=name:|uses:)/)[0];
};
const runOf = (step) => {
  const block = step.split('run: |\n')[1];
  if (block) return block.split(/\n(?! {10}| *$)/)[0].replace(/^ {10}/gm, '');
  return /run: (.+)/.exec(step)[1];
};
function temp(t, prefix = 'factory-review11-') {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function executable(file, body) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

// ---------------------------------------------------------------- repair handoff

function repairFixture(t) {
  const dir = temp(t);
  const control = path.join(dir, 'control', '.github');
  const workspace = path.join(dir, 'workspace');
  mkdirSync(path.join(control, 'prompts'), { recursive: true });
  mkdirSync(workspace);
  writeFileSync(path.join(control, 'prompts', 'repair.md'), 'repair\n');
  writeFileSync(path.join(dir, 'task.md'), 'implement\n');
  writeFileSync(path.join(dir, 'metadata.json'), '{}\n');
  // Verification fails until VERIFY_PASS is set; QA always passes.
  executable(
    path.join(control, 'scripts', 'verify.sh'),
    '#!/usr/bin/env bash\necho "verification"\n[[ -n "${VERIFY_PASS:-}" ]]\n',
  );
  executable(
    path.join(control, 'scripts', 'browser-acceptance.sh'),
    '#!/usr/bin/env bash\nexit 0\n',
  );
  writeFileSync(
    path.join(control, 'scripts', 'create-runtime-config.mjs'),
    'process.exit(0);\n',
  );
  writeFileSync(
    path.join(control, 'scripts', 'build-repair-prompt.mjs'),
    "import { writeFileSync } from 'node:fs'; const i=process.argv.indexOf('--output'); writeFileSync(process.argv[i+1], 'repair\\n');\n",
  );
  // The repair Agent reaches the runner deadline.
  writeFileSync(
    path.join(control, 'scripts', 'run-agent.mjs'),
    "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.REPAIR_LOG, 'repair\\n'); process.exit(75);\n",
  );
  const artifacts = path.join(dir, 'artifacts');
  const run = (env = {}) =>
    spawnSync(
      path.join(scripts, 'verify-and-repair.sh'),
      [
        path.join(dir, 'control'),
        workspace,
        path.join(dir, 'task.md'),
        path.join(dir, 'metadata.json'),
        artifacts,
        path.join(dir, 'state'),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          REPAIR_LOG: path.join(dir, 'repairs.log'),
          GITHUB_RUN_ATTEMPT: '',
          ...env,
        },
      },
    );
  const checkpoint = path.join(artifacts, 'pipeline-state.json');
  const state = () => JSON.parse(readFileSync(checkpoint, 'utf8'));
  const repairs = () =>
    existsSync(path.join(dir, 'repairs.log'))
      ? readFileSync(path.join(dir, 'repairs.log'), 'utf8').split('\n').length -
        1
      : 0;
  return { run, state, checkpoint, repairs };
}

test('a handoff during a repair checkpoints verification of that repair, keeping its count', (t) => {
  const f = repairFixture(t);
  const first = f.run();
  assert.equal(first.status, 75, first.stderr);
  assert.match(first.stdout, /during repair 1; the continuation verifies/);
  const saved = f.state();
  assert.equal(saved.phase, 'verify');
  assert.equal(saved.repairAttempts, 1);
  assert.equal(saved.verificationAttempts, 1);
  assert.equal(saved.outcome, 'handoff');

  // The continuation verifies the interrupted repair's work before anything else.
  const second = f.run({ VERIFY_PASS: '1' });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(f.repairs(), 1);
  const done = f.state();
  assert.equal(done.phase, 'done');
  assert.equal(done.repairAttempts, 1);
  assert.equal(done.verificationAttempts, 2);
});

test('a handoff during the last allowed repair still verifies it instead of stopping as budget-exhausted', (t) => {
  const f = repairFixture(t);
  // Four repairs already ran: this run's verification fails and repair 5 is interrupted.
  assert.equal(f.run({ VERIFY_PASS: '1' }).status, 0);
  const state = f.state();
  writeFileSync(
    f.checkpoint,
    JSON.stringify({
      ...state,
      phase: 'verify',
      verificationAttempts: 4,
      repairAttempts: 4,
    }),
  );
  const interrupted = f.run();
  assert.equal(interrupted.status, 75, interrupted.stderr);
  assert.equal(f.state().repairAttempts, 5);
  assert.equal(f.state().phase, 'verify');

  const resumed = f.run({ VERIFY_PASS: '1' });
  assert.equal(resumed.status, 0, resumed.stderr + resumed.stdout);
  assert.doesNotMatch(resumed.stdout, /budget reached before repair/);
  assert.equal(f.state().phase, 'done');
  assert.equal(f.state().repairAttempts, 5);
  assert.equal(f.state().verificationAttempts, 6);
});

// ---------------------------------------------------------------- outdated lockfile

function installFixture(
  t,
  {
    frozenOutput = 'ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"',
  } = {},
) {
  const dir = temp(t);
  const scriptsDir = path.join(dir, 'control', '.github', 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(
    path.join(scripts, 'timed-command.mjs'),
    path.join(scriptsDir, 'timed-command.mjs'),
  );
  copyFileSync(
    path.join(scripts, 'timing.mjs'),
    path.join(scriptsDir, 'timing.mjs'),
  );
  writeFileSync(path.join(scriptsDir, 'assert-current-template.mjs'), '');
  mkdirSync(path.join(dir, 'workspace'));
  mkdirSync(path.join(dir, 'tmp'));
  executable(
    path.join(dir, 'bin', 'pnpm'),
    [
      '#!/usr/bin/env bash',
      'echo "$*" >> "$PNPM_CALLS"',
      'if [[ "$*" == *--frozen-lockfile* && "$*" != *--no-frozen-lockfile* ]]; then',
      `  echo '${frozenOutput}' >&2`,
      '  exit 1',
      'fi',
      '',
    ].join('\n'),
  );
  const calls = path.join(dir, 'calls.log');
  const run = (script, env = {}) => {
    const result = spawnSync('bash', ['-e', '-c', script], {
      cwd: path.join(dir, 'workspace'),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        PNPM_CALLS: calls,
        RUNNER_TEMP: path.join(dir, 'tmp'),
        FACTORY_TIMINGS_FILE: '',
        ...env,
      },
    });
    return {
      ...result,
      calls: existsSync(calls)
        ? readFileSync(calls, 'utf8').trim().split('\n')
        : [],
    };
  };
  return { run };
}

const agentInstall = runOf(
  stepOf('Install application dependencies', jobOf('agent')),
);
const failedPreviewInstall = runOf(
  stepOf('Install application dependencies', jobOf('preview-build-failed')),
);

test('restored work with an outdated lockfile installs again without freezing', (t) => {
  const result = installFixture(t).run(agentInstall, { RESTORED_WORK: 'true' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(result.calls, [
    'install --frozen-lockfile',
    'install --no-frozen-lockfile',
    'exec nocobase skills sync',
  ]);
  assert.match(result.stdout, /does not match its package\.json/);
});

test('a fresh task, or another install error, keeps the frozen install failing', (t) => {
  const fresh = installFixture(t).run(agentInstall, { RESTORED_WORK: 'false' });
  assert.notEqual(fresh.status, 0);
  assert.deepEqual(fresh.calls, ['install --frozen-lockfile']);

  const other = installFixture(t, { frozenOutput: 'ERR_PNPM_FETCH_404' }).run(
    agentInstall,
    { RESTORED_WORK: 'true' },
  );
  assert.notEqual(other.status, 0);
  assert.deepEqual(other.calls, ['install --frozen-lockfile']);
});

test('the restored-work condition covers continuations, recoveries and the published work branch only', () => {
  const step = stepOf('Install application dependencies', jobOf('agent'));
  const condition = /RESTORED_WORK: \$\{\{ (.+) \}\}/.exec(step)[1];
  assert.equal(
    condition,
    "(github.event_name == 'repository_dispatch' && github.event.action == 'code-agent-continue') || inputs.recovery_run_id != '' || needs.prepare.outputs.base_ref == needs.prepare.outputs.work_branch",
  );
  // Final verification of accepted work stays frozen.
  assert.match(
    stepOf('Install application dependencies', jobOf('verify-final')),
    /run: node \.\.\/control\/\.github\/scripts\/timed-command\.mjs install pnpm install --frozen-lockfile\n/,
  );
});

test('the failed preview installs outdated-lockfile work without freezing, nothing else', (t) => {
  const outdated = installFixture(t).run(failedPreviewInstall);
  assert.equal(outdated.status, 0, outdated.stderr);
  assert.deepEqual(outdated.calls, [
    'install --frozen-lockfile',
    'install --no-frozen-lockfile',
  ]);
  const other = installFixture(t, { frozenOutput: 'ERR_PNPM_FETCH_404' }).run(
    failedPreviewInstall,
  );
  assert.notEqual(other.status, 0);
  assert.deepEqual(other.calls, ['install --frozen-lockfile']);
});

// ---------------------------------------------------------------- final test retry

function verifyFixture(t, testFailures) {
  const dir = temp(t);
  const scriptsDir = path.join(dir, 'control', '.github', 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  for (const name of ['verify.sh', 'timed-command.mjs', 'timing.mjs'])
    copyFileSync(path.join(scripts, name), path.join(scriptsDir, name));
  chmodSync(path.join(scriptsDir, 'verify.sh'), 0o755);
  executable(
    path.join(scriptsDir, 'apply-database.sh'),
    '#!/usr/bin/env bash\n',
  );
  mkdirSync(path.join(dir, 'workspace'));
  writeFileSync(path.join(dir, 'config.yml'), '');
  executable(
    path.join(dir, 'bin', 'pnpm'),
    [
      '#!/usr/bin/env bash',
      'echo "$1" >> "$PNPM_CALLS"',
      'if [[ "$1" == test ]]; then',
      '  count=$(( $(cat "$TEST_COUNT" 2>/dev/null || echo 0) + 1 ))',
      '  echo "$count" > "$TEST_COUNT"',
      `  (( count > ${testFailures} )) || exit 1`,
      'fi',
      '',
    ].join('\n'),
  );
  const artifacts = path.join(dir, 'artifacts', 'verify-final');
  const run = (env = {}) => {
    const result = spawnSync(
      path.join(scriptsDir, 'verify.sh'),
      [path.join(dir, 'workspace'), path.join(dir, 'config.yml'), artifacts],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
          PNPM_CALLS: path.join(dir, 'calls.log'),
          TEST_COUNT: path.join(dir, 'test-count'),
          FACTORY_SKIP_BROWSER: '1',
          FACTORY_TIMINGS_FILE: path.join(dir, 'timings.jsonl'),
          ...env,
        },
      },
    );
    const calls = readFileSync(path.join(dir, 'calls.log'), 'utf8')
      .trim()
      .split('\n');
    return { ...result, calls, artifacts, dir };
  };
  return { run };
}

test('final verification runs a failed test check once more and records it', (t) => {
  const result = verifyFixture(t, 1).run({ FACTORY_RETRY_TEST_ONCE: '1' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.calls.filter((call) => call === 'test').length, 2);
  assert.match(result.stdout, /::warning::The test check failed \(exit 1\)/);
  assert.equal(
    readFileSync(path.join(result.artifacts, 'test-retried'), 'utf8'),
    'test exit 1\n',
  );
});

test('a test check failing twice still fails final verification, and nothing retries without the flag', (t) => {
  const twice = verifyFixture(t, 2).run({ FACTORY_RETRY_TEST_ONCE: '1' });
  assert.notEqual(twice.status, 0);
  assert.equal(twice.calls.filter((call) => call === 'test').length, 2);
  assert.equal(
    readFileSync(
      path.join(twice.dir, 'artifacts', 'last-failed-stage'),
      'utf8',
    ),
    'test\n',
  );

  const plain = verifyFixture(t, 1).run();
  assert.notEqual(plain.status, 0);
  assert.equal(plain.calls.filter((call) => call === 'test').length, 1);
});

test('only final verification sets the single test retry', () => {
  assert.match(
    stepOf('Independently verify the applied patch', jobOf('verify-final')),
    /FACTORY_RETRY_TEST_ONCE: '1'/,
  );
  assert.equal(workflow.match(/FACTORY_RETRY_TEST_ONCE/g).length, 1);
  assert.doesNotMatch(
    readFileSync(path.join(scripts, 'verify-and-repair.sh'), 'utf8'),
    /FACTORY_RETRY_TEST_ONCE/,
  );
});

// ---------------------------------------------------------------- prepare skips

test('Issue events of preset and maintenance Issues start no prepare job', () => {
  const condition = /\n {4}if: >-\n((?: {6}.+\n)+)/.exec(jobOf('prepare'))[1];
  assert.match(condition, /github\.event_name != 'issues' \|\|/);
  for (const label of ['factory:external', 'factory:preset', 'factory:manual'])
    assert.match(
      condition,
      new RegExp(
        `!contains\\(github\\.event\\.issue\\.labels\\.\\*\\.name, '${label}'\\)`,
      ),
    );
});

test('the Issue form states the task limits', () => {
  const form = readFileSync(
    path.join(root, '.github/ISSUE_TEMPLATE/code-agent-task.yml'),
    'utf8',
  );
  assert.doesNotMatch(form, /不限修复次数/);
  assert.match(form, /最多修复 5 次/);
});
