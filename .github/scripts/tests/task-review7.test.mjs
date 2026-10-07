import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
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
import { continuationBase } from '../handoff-control.mjs';
import { validateRecovery } from '../handoff-recovery.mjs';
import { initialize, saveState } from '../pipeline-state.mjs';
import { CORE_JOB_TIMEOUT_MINUTES, jobOutcome } from '../task-progress.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(
  path.resolve(scripts, '../workflows/code-agent-task.yml'),
  'utf8',
);
const job = (name) =>
  workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const step = (name) =>
  workflow.split(`- name: ${name}\n`)[1].split(/\n {6}- (?:name|uses): /)[0];
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

function temp(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-review7-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// verify.sh with a stub pnpm that fails the named command and records calls.
function verify(t, failing) {
  const root = temp(t);
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const log = path.join(root, 'calls.log');
  writeFileSync(
    path.join(bin, 'pnpm'),
    `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(log)}\n[[ "$1" == ${JSON.stringify(failing)} ]] && exit 1\nexit 0\n`,
  );
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace);
  writeFileSync(path.join(root, 'config.yml'), '');
  const artifacts = path.join(root, 'state', 'verify-1');
  const result = spawnSync(
    'bash',
    [
      path.join(scripts, 'verify.sh'),
      workspace,
      path.join(root, 'config.yml'),
      artifacts,
    ],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FACTORY_SKIP_BROWSER: '1',
        FACTORY_TIMINGS_FILE: path.join(root, 't.jsonl'),
      },
      encoding: 'utf8',
    },
  );
  const stage = path.join(root, 'state', 'last-failed-stage');
  return {
    status: result.status,
    calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
    stage: existsSync(stage) ? readFileSync(stage, 'utf8').trim() : null,
  };
}

test('verification checks the lockfile first, as a stage the repair loop can hand to the agent', (t) => {
  const stale = verify(t, 'install');
  assert.notEqual(stale.status, 0);
  assert.equal(stale.stage, 'lockfile');
  // Lockfile-only and frozen: no node_modules change, no lifecycle scripts.
  assert.deepEqual(stale.calls, [
    'install --frozen-lockfile --lockfile-only --prefer-offline --ignore-scripts',
  ]);
  const later = verify(t, 'format:check');
  assert.equal(later.stage, 'format:check');
  assert.equal(
    later.calls[0],
    'install --frozen-lockfile --lockfile-only --prefer-offline --ignore-scripts',
  );
  // A retried repair round re-runs a failed lockfile stage first.
  assert.match(
    readFileSync(path.join(scripts, 'verify.sh'), 'utf8'),
    /lockfile\|format:check\|lint\|typecheck\|test\) run_check "\$previous"/,
  );
});

async function recoveryFixture(t) {
  const root = temp(t);
  const repository = 'gchust/nb3-factory';
  const task = {
    schemaVersion: 1,
    repository,
    controlSha: A,
    issue: { number: 182 },
    run: { id: 12345, attempt: 1 },
    workBranch: 'agent/issue-182',
    applicationBase: { ref: 'issues-182', sha: B },
    task: {
      targetBranch: 'issues-182',
      requirements: 'Customer list',
      acceptanceCriteria: 'B01. QA',
      sampleData: 'yes',
    },
  };
  const state = initialize(path.join(root, 'pipeline-state.json'), task);
  Object.assign(state, {
    controlSha: A,
    phase: 'implementation',
    outcome: 'failed',
    executionId: '12345:1',
  });
  const patch = Buffer.from('patch');
  state.patchHash = createHash('sha256').update(patch).digest('hex');
  saveState(path.join(root, 'pipeline-state.json'), state);
  return {
    task,
    checkpointTask: structuredClone(task),
    state,
    patch,
    event: {
      inputs: { issue_number: '182', recovery_run_id: '12345' },
      repository: { full_name: repository },
    },
    run: {
      id: 12345,
      run_attempt: 2,
      path: '.github/workflows/code-agent-task.yml',
      head_repository: { full_name: repository },
      event: 'issues',
      status: 'completed',
      conclusion: 'failure',
    },
  };
}

test('a rejected Re-run leaves the first attempt recoverable, and only that one', async (t) => {
  const f = await recoveryFixture(t);
  assert.equal(validateRecovery(f).recovery.sourceAttempt, 1);
  // The checkpoint must prove it is the recorded attempt's own state.
  assert.throws(
    () =>
      validateRecovery({ ...f, state: { ...f.state, executionId: '12345:2' } }),
    /source run attempt/,
  );
  assert.throws(
    () => validateRecovery({ ...f, state: { ...f.state, executionId: null } }),
    /source run attempt/,
  );
  // A checkpoint never belongs to a later attempt than the run has.
  f.task.run = f.checkpointTask.run = { id: 12345, attempt: 3 };
  assert.throws(() => validateRecovery(f), /source run attempt/);
});

test('a continuation keeps the base its source run recorded', () => {
  const previous = { applicationBase: { ref: 'apps/demo', sha: B } };
  assert.deepEqual(continuationBase(previous, 'apps/demo', C), {
    ref: 'apps/demo',
    sha: B,
    pinned: true,
  });
  assert.deepEqual(continuationBase(previous, 'apps/demo', B), {
    ref: 'apps/demo',
    sha: B,
    pinned: false,
  });
  assert.deepEqual(continuationBase(null, 'apps/demo', C), {
    ref: 'apps/demo',
    sha: C,
    pinned: false,
  });
  assert.throws(
    () => continuationBase(previous, 'agent/issue-2', C),
    /base ref changed/,
  );
  const base = step('Resolve the application base');
  assert.match(base, /handoff-control\.mjs base/);
  assert.match(base, /--previous-task previous-task\/task-metadata\.json/);
  assert.match(
    job('prepare'),
    /base_sha: \$\{\{ steps\.base\.outputs\.sha \}\}/,
  );
  assert.match(
    job('prepare'),
    /base_ref: \$\{\{ steps\.base\.outputs\.ref \}\}/,
  );
});

test('progress labels a core job cancelled at its limit as a timeout', () => {
  const at = (minutes) => ({
    started_at: '2026-10-06T00:00:00Z',
    completed_at: new Date(
      Date.parse('2026-10-06T00:00:00Z') + minutes * 60_000,
    ).toISOString(),
  });
  assert.equal(
    jobOutcome({ name: 'agent', conclusion: 'cancelled', ...at(360) }),
    'timed_out',
  );
  assert.equal(
    jobOutcome({ name: 'agent', conclusion: 'cancelled', ...at(60) }),
    'cancelled',
  );
  assert.equal(
    jobOutcome({ name: 'verify-final', conclusion: 'cancelled', ...at(89) }),
    'timed_out',
  );
  assert.equal(
    jobOutcome({ name: 'agent', conclusion: 'failure', ...at(360) }),
    'failure',
  );
  for (const [name, minutes] of Object.entries(CORE_JOB_TIMEOUT_MINUTES))
    assert.match(
      job(name),
      new RegExp(`\\n {4}timeout-minutes: ${minutes}\\n`),
      name,
    );
});

test('a continuation that fails during setup still seals its restored work', () => {
  const mark = step('Mark a continuation that failed during setup');
  assert.match(mark, /failure\(\) && steps\.resume\.outcome == 'success'/);
  assert.match(
    mark,
    /steps\.implementation\.outcome == 'skipped' && steps\.verify\.outcome == 'skipped'/,
  );
  assert.match(mark, /pipeline-state\.mjs outcome "\$state" failed/);
  assert.match(
    step('Create deterministic patch'),
    /failure\(\) && steps\.setup_failure\.outcome == 'success'/,
  );
});

test('a failed verification hands its build to the preview instead of building twice', () => {
  const upload = step("Upload the failed verification's build");
  assert.match(
    upload,
    /if: failure\(\) && steps\.failed_dist\.outcome == 'success'/,
  );
  assert.match(
    upload,
    /name: factory-dist-\$\{\{ needs\.prepare\.outputs\.issue_number \}\}/,
  );
  assert.match(
    job('verify-final'),
    /failed_dist: \$\{\{ steps\.failed_dist_upload\.outcome == 'success' \}\}/,
  );
  const preview = job('preview-build-failed');
  assert.match(
    preview,
    /needs: \[prepare, agent, verify-final, publish-failed\]/,
  );
  assert.match(preview, /needs\.verify-final\.outputs\.failed_dist != 'true'/);
  for (const name of [
    'Summarize failed preview packaging timings',
    'Upload failed preview packaging diagnostics',
  ])
    assert.match(step(name), /continue-on-error: true/, name);
});

test('report-failure and publish-reply check out only the scripts they run', () => {
  for (const name of ['report-failure', 'publish-reply'])
    assert.match(job(name), /sparse-checkout: \.github\/scripts\n/, name);
});

test('a rejected Re-run stops first and uploads no checkpoint or patch copy', () => {
  const agent = job('agent');
  const steps = agent.split('\n      - name: ').slice(1);
  // Only the control checkout, which the guard reads, comes before it.
  assert.match(steps[0], /^Check out factory control plane\n/);
  assert.match(
    steps[1],
    /^Reject a GitHub Re-run of this job\n {8}id: rerun_guard\n/,
  );
  assert.match(steps[1], /\(\( \$\{GITHUB_RUN_ATTEMPT:-1\} > 1 \)\)/);
  assert.match(steps[1], /exit 1/);
  for (const name of [
    'Upload Code Agent patch and diagnostics',
    'Stage the patch for downstream jobs',
    'Upload the patch for downstream jobs',
  ])
    assert.match(
      step(name),
      /if: always\(\) && steps\.rerun_guard\.outcome == 'success'\n/,
      name,
    );
  // No step of the agent job uploads an artifact without the guard.
  const uploads = agent
    .split('\n      - ')
    .filter((s) => s.includes('actions/upload-artifact@'));
  assert.ok(uploads.length >= 2);
  for (const upload of uploads)
    assert.match(
      upload,
      /steps\.rerun_guard\.outcome == 'success'/,
      upload.split('\n')[0],
    );
  assert.match(
    agent,
    /rerun_rejected: \$\{\{ steps\.rerun_guard\.outcome == 'failure' \}\}/,
  );
  assert.match(
    job('report-failure'),
    /FACTORY_RERUN_REJECTED: \$\{\{ needs\.agent\.outputs\.rerun_rejected \}\}/,
  );
});

test('restored work that failed during setup gets no build review', () => {
  assert.match(
    step('Review build quality and framework feedback'),
    /steps\.setup_failure\.outcome != 'success'/,
  );
});

test('repeated pnpm errors such as an outdated lockfile count as one failure identity', async () => {
  const { observedFailures } = await import('../task-policy.mjs');
  for (const log of [
    '[ERR_PNPM_OUTDATED_LOCKFILE] Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with <ROOT>/package.json',
    ' ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date',
  ]) {
    const [failure, ...rest] = observedFailures(
      'build',
      null,
      log,
      { task: {} },
      'lockfile',
    );
    assert.equal(rest.length, 0);
    assert.equal(failure.criterion, 'lockfile');
    assert.match(failure.symptom, /err_pnpm_outdated_lockfile/);
  }
});
