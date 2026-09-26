import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pinInitialBase, resolveTargetBranch } from '../task-base.mjs';
import { STATUS_LABELS } from '../factory-lib.mjs';

const repository = 'test/factory';
const initial = 'a'.repeat(40);
const advanced = 'b'.repeat(40);
const work = 'c'.repeat(40);
const bot = { login: 'github-actions[bot]', type: 'Bot' };
function fixture() {
  const comments = [];
  const refs = new Map([['develop', initial]]);
  return {
    repository, comments, refs,
    async getRef(branch) { return refs.has(branch) ? { object: { sha: refs.get(branch) } } : null; },
    async request(method, route, { query } = {}) {
      assert.equal(method, 'GET');
      assert.equal(route, '/issues/20/comments');
      return comments.slice((query.page - 1) * 100, query.page * 100);
    },
    async addComment(number, body) {
      assert.equal(number, 20);
      const value = { id: comments.length + 1, body, user: bot };
      comments.push(value);
      return value;
    },
  };
}
const pull = (number, base = 'develop', state = 'open') => ({
  number: 100 + number, state,
  base: { ref: base },
  head: { ref: `agent/issue-${number}`, repo: { full_name: repository } },
});

test('new omitted targets resolve to the repository default, not an issues-N branch', async () => {
  const c = fixture();
  assert.equal(await resolveTargetBranch(c, 20, null, [pull(10)], 'develop'), 'develop');
  assert.equal(await resolveTargetBranch(c, 20, null, [], 'main'), 'main');
  assert.deepEqual([...c.refs.keys()], ['develop']);
});
test('legacy omitted targets preserve their own PR or existing application branch', async () => {
  const c = fixture();
  assert.equal(await resolveTargetBranch(c, 20, null, [pull(20, 'apps/legacy')], 'develop'), 'apps/legacy');
  assert.equal(await resolveTargetBranch(c, 20, null, [pull(20, 'issues-20', 'closed')], 'develop'), 'issues-20');
  c.refs.set('issues-20', initial);
  assert.equal(await resolveTargetBranch(c, 20, null, [], 'develop'), 'issues-20');
  assert.equal(await resolveTargetBranch(c, 21, null, [], 'develop'), 'develop');
});
test('explicit branches are preserved; conflicting own PRs cannot be guessed', async () => {
  const c = fixture();
  assert.equal(await resolveTargetBranch(c, 20, 'apps/custom', [], 'develop'), 'apps/custom');
  await assert.rejects(resolveTargetBranch(c, 20, null, [pull(20), pull(20, 'other')], 'develop'), /多个/);
  await assert.rejects(resolveTargetBranch(c, 20, '../invalid', [], 'develop'), /无效/);
});
test('the first source SHA survives a moving default branch without another branch', async () => {
  const c = fixture();
  assert.equal(await pinInitialBase(c, 20, 'develop', initial), initial);
  assert.equal(await pinInitialBase(c, 20, 'develop', advanced), initial);
  assert.equal(c.comments.length, 1);
  assert.deepEqual([...c.refs.keys()], ['develop']);
});
test('an ambiguous successful receipt write is reused on retry', async () => {
  const c = fixture();
  const add = c.addComment.bind(c);
  c.addComment = async (...args) => { await add(...args); throw new Error('connection lost'); };
  await assert.rejects(pinInitialBase(c, 20, 'develop', initial), /connection lost/);
  c.addComment = add;
  assert.equal(await pinInitialBase(c, 20, 'develop', advanced), initial);
  assert.equal(c.comments.length, 1);
});
test('human receipts and quoted bot copies are not baseline authority', async () => {
  const c = fixture();
  await pinInitialBase(c, 20, 'develop', initial);
  const body = c.comments[0].body;
  c.comments[0].user = { login: 'test', type: 'User' };
  c.comments.push({ user: bot, body: `Copied comment:\n${body}` });
  for (let i = 0; i < 105; i++) c.comments.push({ user: bot, body: 'Other status' });
  assert.equal(await pinInitialBase(c, 20, 'develop', advanced), advanced);
  assert.equal(await pinInitialBase(c, 20, 'develop', initial), advanced);
});
for (const [name, mutate] of [
  ['corrupt', (body) => body.replace('{', '!')],
  ['wrong repository', (body) => body.replace(repository, 'other/repository')],
  ['wrong Issue', (body) => body.replace('"issueNumber":20', '"issueNumber":21')],
  ['wrong destination', (body) => body.replaceAll('develop', 'other')],
  ['invalid SHA', (body) => body.replace(initial, 'not-a-sha')],
]) {
  test(`rejects ${name} baseline receipts rather than restarting from latest`, async () => {
    const c = fixture();
    await pinInitialBase(c, 20, 'develop', initial);
    c.comments[0].body = mutate(c.comments[0].body);
    await assert.rejects(pinInitialBase(c, 20, 'develop', advanced), /代码起点/);
    assert.equal(c.comments.length, 1);
  });
}

// Use the actual prepare and publish CLIs against one stateful HTTP fixture.
// Git refs, PR query filtering and bot comments behave like the REST API.
async function integration(t, { branch = '', existingWork = false, legacy = false } = {}) {
  const c = fixture();
  if (existingWork) c.refs.set('agent/issue-20', work);
  if (legacy) c.refs.set('issues-20', initial);
  const issues = new Map([[20, {
    number: 20, title: '[Code Agent] Test', state: 'open', user: { login: 'owner' }, labels: [],
    body: `### 目标分支\n${branch}\n### 任务类型\n创建新系统\n### 业务需求\nBuild a real counter\n### 验收要求\nClick increments\n`,
  }]]);
  const pulls = [pull(10)];
  if (existingWork) pulls.push(pull(20, legacy ? 'issues-20' : 'develop'));
  const calls = [];
  const server = createServer(async (req, res) => {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : undefined;
      const url = new URL(req.url, 'http://fixture');
      const route = url.pathname.replace(`/repos/${repository}`, '');
      calls.push({ method: req.method, route, body });
      let value;
      if (route === '') value = { default_branch: 'develop' };
      else if (route === '/labels') value = Object.keys(STATUS_LABELS).map((name) => ({ name }));
      else if (route === '/issues/20') {
        if (req.method === 'PATCH') Object.assign(issues.get(20), body);
        value = issues.get(20);
      } else if (route === '/issues/20/comments') {
        value = req.method === 'POST' ? await c.addComment(20, body.body) : c.comments;
      } else if (route.startsWith('/git/ref/heads/')) value = await c.getRef(route.slice('/git/ref/heads/'.length));
      else if (route === '/git/refs') {
        c.refs.set(body.ref.replace('refs/heads/', ''), body.sha);
        value = { object: { sha: body.sha } };
      } else if (route === '/pulls' && req.method === 'GET') {
        value = pulls.filter((p) =>
          (!url.searchParams.get('state') || p.state === url.searchParams.get('state')) &&
          (!url.searchParams.get('head') || url.searchParams.get('head') === `test:${p.head.ref}`) &&
          (!url.searchParams.get('base') || url.searchParams.get('base') === p.base.ref));
      } else if (route === '/pulls' && req.method === 'POST') {
        value = { ...pull(20, body.base), html_url: 'https://github.com/test/factory/pull/120', body: body.body };
        pulls.push(value);
      } else if (route === '/pulls/120' && req.method === 'PATCH') {
        value = pulls.find((p) => p.number === 120);
        Object.assign(value, { body: body.body, base: { ref: body.base } });
      } else throw new Error(`Unexpected request ${req.method} ${route}`);
      res.writeHead(value == null ? 404 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value ?? { message: 'Not found' }));
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ message: error.message })); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-default-base-'));
  t.after(() => { server.closeAllConnections(); server.close(); rmSync(root, { recursive: true, force: true }); });
  const env = { ...process.env, GITHUB_TOKEN: 'test-only', GITHUB_REPOSITORY: repository,
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_RUN_ID: '101', GITHUB_SERVER_URL: 'https://github.com' };
  const run = (script, args) => promisify(execFile)(process.execPath, [path.resolve(import.meta.dirname, '..', script), ...args], { env, timeout: 10000 });
  const metadata = path.join(root, 'task.json');
  const event = path.join(root, 'event.json');
  writeFileSync(event, JSON.stringify({ issue: { number: 20 }, repository: { owner: { login: 'test' } } }));
  return { c, calls, pulls, metadata, issues,
    async prepare() {
      const output = path.join(root, 'output'); writeFileSync(output, '');
      await run('prepare-task.mjs', ['--event', event, '--metadata', metadata, '--output', output]);
      return { metadata: JSON.parse(readFileSync(metadata, 'utf8')), output: readFileSync(output, 'utf8') };
    },
    async publish() {
      c.refs.set('agent/issue-20', work);
      const summary = path.join(root, 'summary.json');
      writeFileSync(summary, JSON.stringify({ counts: { files: 1, added: 1, modified: 0, deleted: 0, renamed: 0 } }));
      await run('publish-pr.mjs', ['--metadata', metadata, '--summary', summary]);
    },
  };
}
for (const branch of ['', 'develop']) {
  test(`actual prepare and publisher use develop without intermediate branch: ${branch || 'omitted'}`, async (t) => {
    const f = await integration(t, { branch });
    const first = await f.prepare();
    assert.equal(first.metadata.task.targetBranch, 'develop');
    assert.equal(first.metadata.workBranch, 'agent/issue-20');
    assert.equal(first.metadata.targetCreated, false);
    // A stable logical-run key is recorded once and survives retries of the same Issue.
    assert.deepEqual(first.metadata.evaluation, { version: 1, runKey: `${repository}/issues/20/initial`, kind: 'initial', requiredChecks: [] });
    assert.match(first.output, /status=ready/); // Another Issue already has a develop PR.
    assert.match(first.output, new RegExp(`base_ref=develop\\nbase_sha=${initial}`));
    f.c.refs.set('develop', advanced);
    const retry = await f.prepare();
    assert.match(retry.output, new RegExp(`base_sha=${initial}`));
    assert.deepEqual(retry.metadata.evaluation, first.metadata.evaluation);
    assert.equal(f.calls.filter((call) => call.route === '/git/refs').length, 0);
    await f.publish();
    const published = f.calls.find((call) => call.route === '/pulls' && call.method === 'POST');
    assert.equal(published.body.base, 'develop');
    assert.equal(published.body.head, 'agent/issue-20');
    assert.match(published.body.body, /agent-target-branch: develop/);
    const resumed = await f.prepare();
    assert.match(resumed.output, new RegExp(`base_ref=agent/issue-20\\nbase_sha=${work}`));
    assert.equal(resumed.metadata.existingPullRequest.number, 120);
    await f.publish();
    assert.equal(f.calls.filter((call) => call.route === '/pulls' && call.method === 'POST').length, 1);
    assert.equal(f.calls.filter((call) => call.route === '/pulls/120' && call.method === 'PATCH').length, 1);
  });
}
test('actual prepare preserves a pre-existing legacy task rather than migrating its PR', async (t) => {
  const f = await integration(t, { existingWork: true, legacy: true });
  const result = await f.prepare();
  assert.equal(result.metadata.task.targetBranch, 'issues-20');
  assert.equal(result.metadata.existingPullRequest.number, 120);
  assert.match(result.output, new RegExp(`base_sha=${work}`));
});
