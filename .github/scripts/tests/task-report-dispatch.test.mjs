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

function dispatch(
  t,
  {
    delivered = 'true',
    failWorkflow = '',
    failCount = '99',
    runId = '123',
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
    [path.resolve(import.meta.dirname, '../dispatch-task-reports.sh')],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REPOSITORY: repository,
        SOURCE_RUN_ID: runId,
        SOURCE_ATTEMPT: '2',
        FACTORY_REPORT_REF: 'develop',
        FACTORY_TASK_DELIVERED: delivered,
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
      'report-task-usage.yml',
      'publish-agent-history.yml',
      'publish-visual-report.yml',
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

test('handoffs and failed deliveries keep their history, never premature media', (t) => {
  const f = dispatch(t, { delivered: 'false' });
  assert.equal(f.result.status, 0);
  assert.deepEqual(
    f.calls.map((args) => args[2]),
    ['report-task-usage.yml', 'publish-agent-history.yml'],
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
      'report-task-usage.yml',
      'report-task-usage.yml',
      'publish-agent-history.yml',
      'publish-visual-report.yml',
    ],
  );
});

test('a failed usage dispatch still attempts media and leaves explicit replay instructions', (t) => {
  const f = dispatch(t, { failWorkflow: 'report-task-usage.yml' });
  assert.equal(f.result.status, 1);
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls.at(-1)[2], 'publish-visual-report.yml');
  assert.match(f.result.stdout, /::warning::.*report-task-usage/);
  assert.match(f.summary, /run_id=123.*attempt=2/);
});

test('permanent failures are bounded independently for every reporter', (t) => {
  const f = dispatch(t, { failWorkflow: '*' });
  assert.equal(f.result.status, 1);
  assert.equal(f.calls.length, 9);
  assert.match(f.summary, /publish-visual-report/);
  assert.match(f.summary, /publish-agent-history/);
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
  const dispatcher = task.split('\n  dispatch-reports:\n')[1];
  assert.ok(dispatcher);
  assert.match(
    dispatcher,
    /needs: \[prepare, agent, verify-final, publish, report-failure\]/,
  );
  assert.match(
    dispatcher,
    /if: always\(\) && needs.prepare.outputs.status == 'ready'/,
  );
  assert.match(dispatcher, /actions: write/);
  assert.match(dispatcher, /continue-on-error: true/);
  assert.match(
    dispatcher,
    /FACTORY_TASK_DELIVERED: \$\{\{ needs.publish.result == 'success' \}\}/,
  );
  assert.doesNotMatch(
    dispatcher,
    /\$\{\{\s*secrets\.|contents: write|pnpm|run-agent|uses: \.\//,
  );
  for (const name of ['publish-visual-report', 'report-task-usage']) {
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
