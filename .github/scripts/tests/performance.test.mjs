import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
const scripts = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-performance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, value, mode) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value, { mode });
  return target;
}

test('timing preserves failure exit status and never stores command arguments', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'timings.jsonl');
  const result = spawnSync(
    process.execPath,
    [
      path.join(scripts, 'timed-command.mjs'),
      'test',
      process.execPath,
      '-e',
      'process.exit(7)',
      'secret-argument',
    ],
    { env: { ...process.env, FACTORY_TIMINGS_FILE: file }, encoding: 'utf8' },
  );
  assert.equal(result.status, 7);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(record.status, 7);
  assert.ok(record.durationMs >= 0);
  assert.ok(!JSON.stringify(record).includes('secret-argument'));
});

test('fast checks stop expensive work; repair prioritizes failed check without omitting any checks', (t) => {
  const root = fixture(t);
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace);
  spawnSync('git', ['init', workspace]);
  spawnSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'base',
    ],
    { cwd: workspace },
  );
  const config = write(root, 'runtime.yml', 'config');
  const commands = path.join(root, 'commands');
  write(
    root,
    'bin/pnpm',
    '#!/usr/bin/env bash\n[[ -z "${FACTORY_TEST_API_KEY:-}${FACTORY_TEST_ADMIN_KEY:-}" ]] || exit 44\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n[[ "$1" != "${FAIL_CHECK:-}" ]]\n',
    0o755,
  );
  const env = {
    ...process.env,
    PATH: `${root}/bin:${process.env.PATH}`,
    COMMAND_LOG: commands,
    FACTORY_SKIP_BROWSER: '1',
    FACTORY_RETRY_FAILED_CHECK: '1',
    FACTORY_TEST_API_KEY: 'isolated-api-test-fixture',
    FACTORY_TEST_ADMIN_KEY: 'isolated-admin-test-fixture',
    FACTORY_BUILD_TARGET: 'linux-x64',
    FACTORY_BUILD_NODE_VERSION: '24',
  };
  const run = (attempt, fail = '') =>
    spawnSync(
      'bash',
      [
        path.join(scripts, 'verify.sh'),
        workspace,
        config,
        path.join(root, `artifacts/verify-${attempt}`),
      ],
      { env: { ...env, FAIL_CHECK: fail }, encoding: 'utf8' },
    );
  let result = run(1, 'lint');
  assert.notEqual(result.status, 0);
  assert.deepEqual(readFileSync(commands, 'utf8').trim().split('\n'), [
    'format:check !.github/**',
    'lint --ignore-pattern .github/**',
  ]);
  writeFileSync(commands, '');
  result = run(2);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(commands, 'utf8').trim().split('\n'), [
    'lint --ignore-pattern .github/**',
    'format:check !.github/**',
    'typecheck',
    'test',
    'build --target linux-x64 --node-version 24',
    'exec nocobase db apply',
  ]);
  assert.equal(
    existsSync(path.join(root, 'artifacts/last-failed-stage')),
    false,
  );
});

test('only an archiving verification asks its single build for the tarball', (t) => {
  const root = fixture(t);
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace);
  const config = write(root, 'runtime.yml', 'config');
  const commands = path.join(root, 'commands');
  write(
    root,
    'bin/pnpm',
    '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n',
    0o755,
  );
  const builds = (extra) => {
    writeFileSync(commands, '');
    const result = spawnSync(
      'bash',
      [
        path.join(scripts, 'verify.sh'),
        workspace,
        config,
        path.join(root, 'artifacts'),
      ],
      {
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          COMMAND_LOG: commands,
          FACTORY_SKIP_BROWSER: '1',
          ...extra,
        },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(commands, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('build'));
  };
  assert.deepEqual(builds({}), ['build']);
  assert.deepEqual(builds({ FACTORY_BUILD_ARCHIVE: '1' }), ['build --tar']);
  assert.deepEqual(
    builds({
      FACTORY_BUILD_TARGET: 'linux-x64',
      FACTORY_BUILD_NODE_VERSION: '24',
      FACTORY_BUILD_ARCHIVE: '1',
    }),
    ['build --target linux-x64 --node-version 24 --tar'],
  );
});

test('QA writer rejects bad evidence before saving and retains real failures', (t) => {
  const root = fixture(t);
  const report = path.join(root, 'report.json');
  const input = write(
    root,
    'check.json',
    JSON.stringify({
      criterion: 'Create',
      status: 'failed',
      actions: ['Clicked save'],
      evidence: ['Error visible'],
      screenshots: ['missing.png'],
    }),
  );
  const env = {
    ...process.env,
    FACTORY_BROWSER_METADATA: write(
      root,
      'metadata.json',
      JSON.stringify({ task: { acceptanceCriteria: '1. Create' } }),
    ),
    FACTORY_BROWSER_REPORT: report,
    FACTORY_BROWSER_EVIDENCE_DIR: root,
  };
  const run = () =>
    spawnSync(
      process.execPath,
      [path.join(scripts, 'browser-report-tool.mjs'), 'check', input],
      { env, encoding: 'utf8' },
    );
  assert.notEqual(run().status, 0);
  assert.equal(existsSync(report), false);
  const png = Buffer.alloc(1100);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  write(root, 'missing.png', png);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const draft = JSON.parse(readFileSync(report, 'utf8'));
  assert.equal(draft.passed, false);
  assert.equal(draft.checks[0].status, 'failed');
  assert.equal(run().status, 0);
  assert.equal(JSON.parse(readFileSync(report, 'utf8')).checks.length, 1);
  const metadata = write(
    root,
    'metadata.json',
    JSON.stringify({ task: { acceptanceCriteria: '1. Create' } }),
  );
  const commands = write(
    root,
    'commands.log',
    'open\nsnapshot\nclick\nscreenshot\n',
  );
  const summary = write(
    root,
    'summary.json',
    JSON.stringify({
      passed: false,
      authenticated: true,
      summary: 'Save failed',
      failures: ['Clicked save, error visible'],
    }),
  );
  const finish = () =>
    spawnSync(
      process.execPath,
      [path.join(scripts, 'browser-report-tool.mjs'), 'finish', summary],
      {
        env: {
          ...env,
          FACTORY_BROWSER_METADATA: metadata,
          FACTORY_AGENT_BROWSER_COMMAND_LOG: commands,
        },
        encoding: 'utf8',
      },
    );
  assert.equal(
    finish().status,
    10,
    'observed business defects must reach the repair loop',
  );
  writeFileSync(commands, '');
  assert.equal(
    finish().status,
    2,
    'missing real browser evidence must never pass',
  );
});
