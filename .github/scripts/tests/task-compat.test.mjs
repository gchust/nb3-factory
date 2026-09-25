import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILD_LABEL, GitHubClient, STATUS_LABELS } from '../factory-lib.mjs';
import {
  resolveTaskBranch,
  taskIssueNumber,
  taskMarkerNumber,
  stripTaskTitle,
} from '../task-compat.mjs';

const repository = 'owner/factory';
const pull = (ref) => ({ head: { ref, repo: { full_name: repository } } });
const client = (branches = []) => ({
  getRef: async (branch) =>
    branches.includes(branch) ? { object: { sha: 'sha' } } : null,
});

test('new tasks use neutral branches, retries preserve existing work', async () => {
  assert.equal(
    await resolveTaskBranch(client(), 2, [], repository),
    'agent/issue-2',
  );
  assert.equal(
    await resolveTaskBranch(client(['pi/issue-2']), 2, [], repository),
    'pi/issue-2',
  );
  assert.equal(
    await resolveTaskBranch(client(['agent/issue-2']), 2, [], repository),
    'agent/issue-2',
  );
  assert.equal(
    await resolveTaskBranch(
      client(['agent/issue-2']),
      2,
      [pull('pi/issue-2')],
      repository,
    ),
    'pi/issue-2',
  );
});

test('duplicate migration PRs are rejected instead of silently choosing one', async () => {
  await assert.rejects(
    resolveTaskBranch(
      client(),
      2,
      [pull('pi/issue-2'), pull('agent/issue-2')],
      repository,
    ),
    /multiple open/,
  );
});

test('task branch and source marker parsing support both generations', () => {
  for (const prefix of ['agent', 'pi']) {
    assert.equal(taskIssueNumber(`${prefix}/issue-2`), 2);
    assert.equal(taskMarkerNumber(`<!-- ${prefix}-issue: 2 -->`), 2);
  }
  for (const branch of [
    'feature/issue-2',
    'agent/issue-0',
    'agent/issue-2-extra',
    'agent/issue-9007199254740992',
  ]) {
    assert.equal(taskIssueNumber(branch), null);
  }
  assert.equal(stripTaskTitle('[Pi] Build'), 'Build');
  assert.equal(stripTaskTitle('[Code Agent] Build'), 'Build');
});

test('task titles discard known factory metadata while preserving business brackets', () => {
  for (const prefix of ['[Code Agent #20] ', '[Pi] ', '[预置][S01] ', '[预置][低频综合回归] ', '[F00]', '[M05][需 HTTP 验收] ', '[E01][需测试模型]', '[E02][需测试渠道] ']) {
    assert.equal(stripTaskTitle(prefix + '客户系统'), '客户系统');
  }
  assert.equal(stripTaskTitle('  [Code Agent] [预置][S01] 客户系统（重搭 #155）  '), '客户系统');
  assert.equal(stripTaskTitle('[CRM] 客户系统'), '[CRM] 客户系统');
  assert.equal(stripTaskTitle('支持 [S01] 型号设备'), '支持 [S01] 型号设备');
  assert.equal(stripTaskTitle('[预置][CRM] 客户系统'), '[CRM] 客户系统');
});

test('label initialization creates the persistent build label once', async () => {
  const github = new GitHubClient({ token: 'test', repository });
  const labels = new Set(Object.keys(STATUS_LABELS));
  const created = [];
  github.request = async (method, route, options) => {
    if (method === 'GET' && route === '/labels') return [...labels].map((name) => ({ name }));
    assert.equal(method, 'POST');
    assert.equal(route, '/labels');
    labels.add(options.body.name);
    created.push(options.body.name);
  };
  await github.ensureStatusLabels();
  await github.ensureStatusLabels();
  assert.deepEqual(created, [BUILD_LABEL]);
});

test('concurrent sync and build initialization both succeed when the build label is new', async () => {
  const labels = new Set(Object.keys(STATUS_LABELS));
  let reads = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const clients = Array.from({ length: 2 }, () => {
    const github = new GitHubClient({ token: 'test', repository });
    github.request = async (method, route, options) => {
      if (method === 'GET' && route === '/labels') {
        const snapshot = [...labels].map((name) => ({ name }));
        if (++reads === 2) release();
        await barrier;
        return snapshot;
      }
      if (method === 'GET' && route === `/labels/${encodeURIComponent(BUILD_LABEL)}`) {
        assert.equal(options.allow404, true);
        return labels.has(BUILD_LABEL) ? { name: BUILD_LABEL } : null;
      }
      assert.equal(method, 'POST');
      assert.equal(route, '/labels');
      if (labels.has(options.body.name)) throw new Error('422: already_exists');
      labels.add(options.body.name);
      return { name: options.body.name };
    };
    return github;
  });
  await Promise.all(clients.map((github) => github.ensureStatusLabels()));
  assert.equal(labels.size, Object.keys(STATUS_LABELS).length + 1);
});

test('a build label outside the first page is accepted but a real creation failure still rejects', async () => {
  for (const exists of [true, false]) {
    const github = new GitHubClient({ token: 'test', repository });
    const failure = new Error(exists ? '422: already_exists' : '403: forbidden');
    github.request = async (method, route, options) => {
      if (method === 'GET' && route === '/labels') return Object.keys(STATUS_LABELS).map((name) => ({ name }));
      if (method === 'POST' && route === '/labels') throw failure;
      assert.equal(method, 'GET');
      assert.equal(route, `/labels/${encodeURIComponent(BUILD_LABEL)}`);
      assert.equal(options.allow404, true);
      return exists ? { name: BUILD_LABEL } : null;
    };
    if (exists) await github.ensureStatusLabels();
    else await assert.rejects(github.ensureStatusLabels(), (error) => error === failure);
  }
});

test('status updates remove both old and new statuses but preserve business and build labels', async () => {
  const github = new GitHubClient({ token: 'test', repository });
  const writes = [];
  github.request = async (method, route, options) => {
    writes.push({ method, route, ...options });
  };
  await github.setIssueStatus(
    { number: 2, labels: ['pi:review', { name: 'agent:waiting' }, 'customer'] },
    'agent:running',
  );
  assert.deepEqual(writes[0].body.labels, ['customer', BUILD_LABEL, 'agent:running']);
  await github.setIssueStatus({ number: 2, labels: writes[0].body.labels }, 'agent:review');
  assert.deepEqual(writes[1].body.labels, ['customer', BUILD_LABEL, 'agent:review']);
});
