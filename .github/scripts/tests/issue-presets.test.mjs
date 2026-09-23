import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { parseIssueTask, STATUS_LABELS, TaskInputError } from '../factory-lib.mjs';
import { admitComments, receiptBody, resolveBuildTask } from '../comment-queue.mjs';
import { coordinate } from '../dispatch-comment-builds.mjs';
import { isPresetIssue, preparePresetIssue, PRESET_FORM_PATH, renderPresetForm } from '../issue-presets.mjs';
import { syncIssuePresets } from '../sync-issue-presets.mjs';

const human = { login: 'owner', type: 'User' };
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const taskBody = `### 目标分支

apps/old-system

### 任务类型

继续完善现有系统

### 业务需求

创建工单系统，允许提交附件。

### 验收要求

QA_ONLY: 用两个账号验证数据隔离。

### 示例数据

是

### 确认

- [x] 同意搭建。
`;
const selection = `### 预置案例\n\n#1 - 工单系统\n\n### 本次补充要求\n\n支持导出\n\n### 确认\n\n- [x] 同意\n`;

function fixture(issueNumber = 20) {
  const source = { number: 1, title: '[Code Agent] 工单系统', body: taskBody,
    user: human, labels: [{ name: 'factory:preset' }], state: 'closed',
    html_url: 'https://github.com/test/factory/issues/1', updated_at: '2026-09-20T00:00:00Z' };
  const issue = { number: issueNumber, title: '重搭', body: selection, user: human,
    labels: [{ name: 'agent:pending' }], state: 'open', html_url: `https://github.com/test/factory/issues/${issueNumber}` };
  const originals = [
    { id: 102, user: { login: 'reviewer', type: 'User' }, body: '/build\n增加转派，必须填写原因。' },
    { id: 100, user: human, body: '附件：![截图](https://example.com/image.png)\n```js\nhello()\n```' },
    { id: 101, user: bot, body: 'BOT_REPORT: all checks passed' },
    { id: 103, user: { login: 'other[bot]', type: 'User' }, body: 'BOT_STATUS' },
  ].map((comment) => ({ ...comment, created_at: '2026-09-20T12:00:00Z',
    html_url: `https://github.com/test/factory/issues/1#issuecomment-${comment.id}` }));
  const comments = [];
  const calls = [];
  let nextId = 1000;
  const client = {
    repository: 'test/factory', source, issue, originals, comments, calls,
    async getIssue(number) {
      calls.push(['getIssue', number]);
      if (number === 1) return structuredClone(source);
      if (number === issueNumber) return structuredClone(issue);
      throw new Error(`Unknown issue ${number}`);
    },
    async getRepository() { return { default_branch: 'develop' }; },
    async addComment(number, body) {
      assert.equal(number, issueNumber);
      assert.ok(body.length <= 65000, 'comment stays under the API limit');
      calls.push(['addComment', body]);
      const value = { id: nextId++, user: bot, body };
      comments.push(value);
      return value;
    },
    async request(method, route, options = {}) {
      calls.push([method, route, options]);
      if (method === 'GET' && /^\/issues\/\d+\/comments$/.test(route)) {
        const values = route === '/issues/1/comments' ? originals : comments;
        const page = options.query?.page || 1;
        return structuredClone(values.slice((page - 1) * 100, page * 100));
      }
      if (method === 'PATCH' && route === `/issues/${issueNumber}`) {
        Object.assign(issue, options.body);
        return structuredClone(issue);
      }
      throw new Error(`Unexpected ${method} ${route}`);
    },
  };
  return client;
}

function copies(client) {
  return client.comments.filter((comment) => comment.body.includes('<!-- factory-preset-copy:'));
}

function snapshots(client) {
  return client.comments.filter((comment) => comment.body.includes('<!-- factory-preset-snapshot-v1:'));
}

test('preset label accepts API labels and string labels', () => {
  assert.equal(isPresetIssue({ labels: ['factory:preset'] }), true);
  assert.equal(isPresetIssue({ labels: [{ name: 'factory:preset' }] }), true);
  assert.equal(isPresetIssue({ labels: [] }), false);
  assert.equal(isPresetIssue({}), false);
});

test('form includes closed human cases, sorts by number and quotes special titles', () => {
  const c = fixture();
  const form = renderPresetForm([
    { ...c.source, number: 9, title: '冒号: "quotes"\n下一行' },
    c.source,
    { ...c.source, number: 2, pull_request: {} },
    { ...c.source, number: 3, user: bot },
    { ...c.source, number: 4, labels: [] },
  ]);
  const options = form.split('\n').filter((line) => line.startsWith('        - "'))
    .map((line) => JSON.parse(line.trim().slice(2)));
  assert.deepEqual(options, ['#1 - [Code Agent] 工单系统', '#9 - 冒号: "quotes" 下一行']);
});

test('checked-in form matches the generator with its current synchronized choices', () => {
  const form = readFileSync(new URL('../../ISSUE_TEMPLATE/rebuild-from-preset.yml', import.meta.url), 'utf8');
  const issues = form.split('\n').filter((line) => line.startsWith('        - "'))
    .map((line) => /^#(\d+) - (.*)$/.exec(JSON.parse(line.trim().slice(2))))
    .filter(Boolean)
    .map((match) => ({ ...fixture().source, number: Number(match[1]), title: match[2] }));
  assert.equal(form, renderPresetForm(issues));
  assert.match(renderPresetForm([]), /暂无预置案例/);
});

test('ordinary tasks keep their old parser behavior without loading comments', async () => {
  const c = fixture();
  c.issue.body = taskBody;
  const result = await preparePresetIssue(c, c.issue);
  assert.deepEqual(result.task, parseIssueTask(c.issue));
  assert.equal(c.calls.length, 0);
});

test('clones only human content, preserves raw Markdown and injects comments once', async () => {
  const c = fixture();
  const result = await preparePresetIssue(c, c.issue);
  assert.equal(result.issue.number, 20);
  assert.equal(result.task.targetBranch, 'develop');
  assert.equal(result.task.taskType, '创建新系统');
  assert.match(result.issue.title, /工单系统（重搭 #1）/);
  assert.doesNotMatch(result.issue.body, /apps\/old-system/);
  assert.match(result.issue.body, /支持导出/);
  assert.equal(copies(c).length, 2);
  assert.ok(copies(c)[0].body.includes(c.originals.find((v) => v.id === 100).body));
  assert.match(copies(c)[1].body, /reviewer/);
  assert.ok(copies(c)[1].body.includes('/build\n增加转派'));
  assert.match(result.task.requirements, /附件：.*image.png/s);
  assert.match(result.task.requirements, /增加转派/);
  assert.match(result.task.requirements, /支持导出/);
  assert.doesNotMatch(result.task.requirements, /QA_ONLY|BOT_REPORT|BOT_STATUS|\/build/);
  assert.match(result.task.acceptanceCriteria, /QA_ONLY/);
  assert.match(result.task.acceptanceCriteria, /增加转派/);
  assert.equal(result.preset.humanCommentCount, 2);
  assert.match(result.preset.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(c.calls.filter((call) => call[0] === 'PATCH').length, 1);
  assert.equal(c.calls.at(-1)[0], 'PATCH', 'publish normalized body only after copies');
});

test('normalization keeps unrelated source sections and does not parse comment headings as form fields', async () => {
  const c = fixture();
  c.source.body += '\n### 自定义说明\n\n原文保留\n';
  c.originals[0].body = '/build\n### 目标分支\nevil-branch\n### 验收要求\n仍然是评论';
  const { issue, task } = await preparePresetIssue(c, c.issue);
  assert.match(issue.body, /自定义说明\n\n原文保留/);
  assert.equal(task.targetBranch, 'develop');
  assert.match(task.acceptanceCriteria, /^QA_ONLY/);
  assert.match(task.requirements, /evil-branch/);
});

test('source comments are paginated; no human comments beyond page one are dropped', async () => {
  const c = fixture();
  c.originals.splice(0, c.originals.length, ...Array.from({ length: 105 }, (_, i) => ({
    id: i + 1, user: human, body: `comment ${i + 1}`,
  })));
  const { task, preset } = await preparePresetIssue(c, c.issue);
  assert.equal(preset.humanCommentCount, 105);
  assert.equal(copies(c).length, 105);
  assert.match(task.requirements, /comment 105/);
  assert.ok(c.calls.some(([method, route, options]) => method === 'GET' && route === '/issues/1/comments' && options.query.page === 2));
  const count = c.comments.length;
  await preparePresetIssue(c, c.issue);
  assert.equal(c.comments.length, count, 'retry also paginates destination comments');
});

test('source mutations and label removal do not alter an already captured task', async () => {
  const c = fixture();
  const first = await preparePresetIssue(c, c.issue);
  const count = c.comments.length;
  c.source.body = 'deleted/changed';
  c.source.labels = [];
  c.originals.splice(0);
  c.calls.splice(0);
  const second = await preparePresetIssue(c, c.issue);
  assert.deepEqual(second.task, first.task);
  assert.deepEqual(second.preset, first.preset);
  assert.equal(c.comments.length, count);
  assert.ok(!c.calls.some(([name, number]) => name === 'getIssue' && number === 1));
});

test('same input on another fresh Issue has the same input hash', async () => {
  const firstClient = fixture();
  const secondClient = fixture(21);
  const first = await preparePresetIssue(firstClient, firstClient.issue);
  // A new capture timestamp must not change the input-only fingerprint.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await preparePresetIssue(secondClient, secondClient.issue);
  assert.equal(second.task.targetBranch, 'develop');
  assert.equal(first.preset.inputHash, second.preset.inputHash);
  assert.notEqual(first.preset.capturedAt, second.preset.capturedAt);
});

test('failed copy resumes from the complete snapshot and does not duplicate earlier copies', async () => {
  const c = fixture();
  const add = c.addComment.bind(c);
  let copyCount = 0;
  c.addComment = async (number, body) => {
    if (body.includes('<!-- factory-preset-copy:') && ++copyCount === 2) throw new Error('temporary API failure');
    return add(number, body);
  };
  await assert.rejects(preparePresetIssue(c, c.issue), /temporary API failure/);
  assert.equal(copies(c).length, 1);
  assert.equal(c.issue.body, selection, 'incomplete copying never publishes a runnable task');
  c.source.body = 'source changed while retrying';
  c.originals.splice(0);
  c.addComment = add;
  const result = await preparePresetIssue(c, c.issue);
  assert.equal(copies(c).length, 2);
  assert.equal(snapshots(c).length, 1);
  assert.match(result.task.requirements, /增加转派/);
});

test('ambiguous successful comment write is deduplicated after retry', async () => {
  const c = fixture();
  const add = c.addComment.bind(c);
  let failed = false;
  c.addComment = async (number, body) => {
    const value = await add(number, body);
    if (!failed && body.includes('<!-- factory-preset-copy:')) {
      failed = true;
      throw new Error('response lost');
    }
    return value;
  };
  await assert.rejects(preparePresetIssue(c, c.issue), /response lost/);
  await preparePresetIssue(c, c.issue);
  assert.equal(copies(c).length, 2);
});

test('failed final Issue update resumes without recopying', async () => {
  const c = fixture();
  const request = c.request.bind(c);
  let fail = true;
  c.request = async (method, route, options) => {
    if (method === 'PATCH' && fail) { fail = false; throw new Error('patch failed'); }
    return request(method, route, options);
  };
  await assert.rejects(preparePresetIssue(c, c.issue), /patch failed/);
  const count = c.comments.length;
  await preparePresetIssue(c, c.issue);
  assert.equal(c.comments.length, count);
  assert.equal(parseIssueTask(c.issue).targetBranch, 'develop');
});

test('large Unicode comments are copied and snapshotted without truncation', async () => {
  const c = fixture();
  const original = '🚀中文'.repeat(14000);
  c.originals.splice(0, c.originals.length, { id: 100, user: human, body: original });
  const result = await preparePresetIssue(c, c.issue);
  assert.ok(snapshots(c).length > 1);
  assert.ok(copies(c).length > 1);
  assert.ok(result.task.requirements.includes(original));
  const restored = await preparePresetIssue(c, c.issue);
  assert.equal(restored.task.requirements, result.task.requirements);
});

test('missing snapshot fails rather than fetching new source content', async () => {
  const c = fixture();
  await preparePresetIssue(c, c.issue);
  c.comments.splice(0, c.comments.length, ...copies(c));
  c.calls.splice(0);
  await assert.rejects(preparePresetIssue(c, c.issue), /快照缺失或不完整/);
  assert.ok(!c.calls.some(([name]) => name === 'getIssue'));
});

test('human-authored fake snapshot comments are not accepted', async () => {
  const c = fixture();
  await preparePresetIssue(c, c.issue);
  for (const comment of snapshots(c)) comment.user = human;
  await assert.rejects(preparePresetIssue(c, c.issue), /快照缺失或不完整/);
});

for (const [name, change] of [
  ['pull request', (c) => { c.source.pull_request = {}; }],
  ['unlabeled case', (c) => { c.source.labels = []; }],
  ['bot-created case', (c) => { c.source.user = bot; }],
  ['invalid selection', (c) => { c.issue.body = selection.replace('#1 - 工单系统', '暂无预置案例'); }],
  ['self copy', (c) => { c.issue.body = selection.replace('#1 - 工单系统', '#20 - self'); }],
  ['invalid task body', (c) => { c.source.body = 'missing requirements'; }],
]) {
  test(`rejects ${name} without copies or Issue updates`, async () => {
    const c = fixture();
    change(c);
    await assert.rejects(preparePresetIssue(c, c.issue), TaskInputError);
    assert.equal(c.comments.length, 0);
    assert.ok(!c.calls.some(([method]) => method === 'PATCH'));
  });
}

test('copied bot comments do not enter the ordinary comment queue', async () => {
  const c = fixture();
  await preparePresetIssue(c, c.issue);
  const receipts = [];
  await admitComments(c, c.issue, c.comments, receipts);
  assert.deepEqual(receipts, []);
});

test('preset Issue is skipped by direct and scheduled comment reconciliation', async () => {
  const c = fixture();
  await coordinate(c, 1, 100);
  await coordinate(c, 1);
  assert.deepEqual(c.calls, [['getIssue', 1], ['getIssue', 1]]);
});

test('later human /build retains the preset inputs before the new instruction', async () => {
  const c = fixture();
  const prepared = await preparePresetIssue(c, c.issue);
  c.comments.push({ id: 3000, user: human, body: '/build\n增加仪表盘' });
  c.comments.push({ id: 3001, user: bot, body: receiptBody({ id: 3000, kind: 'build', status: 'dispatched', url: 'comment-link' }) });
  const result = await resolveBuildTask(c, c.issue, 3000, prepared.task);
  assert.match(result.requirements, /增加转派/);
  assert.match(result.requirements, /支持导出/);
  assert.match(result.requirements, /增加仪表盘/);
  assert.ok(result.requirements.indexOf('增加转派') < result.requirements.indexOf('增加仪表盘'));
  assert.doesNotMatch(result.requirements, /QA_ONLY|BOT_REPORT/);
  assert.match(result.acceptanceCriteria, /QA_ONLY/);
});

function syncClient(issues, existing = null) {
  const calls = [];
  return {
    calls,
    async getRepository() { return { default_branch: 'custom-default' }; },
    async request(method, route, options = {}) {
      calls.push([method, route, options]);
      if (method === 'GET' && route.startsWith('/labels/')) return null;
      if (method === 'POST' && route === '/labels') return {};
      if (method === 'GET' && route === '/issues') {
        assert.deepEqual({ ...options.query, page: undefined }, { state: 'all', labels: 'factory:preset', per_page: 100, page: undefined });
        return issues.slice((options.query.page - 1) * 100, options.query.page * 100);
      }
      if (method === 'GET' && route === `/contents/${PRESET_FORM_PATH}`) {
        assert.equal(options.query.ref, 'custom-default');
        return existing;
      }
      if (method === 'PUT' && route === `/contents/${PRESET_FORM_PATH}`) return {};
      throw new Error(`Unexpected sync ${method} ${route}`);
    },
  };
}

test('sync bootstraps the label and creates the form on the actual default branch', async () => {
  const c = syncClient([fixture().source]);
  assert.equal(await syncIssuePresets(c), true);
  const put = c.calls.find(([method]) => method === 'PUT')[2].body;
  assert.equal(put.branch, 'custom-default');
  assert.equal(put.sha, undefined);
  assert.match(Buffer.from(put.content, 'base64').toString('utf8'), /#1 -/);
  assert.equal(c.calls.find(([method]) => method === 'POST')[2].body.name, 'factory:preset');
});

test('sync performs no commit when generated choices are unchanged', async () => {
  const c = syncClient([], { sha: 'blob', content: Buffer.from(renderPresetForm([])).toString('base64') });
  assert.equal(await syncIssuePresets(c), false);
  assert.ok(!c.calls.some(([method]) => method === 'PUT'));
});

test('sync paginates cases and uses the existing blob SHA for replacement', async () => {
  const issues = Array.from({ length: 102 }, (_, i) => ({ ...fixture().source, number: i + 1 }));
  const c = syncClient(issues, { sha: 'old-sha', content: Buffer.from('old').toString('base64') });
  await syncIssuePresets(c);
  const body = c.calls.find(([method]) => method === 'PUT')[2].body;
  assert.equal(body.sha, 'old-sha');
  assert.match(Buffer.from(body.content, 'base64').toString('utf8'), /#102 -/);
});

async function runPrepare(t, client) {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'factory-preset-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const refs = new Map([['develop', 'a'.repeat(40)]]);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.replace('/repos/test/factory', '');
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    try {
      let value;
      if (req.method === 'GET' && route === '') value = await client.getRepository();
      else if (req.method === 'GET' && /^\/issues\/\d+$/.test(route)) value = await client.getIssue(Number(route.split('/').at(-1)));
      else if (req.method === 'GET' && route === '/labels') value = Object.keys(STATUS_LABELS).map((name) => ({ name }));
      else if (req.method === 'GET' && route.startsWith('/git/ref/heads/')) {
        const sha = refs.get(route.slice('/git/ref/heads/'.length));
        if (!sha) { res.writeHead(404); res.end('{}'); return; }
        value = { object: { sha } };
      } else if (req.method === 'POST' && route === '/git/refs') {
        refs.set(body.ref.replace('refs/heads/', ''), body.sha);
        value = { object: { sha: body.sha } };
      } else if (req.method === 'GET' && route === '/pulls') value = [];
      else if (req.method === 'POST' && route.endsWith('/comments')) value = await client.addComment(20, body.body);
      else value = await client.request(req.method, route, { body, query: Object.fromEntries(url.searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ message: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  writeFileSync(path.join(folder, 'event.json'), JSON.stringify({ issue: client.issue, repository: { owner: { login: 'test' } } }));
  await promisify(execFile)(process.execPath, [
    new URL('../prepare-task.mjs', import.meta.url).pathname,
    '--event', path.join(folder, 'event.json'),
    '--metadata', path.join(folder, 'metadata.json'),
    '--output', path.join(folder, 'output'),
  ], { env: { ...process.env, GITHUB_REPOSITORY: 'test/factory', GITHUB_TOKEN: 'test-only',
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_RUN_ID: '99', GITHUB_SERVER_URL: 'https://github.com' } });
  return { refs, folder, output: readFileSync(path.join(folder, 'output'), 'utf8') };
}

test('prepare CLI copies a case into its own work branch with default PR base', async (t) => {
  const c = fixture();
  const { refs, folder, output } = await runPrepare(t, c);
  assert.match(output, /status=ready/);
  assert.match(output, /base_sha=a{40}/);
  assert.deepEqual([...refs.keys()], ['develop']);
  const metadata = JSON.parse(readFileSync(path.join(folder, 'metadata.json'), 'utf8'));
  assert.equal(metadata.preset.sourceIssueNumber, 1);
  assert.equal(metadata.workBranch, 'agent/issue-20');
  assert.equal(metadata.targetCreated, false);
  assert.match(metadata.task.requirements, /增加转派/);
  assert.equal(copies(c).length, 2);
});

test('prepare CLI skips preset Issues before any status writes or branch creation', async (t) => {
  const c = fixture();
  c.issue.labels = [{ name: 'factory:preset' }];
  const { output, refs } = await runPrepare(t, c);
  assert.match(output, /status=preset/);
  assert.deepEqual([...refs.keys()], ['develop']);
  assert.deepEqual(c.calls, [['getIssue', 20]]);
});

test('partial snapshot writes never expose a runnable Issue or copy comments', async () => {
  const c = fixture();
  c.originals[0].body = 'large case '.repeat(6000);
  const add = c.addComment.bind(c);
  let count = 0;
  c.addComment = async (number, body) => {
    if (body.includes('<!-- factory-preset-snapshot-v1:') && ++count === 2) throw new Error('snapshot interrupted');
    return add(number, body);
  };
  await assert.rejects(preparePresetIssue(c, c.issue), /snapshot interrupted/);
  assert.equal(copies(c).length, 0);
  assert.equal(c.issue.body, selection);
  c.addComment = add;
  const result = await preparePresetIssue(c, c.issue);
  assert.ok(result.task.requirements.includes(c.originals[0].body));
  assert.ok(copies(c).length > 0);
});

test('corrupted snapshot fails checksum validation rather than changing inputs', async () => {
  const c = fixture();
  await preparePresetIssue(c, c.issue);
  const snapshot = snapshots(c)[0];
  snapshot.body = snapshot.body.replace(/\n([A-Za-z0-9+/=]+)\n-->$/, '\nAA$1\n-->');
  await assert.rejects(preparePresetIssue(c, c.issue), /校验失败/);
});

test('missing visible copy is restored from snapshot without duplicating other copies', async () => {
  const c = fixture();
  const first = await preparePresetIssue(c, c.issue);
  const removeId = copies(c)[0].id;
  c.comments.splice(c.comments.findIndex((comment) => comment.id === removeId), 1);
  const second = await preparePresetIssue(c, c.issue);
  assert.equal(copies(c).length, 2);
  assert.deepEqual(first.task, second.task);
});

test('a new snapshot uses the actual default branch and keeps it after a rename', async () => {
  const c = fixture();
  c.getRepository = async () => ({ default_branch: 'main' });
  const first = await preparePresetIssue(c, c.issue);
  assert.equal(first.task.targetBranch, 'main');
  c.getRepository = async () => { throw new Error('Must not read a new default on snapshot replay'); };
  assert.equal((await preparePresetIssue(c, c.issue)).task.targetBranch, 'main');
});

test('pre-protocol snapshots keep their issues-N target during replay', async () => {
  const { createHash } = await import('node:crypto');
  const c = fixture();
  await preparePresetIssue(c, c.issue);
  const saved = snapshots(c)[0];
  const match = /factory-preset-snapshot-v1:([a-f0-9]{64}):0:1\n([A-Za-z0-9+/=]+)/.exec(saved.body);
  const old = JSON.parse(Buffer.from(match[2], 'base64').toString('utf8'));
  delete old.targetBranch;
  const json = JSON.stringify(old);
  const hash = createHash('sha256').update(json).digest('hex');
  saved.body = saved.body.replace(match[2], Buffer.from(json).toString('base64'));
  for (const comment of c.comments) comment.body = comment.body.replaceAll(match[1], hash);
  c.issue.body = c.issue.body.replace(match[1], hash).replace('### 目标分支\n\ndevelop', '### 目标分支\n\nissues-20');
  c.getRepository = async () => { throw new Error('Old task must not migrate'); };
  const result = await preparePresetIssue(c, c.issue);
  assert.equal(result.task.targetBranch, 'issues-20');
  assert.equal(copies(c).length, 2);
  // Also cover a failed final issue PATCH under the old protocol.
  c.issue.body = selection;
  assert.equal((await preparePresetIssue(c, c.issue)).task.targetBranch, 'issues-20');
  assert.equal(copies(c).length, 2);
});
