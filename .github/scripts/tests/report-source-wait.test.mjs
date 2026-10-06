import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { TASK_RUN_WAIT_MS, waitForTaskRun } from '../wait-for-task-run.mjs';

const workflows = path.resolve(import.meta.dirname, '../../workflows');
const read = (name) => readFileSync(path.join(workflows, name), 'utf8');
const job = (source, name) =>
  source.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];

test('reports wait longer for the source run than its dispatch job may take', () => {
  // dispatch-reports may run ten minutes before the source run completes; a
  // report that gives up first is lost, because the gate counts it as sent.
  const task = read('code-agent-task.yml');
  const minutes = Number(
    /\n {2}dispatch-reports:\n[\s\S]*?\n {4}timeout-minutes: (\d+)\n/.exec(
      task,
    )[1],
  );
  assert.ok(
    TASK_RUN_WAIT_MS > minutes * 60_000,
    `${TASK_RUN_WAIT_MS} <= ${minutes} min`,
  );
  // Every job that waits has room for the wait and its own work.
  for (const [name, waiting] of [
    ['publish-retro.yml', 'publish-retro'],
    ['publish-visual-report.yml', 'publish-media'],
    ['report-task-usage.yml', 'wait-for-source'],
    ['publish-agent-history.yml', 'wait-for-source'],
  ]) {
    const limit = Number(
      /\n {4}timeout-minutes: (\d+)\n/.exec(job(read(name), waiting))[1],
    );
    assert.ok(limit * 60_000 > TASK_RUN_WAIT_MS, `${name} ${waiting}`);
  }
});

test('the locked reporters wait for the source run outside their concurrency group', () => {
  for (const [name, locked, group] of [
    ['report-task-usage.yml', 'report', 'factory-task-usage'],
    ['publish-agent-history.yml', 'publish', 'factory-agent-history'],
  ]) {
    const source = read(name);
    const wait = job(source, 'wait-for-source');
    assert.doesNotMatch(wait, /concurrency:/, name);
    assert.match(wait, /needs: dispatch-gate\n/, name);
    // The same skip conditions as the job it feeds.
    assert.match(
      wait,
      /!cancelled\(\) && needs\.dispatch-gate\.outputs\.covered != 'true' &&/,
      name,
    );
    assert.match(
      wait,
      /github\.event\.workflow_run\.conclusion != 'skipped'/,
      name,
    );
    assert.match(
      wait,
      /node control\/\.github\/scripts\/wait-for-task-run\.mjs \\\n\s+--run-id "\$SOURCE_RUN_ID" --attempt "\$SOURCE_ATTEMPT"/,
      name,
    );
    const body = job(source, locked);
    assert.match(body, /needs: \[dispatch-gate, wait-for-source\]/, name);
    assert.match(
      body,
      /!cancelled\(\) && needs\.wait-for-source\.result == 'success' &&/,
      name,
    );
    assert.match(
      body,
      new RegExp(`concurrency:\\n {6}group: ${group}\\n`),
      name,
    );
  }
});

test('the standalone wait returns once the pinned attempt completes', async () => {
  const states = ['in_progress', 'completed'];
  const calls = [];
  const run = await waitForTaskRun(
    async (method, route) => {
      calls.push(route);
      return {
        id: 7,
        run_attempt: 2,
        path: '.github/workflows/code-agent-task.yml',
        head_repository: { full_name: 'owner/factory' },
        head_branch: 'develop',
        event: 'repository_dispatch',
        status: states.shift(),
      };
    },
    {
      runId: 7,
      attempt: '2',
      repository: 'owner/factory',
      defaultBranch: 'develop',
      pause: async () => {},
    },
  );
  assert.equal(run.status, 'completed');
  assert.deepEqual(calls, [
    '/actions/runs/7/attempts/2',
    '/actions/runs/7/attempts/2',
  ]);
});
