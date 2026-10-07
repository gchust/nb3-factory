import assert from 'node:assert/strict';
import test from 'node:test';
import { coordinate } from '../dispatch-comment-builds.mjs';
import { readReceipt } from '../comment-queue.mjs';

// The queue asks the API for this Issue's own PRs (by head) and for the open
// PRs on a non-shared target branch (by base), instead of listing every PR of
// the repository on each reconcile.
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const owner = { login: 'gchust', type: 'User' };
const issue = {
  number: 2,
  state: 'open',
  user: owner,
  body: '### 目标分支\napps/demo\n### 任务类型\n创建新系统\n### 业务需求\nOriginal\n### 验收要求\nWorks',
};
const pulls = [
  {
    number: 10,
    state: 'open',
    head: { ref: 'agent/issue-2', repo: { full_name: 'gchust/nb3-factory' } },
    base: { ref: 'apps/demo' },
  },
  {
    number: 11,
    state: 'open',
    head: { ref: 'agent/issue-7', repo: { full_name: 'gchust/nb3-factory' } },
    base: { ref: 'apps/demo' },
  },
  {
    number: 12,
    state: 'closed',
    head: { ref: 'agent/issue-9', repo: { full_name: 'gchust/nb3-factory' } },
    base: { ref: 'develop' },
  },
];

function fixture() {
  const comments = [
    {
      id: 22,
      body: '/build\nFeature 22',
      user: owner,
      author_association: 'OWNER',
    },
  ];
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
        return {
          workflow_runs: [
            {
              id: 1,
              display_title: 'Factory issue #2 build 0',
              status: 'completed',
              conclusion: 'success',
              run_attempt: 1,
            },
          ],
        };
      if (route.endsWith('/jobs')) return { jobs: [] };
      if (route === '/pulls') {
        const { head, base, state } = options.query ?? {};
        return pulls.filter(
          (pull) =>
            (!head || head === `gchust:${pull.head.ref}`) &&
            (!base || base === pull.base.ref) &&
            (state === 'all' || pull.state === state),
        );
      }
      if (route === '/dispatches') return null;
      throw new Error(`Unexpected request ${method} ${route}`);
    },
  };
  return { client, comments, calls };
}

test('the comment queue asks only for its own PRs and the open PRs on its branch', async () => {
  const f = fixture();
  await coordinate(f.client, 2, 0);
  const listings = f.calls.filter((call) => call.route === '/pulls');
  assert.ok(listings.length >= 1);
  for (const call of listings)
    assert.ok(
      call.query.head || call.query.base,
      `unfiltered PR listing: ${JSON.stringify(call.query)}`,
    );
  assert.ok(
    listings.some(
      (call) =>
        call.query.head === 'gchust:agent/issue-2' &&
        call.query.state === 'all',
    ),
  );
  assert.ok(
    listings.some(
      (call) => call.query.base === 'apps/demo' && call.query.state === 'open',
    ),
  );
  // Another Issue's open PR on the same non-shared branch still holds the queue.
  assert.equal(
    f.calls.filter((call) => call.route === '/dispatches').length,
    0,
  );
  assert.equal(f.comments.map(readReceipt).filter(Boolean)[0].status, 'queued');
});
