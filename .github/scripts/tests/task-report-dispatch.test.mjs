import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { waitForTaskRun } from '../wait-for-task-run.mjs';
import { selectArtifact } from '../visual-report.mjs';

const repository = 'owner/factory';
const source = {
  id: 123,
  run_attempt: 2,
  head_branch: 'develop',
  path: '.github/workflows/code-agent-task.yml',
  head_repository: { full_name: repository },
  event: 'repository_dispatch',
  status: 'completed',
  conclusion: 'success',
};
function waiter(responses, extra = {}) {
  const routes = [];
  const delays = [];
  let clock = 0;
  const api = async (method, route) => {
    assert.equal(method, 'GET');
    routes.push(route);
    return responses.length > 1 ? responses.shift() : responses[0];
  };
  const options = {
    runId: 123,
    repository,
    defaultBranch: 'develop',
    timeoutMs: 20,
    pollMs: 10,
    now: () => clock,
    pause: async (ms) => {
      clock += ms;
      delays.push(ms);
    },
    ...extra,
  };
  return { api, options, routes, delays };
}

test('a bot continuation waits until completed and freezes the source attempt', async () => {
  const f = waiter([
    { ...source, status: 'queued' },
    { ...source, status: 'in_progress' },
    source,
  ]);
  assert.deepEqual(await waitForTaskRun(f.api, f.options), source);
  assert.deepEqual(f.routes, [
    '/actions/runs/123',
    '/actions/runs/123/attempts/2',
    '/actions/runs/123/attempts/2',
  ]);
  assert.deepEqual(f.delays, [10, 10]);
});

test('explicit attempts use only their attempt endpoint, never the latest rerun', async () => {
  const f = waiter([source], { attempt: '2' });
  await waitForTaskRun(f.api, f.options);
  assert.deepEqual(f.routes, ['/actions/runs/123/attempts/2']);
  assert.deepEqual(f.delays, []);
});

test('a source that never completes fails visibly after the bounded wait', async () => {
  const f = waiter([{ ...source, status: 'in_progress' }]);
  await assert.rejects(waitForTaskRun(f.api, f.options), /Timed out.*replay/);
  assert.equal(f.routes.length, 3);
  assert.deepEqual(f.delays, [10, 10]);
});

test('an attempt change, foreign repository, or non-task source fails before waiting', async () => {
  for (const changed of [
    { id: 124 },
    { run_attempt: 3 },
    { head_branch: 'feature/untrusted' },
    { head_repository: { full_name: 'fork/repo' } },
    { path: '.github/workflows/other.yml' },
    { event: 'pull_request' },
  ]) {
    const f = waiter([{ ...source, ...changed, status: 'in_progress' }], {
      attempt: '2',
    });
    await assert.rejects(
      waitForTaskRun(f.api, f.options),
      /requested same-repository/,
    );
    assert.deepEqual(f.delays, []);
  }
});

test('a new attempt cannot replace the pinned attempt while polling', async () => {
  const f = waiter([
    { ...source, status: 'in_progress' },
    { ...source, run_attempt: 3 },
  ]);
  await assert.rejects(
    waitForTaskRun(f.api, f.options),
    /requested same-repository/,
  );
  assert.equal(f.routes.at(-1), '/actions/runs/123/attempts/2');
});

test('invalid source arguments fail before any GitHub request', async () => {
  for (const changed of [{ runId: 0 }, { attempt: '-1' }, { attempt: 'bad' }]) {
    const f = waiter([source], changed);
    await assert.rejects(waitForTaskRun(f.api, f.options), /Invalid source/);
    assert.deepEqual(f.routes, []);
  }
});

test('failure and cancellation can still produce usage; successful handoffs cannot publish media', async () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'success']) {
    const f = waiter([{ ...source, conclusion }]);
    const completed = await waitForTaskRun(f.api, f.options);
    assert.equal(completed.conclusion, conclusion);
    assert.equal(
      selectArtifact(
        completed,
        [{ name: 'agent', conclusion: 'success' }],
        [],
        repository,
      ),
      null,
    );
  }
});

// The task names each report in a step of its own.
const ALL_REPORTS = [
  'report-task-progress.yml',
  'report-task-usage.yml',
  'publish-agent-history.yml',
  'publish-retro.yml',
  'publish-visual-report.yml',
  'deploy-preview.yml',
];

function dispatch(
  t,
  {
    delivered = 'true',
    published,
    failWorkflow = '',
    failCount = '99',
    runId = '123',
    issueNumber = '',
    workflows = ALL_REPORTS,
  } = {},
) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-dispatch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'calls.json');
  const summary = path.join(root, 'summary.md');
  mkdirSync(bin);
  const gh = path.join(bin, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const file = process.env.TEST_CALL_LOG;
const calls = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const args = process.argv.slice(2);
calls.push(args);
fs.writeFileSync(file, JSON.stringify(calls));
const attempts = calls.filter(a => a[2] === args[2]).length;
process.exit((args[2] === process.env.TEST_FAIL_WORKFLOW || process.env.TEST_FAIL_WORKFLOW === '*') && attempts <= Number(process.env.TEST_FAIL_COUNT) ? 1 : 0);
`,
  );
  chmodSync(gh, 0o755);
  const sleep = path.join(bin, 'sleep');
  writeFileSync(sleep, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(sleep, 0o755);
  const result = spawnSync(
    'bash',
    [path.resolve(import.meta.dirname, '../dispatch-task-reports.sh'), ...workflows],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REPOSITORY: repository,
        SOURCE_RUN_ID: runId,
        SOURCE_ATTEMPT: '2',
        FACTORY_REPORT_REF: 'develop',
        FACTORY_TASK_PUBLISHED: published ?? delivered,
        ...(issueNumber ? { ISSUE_NUMBER: issueNumber } : {}),
        GH_TOKEN: 'fixture-token',
        GITHUB_STEP_SUMMARY: summary,
        TEST_CALL_LOG: log,
        TEST_FAIL_WORKFLOW: failWorkflow,
        TEST_FAIL_COUNT: failCount,
      },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  return {
    result,
    calls: existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : [],
    summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '',
  };
}

test('successful delivery dispatches every reporter on the default branch with run and attempt', (t) => {
  const f = dispatch(t);
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.deepEqual(
    f.calls,
    [
      'report-task-progress.yml',
      'report-task-usage.yml',
      'publish-agent-history.yml',
      'publish-retro.yml',
      'publish-visual-report.yml',
      'deploy-preview.yml',
    ].map((workflow) => [
      'workflow',
      'run',
      workflow,
      '--repo',
      repository,
      '--ref',
      'develop',
      '--field',
      'run_id=123',
      '--field',
      'attempt=2',
    ]),
  );
  assert.doesNotMatch(f.result.stdout + f.result.stderr, /fixture-token/);
});

test('handoffs and unpublished failures keep history without premature media', (t) => {
  const f = dispatch(t, { delivered: 'false' });
  assert.equal(f.result.status, 0);
  assert.deepEqual(
    f.calls.map((args) => args[2]),
    [
      'report-task-progress.yml',
      'report-task-usage.yml',
      'publish-agent-history.yml',
      'publish-retro.yml',
    ],
  );
});

test('failed published builds dispatch their report and attempt preview deployment', (t) => {
  const f = dispatch(t, { delivered: 'false', published: 'true' });
  assert.equal(f.result.status, 0);
  assert.deepEqual(
    f.calls.slice(-2).map((args) => args[2]),
    ['publish-visual-report.yml', 'deploy-preview.yml'],
  );
});

test('dispatch retries transient errors without retrying a successful request', (t) => {
  const f = dispatch(t, {
    failWorkflow: 'report-task-usage.yml',
    failCount: '1',
  });
  assert.equal(f.result.status, 0);
  assert.deepEqual(
    f.calls.map((args) => args[2]),
    [
      'report-task-progress.yml',
      'report-task-usage.yml',
      'report-task-usage.yml',
      'publish-agent-history.yml',
      'publish-retro.yml',
      'publish-visual-report.yml',
      'deploy-preview.yml',
    ],
  );
});

test('a failed usage dispatch still attempts media and leaves explicit replay instructions', (t) => {
  const f = dispatch(t, { failWorkflow: 'report-task-usage.yml' });
  assert.equal(f.result.status, 1);
  assert.equal(f.calls.length, 8);
  assert.deepEqual(
    f.calls.slice(-2).map((args) => args[2]),
    ['publish-visual-report.yml', 'deploy-preview.yml'],
  );
  assert.match(f.result.stdout, /::warning::.*report-task-usage/);
  assert.match(f.summary, /run_id=123.*attempt=2/);
});

test('permanent failures are bounded independently for every reporter', (t) => {
  const f = dispatch(t, { failWorkflow: '*' });
  assert.equal(f.result.status, 1);
  assert.equal(f.calls.length, 18);
  assert.match(f.summary, /publish-visual-report/);
  assert.match(f.summary, /publish-retro/);
  assert.match(f.summary, /publish-agent-history/);
});

test('a named report is requested on its own, and media only for published work', (t) => {
  const usage = dispatch(t, { workflows: ['report-task-usage.yml'] });
  assert.equal(usage.result.status, 0, usage.result.stderr);
  assert.deepEqual(usage.calls.map((args) => args[2]), ['report-task-usage.yml']);
  const preview = dispatch(t, { delivered: 'false', workflows: ['deploy-preview.yml'] });
  assert.equal(preview.result.status, 0, preview.result.stderr);
  assert.deepEqual(preview.calls, []);
  assert.match(preview.result.stdout, /Not requesting deploy-preview\.yml/);
  const failed = dispatch(t, { workflows: ['publish-retro.yml'], failWorkflow: 'publish-retro.yml' });
  assert.equal(failed.result.status, 1);
  assert.equal(failed.calls.length, 3);
  const unknown = dispatch(t, { workflows: ['code-agent-task.yml'] });
  assert.equal(unknown.result.status, 2);
  assert.deepEqual(unknown.calls, []);
});

test('the dispatcher requests nothing unless its caller names the workflows', (t) => {
  const f = dispatch(t, { workflows: [] });
  assert.equal(f.result.status, 2);
  assert.deepEqual(f.calls, []);
  assert.match(f.result.stderr, /Name the report workflows to request/);
});

test('a finished comment round asks the queue to reconcile its Issue after this run', (t) => {
  const queue = dispatch(t, { workflows: ['comment-build-queue.yml'], issueNumber: '42' });
  assert.equal(queue.result.status, 0, queue.result.stderr);
  assert.deepEqual(queue.calls, [
    [
      'workflow',
      'run',
      'comment-build-queue.yml',
      '--repo',
      repository,
      '--ref',
      'develop',
      '--field',
      'issue_number=42',
      '--field',
      'run_id=123',
    ],
  ]);
  // Retried like the reports.
  const flaky = dispatch(t, {
    workflows: ['comment-build-queue.yml'],
    issueNumber: '42',
    failWorkflow: 'comment-build-queue.yml',
    failCount: '1',
  });
  assert.equal(flaky.result.status, 0);
  assert.equal(flaky.calls.length, 2);
  // Without an Issue there is nothing to reconcile.
  const missing = dispatch(t, { workflows: ['comment-build-queue.yml'] });
  assert.equal(missing.result.status, 2);
  assert.deepEqual(missing.calls, []);
});

test('dispatcher rejects malformed IDs rather than passing them to GitHub', (t) => {
  const f = dispatch(t, { runId: 'abc' });
  assert.equal(f.result.status, 2);
  assert.equal(f.calls.length, 0);
});

test('report dispatch is an isolated terminal job, not another Agent invocation', () => {
  const task = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'),
    'utf8',
  );
  const dispatcher = task
    .split('\n  dispatch-reports:\n')[1]
    ?.split(/\n {2}[a-z][a-z-]*:\n/)[0];
  assert.ok(dispatcher);
  assert.deepEqual(
    dispatcher
      .match(/needs:\s*\[([^\]]+)\]/)[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    [
      'prepare',
      'agent',
      'verify-final',
      'publish',
      'publish-failed',
      'preview-build-failed',
      'report-failure',
      'reply',
      'publish-reply',
    ],
  );
  // A prepared build, or a "Re-run all jobs" that prepare rejected (its
  // requests are then marked handled without dispatching anything).
  assert.match(
    dispatcher,
    /if: >-\n\s+always\(\) &&\n\s+\(\(needs\.prepare\.result == 'success' && needs\.prepare\.outputs\.status == 'ready' && needs\.prepare\.outputs\.comment_kind != 'reply'\) \|\|\n\s+needs\.prepare\.outputs\.rerun_rejected == 'true'\)/,
  );
  assert.match(dispatcher, /actions: write/);
  assert.match(dispatcher, /continue-on-error: true/);
  assert.match(
    dispatcher,
    /FACTORY_TASK_PUBLISHED: \$\{\{ needs.publish.result == 'success' \|\| needs.publish-failed.result == 'success' \}\}/,
  );
  assert.doesNotMatch(
    dispatcher,
    /\$\{\{\s*secrets\.|contents: write|pnpm|run-agent|uses: \.\//,
  );
  for (const name of [
    'publish-visual-report',
    'deploy-preview',
    'report-task-usage',
    'publish-retro',
  ]) {
    const script = readFileSync(
      path.resolve(import.meta.dirname, `../${name}.mjs`),
      'utf8',
    );
    assert.match(script, /await waitForTaskRun\(api,/);
    const workflow = readFileSync(
      path.resolve(import.meta.dirname, `../../workflows/${name}.yml`),
      'utf8',
    );
    assert.match(workflow, /workflow_run:/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(
      workflow,
      /SOURCE_ATTEMPT: \$\{\{ inputs.attempt \|\| github.event.workflow_run.run_attempt \}\}/,
    );
    assert.match(workflow, /--attempt "\$SOURCE_ATTEMPT"/);
  }
});

const reportWorkflows = [
  ['deploy-preview.yml', 'deploy-preview'],
  ['publish-agent-history.yml', 'publish'],
  ['publish-visual-report.yml', 'publish-media'],
  ['publish-retro.yml', 'publish-retro'],
  ['report-task-progress.yml', 'report'],
  ['report-task-usage.yml', 'report'],
];
const readWorkflow = (name) =>
  readFileSync(path.resolve(import.meta.dirname, '../../workflows', name), 'utf8');

test('the task requests each report in its own step, which runs after an earlier one failed', () => {
  const task = readWorkflow('code-agent-task.yml');
  const job = task.split('\n  dispatch-reports:\n')[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  assert.match(job, /continue-on-error: true/);
  const steps = [...job.matchAll(/- name: Request ([\w-]+\.yml)\n\s+id: request-([\w-]+)\n\s+if: \$\{\{ !cancelled\(\) \}\}\n[\s\S]*?run: bash dispatcher\/\.github\/scripts\/dispatch-task-reports\.sh ([\w-]+\.yml)\n/g)];
  assert.deepEqual(
    steps.map(([, name]) => name).sort(),
    reportWorkflows.map(([name]) => name).sort(),
  );
  for (const [, name, id, argument] of steps) {
    assert.equal(argument, name);
    assert.equal(`${id}.yml`, name);
  }
  assert.match(job, /FACTORY_TASK_PUBLISHED: \$\{\{ needs\.publish\.result == 'success' \|\| needs\.publish-failed\.result == 'success' \}\}/);
  assert.equal((job.match(/env: \*report-dispatch-env/g) ?? []).length, reportWorkflows.length - 1);
});

test('the per-report steps never run the dispatcher from the task\'s pinned control plane', () => {
  // Continuations, recoveries and evaluation samples pin an older control SHA
  // whose dispatcher ignores its arguments; six steps would then each request
  // every report. The dispatcher follows this workflow file's revision instead.
  const task = readWorkflow('code-agent-task.yml');
  const job = task.split('\n  dispatch-reports:\n')[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  assert.doesNotMatch(job, /control_sha|control\/\.github/);
  const checkout = /- name: Check out the report dispatcher\n\s+uses: actions\/checkout@\S+ # v[\d.]+\n\s+with:\n((?: {10}.*\n)+)/.exec(job);
  assert.ok(checkout, 'the dispatcher is checked out on its own');
  assert.match(checkout[1], /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(checkout[1], /path: dispatcher/);
  assert.match(checkout[1], /persist-credentials: false/);
  assert.match(checkout[1], /sparse-checkout: \|\n\s+\/\.github\/scripts\/dispatch-task-reports\.sh\n/);
  const runs = [...job.matchAll(/run: (.+)/g)].map(([, command]) => command);
  // Six reports, and the comment queue for a comment round.
  assert.equal(runs.length, reportWorkflows.length + 1);
  for (const command of runs)
    assert.match(command, /^bash dispatcher\/\.github\/scripts\/dispatch-task-reports\.sh [\w-]+\.yml$/);
  // The dispatcher it runs honours its argument: one request per step.
  const script = readFileSync(path.resolve(import.meta.dirname, '../dispatch-task-reports.sh'), 'utf8');
  assert.match(script, /for workflow in "\$@"; do/);
});

test('a question round requests its history like the build reports, and not after a cancel', () => {
  const task = readWorkflow('code-agent-task.yml');
  const job = task.split('\n  dispatch-reply-history:\n')[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  assert.match(job, /^ {4}if: \$\{\{ !cancelled\(\) && /m);
  assert.match(job, /ref: \$\{\{ github\.workflow_sha \}\}/);
  // The gate reads this step name, and the dispatcher retries each request.
  assert.match(
    job,
    /- name: Request publish-agent-history\.yml\n[\s\S]*?run: bash dispatcher\/\.github\/scripts\/dispatch-task-reports\.sh publish-agent-history\.yml\n/,
  );
  assert.doesNotMatch(job, /gh workflow run/);
  // The round's queue starts its next instruction now, not at a late sweep.
  assert.match(
    job,
    /- name: Request comment-build-queue\.yml\n\s+if: \$\{\{ !cancelled\(\) \}\}\n[\s\S]*?ISSUE_NUMBER: \$\{\{ needs\.prepare\.outputs\.issue_number \}\}\n\s+run: bash dispatcher\/\.github\/scripts\/dispatch-task-reports\.sh comment-build-queue\.yml\n?$/,
  );
});

test('a comment build round requests its queue from dispatch-reports', () => {
  const task = readWorkflow('code-agent-task.yml');
  const job = task.split('\n  dispatch-reports:\n')[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  const step = job.split('- name: Request comment-build-queue.yml\n')[1];
  assert.ok(step, 'the queue request step is missing');
  assert.match(step, /if: \$\{\{ !cancelled\(\) && needs\.prepare\.outputs\.build_comment_id != '' \}\}/);
  assert.match(step, /ISSUE_NUMBER: \$\{\{ needs\.prepare\.outputs\.issue_number \}\}/);
  assert.match(step, /SOURCE_RUN_ID: \$\{\{ github\.run_id \}\}/);
  // The budget comment covers the extra request: seven at 70 s fit 10 minutes.
  assert.match(job, /timeout-minutes: 10\n/);
});

test('workflow_run copies of dispatched reports skip once the task requested them', () => {
  const gate = readWorkflow('report-dispatch-gate.yml');
  // A question round requests its history from dispatch-reply-history.
  // dispatch-reports and dispatch-reply-history; not wake-comment-queue.
  assert.match(gate, /select\(\.name \| test\("\^dispatch-"\)\)/);
  assert.match(gate, /actions: read/);
  assert.match(gate, /inputs:\n\s+workflow:\n[\s\S]*?required: true/);
  for (const [name, job] of reportWorkflows) {
    const workflow = readWorkflow(name);
    // A skipped task run (an untrusted author's Issue) started no work, so its
    // completion event starts no report either.
    assert.match(
      workflow,
      new RegExp(`\\n  dispatch-gate:\\n    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion != 'skipped'\\n    uses: \\./\\.github/workflows/report-dispatch-gate\\.yml\\n    with:\\n      workflow: ${name.replace('.', '\\.')}\\n`),
      name,
    );
    const jobBody = (id) => workflow.split(`\n  ${id}:\n`)[1]?.split(/\n {2}[a-z][a-z-]*:\n/)[0];
    // A reporter that serializes waits for the source run in a lock-free job
    // first; that job carries the gate condition, and the locked job needs it.
    const waiting = jobBody('wait-for-source');
    const body = waiting ?? jobBody(job);
    if (waiting) assert.match(jobBody(job), /needs: \[dispatch-gate, wait-for-source\]/, name);
    assert.match(body, /needs: dispatch-gate/, name);
    // Fails open: a skipped or failed gate never suppresses the report.
    assert.match(body, /if: >-\n\s+!cancelled\(\) && needs\.dispatch-gate\.outputs\.covered != 'true'/, name);
  }
});

// The gate's own script against a recorded jobs listing.
function gate(t, steps, { workflow, fail = false, failTimes = 0, runId = '123', calls } = {}) {
  const source = readWorkflow('report-dispatch-gate.yml');
  const script = source.split('        run: |\n')[1].replace(/^ {10}/gm, '');
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const jobs = path.join(root, 'jobs.json');
  writeFileSync(jobs, JSON.stringify({ jobs: [{ name: 'agent', steps: [{ name: `Request ${workflow}`, conclusion: 'success' }] }, { name: 'dispatch-reports', steps }] }));
  // gh api ... --jq <filter>: apply the filter to the recorded listing.
  const count = path.join(root, 'gh-calls');
  writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env bash
echo x >> ${JSON.stringify(count)}
${fail ? 'exit 1' : ''}
if (( $(wc -l < ${JSON.stringify(count)}) <= ${failTimes} )); then exit 1; fi
while [[ $# -gt 0 && "$1" != --jq ]]; do shift; done
jq -r "$2" ${JSON.stringify(jobs)}
`, { mode: 0o755 });
  writeFileSync(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  const output = path.join(root, 'output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', `set -euo pipefail\n${script}`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'o/r', GITHUB_OUTPUT: output,
      GH_TOKEN: 'x', RUN_ID: runId, ATTEMPT: '1', WORKFLOW: workflow },
  });
  assert.equal(result.status, 0, result.stderr);
  if (calls) calls.push(existsSync(count) ? readFileSync(count, 'utf8').trim().split('\n').length : 0);
  return readFileSync(output, 'utf8').trim();
}

test('the gate reads only its own workflow\'s request step and fails open', (t) => {
  const steps = [
    { name: 'Request report-task-usage.yml', conclusion: 'failure' },
    { name: 'Request deploy-preview.yml', conclusion: 'success' },
    { name: 'Request publish-retro.yml', conclusion: 'skipped' },
  ];
  assert.equal(gate(t, steps, { workflow: 'deploy-preview.yml' }), 'covered=true');
  assert.equal(gate(t, steps, { workflow: 'report-task-usage.yml' }), 'covered=false');
  assert.equal(gate(t, steps, { workflow: 'publish-retro.yml' }), 'covered=false');
  assert.equal(gate(t, steps, { workflow: 'publish-agent-history.yml' }), 'covered=false');
  // A run from before the split has one combined step for every report.
  const legacy = [{ name: 'Explicitly request task reports (including continuations)', conclusion: 'success' }];
  assert.equal(gate(t, legacy, { workflow: 'publish-retro.yml' }), 'covered=true');
  const calls = [];
  assert.equal(gate(t, steps, { workflow: 'deploy-preview.yml', fail: true, calls }), 'covered=false');
  // A transient API error is retried; three failures still fail open.
  assert.equal(gate(t, steps, { workflow: 'deploy-preview.yml', failTimes: 2, calls }), 'covered=true');
  assert.equal(gate(t, steps, { workflow: 'report-task-usage.yml', failTimes: 1, calls }), 'covered=false');
  assert.deepEqual(calls, [3, 3, 2]);
  assert.equal(gate(t, steps, { workflow: 'deploy-preview.yml', runId: 'x' }), 'covered=false');
  assert.equal(gate(t, steps, { workflow: 'deploy-preview.yml"); evil' }), 'covered=false');
});

test('live progress updates queue per source run, not globally', () => {
  const workflow = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/report-task-progress.yml'),
    'utf8',
  );
  assert.match(
    workflow,
    /group: factory-live-progress-\$\{\{ github\.event\.client_payload\.snapshot\.runId \|\| inputs\.run_id \|\| github\.event\.workflow_run\.id \}\}\n\s+queue: max/,
  );
});

test('jobs downstream of the dispatch gate never inherit its skip', () => {
  // dispatch-gate is skipped outside workflow_run. A downstream job without a
  // status function uses success(), which a skipped ancestor fails, so it would
  // silently skip on every dispatched report (report-task-usage pages and
  // evaluation did, 2026-09-29).
  const directory = path.resolve(import.meta.dirname, '../../workflows');
  let checked = 0;
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const workflow = readFileSync(path.join(directory, name), 'utf8');
    if (!workflow.includes('\n  dispatch-gate:\n')) continue;
    const jobs = new Map();
    for (const [, id, body] of workflow
      .split(/^jobs:\n/m)[1]
      .matchAll(/^ {2}([a-z][a-z-]*):\n((?: {4}.*\n|\s*\n)*)/gm)) {
      const needs = /^ {4}needs: (?:\[([^\]]+)\]|(\S+))/m.exec(body);
      jobs.set(id, {
        needs: needs ? (needs[1] ?? needs[2]).split(',').map((value) => value.trim()) : [],
        condition: /^ {4}if: (?:>-\n((?: {6}.*\n)+)|(.*))/m.exec(body)?.slice(1).join('') ?? '',
      });
    }
    const gated = (id) => jobs.get(id)?.needs.some((need) => need === 'dispatch-gate' || gated(need));
    for (const [id, job] of jobs) {
      if (id === 'dispatch-gate' || !gated(id)) continue;
      checked++;
      assert.match(job.condition, /!cancelled\(\)|always\(\)/, `${name}: ${id}`);
    }
  }
  assert.ok(checked >= 9);
});

test('the dispatch budget fits six worst-case requests inside the job timeout', () => {
  const script = readFileSync(path.resolve(import.meta.dirname, '../dispatch-task-reports.sh'), 'utf8');
  const seconds = (name) => Number(new RegExp(`^${name}=(\\d+)s$`, 'm').exec(script)?.[1]);
  const attempt = seconds('DISPATCH_ATTEMPT_TIMEOUT') + seconds('DISPATCH_KILL_AFTER');
  const backoff = /^DISPATCH_BACKOFF=\(([\d ]+)\)$/m.exec(script)[1].split(' ').map(Number);
  assert.equal(backoff.length, 2);
  assert.match(script, /for attempt in 1 2 3; do/);
  assert.match(script, /sleep "\$\{DISPATCH_BACKOFF\[attempt - 1\]\}"/);
  const perReport = 3 * attempt + backoff.reduce((sum, value) => sum + value, 0);
  const job = readWorkflow('code-agent-task.yml').split('\n  dispatch-reports:\n')[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  const minutes = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(job)[1]);
  // Two minutes for the runner, checkout and step overhead.
  assert.ok(reportWorkflows.length * perReport <= (minutes - 2) * 60, `${reportWorkflows.length} x ${perReport}s vs ${minutes} min`);
  // The gate retries, fails open, and still fits its own job.
  const gate = readWorkflow('report-dispatch-gate.yml');
  assert.match(gate, /for attempt in 1 2 3; do/);
  assert.match(gate, /timeout --kill-after=5s 20s gh api/);
  assert.ok(3 * 25 + 3 + 6 <= Number(/timeout-minutes: (\d+)/.exec(gate)[1]) * 60 - 60);
});
