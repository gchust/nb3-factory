// Explicit recovery normalization reads a pinned base receipt only for a
// shared target branch, exactly as prepare-task.mjs pins one.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TASK_BASE_MARKER } from '../handoff-recovery.mjs';
import { initialize, saveState } from '../pipeline-state.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const repository = 'owner/factory';
const A = 'a'.repeat(40);
const X = 'b'.repeat(40);
const Y = 'c'.repeat(40);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const receipt = (targetBranch, sha) => ({
  user: { login: 'github-actions[bot]', type: 'Bot' },
  body: `${TASK_BASE_MARKER}${JSON.stringify({ repository, issueNumber: 7, targetBranch, sha })} -->\n\ntext`,
});

async function normalize(t, { targetBranch, liveTarget, comments }) {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'factory-recovery-normalize-'),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const task = {
    schemaVersion: 1,
    repository,
    controlSha: A,
    issue: { number: 7 },
    workBranch: 'agent/issue-7',
    applicationBase: { ref: targetBranch, sha: X },
    task: { targetBranch, requirements: 'R', acceptanceCriteria: 'B01. Q' },
  };
  const state = initialize(path.join(root, 'pipeline-state.json'), task);
  Object.assign(state, {
    controlSha: A,
    phase: 'implementation',
    outcome: 'failed',
    patchHash: sha256('patch'),
  });
  saveState(path.join(root, 'pipeline-state.json'), state);
  writeFileSync(path.join(root, 'task-metadata.json'), JSON.stringify(task));
  writeFileSync(path.join(root, 'agent.patch'), 'patch');
  writeFileSync(
    path.join(root, 'event.json'),
    JSON.stringify({
      inputs: { issue_number: '7', recovery_run_id: '900' },
      repository: { full_name: repository, default_branch: 'develop' },
    }),
  );
  const requested = [];
  const server = createServer((req, res) => {
    requested.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/actions/runs/900'))
      res.end(
        JSON.stringify({
          id: 900,
          run_attempt: 1,
          path: '.github/workflows/code-agent-task.yml',
          head_repository: { full_name: repository },
          event: 'issues',
          status: 'completed',
          conclusion: 'failure',
        }),
      );
    else if (req.url.endsWith(`/heads/${encodeURIComponent(targetBranch)}`))
      res.end(JSON.stringify({ object: { sha: liveTarget } }));
    else if (req.url.startsWith(`/repos/${repository}/issues/7/comments?`))
      res.end(JSON.stringify(comments));
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
      path.join(root, 'event.json'),
      '--task',
      path.join(root, 'task-metadata.json'),
      '--checkpoint',
      root,
      '--published',
      path.join(root, 'missing-publication.json'),
      '--output',
      path.join(root, 'output'),
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
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, 'exit');
  return { code, stderr, requested };
}

test('a shared target is compared with its pinned receipt, not its moved head', async (t) => {
  const run = await normalize(t, {
    targetBranch: 'develop',
    liveTarget: Y,
    comments: [receipt('develop', X)],
  });
  assert.equal(run.code, 0, run.stderr);
  assert.ok(run.requested.some((url) => url.includes('/issues/7/comments?')));
});

test('a non-shared target is compared at its live head and reads no receipt', async (t) => {
  // A receipt pinned for another target would make the receipt reader refuse;
  // it is never read for a branch prepare does not pin.
  const run = await normalize(t, {
    targetBranch: 'apps/demo',
    liveTarget: X,
    comments: [receipt('develop', Y)],
  });
  assert.equal(run.code, 0, run.stderr);
  assert.ok(!run.requested.some((url) => url.includes('/comments')));
  // ... and still refuses once that branch moved.
  const moved = await normalize(t, {
    targetBranch: 'apps/demo',
    liveTarget: Y,
    comments: [],
  });
  assert.notEqual(moved.code, 0);
  assert.match(moved.stderr, /Application branch moved/);
});
