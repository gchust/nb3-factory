// Round-9 review fixes in the task workflow: complete setup-failure
// checkpoints, recovery after a published failed branch, retried prepare
// downloads and first-execution re-runs, a non-fatal preview package, the
// comment queue after an unready prepare, and duplicate-safe report requests.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TASK_BASE_MARKER,
  liveRecoveryBase,
  pinnedTaskBase,
  publishedWorkCommit,
  validateRecoveryBase,
} from '../handoff-recovery.mjs';
import { inputHash, requireFreshRunAttempt } from '../pipeline-state.mjs';
import { selectDistArtifact } from '../preview-host.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(
  path.resolve(scripts, '../workflows/code-agent-task.yml'),
  'utf8',
);
const job = (name) =>
  workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const step = (name, text = workflow) =>
  text.split(`- name: ${name}\n`)[1].split('\n      - ')[0];
const S0 = 'a'.repeat(40);
const X = 'b'.repeat(40);
const P = 'c'.repeat(40);
const Y = 'd'.repeat(40);

test('a setup failure still leaves the task metadata in the checkpoint', () => {
  const resume = step('Restore pipeline progress');
  const restore = resume.indexOf('pipeline-state.mjs restore handoff');
  const init = resume.indexOf('pipeline-state.mjs init');
  const copy = resume.indexOf(
    'cp task/task-metadata.json "$RUNNER_TEMP/agent-artifacts/task-metadata.json"',
  );
  // After both the restore and the init branch, before anything can fail.
  assert.ok(restore > 0 && init > restore && copy > init);
  assert.ok(copy < resume.indexOf('echo "phase='));
  // Restore runs before every setup step a failure can stop at.
  const agent = job('agent');
  for (const later of [
    'Install application dependencies',
    'Install pinned Code Agent',
    'Mark a continuation that failed during setup',
  ])
    assert.ok(
      agent.indexOf('- name: Restore pipeline progress') <
        agent.indexOf(`- name: ${later}`),
      later,
    );
  // The checkpoint confirmation still requires it.
  assert.match(
    step('Confirm the handoff checkpoint'),
    /for file in agent\.patch pipeline-state\.json task-metadata\.json/,
  );
});

const source = {
  repository: 'owner/factory',
  issue: { number: 7 },
  workBranch: 'agent/issue-7',
  task: { targetBranch: 'develop', acceptanceCriteria: 'B02. Save' },
};

test("a recovery keeps the recorded base when the work branch holds the failed run's published commit", () => {
  // New Issue: recorded develop@X, publish-failed pushed P onto agent/issue-7.
  const recovery = {
    sourceRunId: 900,
    baseRef: 'develop',
    baseSha: X,
    inputHash: inputHash(source),
    publishedCommit: P,
  };
  const base = liveRecoveryBase({ recovery, source, workSha: P });
  assert.deepEqual(base, { ref: 'develop', sha: X, expectedWorkSha: P });
  validateRecoveryBase(recovery, source, source, base.ref, base.sha);
  // Newer work on the branch is still refused.
  const moved = liveRecoveryBase({ recovery, source, workSha: Y });
  assert.deepEqual(moved, {
    ref: 'agent/issue-7',
    sha: Y,
    expectedWorkSha: null,
  });
  assert.throws(
    () => validateRecoveryBase(recovery, source, source, moved.ref, moved.sha),
    /Application branch moved/,
  );
  // Without a publication record the pushed branch looks moved: refuse.
  const unrecorded = liveRecoveryBase({
    recovery: { ...recovery, publishedCommit: null },
    source,
    workSha: P,
  });
  assert.throws(
    () =>
      validateRecoveryBase(
        recovery,
        source,
        source,
        unrecorded.ref,
        unrecorded.sha,
      ),
    /Application branch moved/,
  );
  // A comment build recorded on the work branch itself.
  const comment = { ...recovery, baseRef: 'agent/issue-7', baseSha: S0 };
  assert.deepEqual(
    liveRecoveryBase({ recovery: comment, source, workSha: P }),
    {
      ref: 'agent/issue-7',
      sha: S0,
      expectedWorkSha: P,
    },
  );
});

test('a recovery without a work branch compares a shared target with its pinned receipt', () => {
  const recovery = {
    sourceRunId: 900,
    baseRef: 'develop',
    baseSha: X,
    inputHash: inputHash(source),
  };
  // develop moved to Y since; the receipt still pins X.
  const pinned = liveRecoveryBase({
    recovery,
    source,
    workSha: null,
    targetSha: Y,
    pinnedSha: X,
  });
  assert.deepEqual(pinned, { ref: 'develop', sha: X, expectedWorkSha: null });
  validateRecoveryBase(recovery, source, source, pinned.ref, pinned.sha);
  // A non-shared target has no receipt: its live head must still match.
  const live = liveRecoveryBase({
    recovery,
    source,
    workSha: null,
    targetSha: Y,
    pinnedSha: null,
  });
  assert.throws(
    () => validateRecoveryBase(recovery, source, source, live.ref, live.sha),
    /Application branch moved/,
  );
  // The receipt is read the way task-base.mjs writes it.
  const taskBase = readFileSync(path.join(scripts, 'task-base.mjs'), 'utf8');
  assert.ok(taskBase.includes(`const marker = '${TASK_BASE_MARKER}';`));
  const receipt = (sha, login = 'github-actions[bot]') => ({
    user: { login, type: 'Bot' },
    body: `${TASK_BASE_MARKER}${JSON.stringify({ repository: 'owner/factory', issueNumber: 7, targetBranch: 'develop', sha })} -->\n\ntext`,
  });
  const where = {
    repository: 'owner/factory',
    issue: 7,
    targetBranch: 'develop',
  };
  assert.equal(pinnedTaskBase([receipt(X)], where), X);
  assert.equal(pinnedTaskBase([], where), null);
  assert.equal(pinnedTaskBase([receipt(Y, 'someone')], where), null);
  assert.throws(
    () => pinnedTaskBase([receipt(X), receipt(Y)], where),
    /disagree/,
  );
});

test("only the failed run's own publication record counts", () => {
  const record = {
    version: 1,
    sourceRunId: 900,
    workBranch: 'agent/issue-7',
    commit: P,
  };
  const where = { sourceRunId: 900, workBranch: 'agent/issue-7' };
  assert.equal(publishedWorkCommit(record, where), P);
  assert.equal(publishedWorkCommit(null, where), null);
  assert.equal(
    publishedWorkCommit({ ...record, sourceRunId: 901 }, where),
    null,
  );
  assert.equal(
    publishedWorkCommit({ ...record, workBranch: 'agent/issue-8' }, where),
    null,
  );
  assert.equal(publishedWorkCommit({ ...record, commit: 'x' }, where), null);
});

test('check-base maps a pushed failed branch to the recorded base and outputs the push lease', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review9-base-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkpoint = path.join(root, 'recovery');
  mkdirSync(checkpoint);
  writeFileSync(
    path.join(checkpoint, 'task-metadata.json'),
    JSON.stringify(source),
  );
  writeFileSync(
    path.join(checkpoint, 'recovery.json'),
    JSON.stringify({
      sourceRunId: 900,
      baseRef: 'develop',
      baseSha: X,
      inputHash: inputHash(source),
      publishedCommit: P,
    }),
  );
  const metadata = path.join(root, 'task-metadata.json');
  const output = path.join(root, 'output');
  const run = (baseRef, baseSha) => {
    writeFileSync(metadata, JSON.stringify(source));
    writeFileSync(output, '');
    return spawnSync(
      process.execPath,
      [
        path.join(scripts, 'handoff-recovery.mjs'),
        'check-base',
        '--checkpoint',
        checkpoint,
        '--metadata',
        metadata,
        '--base-ref',
        baseRef,
        '--base-sha',
        baseSha,
        '--output',
        output,
      ],
      { encoding: 'utf8' },
    );
  };
  // prepare-task resolved the live work branch at the published commit.
  const pushed = run('agent/issue-7', P);
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.equal(
    readFileSync(output, 'utf8'),
    `ref=develop\nsha=${X}\nexpected_work_sha=${P}\n`,
  );
  assert.equal(
    JSON.parse(readFileSync(metadata, 'utf8')).recovery.publishedCommit,
    P,
  );
  // Newer work refuses.
  const moved = run('agent/issue-7', Y);
  assert.notEqual(moved.status, 0);
  assert.match(moved.stderr, /Application branch moved/);
});

test('the workflow records the published commit, feeds it to recovery and leases on it', () => {
  // Publication writes and uploads the record after the push.
  const push = step('Commit and push task branch');
  assert.match(push, /id: push\n/);
  assert.match(
    push,
    /if \[\[ "\$EXPECTED_WORK_SHA" =~ \^\[a-f0-9\]\{40\}\$ \]\]; then\n\s+# Only the failed run's own published commit may be replaced\.\n\s+lease="refs\/heads\/\$\{WORK_BRANCH\}:\$\{EXPECTED_WORK_SHA\}"/,
  );
  assert.match(
    push,
    /EXPECTED_WORK_SHA: \$\{\{ needs\.prepare\.outputs\.expected_work_sha \}\}/,
  );
  assert.match(push, /"\$\(git rev-parse HEAD\)" "\$GITHUB_RUN_ID"/);
  const upload = step('Upload the publication record');
  assert.match(upload, /if: steps\.push\.outcome == 'success'/);
  assert.match(upload, /continue-on-error: true/);
  assert.match(
    upload,
    /name: factory-published-\$\{\{ needs\.prepare\.outputs\.issue_number \}\}/,
  );
  // Shared by publish and publish-failed.
  assert.match(job('publish-failed'), /steps: \*publication-steps/);
  // Recovery downloads it and hands it to normalize.
  const prepare = job('prepare');
  const download = step(
    "Download the failed run's publication record",
    prepare,
  );
  assert.match(download, /continue-on-error: true/);
  assert.match(
    download,
    /name: factory-published-\$\{\{ inputs\.issue_number \}\}/,
  );
  assert.match(download, /run-id: \$\{\{ inputs\.recovery_run_id \}\}/);
  assert.match(
    step('Validate and normalize explicit recovery', prepare),
    /--published recovery-published\/publication\.json/,
  );
  // check-base runs before the base is resolved and feeds it.
  const check = prepare.indexOf(
    '- name: Reject changed recovery input or application base',
  );
  const base = prepare.indexOf('- name: Resolve the application base');
  assert.ok(check > 0 && check < base);
  assert.match(
    step('Reject changed recovery input or application base', prepare),
    /--output "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    step('Resolve the application base', prepare),
    /RECOVERY_EXPECTED_WORK_SHA: \$\{\{ steps\.recovery_base\.outputs\.expected_work_sha \}\}/,
  );
  assert.match(
    prepare,
    /expected_work_sha: \$\{\{ steps\.base\.outputs\.expected_work_sha \}\}/,
  );
});

test('prepare retries its source task and checkpoint downloads once', () => {
  const prepare = job('prepare');
  for (const [name, id] of [
    ['Download source task control pin', 'previous_task_download'],
    ['Download failed-run checkpoint', 'recovery_download'],
  ]) {
    assert.match(step(name, prepare), new RegExp(`id: ${id}\\n`));
    assert.match(
      step(name, prepare),
      /uses: \.\/factory-actions\/\.github\/actions\/download-with-retry\n/,
    );
    assert.doesNotMatch(step(name, prepare), /continue-on-error/);
  }
});

function runAgentGuard(
  t,
  attempts,
  { failApi = false, pinnedHonours = true } = {},
) {
  const guard = step('Reject a GitHub Re-run of this job', job('agent'));
  const script = guard.split('run: |\n')[1].replace(/^ {10}/gm, '');
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-review9-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The pinned control plane's pipeline-state.mjs, current or older.
  const pinned = path.join(root, 'control', '.github', 'scripts');
  mkdirSync(pinned, { recursive: true });
  writeFileSync(
    path.join(pinned, 'pipeline-state.mjs'),
    pinnedHonours
      ? readFileSync(path.join(scripts, 'pipeline-state.mjs'), 'utf8')
      : '// an older pipeline-state.mjs\n',
  );
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
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
  const env = path.join(root, 'env');
  writeFileSync(env, '');
  const result = spawnSync('bash', ['-c', script], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'owner/factory',
      GITHUB_RUN_ID: '900',
      GITHUB_RUN_ATTEMPT: String(attempts.length + 1),
      GITHUB_ENV: env,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    env: readFileSync(env, 'utf8'),
    stdout: result.stdout,
  };
}

test('a re-run whose earlier attempts never started the agent runs as the first execution', (t) => {
  // Attempt 1's prepare failed: no agent job started.
  const first = runAgentGuard(t, [null]);
  assert.equal(first.status, 0);
  assert.equal(first.env, 'FACTORY_FIRST_AGENT_ATTEMPT=true\n');
  // An earlier attempt that started the agent is still rejected.
  assert.equal(runAgentGuard(t, ['failure']).status, 1);
  assert.equal(runAgentGuard(t, [null, 'cancelled']).status, 1);
  // An unreadable job list rejects.
  assert.equal(runAgentGuard(t, [null], { failApi: true }).status, 1);
  // A task pinned to a control plane that ignores the verdict is rejected
  // as a re-run, before anything writes agent-artifacts.
  const older = runAgentGuard(t, [null], { pinnedHonours: false });
  assert.equal(older.status, 1);
  assert.equal(older.env, '');
  assert.match(
    older.stdout,
    /cannot run a GitHub Re-run as its first execution/,
  );
  // A later attempt the guard did not accept is rejected even when the guard
  // never ran (the control checkout before it failed). Evaluated as GitHub
  // does: outcome strings, run_attempt compared as a number.
  const expression = /rerun_rejected: \$\{\{ (.+) \}\}/
    .exec(job('agent'))[1]
    .replaceAll('steps.rerun_guard.outcome', 'outcome')
    .replaceAll('github.run_attempt', 'attempt')
    .replaceAll("'", '"');
  const rejected = new Function('outcome', 'attempt', `return ${expression};`);
  assert.equal(rejected('skipped', 2), true);
  assert.equal(rejected('failure', 2), true);
  assert.equal(rejected('success', 2), false);
  assert.equal(rejected('skipped', 1), false);
  assert.equal(rejected('failure', 1), true);
  // The pinned scripts are checked out before the guard runs.
  const agent = job('agent');
  assert.ok(
    agent.indexOf('- name: Check out factory control plane') <
      agent.indexOf('- name: Reject a GitHub Re-run of this job'),
  );
  // ... and is the only step before the guard: nothing writes agent-artifacts.
  const before = agent
    .split('\n    steps:\n')[1]
    .split('- name: Reject a GitHub Re-run of this job')[0];
  assert.deepEqual(
    [...before.matchAll(/- name: (.+)/g)].map(([, name]) => name),
    ['Check out factory control plane'],
  );
  // pipeline-state accepts attempt 2 only with that verdict.
  const saved = { ...process.env };
  t.after(() => {
    process.env.GITHUB_RUN_ATTEMPT = saved.GITHUB_RUN_ATTEMPT;
    process.env.FACTORY_FIRST_AGENT_ATTEMPT = saved.FACTORY_FIRST_AGENT_ATTEMPT;
    if (saved.GITHUB_RUN_ATTEMPT === undefined)
      delete process.env.GITHUB_RUN_ATTEMPT;
    if (saved.FACTORY_FIRST_AGENT_ATTEMPT === undefined)
      delete process.env.FACTORY_FIRST_AGENT_ATTEMPT;
  });
  process.env.GITHUB_RUN_ATTEMPT = '2';
  delete process.env.FACTORY_FIRST_AGENT_ATTEMPT;
  assert.throws(
    () => requireFreshRunAttempt(),
    /GitHub Re-run cannot preserve/,
  );
  process.env.FACTORY_FIRST_AGENT_ATTEMPT = 'true';
  assert.doesNotThrow(() => requireFreshRunAttempt());
  // The guard reads the jobs with the job's token.
  assert.match(
    step('Reject a GitHub Re-run of this job', job('agent')),
    /GH_TOKEN: \$\{\{ github\.token \}\}/,
  );
  assert.match(job('agent'), /permissions:\n {6}actions: read\n/);
});

test('a failed preview package no longer fails a passed verification', () => {
  const verify = job('verify-final');
  const stage = step('Stage the deployable build and its metadata', verify);
  const upload = step('Upload the deployable build', verify);
  assert.match(stage, /id: dist_stage\n\s+continue-on-error: true/);
  assert.match(upload, /id: dist_upload\n/);
  assert.match(upload, /continue-on-error: true/);
  assert.match(upload, /if: steps\.dist_stage\.outcome == 'success'/);
  const report = step('Report a missing deployable build', verify);
  assert.match(
    report,
    /steps\.dist_stage\.outcome == 'failure' \|\| steps\.dist_upload\.outcome == 'failure'/,
  );
  // The selector keys on this step, so it must report a real conclusion.
  assert.doesNotMatch(report, /continue-on-error/);
  assert.doesNotMatch(verify, /dist_available/);
  // deploy-preview's selector reports the missing package instead of throwing.
  const run = {
    path: '.github/workflows/code-agent-task.yml',
    head_repository: { full_name: 'owner/factory' },
    event: 'issues',
    status: 'completed',
  };
  // As the jobs API reports them: a continue-on-error upload that failed
  // concludes success, and the report step runs only when it failed.
  const jobs = ({ missing }) => [
    {
      name: 'verify-final',
      conclusion: 'success',
      started_at: '2026-10-07T01:00:00Z',
      completed_at: '2026-10-07T02:00:00Z',
      steps: [
        { name: 'Upload the deployable build', conclusion: 'success' },
        {
          name: 'Report a missing deployable build',
          conclusion: missing ? 'success' : 'skipped',
        },
      ],
    },
    { name: 'publish', conclusion: 'success' },
  ];
  assert.equal(
    selectDistArtifact(run, jobs({ missing: true }), [], 'owner/factory'),
    null,
  );
  // An upload that succeeded but left no artifact is still an error.
  assert.throws(
    () =>
      selectDistArtifact(run, jobs({ missing: false }), [], 'owner/factory'),
    /Expected one unexpired deployable build artifact/,
  );
});

test('a comment round whose prepare is not ready still wakes the comment queue', () => {
  const wake = job('wake-comment-queue');
  assert.match(wake, /needs: prepare\n/);
  assert.match(
    wake,
    /!cancelled\(\) &&\n\s+needs\.prepare\.outputs\.build_comment_id != '' &&\n\s+\(needs\.prepare\.outputs\.status != 'ready' \|\| needs\.prepare\.result != 'success'\) &&\n\s+needs\.prepare\.outputs\.rerun_rejected != 'true'/,
  );
  assert.match(wake, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(
    wake,
    /ISSUE_NUMBER: \$\{\{ needs\.prepare\.outputs\.issue_number \}\}/,
  );
  assert.match(wake, /dispatch-task-reports\.sh comment-build-queue\.yml/);
  assert.match(wake, /actions: write/);
  // The ready paths keep their own requests.
  assert.match(job('dispatch-reports'), /Request comment-build-queue\.yml/);
  assert.match(
    job('dispatch-reply-history'),
    /Request comment-build-queue\.yml/,
  );
});

test('every report the dispatcher may request twice is documented as idempotent', () => {
  const dispatcher = readFileSync(
    path.join(scripts, 'dispatch-task-reports.sh'),
    'utf8',
  );
  const accepted = [
    ...dispatcher
      .split('for workflow in "$@"; do')[1]
      .matchAll(/([a-z-]+\.yml)/g),
  ].map(([, name]) => name);
  const documented = dispatcher
    .split('idempotent per source run and attempt:')[1]
    .split('# Retrying only')[0];
  assert.ok(accepted.length >= 7);
  for (const name of new Set(accepted))
    assert.match(
      documented,
      new RegExp(`#   ${name.replace('.yml', '').replace(/[-]/g, '\\-')}\\s`),
      name,
    );
});
