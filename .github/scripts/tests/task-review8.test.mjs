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
  symlinkSync,
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

test('a rejected Re-run requests no report, and its skipped requests still count as handled', (t) => {
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
  assert.deepEqual(rejected.calls, []);
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
    /FACTORY_RERUN_REJECTED: \$\{\{ needs\.agent\.outputs\.rerun_rejected == 'true'/,
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

// Runs the prepare guard's script with a stub gh that answers each attempt's
// agent job (`null` = no agent job started, 'skipped', 'failure', ...).
function runPrepareGuard(t, attempts, { failApi = false } = {}) {
  const guard = job('prepare')
    .split('- name: Reject a GitHub Re-run of a prepared task\n')[1]
    .split('\n      - ')[0];
  const script = guard.split('run: |\n')[1].replace(/^ {10}/gm, '');
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  // gh api ... /attempts/N/jobs --jq <filter>: print "agent" when that attempt ran it.
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env node
if (${failApi}) process.exit(1);
const url = process.argv.find((a) => a.includes('/attempts/'));
const n = Number(/attempts\\/(\\d+)\\//.exec(url)[1]);
const agent = ${JSON.stringify(attempts)}[n - 1];
if (agent && agent !== 'skipped') console.log('agent');
`,
  );
  chmodSync(path.join(bin, 'gh'), 0o755);
  const output = path.join(root, 'output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', script], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'owner/factory',
      GITHUB_RUN_ID: '900',
      GITHUB_RUN_ATTEMPT: String(attempts.length + 1),
      GITHUB_OUTPUT: output,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: readFileSync(output, 'utf8'),
    stdout: result.stdout,
  };
}

test('Re-run all jobs stops before prepare records anything once an earlier attempt ran the build', (t) => {
  const prepare = job('prepare');
  const steps = prepare.split('\n      - name: ').slice(1);
  assert.match(steps[0], /^Reject a GitHub Re-run of a prepared task\n/);
  assert.match(steps[0], /id: rerun_guard\n/);
  assert.match(steps[0], /if: github\.run_attempt > 1/);
  // Nothing before it labels the Issue or saves the task.
  assert.doesNotMatch(steps[0], /prepare-task|upload-artifact|mark-failure/);
  assert.match(prepare, /permissions:\n {6}actions: read\n/);
  assert.match(
    prepare,
    /rerun_rejected: \$\{\{ steps\.rerun_guard\.outputs\.rerun_rejected \}\}/,
  );

  const built = runPrepareGuard(t, ['failure']);
  assert.equal(built.status, 1);
  assert.equal(built.output, 'rerun_rejected=true\n');
  assert.match(built.stdout, /recovery_run_id=900/);
  // The build ran in an earlier attempt than the last one.
  assert.equal(runPrepareGuard(t, ['success', null]).status, 1);
  // A question round (agent skipped) or a build that never started re-runs.
  for (const attempts of [['skipped'], [null], ['skipped', 'skipped']]) {
    const run = runPrepareGuard(t, attempts);
    assert.equal(run.status, 0, JSON.stringify(attempts));
    assert.equal(run.output, 'rerun_rejected=false\n');
  }
  // An unreadable job list stops the re-run, which changes nothing, and fails
  // closed toward the reports too: they are still marked handled.
  const unreadable = runPrepareGuard(t, ['skipped'], { failApi: true });
  assert.equal(unreadable.status, 1);
  assert.equal(unreadable.output, 'rerun_rejected=true\n');
});

test('a re-run prepare rejected still marks every report handled and requests none', (t) => {
  const dispatchJob = job('dispatch-reports');
  assert.match(
    dispatchJob,
    /needs\.prepare\.outputs\.rerun_rejected == 'true'\)/,
  );
  assert.match(
    dispatchJob,
    /FACTORY_RERUN_REJECTED: \$\{\{ needs\.agent\.outputs\.rerun_rejected == 'true' \|\| needs\.prepare\.outputs\.rerun_rejected == 'true' \}\}/,
  );
  assert.match(
    dispatchJob,
    /FACTORY_PREPARE_REJECTED: \$\{\{ needs\.prepare\.outputs\.rerun_rejected == 'true' \}\}/,
  );
  // The comment queue step needs a claimed comment, which a rejected prepare never has.
  assert.match(
    dispatchJob,
    /Request comment-build-queue\.yml\n[^\n]*\n\s+if: \$\{\{ !cancelled\(\) && needs\.prepare\.outputs\.build_comment_id != '' \}\}/,
  );
  const rejected = dispatch(
    t,
    [
      'report-task-progress.yml',
      'report-task-usage.yml',
      'publish-agent-history.yml',
    ],
    {
      FACTORY_RERUN_REJECTED: 'true',
      FACTORY_PREPARE_REJECTED: 'true',
    },
  );
  assert.equal(rejected.result.status, 0, rejected.result.stderr);
  assert.deepEqual(rejected.calls, []);
  assert.match(rejected.result.stdout, /prepare rejected attempt 2/);
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
  // A repair round reads the previous stage, then files format:auto under its own.
  const read = verify.indexOf('previous="$(cat "$failed_stage")"');
  const format = verify.indexOf('printf \'%s\\n\' format >"$failed_stage"');
  const formatAuto = verify.indexOf('format:auto node');
  const retry = verify.indexOf('run_check "$previous"');
  assert.ok(
    read > 0 && read < format && format < formatAuto && formatAuto < retry,
  );
  // The full-QA database reset writes its stage, and clears it when it passed.
  const repair = readFileSync(
    path.resolve(import.meta.dirname, '../verify-and-repair.sh'),
    'utf8',
  );
  const stage = repair.indexOf(
    'printf \'%s\\n\' database >"$artifact_dir/last-failed-stage"',
  );
  const reset = repair.indexOf(
    '"$control_dir/.github/scripts/apply-database.sh"',
    stage,
  );
  assert.ok(stage > 0 && reset > stage);
  assert.match(
    repair.slice(reset),
    /else\n\s+rm -f "\$artifact_dir\/last-failed-stage"\n/,
  );
});

test('a failing format:auto in a repair round is filed under its own stage', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-format-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // A copy of verify.sh beside stub helpers whose format step fails.
  const scripts = path.join(root, 'scripts');
  mkdirSync(scripts);
  writeFileSync(
    path.join(scripts, 'verify.sh'),
    readFileSync(path.resolve(import.meta.dirname, '../verify.sh')),
  );
  writeFileSync(
    path.join(scripts, 'timed-command.mjs'),
    "import { spawnSync } from 'node:child_process';\nconst [, , , ...cmd] = process.argv;\nprocess.exit(spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' }).status ?? 1);\n",
  );
  writeFileSync(path.join(scripts, 'format-changes.mjs'), 'process.exit(3);\n');
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace);
  const artifacts = path.join(root, 'artifacts', 'verification-1');
  mkdirSync(artifacts, { recursive: true });
  const stageFile = path.join(root, 'artifacts', 'last-failed-stage');
  writeFileSync(stageFile, 'lint\n');
  writeFileSync(path.join(root, 'config.yml'), '');
  const result = spawnSync(
    'bash',
    [
      path.join(scripts, 'verify.sh'),
      workspace,
      path.join(root, 'config.yml'),
      artifacts,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, FACTORY_RETRY_FAILED_CHECK: '1' },
    },
  );
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(stageFile, 'utf8'), 'format\n');
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
  // The whole checkpoint, regular files only, without the handoff request.
  assert.match(
    keep,
    /\(cd handoff && find \. -type f ! -path \.\/handoff\.json ! -name 'live-progress\.\*' \\\n\s+! -name 'agent\*\.jsonl\.result\.json' ! -name 'timings\.jsonl' \\\n\s+-exec cp --parents \{\} "\$artifacts" \\;\)/,
  );
  assert.match(keep, /cp task\/task-metadata\.json/);
  // A refused control-plane verification keeps nothing.
  assert.match(keep, /steps\.verify_control\.outcome == 'success'/);
  // The task download (with its retry) precedes verification and the patch
  // restore, so a failing patch restore is kept.
  const agentJob = job('agent');
  assert.ok(
    agentJob.indexOf('- name: Retry the normalized task download') <
      agentJob.indexOf('- name: Verify the pinned handoff control plane'),
  );
  assert.ok(
    agentJob.indexOf('- name: Verify the pinned handoff control plane') <
      agentJob.indexOf('- name: Restore handoff checkpoint'),
  );
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

test('only a checkpoint this run could have restored is kept', async (t) => {
  const { createHash } = await import('node:crypto');
  const { inputHash, keepRefusal } = await import('../pipeline-state.mjs');
  const metadata = {
    issue: { number: 7 },
    task: {
      targetBranch: 'apps/demo',
      acceptanceCriteria: 'B02. Save customer',
    },
  };
  const patch = Buffer.from('diff --git a/x b/x\n');
  const state = {
    inputHash: inputHash(metadata),
    patchHash: createHash('sha256').update(patch).digest('hex'),
    controlSha: C,
    phase: 'qa-full',
  };
  // A transient failure (download, install, admission API) keeps it.
  assert.equal(keepRefusal(state, patch, metadata, C), null);
  for (const [name, args, reason] of [
    [
      'input edited',
      [
        state,
        patch,
        {
          ...metadata,
          task: { ...metadata.task, acceptanceCriteria: 'B02. Other' },
        },
        C,
      ],
      /business input has changed/,
    ],
    [
      'patch changed',
      [state, Buffer.from('other'), metadata, C],
      /patch hash does not match/,
    ],
    [
      'no patch hash',
      [{ ...state, patchHash: undefined }, patch, metadata, C],
      /patch hash does not match/,
    ],
    ['other control plane', [state, patch, metadata, B], /factory SHA differs/],
    [
      'unknown control plane',
      [state, patch, metadata, undefined],
      /factory SHA differs/,
    ],
    [
      'stopped',
      [
        { ...state, stopReason: { code: 'repeated-failure' } },
        patch,
        metadata,
        C,
      ],
      /stopped for diagnosis/,
    ],
    [
      'finished',
      [{ ...state, phase: 'done' }, patch, metadata, C],
      /already finished verification/,
    ],
    [
      'budget changed',
      [
        {
          ...state,
          budget: {
            maxRepairAttempts: 3,
            maxActiveSeconds: 3600,
            maxContinuations: 1,
          },
        },
        patch,
        {
          ...metadata,
          evaluation: {
            budget: {
              maxRepairAttempts: 2,
              maxActiveSeconds: 3600,
              maxContinuations: 1,
            },
          },
        },
        C,
      ],
      /budget differs/,
    ],
    [
      'budget invalid',
      [
        { ...state, budget: { maxRepairAttempts: 99 } },
        patch,
        {
          ...metadata,
          evaluation: {
            budget: {
              maxRepairAttempts: 2,
              maxActiveSeconds: 3600,
              maxContinuations: 1,
            },
          },
        },
        C,
      ],
      /Invalid evaluation sample budget/,
    ],
  ])
    assert.match(String(keepRefusal(...args)), reason, name);

  // A repair checkpoint needs its diagnostic context, as restoreState demands.
  const repair = { ...state, phase: 'repair' };
  assert.match(
    String(keepRefusal(repair, patch, metadata, C)),
    /Repair checkpoint is missing its diagnostic context/,
  );
  assert.equal(keepRefusal(repair, patch, metadata, C, true), null);
  // One validator: every refusal keepRefusal shares is also restoreState's.
  const { checkpointRefusal } = await import('../pipeline-state.mjs');
  assert.equal(
    checkpointRefusal(repair, { patch, metadata, controlSha: C }),
    'Repair checkpoint is missing its diagnostic context.',
  );
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../pipeline-state.mjs'),
    'utf8',
  );
  const restore = source
    .split('export function restoreState')[1]
    .split('\nexport function ')[0];
  assert.match(restore, /const refusal = checkpointRefusal\(state, \{/);
  assert.match(restore, /if \(refusal\) throw new Error\(refusal\);/);
  assert.doesNotMatch(
    restore,
    /state\.inputHash !== inputHash|state\.stopReason\)/,
  );

  // The CLI exits 1 with the reason, and 0 for an intact checkpoint.
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-keep-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadataFile = path.join(root, 'task-metadata.json');
  writeFileSync(metadataFile, JSON.stringify(metadata));
  const stateFile = path.join(root, 'pipeline-state.json');
  initialize(stateFile, metadata);
  const saved = readState(stateFile);
  Object.assign(saved, {
    patchHash: state.patchHash,
    controlSha: C,
    phase: 'qa-full',
  });
  writeFileSync(stateFile, JSON.stringify(saved));
  const patchFile = path.join(root, 'agent.patch');
  writeFileSync(patchFile, patch);
  const keepable = (controlSha) =>
    spawnSync(
      process.execPath,
      [
        path.resolve(import.meta.dirname, '../pipeline-state.mjs'),
        'keepable',
        stateFile,
        patchFile,
        metadataFile,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, FACTORY_CONTROL_SHA: controlSha },
      },
    );
  assert.equal(keepable(C).status, 0, keepable(C).stderr);
  const refused = keepable(B);
  assert.equal(refused.status, 1);
  assert.match(
    refused.stderr,
    /Not keeping the handed-off checkpoint: Checkpoint factory SHA differs/,
  );
});

test('the keep step runs the check and skips a refused sample admission', () => {
  const keep = step('Keep the handed-off checkpoint');
  assert.match(keep, /steps\.admit\.outputs\.refused != 'true'/);
  assert.match(
    keep,
    /node bootstrap\/\.github\/scripts\/pipeline-state\.mjs keepable \\\n\s+handoff\/pipeline-state\.json handoff\/agent\.patch task\/task-metadata\.json/,
  );
  // The check runs before anything is copied or marked failed, and again on
  // exactly what is published.
  assert.ok(keep.indexOf('keepable') < keep.indexOf('cp --parents'));
  assert.match(
    keep,
    /pipeline-state\.mjs keepable \\\n\s+"\$artifacts\/pipeline-state\.json" "\$artifacts\/agent\.patch" "\$artifacts\/task-metadata\.json"/,
  );
  assert.ok(
    keep.lastIndexOf('keepable') < keep.indexOf('pipeline-state.mjs outcome'),
  );
  const admit = step('Admit the evaluation sample for this execution');
  assert.match(admit, /id: admit\n/);
  assert.match(
    admit,
    /2> "\$RUNNER_TEMP\/sample-admission\.err" \|\| status=\$\?/,
  );
  // Both refusal texts are the ones evaluation-sample.mjs prints or throws.
  const sampleScript = readFileSync(
    path.resolve(import.meta.dirname, '../evaluation-sample.mjs'),
    'utf8',
  );
  assert.match(sampleScript, /::error::Evaluation sample not admitted:/);
  assert.match(
    sampleScript,
    /Batch sample receipt no longer matches the task metadata/,
  );
});

test('the admission step marks refusals, and not API errors, as refused', (t) => {
  const admit = step('Admit the evaluation sample for this execution');
  const script = admit.split('run: |\n')[1].replace(/^ {10}/gm, '');
  const cases = [
    ['::error::Evaluation sample not admitted: released.', 1, true],
    [
      'Error: Batch sample receipt no longer matches the task metadata',
      1,
      true,
    ],
    ['Error: GitHub API GET /issues/7 failed (503)', 1, false],
    ['', 0, false],
  ];
  for (const [stderr, exitCode, refused] of cases) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review8-admit-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    // A stand-in evaluation-sample.mjs that prints stderr and exits.
    const scripts = path.join(root, 'control', '.github', 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(
      path.join(scripts, 'evaluation-sample.mjs'),
      `process.stderr.write(${JSON.stringify(stderr ? `${stderr}\n` : '')});\nprocess.exit(${exitCode});\n`,
    );
    const output = path.join(root, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: root,
        GITHUB_OUTPUT: output,
        GITHUB_ENV: path.join(root, 'env'),
      },
    });
    assert.equal(result.status, exitCode, stderr);
    assert.equal(
      readFileSync(output, 'utf8'),
      refused ? 'refused=true\n' : '',
      stderr,
    );
  }
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

test('a rejected Re-run never replaces the real attempt progress comment', async () => {
  const { publishProgress, rejectedRerun } =
    await import('../task-progress.mjs');
  const rejected = [
    { name: 'prepare', conclusion: 'success' },
    {
      name: 'agent',
      status: 'completed',
      conclusion: 'failure',
      steps: [
        { name: 'Reject a GitHub Re-run of this job', conclusion: 'failure' },
      ],
    },
  ];
  assert.equal(rejectedRerun(rejected), true);
  assert.equal(
    rejectedRerun([
      {
        name: 'agent',
        steps: [
          { name: 'Reject a GitHub Re-run of this job', conclusion: 'success' },
        ],
      },
    ]),
    false,
  );
  const writes = [];
  const api = async (method, route) => {
    if (method !== 'GET') {
      writes.push(route);
      return {};
    }
    if (route === '') return { default_branch: 'develop' };
    if (/\/jobs\?/u.test(route)) return { jobs: rejected };
    if (/\/actions\/runs\/\d+$/u.test(route))
      return {
        id: 123,
        run_attempt: 2,
        run_number: 10,
        display_title: 'Factory issue #165 build 0 from 0',
        path: '.github/workflows/code-agent-task.yml',
        head_branch: 'develop',
        head_repository: { full_name: 'owner/factory' },
        event: 'issues',
        status: 'completed',
        conclusion: 'failure',
      };
    throw new Error(`Unexpected read: ${route}`);
  };
  assert.equal(
    await publishProgress(api, 'owner/factory', { runId: 123, attempt: 2 }),
    false,
  );
  assert.deepEqual(writes, []);
});
