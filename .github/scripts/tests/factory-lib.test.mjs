import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GitHubClient,
  TaskInputError,
  assertSafeChangedPaths,
  extractIssueSections,
  issueNumberFromEvent,
  parseIssueTask,
  validateTargetBranch,
} from '../factory-lib.mjs';

const validBody = `### 目标分支

apps/it-service-desk

### 任务类型

继续完善现有系统

### 业务需求

员工可以提交工单。

处理人员可以分派、解决工单。

### 验收要求

1. 员工可以查看进度
2. 服务台可以查看逾期

### 示例数据

是

### 确认

- [x] 我确认
`;

test('extractIssueSections keeps multiline field values', () => {
  const sections = extractIssueSections(validBody);
  assert.equal(sections.get('目标分支'), 'apps/it-service-desk');
  assert.match(sections.get('业务需求'), /员工可以提交工单。[\s\S]*处理人员/);
});

test('parseIssueTask normalizes the Issue Form body', () => {
  const task = parseIssueTask({ body: validBody });
  assert.deepEqual(task, {
    targetBranch: 'apps/it-service-desk',
    taskType: '继续完善现有系统',
    requirements: '员工可以提交工单。\n\n处理人员可以分派、解决工单。',
    acceptanceCriteria: '1. 员工可以查看进度\n2. 服务台可以查看逾期',
    sampleData: '是',
  });
});

test('parseIssueTask derives acceptance criteria from the business requirements when omitted', () => {
  const body = validBody.replace('1. 员工可以查看进度\n2. 服务台可以查看逾期', '_No response_');
  const task = parseIssueTask({ body });
  assert.match(task.acceptanceCriteria, /^未填写验收要求/u);
  assert.match(task.acceptanceCriteria, /C01\. 员工可以提交工单。\n\n处理人员可以分派、解决工单。$/u);
  assert.equal(task.requirements, '员工可以提交工单。\n\n处理人员可以分派、解决工单。');
});

test('parseIssueTask rejects missing required content', () => {
  assert.throws(
    () =>
      parseIssueTask({
        body: validBody.replace(
          '员工可以提交工单。\n\n处理人员可以分派、解决工单。',
          '_No response_',
        ),
      }),
    TaskInputError,
  );
});

test('parseIssueTask ignores the legacy repair count field', () => {
  const body = validBody.replace(
    '### 确认',
    '### 自动修复次数\n\n0 次\n\n### 确认',
  );
  assert.deepEqual(
    parseIssueTask({ body }),
    parseIssueTask({ body: validBody }),
  );
});

test('target branch validation accepts optional namespaces and rejects invalid refs', () => {
  assert.equal(validateTargetBranch('apps/crm-v2'), 'apps/crm-v2');
  assert.equal(validateTargetBranch('apps/team/crm_2'), 'apps/team/crm_2');
  for (const invalid of [
    'HEAD',
    'a.lock',
    'team/.hidden',
    'a//b',
    'a/',
    'apps/../main',
    'apps/a lock',
  ]) {
    assert.throws(() => validateTargetBranch(invalid), TaskInputError);
  }
});

test('issue number resolves from every supported trigger', () => {
  assert.equal(issueNumberFromEvent({ issue: { number: 12 } }), 12);
  assert.equal(
    issueNumberFromEvent({ client_payload: { issue_number: '13' } }),
    13,
  );
  assert.equal(issueNumberFromEvent({ inputs: { issue_number: 14 } }), 14);
  assert.throws(
    () => issueNumberFromEvent({ inputs: { issue_number: '../1' } }),
    TaskInputError,
  );
});

test('factory control files cannot be published from a Code Agent patch', () => {
  assert.doesNotThrow(() =>
    assertSafeChangedPaths(['client/pages/orders.tsx', 'pnpm-lock.yaml']),
  );
  for (const file of [
    '.github/workflows/code-agent-task.yml',
    '.npmrc',
    '.gitmodules',
    'config.yml',
  ]) {
    assert.throws(() => assertSafeChangedPaths([file]), TaskInputError);
  }
});

function replyWith(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.method);
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
    });
  });
  t.mock.method(console, 'warn', () => {});
  return calls;
}

const retryingClient = () =>
  new GitHubClient({
    token: 'test-only',
    repository: 'owner/factory',
    retryDelays: [0, 0],
  });

test('GitHub reads retry a short outage or dropped connection', async (t) => {
  const calls = replyWith(t, [
    { status: 503 },
    new TypeError('fetch failed'),
    { status: 200, body: [{ number: 7 }] },
  ]);
  assert.deepEqual(await retryingClient().request('GET', '/issues'), [
    { number: 7 },
  ]);
  assert.deepEqual(calls, ['GET', 'GET', 'GET']);
});

test('GitHub retries are bounded and keep the final status', async (t) => {
  const calls = replyWith(t, [
    { status: 502 },
    { status: 504 },
    { status: 503, body: { message: 'unavailable' } },
  ]);
  await assert.rejects(
    retryingClient().request('PATCH', '/issues/7', { body: { body: 'x' } }),
    /GitHub API PATCH \/issues\/7 failed \(503\): .*unavailable/,
  );
  assert.equal(calls.length, 3);
});

test('GitHub writes that create something and ordinary errors are not retried', async (t) => {
  const calls = replyWith(t, [
    { status: 503 },
    new TypeError('fetch failed'),
    { status: 500 },
    { status: 422 },
  ]);
  const client = retryingClient();
  const comment = { body: { body: 'x' } };
  await assert.rejects(client.request('POST', '/issues/7/comments', comment), /\(503\)/);
  await assert.rejects(client.request('POST', '/issues/7/comments', comment), /fetch failed/);
  await assert.rejects(client.request('GET', '/issues'), /\(500\)/);
  await assert.rejects(client.request('PUT', '/contents/x'), /\(422\)/);
  assert.deepEqual(calls, ['POST', 'POST', 'GET', 'PUT']);
});

// Answers like a half-open connection: nothing until the caller's signal fires.
function hangThenReply(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.method);
    assert.ok(options.signal instanceof AbortSignal);
    const reply = replies.shift();
    if (reply !== 'hang') return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  });
  t.mock.method(console, 'warn', () => {});
  return calls;
}

const timingClient = (timeoutMs) =>
  new GitHubClient({ token: 'test-only', repository: 'owner/factory', retryDelays: [0, 0], timeoutMs });

test('every GitHub attempt has a deadline and a timed-out read is retried', async (t) => {
  const calls = hangThenReply(t, ['hang', 'hang', { status: 200, body: { number: 7 } }]);
  const started = Date.now();
  assert.deepEqual(await timingClient(20).request('GET', '/issues/7'), { number: 7 });
  assert.deepEqual(calls, ['GET', 'GET', 'GET']);
  assert.ok(Date.now() - started < 5000);
});

test('a timed-out POST or DELETE is not repeated', async (t) => {
  const calls = hangThenReply(t, ['hang', 'hang']);
  const client = timingClient(20);
  await assert.rejects(client.request('POST', '/issues/7/comments', { body: { body: 'x' } }), { name: 'TimeoutError' });
  await assert.rejects(client.request('DELETE', '/git/refs/heads/x'), { name: 'TimeoutError' });
  assert.deepEqual(calls, ['POST', 'DELETE']);
});

test('callers can override the attempt deadline per client or per request', async (t) => {
  assert.equal(retryingClient().timeoutMs, 30_000);
  const calls = hangThenReply(t, ['hang', 'hang', 'hang']);
  await assert.rejects(timingClient(60_000).request('GET', '/issues', { timeoutMs: 10 }), { name: 'TimeoutError' });
  assert.deepEqual(calls, ['GET', 'GET', 'GET']);
});

test('a response body that stalls past the deadline is retried for reads', async (t) => {
  const calls = [];
  const replies = ['stall', { number: 8 }];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.method);
    const reply = replies.shift();
    if (reply !== 'stall') return new Response(JSON.stringify(reply), { status: 200 });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"number":'));
        options.signal.addEventListener('abort', () => controller.error(options.signal.reason), { once: true });
      },
    });
    return new Response(stream, { status: 200 });
  });
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(await timingClient(20).request('GET', '/issues/8'), { number: 8 });
  assert.deepEqual(calls, ['GET', 'GET']);
});
