import assert from 'node:assert/strict';
import test from 'node:test';
import { coordinate as reconcile, main } from '../dispatch-comment-builds.mjs';
import {
  parseBuild,
  readReceipt,
  receiptBody,
  resolveBuildTask,
} from '../comment-queue.mjs';

const coordinate = (client, number) => reconcile(client, number, 0);

const task = {
  targetBranch: 'apps/demo',
  taskType: '创建新系统',
  requirements: 'Original',
  acceptanceCriteria: 'Works',
  sampleData: '是',
};
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const owner = { login: 'gchust', type: 'User' };
const issue = {
  number: 2,
  state: 'open',
  user: owner,
  body: '### 目标分支\napps/demo\n### 任务类型\n创建新系统\n### 业务需求\nOriginal\n### 验收要求\nWorks',
};
const command = (id, body = `/build\nFeature ${id}`, user = owner) => ({
  id,
  body,
  user,
});
const run = (id, build = 0, status = 'completed', conclusion = 'success') => ({
  id,
  display_title: `Factory issue #2 build ${build}`,
  status,
  conclusion,
  run_attempt: 1,
});
function fixture({ comments = [], runs = [], jobs = [], pulls = [] } = {}) {
  const calls = [];
  const client = {
    repository: 'gchust/nb3-factory',
    getIssue: async () => issue,
    getRepository: async () => ({ default_branch: 'develop' }),
    getRef: async () => null,
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
      if (route.endsWith('/jobs')) return { jobs };
      if (route === '/pulls') return pulls.map((pull) => ({ base: { ref: 'apps/demo' }, ...pull }));
      if (route === '/dispatches') return null;
      if (route === '/issues') return [issue];
      throw new Error(`Unexpected request ${method} ${route}`);
    },
  };
  return {
    client,
    comments,
    calls,
    receipts: () => comments.map(readReceipt).filter(Boolean),
    dispatches: () => calls.filter((call) => call.route === '/dispatches'),
  };
}

test('only a standalone /build command with a prompt is accepted', () => {
  assert.equal(parseBuild('/build\r\n\r\nAdd orders'), 'Add orders');
  for (const body of [
    '/build',
    '/builder\ntext',
    'please /build\ntext',
    '/build do this',
  ])
    assert.equal(parseBuild(body), null);
});
test('receipt JSON cannot break out of its marker and owner cannot spoof bot state', () => {
  const data = {
    id: 20,
    task,
    prompt: '-->\n/build\n<script>',
    status: 'queued',
  };
  const body = receiptBody(data);
  assert.equal(readReceipt({ id: 99, user: bot, body }).excerpt, data.prompt);
  assert.equal(readReceipt({ user: owner, body }), null);
});
test('queued comments refresh their display while waiting for the current workflow', async () => {
  const f = fixture({
    comments: [
      command(22),
      command(21),
      command(23, '/build\nBot output', bot),
    ],
    runs: [run(1, 0, 'in_progress')],
  });
  await coordinate(f.client, 2);
  assert.deepEqual(
    f.receipts().map((item) => item.id),
    [21, 22],
  );
  assert.equal(f.dispatches().length, 0);
  f.comments.find((item) => item.id === 21).body = '/build\nEdited';
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].excerpt, 'Edited');
  assert.equal(f.receipts()[0].prompt, undefined);
  assert.equal(f.receipts()[0].task, undefined);
  assert.equal(f.receipts().length, 2);
});
test('completion dispatches one round; repeated events do not duplicate dispatch', async () => {
  const f = fixture({ comments: [command(21), command(22)], runs: [run(1)] });
  await coordinate(f.client, 2);
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 1);
  assert.deepEqual(f.dispatches()[0].body.client_payload, {
    issue_number: 2,
    build_comment_id: 21,
  });
});
test('failed round finishes and next prompt starts on the existing branch', async () => {
  const runs = [run(1)];
  const f = fixture({ comments: [command(21), command(22)], runs });
  await coordinate(f.client, 2);
  runs.push(run(2, 21, 'completed', 'failure'));
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].conclusion, 'failure');
  assert.equal(f.dispatches()[1].body.client_payload.build_comment_id, 22);
  const result = await resolveBuildTask(f.client, issue, 22);
  assert.match(result.requirements, /Feature 21/);
  assert.match(result.requirements, /本轮必须实现的追加指令 #22/);
  assert.match(result.requirements, /Feature 22/);
  assert.equal(result.targetBranch, 'apps/demo');
  await assert.rejects(resolveBuildTask(f.client, issue, 21), /已经结束/);
});
for (const build of [0, 21]) {
  test(`build ${build} handoff does not release the queue before continuation appears`, async () => {
    const comments = [command(21), command(22)];
    if (build)
      comments.push({
        id: 999,
        user: bot,
        body: receiptBody({
          id: 21,
          task,
          prompt: 'Feature 21',
          status: 'dispatched',
        }),
      });
    const f = fixture({
      comments,
      runs: [run(2, build)],
      jobs: [
        {
          steps: [{ name: 'Dispatch continuation run', conclusion: 'success' }],
        },
      ],
    });
    await coordinate(f.client, 2);
    assert.equal(f.dispatches().length, 0);
  });
}
test('a running continuation blocks the queue even when earlier run completed', async () => {
  const f = fixture({
    comments: [command(21)],
    runs: [run(2, 0, 'queued'), run(1)],
  });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 0);
});
test('closed PR never produces a second PR round', async () => {
  const f = fixture({
    comments: [command(21)],
    runs: [run(1)],
    pulls: [
      {
        state: 'closed',
        head: {
          ref: 'agent/issue-2',
          repo: { full_name: 'gchust/nb3-factory' },
        },
      },
    ],
  });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 0);
});
test('bot comments and PR comments cannot cause writes or dispatch', async () => {
  const f = fixture();
  await main(
    {
      action: 'created',
      issue,
      comment: command(21, '/build\nBot output', bot),
    },
    f.client,
  );
  await main(
    {
      action: 'created',
      issue: { ...issue, pull_request: {} },
      comment: command(21),
    },
    f.client,
  );
  assert.equal(f.calls.length, 0);
});

test('ordinary user comments become read-only question rounds', async () => {
  const f = fixture({
    comments: [command(21, '现在支持哪些权限？')],
    runs: [run(1)],
  });
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].kind, 'reply');
  const task = await resolveBuildTask(f.client, issue, 21);
  assert.equal(task.commentKind, 'reply');
  assert.equal(task.sourceComment.prompt, '现在支持哪些权限？');
  assert.match(task.sourceComment.url, /#issuecomment-21$/);
  assert.match(
    f.comments.find((item) => item.user === bot).body,
    /> 现在支持哪些权限？/,
  );
});

test('bot status updates and agent replies never enqueue themselves', async () => {
  const f = fixture({
    comments: [command(21, 'An answer', bot)],
    runs: [run(1)],
  });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 0);
});

test('long source comments do not overflow queue receipts or lose prompt content', async () => {
  const f = fixture({
    comments: [command(21, 'x'.repeat(65000)), command(22, 'What works?')],
    runs: [run(1)],
  });
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].excerpt.length, 1500);
  assert.equal(f.dispatches()[0].body.client_payload.build_comment_id, 21);
  const live = await resolveBuildTask(f.client, issue, 21);
  assert.equal(live.sourceComment.prompt.length, 65000);
});

test('another open task PR keeps the next round queued instead of consuming it', async () => {
  const f = fixture({
    comments: [command(21)],
    runs: [run(1)],
    pulls: [
      {
        state: 'open',
        head: {
          ref: 'agent/issue-3',
          repo: { full_name: 'gchust/nb3-factory' },
        },
      },
    ],
  });
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].status, 'queued');
});

test('dispatch network failure retries the same comment instead of losing the round', async () => {
  const f = fixture({ comments: [command(21)], runs: [run(1)] });
  await coordinate(f.client, 2);
  const receipt = f.comments.find((comment) => readReceipt(comment));
  const data = readReceipt(receipt);
  receipt.body = receiptBody({ ...data, dispatchedAt: Date.now() - 600000 });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 2);
  assert.equal(f.dispatches()[1].body.client_payload.build_comment_id, 21);
});

test('claims reject duplicate initial runs and allow only the next continuation', async () => {
  const { claimComment, claimedRuns } = await import('../comment-queue.mjs');
  const f = fixture();
  assert.equal(await claimComment(f.client, 2, 21, 101), true);
  assert.equal(await claimComment(f.client, 2, 21, 102), false);
  assert.equal(await claimComment(f.client, 2, 21, 103, 101), true);
  assert.equal(await claimComment(f.client, 2, 21, 104, 101), false);
  assert.equal(await claimComment(f.client, 2, 21, 101), false);
  assert.equal(await claimComment(f.client, 2, 21, 103), true);
  assert.deepEqual(claimedRuns(f.comments, 21), [101, 103]);
});

test('duplicate rejected run does not release a claimed handoff round', async () => {
  const comments = [
    command(21),
    command(22),
    {
      id: 900,
      user: bot,
      body: receiptBody({
        id: 21,
        task,
        prompt: 'Feature',
        status: 'dispatched',
      }),
    },
    { id: 901, user: bot, body: '<!-- factory-comment-claim:21:100 -->' },
  ];
  const f = fixture({
    comments,
    runs: [run(101, 21), run(100, 21)],
    jobs: [
      { steps: [{ name: 'Dispatch continuation run', conclusion: 'success' }] },
    ],
  });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 0);
  assert.ok(f.calls.some((call) => call.route.includes('/runs/100/attempts/')));
});

test('a continuation cancelled before prepare still finishes the round', async () => {
  const comments = [
    command(21),
    command(22),
    {
      id: 900,
      user: bot,
      body: receiptBody({
        id: 21,
        task,
        prompt: 'Feature',
        status: 'dispatched',
      }),
    },
    { id: 901, user: bot, body: '<!-- factory-comment-claim:21:100 -->' },
  ];
  const f = fixture({
    comments,
    runs: [
      {
        ...run(101, 21, 'completed', 'cancelled'),
        display_title: 'Factory issue #2 build 21 from 100',
      },
      run(100, 21),
    ],
  });
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].conclusion, 'cancelled');
  assert.equal(f.dispatches()[0].body.client_payload.build_comment_id, 22);
});

test('closed Issue rejects new builds but still answers user questions', async () => {
  const f = fixture({
    comments: [command(21), command(22, 'How does this work?')],
    runs: [run(1)],
  });
  f.client.getIssue = async () => ({ ...issue, state: 'closed' });
  await coordinate(f.client, 2);
  assert.match(f.receipts()[0].conclusion, /^rejected:/);
  assert.equal(f.dispatches()[0].body.client_payload.build_comment_id, 22);
});

test('scheduled reconciliation never backfills historical comments before activation', async () => {
  const f = fixture({
    comments: [command(21, 'Old discussion')],
    runs: [run(1)],
  });
  await main({}, f.client);
  assert.equal(f.receipts().length, 0);
  f.comments.push(command(22, 'New question'));
  await main(
    { action: 'created', issue, comment: command(22, 'New question') },
    f.client,
  );
  assert.deepEqual(
    f.receipts().map((item) => item.id),
    [22],
  );
});

test('questions on an old closed PR still work after workflow artifacts expire', async () => {
  const f = fixture({
    comments: [command(21, 'What does this app do?')],
    pulls: [
      {
        state: 'closed',
        head: {
          ref: 'agent/issue-2',
          repo: { full_name: 'gchust/nb3-factory' },
        },
      },
    ],
  });
  f.client.getIssue = async () => ({ ...issue, state: 'closed' });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches()[0].body.client_payload.build_comment_id, 21);
});

test('execution uses current Issue requirements and comment even after dispatch', async () => {
  const f = fixture({ comments: [command(21)], runs: [run(1)] });
  await coordinate(f.client, 2);
  f.comments.find((c) => c.id === 21).body =
    '/build\nCorrected business request';
  const updated = {
    ...issue,
    body: issue.body
      .replace('Original', 'New business context')
      .replace('Works', 'New acceptance'),
  };
  const task = await resolveBuildTask(f.client, updated, 21);
  assert.match(task.requirements, /New business context/);
  assert.match(task.requirements, /Corrected business request/);
  assert.match(task.acceptanceCriteria, /New acceptance/);
  assert.doesNotMatch(task.requirements, /Original|Feature 21/);
});

test('legacy snapshots never override live source content', async () => {
  const f = fixture({
    comments: [
      command(21, '/build\nBusiness only'),
      {
        id: 999,
        user: bot,
        body:
          '<!-- factory-build-v1\n' +
          JSON.stringify({
            id: 21,
            status: 'dispatched',
            kind: 'build',
            prompt: 'Use old technology',
            task: { ...task, requirements: 'Obsolete issue' },
          }) +
          '\n-->',
      },
    ],
    runs: [run(1)],
  });
  const live = await resolveBuildTask(f.client, issue, 21);
  assert.match(live.requirements, /Business only/);
  assert.doesNotMatch(live.requirements, /Use old technology|Obsolete issue/);
});

for (const body of ['Now answer a question', '/build\nNow implement this']) {
  test(`editing a queued comment changes execution type: ${body.split('\n')[0]}`, async () => {
    const f = fixture({
      comments: [command(21)],
      runs: [run(1, 0, 'in_progress')],
    });
    await coordinate(f.client, 2);
    f.comments.find((c) => c.id === 21).body = body;
    await main(
      { action: 'edited', issue, comment: command(21, body) },
      f.client,
    );
    assert.equal(
      f.receipts()[0].kind,
      body.startsWith('/build\n') ? 'build' : 'reply',
    );
    const receipt = f.comments.find((c) => readReceipt(c));
    receipt.body = receiptBody({
      ...readReceipt(receipt),
      status: 'dispatched',
    });
    const task = await resolveBuildTask(f.client, issue, 21);
    assert.equal(
      task.commentKind,
      body.startsWith('/build\n') ? 'build' : 'reply',
    );
  });
}

for (const removed of [true, false]) {
  test(`deleted or empty queued comment is skipped: deleted=${removed}`, async () => {
    const runs = [run(1, 0, 'in_progress')];
    const f = fixture({ comments: [command(21), command(22)], runs });
    await coordinate(f.client, 2);
    if (removed)
      f.comments.splice(
        f.comments.findIndex((c) => c.id === 21),
        1,
      );
    else f.comments.find((c) => c.id === 21).body = '';
    runs[0].status = 'completed';
    await coordinate(f.client, 2);
    assert.match(f.receipts()[0].conclusion, /^cancelled:/);
    assert.equal(f.dispatches()[0].body.client_payload.build_comment_id, 22);
  });
}

test('deleted or bot-authored comments cannot execute stale text', async () => {
  const f = fixture({ comments: [command(21)], runs: [run(1)] });
  await coordinate(f.client, 2);
  f.comments.find((c) => c.id === 21).user = bot;
  await assert.rejects(resolveBuildTask(f.client, issue, 21), /删除或作者/);
  f.comments.splice(
    f.comments.findIndex((c) => c.id === 21),
    1,
  );
  await assert.rejects(resolveBuildTask(f.client, issue, 21), /删除或作者/);
});

test('editing a finished comment does not enqueue another execution', async () => {
  const runs = [run(1)];
  const f = fixture({ comments: [command(21)], runs });
  await coordinate(f.client, 2);
  runs.push(run(2, 21));
  await coordinate(f.client, 2);
  f.comments.find((c) => c.id === 21).body = '/build\nChanged after completion';
  await main(
    {
      action: 'edited',
      issue,
      comment: command(21, '/build\nChanged after completion'),
    },
    f.client,
  );
  assert.equal(f.dispatches().length, 1);
  assert.equal(f.receipts()[0].status, 'done');
});

test('completion recognizes a dispatched build edited into a question', async () => {
  const runs = [run(1)];
  const jobs = [];
  const f = fixture({ comments: [command(21)], runs, jobs });
  await coordinate(f.client, 2);
  f.comments.find((c) => c.id === 21).body = 'Please explain the result';
  runs.push(run(2, 21));
  jobs.push(
    { name: 'agent', conclusion: 'skipped' },
    { name: 'reply', conclusion: 'success' },
  );
  await coordinate(f.client, 2);
  assert.equal(f.receipts()[0].kind, 'reply');
  assert.equal(f.receipts()[0].conclusion, 'success');
});

for (const body of [
  '/build\nExternal feature',
  'How does this feature work?',
]) {
  test(`external user can trigger a round on another user's Issue: ${body}`, async () => {
    const outsider = { login: 'external-contributor', type: 'User' };
    const externalIssue = {
      ...issue,
      user: { login: 'another-user', type: 'User' },
    };
    const comment = command(21, body, outsider);
    const f = fixture({ comments: [comment], runs: [run(1)] });
    f.client.getIssue = async () => externalIssue;
    await main({ action: 'created', issue: externalIssue, comment }, f.client);
    assert.equal(f.dispatches().length, 1);
    const task = await resolveBuildTask(f.client, externalIssue, 21);
    assert.match(
      task.requirements,
      body.startsWith('/build')
        ? /External feature/
        : /How does this feature work/,
    );
    assert.equal(
      task.commentKind,
      body.startsWith('/build') ? 'build' : 'reply',
    );
  });
}

for (const branch of ['', 'develop']) {
  test(`another default-target PR cannot block a comment round: ${branch || 'omitted'}`, async () => {
    const f = fixture({ comments: [command(21)], runs: [run(1)], pulls: [{
      state: 'open', base: { ref: 'develop' },
      head: { ref: 'agent/issue-99', repo: { full_name: 'gchust/nb3-factory' } },
    }] });
    f.client.getIssue = async () => ({ ...issue, body: issue.body.replace('apps/demo', branch) });
    await coordinate(f.client, 2);
    assert.equal(f.dispatches().length, 1);
    assert.equal(f.dispatches()[0].body.client_payload.build_comment_id, 21);
  });
}
test('a PR on another explicit application branch does not block this queue', async () => {
  const f = fixture({ comments: [command(21)], runs: [run(1)], pulls: [{
    state: 'open', base: { ref: 'apps/other' },
    head: { ref: 'agent/issue-99', repo: { full_name: 'gchust/nb3-factory' } },
  }] });
  await coordinate(f.client, 2);
  assert.equal(f.dispatches().length, 1);
});
