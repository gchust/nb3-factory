// Round-10 review of the task workflow: continuation context, Issue author
// trust for comment rounds and presets, undispatched handoffs, idempotent
// publication, kept checkpoints, run-script inputs, recovery downloads, the
// font cache, composite actions and empty failed patches.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readReceipt,
  receiptBody,
  resolveBuildTask,
} from '../comment-queue.mjs';
import { coordinate } from '../dispatch-comment-builds.mjs';
import { handoffDispatched, validateRecovery } from '../handoff-recovery.mjs';
import { readPresetSource, renderPresetForm } from '../issue-presets.mjs';
import { initialize, saveState } from '../pipeline-state.mjs';
import { createPull } from '../pull-request.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const root = path.resolve(scripts, '..', '..');
const workflow = readFileSync(
  path.join(root, '.github/workflows/code-agent-task.yml'),
  'utf8',
);
const queueWorkflow = readFileSync(
  path.join(root, '.github/workflows/comment-build-queue.yml'),
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
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const repository = 'owner/factory';
function temp(t, prefix = 'factory-review10-') {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------- 1

test('a continuation explains its handed-off work with exactly the workflow arguments', (t) => {
  const step = stepOf('Explain handed-off work without exposing QA context');
  const script = runOf(step);
  assert.doesNotMatch(script, /--checkpoint/);
  const dir = temp(t);
  // A copy, not a symlink: the script runs its CLI only when invoked by its
  // own path, as from the workflow's bootstrap checkout.
  cpSync(scripts, path.join(dir, 'bootstrap', '.github', 'scripts'), {
    recursive: true,
    filter: (file) => !file.includes(`${path.sep}tests`),
  });
  const prompt = path.join(dir, 'implement.md');
  writeFileSync(prompt, '# Task\n');
  const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PREVIOUS_RUN_ID: '4242', RUNNER_TEMP: dir },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(prompt, 'utf8'),
    /## Restored partial implementation\n\nThis workspace contains the unverified code changes from run 4242/,
  );
});

test('commands that read a checkpoint still say so when it is missing', (t) => {
  const dir = temp(t);
  const prompt = path.join(dir, 'implement.md');
  writeFileSync(prompt, '');
  const result = spawnSync(
    process.execPath,
    [path.join(scripts, 'handoff-recovery.mjs'), 'context', '--prompt', prompt],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /context requires --checkpoint/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

// ---------------------------------------------------------------- 2

const owner = { login: 'maintainer', type: 'User' };
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const issueBody =
  '### 目标分支\napps/demo\n### 任务类型\n创建新系统\n### 业务需求\nOUTSIDER_REQUIREMENT\n### 验收要求\nWorks';
function queueFixture({
  association = 'NONE',
  comments = [],
  runs = [],
  user = { login: 'outsider', type: 'User' },
} = {}) {
  const issue = {
    number: 2,
    state: 'open',
    user,
    author_association: association,
    body: issueBody,
  };
  const calls = [];
  const client = {
    repository: 'owner/factory',
    getIssue: async () => issue,
    getRepository: async () => ({ default_branch: 'develop' }),
    async addComment(number, body) {
      const value = { id: 1000 + comments.length, body, user: bot };
      comments.push(value);
      return value;
    },
    async request(method, route, options = {}) {
      calls.push({ method, route, ...options });
      if (route === '/issues/2/comments') return [...comments];
      if (method === 'PATCH' && route.startsWith('/issues/comments/')) {
        const comment = comments.find(
          (item) => item.id === Number(route.split('/').pop()),
        );
        comment.body = options.body.body;
        return comment;
      }
      if (route === '/actions/workflows/code-agent-task.yml/runs')
        return { workflow_runs: runs };
      if (route.endsWith('/jobs')) return { jobs: [] };
      if (route === '/pulls') return [];
      if (route === '/dispatches') return null;
      throw new Error(`Unexpected request ${method} ${route}`);
    },
  };
  return {
    issue,
    client,
    comments,
    receipts: () => comments.map(readReceipt).filter(Boolean),
    dispatches: () => calls.filter((call) => call.route === '/dispatches'),
  };
}
const maintainerComment = (id, body = '/build\nAdd orders') => ({
  id,
  body,
  user: owner,
  author_association: 'OWNER',
});
const built = [
  {
    id: 1,
    display_title: 'Factory issue #2 build 0',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
  },
];

test("a maintainer's comment on an outsider's Issue is never queued or dispatched", async () => {
  for (const association of [
    'NONE',
    'CONTRIBUTOR',
    'FIRST_TIME_CONTRIBUTOR',
    undefined,
  ]) {
    const f = queueFixture({
      association,
      comments: [
        maintainerComment(21),
        maintainerComment(22, 'How does it work?'),
      ],
      runs: built,
    });
    await coordinate(f.client, 2, 0);
    assert.deepEqual(f.receipts(), [], String(association));
    assert.equal(f.dispatches().length, 0);
  }
  // A member's Issue still takes the same comments.
  const trusted = queueFixture({
    association: 'MEMBER',
    comments: [maintainerComment(21)],
    runs: built,
  });
  await coordinate(trusted.client, 2, 0);
  assert.equal(trusted.dispatches().length, 1);
});

test("a maintainer's comment on the factory's own Issue (daily preset, evaluation sample) still starts a round", async () => {
  // Opened by this repository's workflows with GITHUB_TOKEN: the bot's
  // association is never OWNER, MEMBER or COLLABORATOR.
  for (const association of ['NONE', 'CONTRIBUTOR']) {
    const f = queueFixture({
      association,
      user: bot,
      comments: [maintainerComment(21)],
      runs: built,
    });
    await coordinate(f.client, 2, 0);
    assert.deepEqual(
      f.receipts().map((receipt) => [receipt.id, receipt.status]),
      [[21, 'dispatched']],
    );
    assert.equal(f.dispatches().length, 1);
    const task = await resolveBuildTask(f.client, f.issue, 21);
    assert.match(task.requirements, /Add orders/);
  }
  // Any other bot or App is not trusted, nor a user named like the factory bot.
  for (const user of [
    { login: 'task-manager[bot]', type: 'Bot' },
    { login: 'github-actions[bot]', type: 'User' },
  ]) {
    const f = queueFixture({
      user,
      comments: [maintainerComment(21)],
      runs: built,
    });
    await coordinate(f.client, 2, 0);
    assert.deepEqual(f.receipts(), [], user.login);
    await assert.rejects(
      resolveBuildTask(f.client, f.issue, 21),
      /Issue 作者没有仓库权限/,
    );
  }
});

test("an untrusted Issue's earlier receipts are closed, and a lost dispatch is not sent again", async () => {
  const f = queueFixture({
    comments: [
      maintainerComment(21),
      maintainerComment(22),
      {
        id: 101,
        user: bot,
        body: receiptBody({
          id: 21,
          kind: 'build',
          status: 'dispatched',
          dispatchedAt: 1,
        }),
      },
      {
        id: 102,
        user: bot,
        body: receiptBody({ id: 22, kind: 'build', status: 'queued' }),
      },
    ],
    runs: built,
  });
  await coordinate(f.client, 2, 0);
  const receipts = f.receipts();
  assert.equal(receipts.length, 2);
  for (const receipt of receipts) {
    assert.equal(receipt.status, 'done');
    assert.match(receipt.conclusion, /^rejected: Issue 作者没有仓库权限/);
  }
  assert.equal(f.dispatches().length, 0);
});

test("prepare refuses a comment round on an outsider's Issue before reading it", async () => {
  const f = queueFixture({
    comments: [
      maintainerComment(21),
      {
        id: 101,
        user: bot,
        body: receiptBody({ id: 21, kind: 'build', status: 'dispatched' }),
      },
    ],
  });
  await assert.rejects(
    resolveBuildTask(f.client, f.issue, 21),
    /Issue 作者没有仓库权限/,
  );
  const task = await resolveBuildTask(
    f.client,
    { ...f.issue, author_association: 'COLLABORATOR' },
    21,
  );
  assert.match(task.requirements, /Add orders/);
});

test('the queue workflow drops comment events on Issues from people without repository access', () => {
  const condition = queueWorkflow
    .split('  reconcile:\n')[1]
    .split('runs-on:')[0];
  assert.match(
    condition,
    /contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github\.event\.comment\.author_association\) &&\n\s+\(contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github\.event\.issue\.author_association\) \|\|\n\s+\(github\.event\.issue\.user\.login == 'github-actions\[bot\]' && github\.event\.issue\.user\.type == 'Bot'\)\)/,
  );
});

// ---------------------------------------------------------------- 3

function presetClient({ sourceAssociation = 'OWNER', comments }) {
  const source = {
    number: 1,
    title: '工单系统',
    body: '### 任务类型\n\n创建新系统\n\n### 业务需求\n\n工单\n\n### 验收要求\n\nB01. 打开',
    user: owner,
    author_association: sourceAssociation,
    labels: [{ name: 'factory:preset' }],
    html_url: 'https://github.com/owner/factory/issues/1',
  };
  return {
    source,
    async getIssue() {
      return structuredClone(source);
    },
    async request(method, route) {
      if (route === '/issues/1/comments') return comments;
      throw new Error(`Unexpected request ${method} ${route}`);
    },
  };
}

test('a preset keeps only the comments of people with repository access', async () => {
  const human = (id, association, body) => ({
    id,
    user: { login: `user${id}`, type: 'User' },
    author_association: association,
    body,
    created_at: '2026-10-01T00:00:00Z',
    html_url: `x#${id}`,
  });
  const client = presetClient({
    comments: [
      human(10, 'OWNER', 'MAINTAINER_INPUT'),
      human(11, 'NONE', 'OUTSIDER_INPUT'),
      human(12, 'CONTRIBUTOR', 'CONTRIBUTOR_INPUT'),
      human(13, 'COLLABORATOR', '<!-- factory:review-only -->\nREVIEW_INPUT'),
      { ...human(14, 'OWNER', 'BOT_INPUT'), user: bot },
    ],
  });
  const { comments } = await readPresetSource(client, 1);
  assert.deepEqual(
    comments.map((comment) => comment.id),
    [10, 13],
  );
  const outsider = presetClient({ sourceAssociation: 'NONE', comments: [] });
  await assert.rejects(readPresetSource(outsider, 1), /有仓库权限的维护者/);
  // The rebuild form lists the same presets the capture accepts.
  const form = renderPresetForm([
    { ...client.source, number: 1 },
    { ...outsider.source, number: 2, title: 'Outsider preset' },
  ]);
  assert.match(form, /#1 - 工单系统/);
  assert.doesNotMatch(form, /Outsider preset/);
});

// ---------------------------------------------------------------- 4

function recoveryFixture(t, { outcome = 'handoff' } = {}) {
  const dir = temp(t);
  const task = {
    schemaVersion: 1,
    repository,
    controlSha: A,
    issue: { number: 7 },
    workBranch: 'agent/issue-7',
    applicationBase: { ref: 'apps/demo', sha: B },
    task: {
      targetBranch: 'apps/demo',
      requirements: 'R',
      acceptanceCriteria: 'B01. Q',
    },
  };
  const state = initialize(path.join(dir, 'pipeline-state.json'), task);
  Object.assign(state, {
    controlSha: A,
    phase: 'implementation',
    outcome,
    patchHash: sha256('patch'),
  });
  saveState(path.join(dir, 'pipeline-state.json'), state);
  writeFileSync(path.join(dir, 'task-metadata.json'), JSON.stringify(task));
  writeFileSync(path.join(dir, 'agent.patch'), 'patch');
  return { dir, task, state };
}
const failedRun = {
  id: 900,
  run_attempt: 1,
  created_at: '2026-10-07T00:00:00Z',
  path: '.github/workflows/code-agent-task.yml',
  head_repository: { full_name: repository },
  event: 'issues',
  status: 'completed',
  conclusion: 'failure',
};

test('a handoff checkpoint is recoverable only when no continuation was dispatched', (t) => {
  const f = recoveryFixture(t);
  const args = {
    event: {
      inputs: { issue_number: '7', recovery_run_id: '900' },
      repository: { full_name: repository },
    },
    run: failedRun,
    task: f.task,
    checkpointTask: structuredClone(f.task),
    state: f.state,
    patch: Buffer.from('patch'),
  };
  assert.throws(() => validateRecovery(args), /non-recoverable phase/);
  assert.throws(
    () => validateRecovery({ ...args, undispatchedHandoff: 'true' }),
    /non-recoverable phase/,
  );
  assert.equal(
    validateRecovery({ ...args, undispatchedHandoff: true }).recovery
      .sourceRunId,
    900,
  );
  // A stopped handoff (spent budget) stays unrecoverable.
  assert.throws(
    () =>
      validateRecovery({
        ...args,
        undispatchedHandoff: true,
        state: {
          ...f.state,
          stopReason: { code: 'handoff-limit', reason: 'x' },
        },
      }),
    /non-recoverable phase/,
  );
  const step = (conclusion) => ({
    name: 'agent',
    steps: [{ name: 'Dispatch continuation run', conclusion }],
  });
  const continuation = {
    event: 'repository_dispatch',
    display_title: 'Factory issue #7 build 0 from 900',
  };
  for (const [jobs, runs, expected] of [
    [[step('failure')], [], false],
    [[step('skipped')], [], false],
    [[step('success')], [], true],
    // A failed dispatch that still reached GitHub.
    [[step('failure')], [continuation], true],
    // A recovery from the same run is a workflow_dispatch, not a continuation.
    [
      [step('failure')],
      [{ ...continuation, event: 'workflow_dispatch' }],
      false,
    ],
    [
      [step('failure')],
      [
        {
          ...continuation,
          display_title: 'Factory issue #7 build 0 from 9001',
        },
      ],
      false,
    ],
    // Without the agent job nothing proves the dispatch did not happen.
    [[], [], true],
  ])
    assert.equal(
      handoffDispatched({ jobs, runs, issue: 7, runId: 900 }),
      expected,
    );
});

async function normalizeHandoff(t, { dispatch, continuation = false }) {
  const f = recoveryFixture(t);
  writeFileSync(
    path.join(f.dir, 'event.json'),
    JSON.stringify({
      inputs: { issue_number: '7', recovery_run_id: '900' },
      repository: { full_name: repository, default_branch: 'develop' },
    }),
  );
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname.endsWith('/actions/runs/900'))
      res.end(JSON.stringify(failedRun));
    else if (url.pathname.endsWith('/actions/runs/900/attempts/1/jobs'))
      res.end(
        JSON.stringify({
          jobs: [
            {
              name: 'agent',
              steps: [
                { name: 'Dispatch continuation run', conclusion: dispatch },
              ],
            },
          ],
        }),
      );
    else if (
      url.pathname.endsWith('/actions/workflows/code-agent-task.yml/runs')
    ) {
      assert.equal(url.searchParams.get('event'), 'repository_dispatch');
      assert.equal(
        url.searchParams.get('created'),
        `>=${failedRun.created_at}`,
      );
      res.end(
        JSON.stringify({
          workflow_runs: continuation
            ? [
                {
                  event: 'repository_dispatch',
                  display_title: 'Factory issue #7 build 0 from 900',
                },
              ]
            : [],
        }),
      );
    } else if (url.pathname.endsWith('/heads/apps%2Fdemo'))
      res.end(JSON.stringify({ object: { sha: B } }));
    else res.writeHead(404).end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const child = spawn(
    process.execPath,
    [
      path.join(scripts, 'handoff-recovery.mjs'),
      'normalize',
      '--event',
      path.join(f.dir, 'event.json'),
      '--task',
      path.join(f.dir, 'task-metadata.json'),
      '--checkpoint',
      f.dir,
      '--output',
      path.join(f.dir, 'output'),
    ],
    {
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REPOSITORY: repository,
        GITHUB_TOKEN: 'test-only',
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.resume();
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const [code] = await once(child, 'exit');
  return { code, stderr, dir: f.dir };
}

test('normalize recovers a handoff whose dispatch failed, and refuses one that has a continuation', async (t) => {
  const failed = await normalizeHandoff(t, { dispatch: 'failure' });
  assert.equal(failed.code, 0, failed.stderr);
  assert.equal(
    JSON.parse(readFileSync(path.join(failed.dir, 'handoff.json'), 'utf8'))
      .reason,
    'failed-run-recovery',
  );
  const sent = await normalizeHandoff(t, { dispatch: 'success' });
  assert.notEqual(sent.code, 0);
  assert.match(sent.stderr, /handed off to a continuation/);
  const reached = await normalizeHandoff(t, {
    dispatch: 'failure',
    continuation: true,
  });
  assert.notEqual(reached.code, 0);
  assert.match(reached.stderr, /handed off to a continuation/);
});

function outcomeScript(env) {
  const script = runOf(stepOf('Record agent outcome'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'factory-review10-outcome-'));
  const output = path.join(dir, 'output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: output,
      FACTORY_JOB_STARTED_EPOCH_SECONDS: '',
      ...env,
    },
  });
  const text = readFileSync(output, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  return text;
}

test('the agent job reports a handoff it could not dispatch, and report-failure passes it on', () => {
  const base = { JOB_TIMEOUT_SECONDS: '21600' };
  assert.match(
    outcomeScript({
      ...base,
      HANDOFF_REQUESTED: 'true',
      HANDOFF_OUTCOME: 'success',
      CHECKPOINT_OUTCOME: 'success',
      DISPATCH_OUTCOME: 'failure',
    }),
    /handoff=false\nhandoff_undispatched=true\n/,
  );
  // A refused handoff (spent budget) fails the metadata step: still no successor.
  assert.match(
    outcomeScript({
      ...base,
      HANDOFF_REQUESTED: 'true',
      HANDOFF_OUTCOME: 'failure',
      CHECKPOINT_OUTCOME: 'success',
      DISPATCH_OUTCOME: 'skipped',
    }),
    /handoff_undispatched=true/,
  );
  const sent = outcomeScript({
    ...base,
    HANDOFF_REQUESTED: 'true',
    HANDOFF_OUTCOME: 'success',
    CHECKPOINT_OUTCOME: 'success',
    DISPATCH_OUTCOME: 'success',
  });
  assert.match(sent, /handoff=true/);
  assert.doesNotMatch(sent, /handoff_undispatched/);
  assert.doesNotMatch(
    outcomeScript({
      ...base,
      HANDOFF_REQUESTED: 'false',
      HANDOFF_OUTCOME: 'skipped',
      CHECKPOINT_OUTCOME: 'success',
      DISPATCH_OUTCOME: 'skipped',
    }),
    /handoff_undispatched/,
  );
  assert.match(
    jobOf('agent'),
    /handoff_undispatched: \$\{\{ steps\.outcome\.outputs\.handoff_undispatched \}\}/,
  );
  const mark = stepOf('Mark Issue as failed', jobOf('report-failure'));
  assert.match(
    mark,
    /FACTORY_HANDOFF_UNDISPATCHED: \$\{\{ needs\.agent\.outputs\.handoff_undispatched \}\}/,
  );
  assert.match(
    mark,
    /FACTORY_EMPTY_PATCH: \$\{\{ needs\.agent\.outputs\.empty_patch \}\}/,
  );
});

async function notice(t, state, env) {
  const dir = temp(t);
  writeFileSync(path.join(dir, 'pipeline-state.json'), JSON.stringify(state));
  writeFileSync(
    path.join(dir, 'task-metadata.json'),
    JSON.stringify({ applicationBase: { sha: B } }),
  );
  const mutations = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (req.method !== 'GET')
      mutations.push({ url: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.startsWith('/repos/o/r/labels') && req.method === 'GET'
          ? []
          : { number: 7, labels: [] },
      ),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const child = spawn(
    process.execPath,
    [path.join(scripts, 'mark-failure.mjs'), '7', dir],
    {
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_TOKEN: 'fixture',
        GITHUB_RUN_ID: '100',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        FACTORY_RUN_TIMED_OUT: 'false',
        ...env,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);
  return mutations.find((item) => item.url.endsWith('/comments')).body.body;
}

test('the failure notice offers recovery from an undispatched handoff, never from a cancelled run', async (t) => {
  const handoff = { phase: 'repair', outcome: 'handoff' };
  const offered = await notice(t, handoff, {
    FACTORY_CHECKPOINT_AVAILABLE: 'true',
    FACTORY_HANDOFF_UNDISPATCHED: 'true',
  });
  assert.match(offered, /续跑没有成功派发/);
  assert.match(offered, /recovery_run_id=100/);
  const plain = await notice(t, handoff, {
    FACTORY_CHECKPOINT_AVAILABLE: 'true',
  });
  assert.doesNotMatch(plain, /recovery_run_id/);
  // Without a saved checkpoint, or after a cancel, nothing suggests recovery.
  for (const env of [
    { FACTORY_CHECKPOINT_AVAILABLE: 'false' },
    { FACTORY_CHECKPOINT_AVAILABLE: 'true', FACTORY_RUN_CANCELLED: 'true' },
  ]) {
    const lost = await notice(t, handoff, {
      FACTORY_HANDOFF_UNDISPATCHED: 'true',
      ...env,
    });
    assert.match(lost, /检查点未保存或运行已取消，无法从本 Run 恢复/);
    assert.doesNotMatch(lost, /recovery_run_id|恢复时会再次核对/);
  }
  const cancelled = await notice(
    t,
    { phase: 'repair', outcome: 'failed' },
    {
      FACTORY_CHECKPOINT_AVAILABLE: 'true',
      FACTORY_RUN_CANCELLED: 'true',
    },
  );
  assert.match(cancelled, /本次运行已取消/);
  assert.doesNotMatch(cancelled, /recovery_run_id/);
  const empty = await notice(
    t,
    { phase: 'implementation', outcome: 'failed' },
    { FACTORY_EMPTY_PATCH: 'true' },
  );
  assert.match(empty, /没有保存任何代码差异.*没有创建标记 failed 的搭建 PR/);
});

test('a spent evaluation budget at the handoff records its stop for the notice', () => {
  const handoff = stepOf('Prepare runner handoff metadata');
  assert.match(handoff, /evaluation-budget\.mjs handoff/);
  const budget = readFileSync(
    path.join(scripts, 'evaluation-budget.mjs'),
    'utf8',
  );
  assert.match(
    budget,
    /stopPipeline\(file, state, refusal, 'handoff-limit'\);\n\s+console\.error/,
  );
});

// ---------------------------------------------------------------- 5

const pushScript = runOf(stepOf('Commit and push task branch'));
const branch = 'agent/issue-7';
function pushFixture(t) {
  const dir = temp(t, 'factory-review10-push-');
  const git = (cwd, ...args) =>
    execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const remote = path.join(dir, 'remote.git');
  git(dir, 'init', '--bare', '-b', 'develop', remote);
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-b', 'develop', seed);
  git(seed, 'config', 'user.name', 'Test');
  git(seed, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(path.join(seed, 'app.txt'), 'base\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'base');
  const base = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'HEAD:refs/heads/develop');
  let attempt = 0;
  // The target moves with a commit of the same tree, as a factory-only change
  // the publisher restacks onto would leave the application tree.
  const moveTarget = () => {
    git(seed, 'commit', '--allow-empty', '-m', 'factory-only change');
    git(seed, 'push', 'origin', 'HEAD:refs/heads/develop');
    return git(seed, 'rev-parse', 'HEAD');
  };
  // The record an earlier attempt of this run uploaded (factory-published-N).
  const writeRecord = (value) => {
    mkdirSync(path.join(dir, 'previous-publication'), { recursive: true });
    writeFileSync(
      path.join(dir, 'previous-publication', 'publication.json'),
      JSON.stringify(value),
    );
  };
  // Each attempt is a fresh runner: a new clone at the base with the change staged.
  const push = (change, date, onto = base) => {
    attempt += 1;
    const workspace = path.join(dir, `workspace-${attempt}`);
    git(dir, 'clone', '--quiet', remote, workspace);
    git(workspace, 'checkout', '--quiet', onto);
    writeFileSync(path.join(workspace, 'app.txt'), change);
    git(workspace, 'add', 'app.txt');
    const runnerTemp = path.join(dir, `runner-${attempt}`);
    mkdirSync(runnerTemp);
    const result = spawnSync('bash', ['-eo', 'pipefail', '-c', pushScript], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_REF: 'develop',
        BASE_SHA: base,
        ISSUE_NUMBER: '7',
        WORK_BRANCH: branch,
        EXPECTED_WORK_SHA: '',
        RUNNER_TEMP: runnerTemp,
        GITHUB_RUN_ID: '901',
        GITHUB_RUN_ATTEMPT: String(attempt),
        FACTORY_DELIVERY_STATUS: 'success',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    });
    const record = () =>
      JSON.parse(
        readFileSync(
          path.join(runnerTemp, 'publication-record', 'publication.json'),
          'utf8',
        ),
      );
    return { ...result, record };
  };
  const remoteHead = () => git(remote, 'rev-parse', `refs/heads/${branch}`);
  return { push, remoteHead, moveTarget, writeRecord };
}

test('a re-run publication keeps the commit its earlier attempt pushed instead of failing the lease', (t) => {
  const f = pushFixture(t);
  const first = f.push('feature\n', '2026-10-07T00:00:00Z');
  assert.equal(first.status, 0, first.stderr);
  const pushed = f.remoteHead();
  const again = f.push('feature\n', '2026-10-07T01:00:00Z');
  assert.equal(again.status, 0, again.stderr);
  assert.match(
    again.stdout,
    /already holds this verified tree at [a-f0-9]{40}, published by this task/,
  );
  assert.equal(f.remoteHead(), pushed);
  assert.equal(again.record().commit, pushed);
  // Different content is still refused by the new-branch lease.
  const other = f.push('other\n', '2026-10-07T02:00:00Z');
  assert.notEqual(other.status, 0);
  assert.equal(f.remoteHead(), pushed);
});

test("after the target moved, only this run's publication record lets a re-run keep its earlier commit", (t) => {
  const f = pushFixture(t);
  const first = f.push('feature\n', '2026-10-07T00:00:00Z');
  assert.equal(first.status, 0, first.stderr);
  const pushed = f.remoteHead();
  const moved = f.moveTarget();
  // Same tree on a new parent, without a record: not provably this run's.
  const unrecorded = f.push('feature\n', '2026-10-07T01:00:00Z', moved);
  assert.notEqual(unrecorded.status, 0);
  // A record of another run does not count either.
  f.writeRecord({ ...first.record(), sourceRunId: 900 });
  assert.notEqual(f.push('feature\n', '2026-10-07T02:00:00Z', moved).status, 0);
  f.writeRecord(first.record());
  const kept = f.push('feature\n', '2026-10-07T03:00:00Z', moved);
  assert.equal(kept.status, 0, kept.stderr);
  assert.match(kept.stdout, /published by this task/);
  assert.equal(f.remoteHead(), pushed);
  assert.equal(kept.record().commit, pushed);
  // The record never admits different content.
  assert.notEqual(f.push('other\n', '2026-10-07T04:00:00Z', moved).status, 0);
  assert.equal(f.remoteHead(), pushed);
  const download = stepOf(
    "Download this run's publication record",
    jobOf('publish'),
  );
  assert.match(download, /if: github\.run_attempt > 1/);
  assert.match(download, /continue-on-error: true/);
  assert.match(download, /path: previous-publication\n/);
});

function pullClient(responses) {
  const calls = [];
  return {
    calls,
    async request(method, route, options) {
      calls.push({ method, route, options });
      const next = responses[method].shift();
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next() : next;
    },
  };
}
const pullArgs = {
  owner: 'o',
  workBranch: branch,
  targetBranch: 'develop',
  body: { title: 't' },
};
const noSleep = { delays: [0, 0], sleep: async () => {} };

test('creating the PR looks it up after a failed create and retries only transient failures', async () => {
  const existing = { number: 5, base: { ref: 'develop' }, html_url: 'pr/5' };
  // The response was lost but the PR exists.
  let client = pullClient({
    POST: [new Error('GitHub API POST /pulls failed (502): bad gateway')],
    GET: [[existing]],
  });
  assert.equal(await createPull(client, pullArgs, noSleep), existing);
  assert.equal(client.calls.filter((call) => call.method === 'POST').length, 1);
  // A timeout without a PR is retried.
  const created = { number: 6, html_url: 'pr/6' };
  client = pullClient({
    POST: [
      Object.assign(new Error('The operation timed out'), {
        name: 'TimeoutError',
      }),
      created,
    ],
    GET: [[]],
  });
  assert.equal(await createPull(client, pullArgs, noSleep), created);
  // "already exists" before the listing shows it: look again.
  client = pullClient({
    POST: [
      new Error(
        'GitHub API POST /pulls failed (422): A pull request already exists for o:agent/issue-7.',
      ),
      new Error(
        'GitHub API POST /pulls failed (422): A pull request already exists',
      ),
    ],
    GET: [[], [existing]],
  });
  assert.equal(await createPull(client, pullArgs, noSleep), existing);
  // Any other refusal is final.
  client = pullClient({
    POST: [
      new Error(
        'GitHub API POST /pulls failed (422): No commits between develop and agent/issue-7',
      ),
    ],
    GET: [[]],
  });
  await assert.rejects(createPull(client, pullArgs, noSleep), /No commits/);
  assert.equal(client.calls.filter((call) => call.method === 'POST').length, 1);
});

// ---------------------------------------------------------------- 6

test('a continuation downloads and verifies its checkpoint before the application checkout, and keeps it on cancellation', () => {
  const agent = jobOf('agent');
  const index = (name) => agent.indexOf(`- name: ${name}\n`);
  assert.ok(
    index('Download handoff checkpoint') < index('Check out application base'),
  );
  assert.ok(
    index('Download normalized task') < index('Check out application base'),
  );
  assert.ok(
    index('Verify the pinned handoff control plane') <
      index('Check out application base'),
  );
  assert.match(
    stepOf('Keep the handed-off checkpoint'),
    /\(failure\(\) \|\| cancelled\(\)\)/,
  );
  assert.match(
    stepOf('Mark a continuation that failed during setup'),
    /\(failure\(\) \|\| cancelled\(\)\)/,
  );
  assert.match(
    stepOf('Create deterministic patch'),
    /\(failure\(\) \|\| cancelled\(\)\) && steps\.setup_failure\.outcome == 'success'/,
  );
});

// ---------------------------------------------------------------- 7

test('no run script of the task workflow interpolates an expression', () => {
  let checked = 0;
  for (const step of workflow.split(/\n\s+- (?=name:|uses:|run:)/)) {
    const run = /\n?\s*run: (\|\n[\s\S]*|.*)$/.exec(step)?.[1];
    if (!run) continue;
    checked++;
    assert.doesNotMatch(run, /\$\{\{/, step.split('\n')[0]);
  }
  assert.ok(checked > 60);
});

// ---------------------------------------------------------------- 8

test('a recovery uploads only the normalized files and the agent job checks the checkpoint it downloads itself', (t) => {
  const save = stepOf('Save normalized recovery checkpoint', jobOf('prepare'));
  assert.match(
    save,
    /path: \|\n\s+recovery\/task-event\.json\n\s+recovery\/handoff\.json\n\s+recovery\/recovery\.json\n/,
  );
  const agent = jobOf('agent');
  const download = stepOf("Download the failed run's checkpoint", agent);
  assert.match(
    download,
    /uses: \.\/factory-actions\/\.github\/actions\/download-with-retry/,
  );
  assert.match(download, /run-id: \$\{\{ inputs\.recovery_run_id \}\}/);
  assert.match(download, /path: handoff\n/);
  const apply = stepOf('Apply the normalized recovery files', agent);
  assert.match(apply, /handoff-recovery\.mjs match --checkpoint handoff/);
  assert.ok(
    agent.indexOf('- name: Apply the normalized recovery files') <
      agent.indexOf('- name: Verify the pinned handoff control plane'),
  );

  // match accepts the validated checkpoint and refuses any other.
  const f = recoveryFixture(t, { outcome: 'failed' });
  writeFileSync(
    path.join(f.dir, 'recovery.json'),
    JSON.stringify({
      sourceRunId: 900,
      controlSha: A,
      inputHash: f.state.inputHash,
      patchHash: sha256('patch'),
    }),
  );
  const match = () =>
    spawnSync(
      process.execPath,
      [
        path.join(scripts, 'handoff-recovery.mjs'),
        'match',
        '--checkpoint',
        f.dir,
      ],
      { encoding: 'utf8' },
    );
  assert.equal(match().status, 0, match().stderr);
  writeFileSync(path.join(f.dir, 'agent.patch'), 'other patch');
  const refused = match();
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /not the one this recovery validated/);
});

// ---------------------------------------------------------------- 9

test('the pinned font package is cached under its SHA-256: saved by the agent job, restored by verify-final', (t) => {
  const script = readFileSync(
    path.join(scripts, 'install-browser-fonts.sh'),
    'utf8',
  );
  const sha = /^FONT_DEB_SHA256=([0-9a-f]{64})$/m.exec(script)[1];
  const read = runOf(
    stepOf('Read the pinned Chinese font package', jobOf('agent')),
  );
  const output = path.join(temp(t), 'output');
  const result = spawnSync('bash', ['-eo', 'pipefail', '-c', read], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FONT_SCRIPT: path.join(scripts, 'install-browser-fonts.sh'),
      GITHUB_OUTPUT: output,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), `sha=${sha}\n`);
  for (const name of ['agent', 'verify-final']) {
    const job = jobOf(name);
    const restore = stepOf('Restore the pinned Chinese font package', job);
    assert.match(restore, /uses: actions\/cache\/restore@[0-9a-f]{40}/);
    assert.match(
      restore,
      /key: browser-font-deb-\$\{\{ runner\.os \}\}-\$\{\{ steps\.font_pin\.outputs\.sha \}\}/,
    );
    assert.match(
      stepOf('Install Chinese browser fonts', job),
      /FACTORY_FONT_DEB_CACHE: \$\{\{ github\.workspace \}\}\/browser-font-cache/,
    );
    assert.ok(
      job.indexOf('Restore the pinned Chinese font package') <
        job.indexOf('- name: Install Chinese browser fonts'),
    );
  }
  const save = stepOf('Save the pinned Chinese font package', jobOf('agent'));
  assert.match(save, /uses: actions\/cache\/save@[0-9a-f]{40}/);
  assert.match(save, /steps\.font_cache\.outputs\.cache-hit != 'true'/);
  assert.match(save, /continue-on-error: true/);
  // Saved before any model call.
  assert.ok(
    jobOf('agent').indexOf('- name: Save the pinned Chinese font package') <
      jobOf('agent').indexOf('- name: Run Code Agent implementation'),
  );
  assert.doesNotMatch(jobOf('verify-final'), /actions\/cache\/save@/);
  // ffmpeg refreshes the index only when installing from the current one fails.
  const ffmpeg = runOf(stepOf('Install optional video encoder'));
  assert.ok(
    ffmpeg.indexOf('apt-get install') < ffmpeg.indexOf('apt-get update'),
  );
});

// ---------------------------------------------------------------- 11

test('the retrying download fails only when both attempts failed', () => {
  const action = readFileSync(
    path.join(root, '.github/actions/download-with-retry/action.yml'),
    'utf8',
  );
  const steps = action.split('\n    - name: ').slice(1);
  assert.equal(steps.length, 5);
  for (const step of steps.slice(0, 2))
    assert.match(step, /continue-on-error: true/);
  assert.match(
    steps[2],
    /if: steps\.this_run\.outcome == 'failure' \|\| steps\.other_run\.outcome == 'failure'\n\s+shell: bash\n\s+run: sleep 30/,
  );
  for (const step of steps.slice(3)) {
    assert.match(step, /if: steps\.(this_run|other_run)\.outcome == 'failure'/);
    assert.doesNotMatch(step, /continue-on-error/);
  }
  // This run's artifacts are read without a token, as before.
  assert.doesNotMatch(steps[0].split('with:')[1], /github-token|run-id/);
  assert.doesNotMatch(steps[3].split('with:')[1], /github-token|run-id/);
  assert.doesNotMatch(action, /timeout-minutes/);
  // Every former copy of the download-wait-retry steps uses it.
  assert.doesNotMatch(workflow, /- name: (Wait before retrying|Retry the)/);
  assert.equal(
    [
      ...workflow.matchAll(
        /uses: \.\/factory-actions\/\.github\/actions\/download-with-retry\n/g,
      ),
    ].length,
    5,
  );
});

// ---------------------------------------------------------------- 12

test('a failed build with an empty patch on a new branch skips publish-failed and says why', (t) => {
  const step = stepOf('Check for a publishable diff');
  assert.match(step, /continue-on-error: true/);
  const script = runOf(step);
  const check = (baseRef, patch, expectedWorkSha = '') => {
    const dir = temp(t);
    mkdirSync(path.join(dir, 'agent-artifacts'));
    if (patch !== null)
      writeFileSync(path.join(dir, 'agent-artifacts', 'agent.patch'), patch);
    const output = path.join(dir, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
        BASE_REF: baseRef,
        WORK_BRANCH: branch,
        EXPECTED_WORK_SHA: expectedWorkSha,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(output, 'utf8');
  };
  assert.equal(check('develop', ''), 'empty=true\n');
  assert.equal(check('develop', 'diff --git a/x b/x\n'), '');
  // An existing work branch's PR is still marked failed.
  assert.equal(check(branch, ''), '');
  // A recovery keeps the target as its base, yet the failed run's publication
  // created the work branch: its PR is still marked failed.
  assert.equal(check('develop', '', A), '');
  assert.match(
    step,
    /EXPECTED_WORK_SHA: \$\{\{ needs\.prepare\.outputs\.expected_work_sha \}\}/,
  );
  const failed = jobOf('publish-failed');
  assert.match(failed, /needs\.agent\.outputs\.empty_patch != 'true'/);
  assert.match(
    jobOf('agent'),
    /empty_patch: \$\{\{ steps\.diff\.outputs\.empty == 'true' \}\}/,
  );
});
