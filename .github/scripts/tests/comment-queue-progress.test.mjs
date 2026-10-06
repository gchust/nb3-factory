import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { waitForSourceRun } from '../dispatch-comment-builds.mjs';

const read = (name) =>
  readFileSync(
    path.resolve(import.meta.dirname, '../../workflows', name),
    'utf8',
  );
const jobOf = (source, name) =>
  source.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];

function clock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  };
}

test('the queue waits for its source task run to complete', async () => {
  const statuses = ['in_progress', 'in_progress', 'completed'];
  const calls = [];
  const client = {
    request: async (method, route) => {
      calls.push([method, route]);
      return {
        path: '.github/workflows/code-agent-task.yml',
        status: statuses.shift(),
      };
    },
  };
  const result = await waitForSourceRun(client, '123', {
    ...clock(),
    intervalMs: 1000,
  });
  assert.equal(result, 'completed');
  assert.deepEqual(calls, Array(3).fill(['GET', '/actions/runs/123']));
});

test('the wait ends at its deadline and never waits on another workflow', async () => {
  const running = {
    request: async () => ({
      path: '.github/workflows/code-agent-task.yml',
      status: 'in_progress',
    }),
  };
  assert.equal(
    await waitForSourceRun(running, '123', {
      ...clock(),
      timeoutMs: 5000,
      intervalMs: 1000,
    }),
    'timed-out',
  );
  const other = {
    request: async () => ({
      path: '.github/workflows/other.yml',
      status: 'in_progress',
    }),
  };
  assert.equal(await waitForSourceRun(other, '123', clock()), 'not-a-task-run');
  await assert.rejects(
    waitForSourceRun(running, 'abc', clock()),
    /Invalid source run id/,
  );
});

test('the queue reconciles a finished round without holding its lock during the wait', () => {
  const source = read('comment-build-queue.yml');
  assert.match(
    source,
    /workflow_dispatch:\n\s+inputs:\n[\s\S]*?run_id:\n[\s\S]*?required: false/,
  );
  // The hourly sweep stays as the backstop.
  assert.match(source, /cron: '7 \* \* \* \*'/);
  const wait = jobOf(source, 'wait-for-source');
  assert.match(
    wait,
    /^ {4}if: github\.event_name == 'workflow_dispatch' && inputs\.run_id != ''$/m,
  );
  assert.doesNotMatch(wait, /concurrency:/);
  assert.match(
    wait,
    /dispatch-comment-builds\.mjs --wait-run "\$SOURCE_RUN_ID"/,
  );
  assert.match(wait, /SOURCE_RUN_ID: \$\{\{ inputs\.run_id \}\}/);
  const reconcile = jobOf(source, 'reconcile');
  assert.match(reconcile, /^ {4}needs: wait-for-source$/m);
  // A skipped wait (every other event) and a failed wait still reconcile.
  assert.match(reconcile, /^ {4}if: >-\n {6}!cancelled\(\) &&/m);
  assert.match(
    reconcile,
    /concurrency:\n {6}group: factory-comment-build-queue\n {6}queue: max\n/,
  );
  // The wait only exists for the explicit request; the task's own last jobs send it.
  const task = read('code-agent-task.yml');
  for (const job of ['dispatch-reports', 'dispatch-reply-history'])
    assert.match(
      jobOf(task, job),
      /run: bash dispatcher\/\.github\/scripts\/dispatch-task-reports\.sh comment-build-queue\.yml/,
      job,
    );
});
