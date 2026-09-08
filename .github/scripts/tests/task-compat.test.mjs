import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubClient } from '../factory-lib.mjs';
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

test('status updates remove both old and new statuses but preserve business labels', async () => {
  const github = new GitHubClient({ token: 'test', repository });
  const writes = [];
  github.request = async (method, route, options) => {
    writes.push({ method, route, ...options });
  };
  await github.setIssueStatus(
    { number: 2, labels: ['pi:review', { name: 'agent:waiting' }, 'customer'] },
    'agent:running',
  );
  assert.deepEqual(writes[0].body.labels, ['customer', 'agent:running']);
});
