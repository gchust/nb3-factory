// Round-8 review fixes in the task workflow: rejected re-runs, continuation
// bases, failure stages, kept handoff checkpoints and timeout labels.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { initialize, readState, saveState } from '../pipeline-state.mjs';
import { progressOutcome } from '../task-progress.mjs';
import { recordedContinuationBase } from '../task-compat.mjs';

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'),
  'utf8',
);
const job = (name) =>
  workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const step = (name) =>
  workflow.split(`- name: ${name}\n`)[1].split('\n      - ')[0];
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

function dispatch(t, workflows, env) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const log = path.join(root, 'calls.log');
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$3" >> "${log}"\n`,
  );
  chmodSync(path.join(bin, 'gh'), 0o755);
  const result = spawnSync(
    'bash',
    [
      path.resolve(import.meta.dirname, '../dispatch-task-reports.sh'),
      ...workflows,
    ],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'owner/factory',
        SOURCE_RUN_ID: '123',
        SOURCE_ATTEMPT: '2',
        FACTORY_REPORT_REF: 'develop',
        FACTORY_TASK_PUBLISHED: 'true',
        GH_TOKEN: 'fixture',
        GITHUB_STEP_SUMMARY: '',
        ...env,
      },
      encoding: 'utf8',
    },
  );
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    : [];
  return { result, calls };
}

test('a rejected Re-run requests only progress, and its skipped requests still count as handled', (t) => {
  const reports = [
    'report-task-progress.yml',
    'report-task-usage.yml',
    'publish-agent-history.yml',
    'publish-retro.yml',
    'publish-visual-report.yml',
    'deploy-preview.yml',
  ];
  const rejected = dispatch(t, reports, { FACTORY_RERUN_REJECTED: 'true' });
  assert.equal(rejected.result.status, 0, rejected.result.stderr);
  assert.deepEqual(rejected.calls, ['report-task-progress.yml']);
  assert.match(
    rejected.result.stdout,
    /Not requesting report-task-usage\.yml: attempt 2 was a rejected GitHub Re-run/,
  );
  // The comment queue still moves on.
  const queue = dispatch(t, ['comment-build-queue.yml'], {
    FACTORY_RERUN_REJECTED: 'true',
    ISSUE_NUMBER: '7',
  });
  assert.deepEqual(queue.calls, ['comment-build-queue.yml']);
  // An ordinary attempt requests every report.
  const ordinary = dispatch(t, reports, { FACTORY_RERUN_REJECTED: 'false' });
  assert.deepEqual(ordinary.calls, reports);
  // The workflow passes the agent job's verdict to every request step.
  assert.match(
    job('dispatch-reports'),
    /FACTORY_RERUN_REJECTED: \$\{\{ needs\.agent\.outputs\.rerun_rejected \}\}/,
  );
  assert.match(job('dispatch-reports'), /env: &report-dispatch-env/);
  // The gate counts a step by its success, which a skipped request keeps.
  const gate = readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../workflows/report-dispatch-gate.yml',
    ),
    'utf8',
  );
  assert.match(gate, /\.conclusion == "success"/);
});

test('a comment reply is not answered after a rejected Re-run', () => {
  assert.match(
    job('reply'),
    /needs\.agent\.outputs\.handoff != 'true' &&\n\s+needs\.agent\.outputs\.rerun_rejected != 'true'/,
  );
});

test('Re-run all jobs stops before prepare records anything once the task was saved', () => {
  const prepare = job('prepare');
  const steps = prepare.split('\n      - name: ').slice(1);
  assert.match(steps[0], /^Reject a GitHub Re-run of a prepared task\n/);
  assert.match(steps[0], /if: github\.run_attempt > 1/);
  assert.match(steps[0], /actions\/runs\/\$GITHUB_RUN_ID\/artifacts/);
  assert.match(steps[0], /\^factory-task-\[0-9\]\+\$/);
  assert.match(steps[0], /recovery_run_id=\$\{GITHUB_RUN_ID\}/);
  assert.match(steps[0], /exit 1/);
  // actions: read lets it list this run's artifacts.
  assert.match(prepare, /permissions:\n {6}actions: read\n/);
  // Nothing before it labels the Issue or saves the task.
  assert.doesNotMatch(steps[0], /prepare-task|upload-artifact|mark-failure/);
});

test('a continuation stops when its own task branch moved, and keeps the target-branch base', () => {
  const previous = {
    workBranch: 'agent/issue-7',
    applicationBase: { ref: 'agent/issue-7', sha: B },
  };
  assert.throws(
    () => continuationBase(previous, 'agent/issue-7', C),
    /agent\/issue-7 moved since the source run/,
  );
  assert.deepEqual(continuationBase(previous, 'agent/issue-7', B), {
    ref: 'agent/issue-7',
    sha: B,
    pinned: false,
  });
  const target = {
    workBranch: 'agent/issue-7',
    applicationBase: { ref: 'apps/demo', sha: B },
  };
  assert.deepEqual(continuationBase(target, 'apps/demo', C), {
    ref: 'apps/demo',
    sha: B,
    pinned: true,
  });
});

test("a continuation's status comment shows the base it keeps", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-base-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'task-metadata.json');
  writeFileSync(
    file,
    JSON.stringify({ applicationBase: { ref: 'apps/demo', sha: B } }),
  );
  assert.equal(recordedContinuationBase(file, 'apps/demo'), B);
  assert.equal(recordedContinuationBase(file, 'agent/issue-7'), null);
  assert.equal(
    recordedContinuationBase(path.join(root, 'missing.json'), 'apps/demo'),
    null,
  );
  assert.equal(recordedContinuationBase('', 'apps/demo'), null);
  assert.match(
    step('Resolve Issue and target branch'),
    /FACTORY_PREVIOUS_TASK: \$\{\{ github\.event\.action == 'code-agent-continue' && 'previous-task\/task-metadata\.json' \|\| '' \}\}/,
  );
});

test('verify.sh records the build and database stages before they run', () => {
  const verify = readFileSync(
    path.resolve(import.meta.dirname, '../verify.sh'),
    'utf8',
  );
  const build = verify.indexOf('printf \'%s\\n\' build >"$failed_stage"');
  const buildCommand = verify.indexOf('timed-command.mjs" build pnpm build');
  const database = verify.indexOf('printf \'%s\\n\' database >"$failed_stage"');
  const databaseCommand = verify.indexOf('"$script_dir/apply-database.sh"');
  const cleared = verify.indexOf('rm -f "$failed_stage"', databaseCommand);
  assert.ok(build > 0 && build < buildCommand, 'build stage before the build');
  assert.ok(
    buildCommand < database && database < databaseCommand,
    'database stage before the database step',
  );
  assert.ok(cleared > databaseCommand, 'cleared once both passed');
  assert.ok(
    cleared < verify.indexOf('FACTORY_SKIP_BROWSER'),
    'cleared before the early exit',
  );
  // The check loop still runs first, lockfile included.
  assert.ok(
    verify.indexOf('for check in lockfile format:check lint typecheck test') <
      build,
  );
});

test('a failure without a stage file is never filed under an earlier round', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-stage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadataFile = path.join(root, 'task-metadata.json');
  const metadata = { task: { acceptanceCriteria: 'B02. Save customer' } };
  writeFileSync(metadataFile, JSON.stringify(metadata));
  const file = path.join(root, 'pipeline-state.json');
  initialize(file, metadata);
  const state = readState(file);
  state.failureStage = 'lint';
  saveState(file, state);
  const log = path.join(root, 'build.log');
  writeFileSync(log, 'Error: Cannot find module x\n');
  for (const [kind, expected] of [
    ['build', 'build'],
    ['browser', 'browser'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve(import.meta.dirname, '../pipeline-state.mjs'),
        'capture',
        file,
        kind,
        log,
        '',
        '',
        metadataFile,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '' },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readState(file).failureStage, expected, kind);
  }
  // A written stage still wins.
  writeFileSync(path.join(root, 'last-failed-stage'), 'typecheck\n');
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(import.meta.dirname, '../pipeline-state.mjs'),
      'capture',
      file,
      'build',
      log,
      '',
      '',
      metadataFile,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readState(file).failureStage, 'typecheck');
});

test('continuation downloads are retried once, and a setup failure before restore keeps the checkpoint', () => {
  for (const [first, retry, id] of [
    [
      'Download handoff checkpoint',
      'Retry the handoff checkpoint download',
      'checkpoint_download',
    ],
    [
      'Download normalized task',
      'Retry the normalized task download',
      'task_download',
    ],
  ]) {
    assert.match(step(first), new RegExp(`id: ${id}\\n`));
    assert.match(step(first), /continue-on-error: true/);
    assert.match(
      step(retry),
      new RegExp(`if: steps\\.${id}\\.outcome == 'failure'`),
    );
    assert.doesNotMatch(step(retry), /continue-on-error/);
  }
  const keep = step('Keep the handed-off checkpoint');
  assert.match(keep, /id: keep_checkpoint/);
  assert.match(
    keep,
    /failure\(\) && steps\.rerun_guard\.outcome == 'success' && steps\.resume\.outcome != 'success'/,
  );
  assert.match(keep, /github\.event\.action == 'code-agent-continue'/);
  assert.match(
    keep,
    /steps\.checkpoint_download\.outcome == 'success' \|\| steps\.checkpoint_retry\.outcome == 'success'/,
  );
  assert.match(
    keep,
    /steps\.task_download\.outcome == 'success' \|\| steps\.task_retry\.outcome == 'success'/,
  );
  assert.match(keep, /cp handoff\/agent\.patch handoff\/pipeline-state\.json/);
  assert.match(keep, /cp task\/task-metadata\.json/);
  // The source run's elapsed time is kept, never restarted from this job.
  assert.match(
    keep,
    /env -u FACTORY_JOB_STARTED_EPOCH_SECONDS \\\n\s+node control\/\.github\/scripts\/pipeline-state\.mjs outcome "\$artifacts\/pipeline-state\.json" failed/,
  );
  // It runs before the patch would be created, and counts as a patch and a checkpoint.
  assert.ok(
    workflow.indexOf('- name: Keep the handed-off checkpoint') <
      workflow.indexOf('- name: Create deterministic patch'),
  );
  assert.match(
    job('agent'),
    /patch_available: \$\{\{ steps\.patch\.outcome == 'success' \|\| steps\.keep_checkpoint\.outcome == 'success' \}\}/,
  );
  assert.match(
    step('Confirm the handoff checkpoint'),
    /steps\.keep_checkpoint\.outcome == 'success'/,
  );
});

test('a kept checkpoint passes recovery validation from the failed continuation', async () => {
  const { validateRecovery } = await import('../handoff-recovery.mjs');
  const { createHash } = await import('node:crypto');
  const { inputHash } = await import('../pipeline-state.mjs');
  const patch = Buffer.from('diff --git a/x b/x\n');
  const task = {
    schemaVersion: 1,
    repository: 'owner/factory',
    issue: { number: 7 },
    workBranch: 'agent/issue-7',
    controlSha: C,
    run: { id: 900, attempt: 1 },
    applicationBase: { ref: 'apps/demo', sha: B },
    task: {
      targetBranch: 'apps/demo',
      acceptanceCriteria: 'B02. Save customer',
    },
  };
  // The source run's state, handed off and kept with outcome failed.
  const state = {
    controlSha: C,
    inputHash: inputHash(task),
    outcome: 'failed',
    phase: 'qa-full',
    executionId: '800:1',
    patchHash: createHash('sha256').update(patch).digest('hex'),
  };
  const run = {
    id: 900,
    path: '.github/workflows/code-agent-task.yml',
    head_repository: { full_name: 'owner/factory' },
    event: 'repository_dispatch',
    status: 'completed',
    conclusion: 'failure',
    run_attempt: 1,
  };
  const event = {
    inputs: { issue_number: '7', recovery_run_id: '900' },
    repository: { full_name: 'owner/factory' },
  };
  const result = validateRecovery({
    event,
    run,
    task,
    checkpointTask: structuredClone(task),
    state,
    patch,
  });
  assert.equal(result.recovery.sourceRunId, 900);
  assert.equal(result.recovery.baseSha, B);
});

test('a completed run concluded cancelled or failed by a timeout is labelled a timeout', () => {
  const started = '2026-10-07T00:00:00Z';
  const agentTimedOut = {
    name: 'agent',
    status: 'completed',
    conclusion: 'cancelled',
    started_at: started,
    completed_at: '2026-10-07T06:00:00Z',
  };
  const agentCancelled = {
    name: 'agent',
    status: 'completed',
    conclusion: 'cancelled',
    started_at: started,
    completed_at: '2026-10-07T01:00:00Z',
  };
  for (const conclusion of ['cancelled', 'failure'])
    assert.equal(
      progressOutcome({ status: 'completed', conclusion }, [agentTimedOut]),
      'timed_out',
      conclusion,
    );
  assert.equal(
    progressOutcome({ status: 'completed', conclusion: 'cancelled' }, [
      agentCancelled,
    ]),
    'cancelled',
  );
  assert.equal(
    progressOutcome({ status: 'completed', conclusion: 'failure' }, [
      { ...agentCancelled, conclusion: 'failure' },
    ]),
    'failure',
  );
  // A delivery stays a delivery, and an in-progress run still reads its jobs.
  assert.equal(
    progressOutcome({ status: 'completed', conclusion: 'success' }, [
      { name: 'publish', conclusion: 'success' },
    ]),
    'delivered',
  );
  assert.equal(
    progressOutcome({ status: 'in_progress', conclusion: null }, [
      agentTimedOut,
    ]),
    'timed_out',
  );
});

test('the Re-run comment on sample admission no longer claims a reachable re-run', () => {
  assert.doesNotMatch(
    workflow,
    /"Re-run failed jobs" reuses prepare's outputs/,
  );
});
