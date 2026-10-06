import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('terminal notice publishes evidence and unknown cause without offering checkpoint recovery', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-stop-notice-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, 'pipeline-state.json'),
    JSON.stringify({
      phase: 'repair',
      outcome: 'budget-exhausted',
      verificationAttempts: 3,
      repairAttempts: 2,
      stopReason: { code: 'repeated-failure', reason: '相同失败已出现 3 次' },
    }),
  );
  writeFileSync(path.join(root, 'task-metadata.json'), '{}');
  const mutations = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (req.method !== 'GET')
      mutations.push({ url: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.startsWith('/repos/o/r/labels') && req.method === 'GET'
          ? []
          : { number: 7, labels: [] },
      ),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await exec(
    process.execPath,
    [path.resolve(import.meta.dirname, '../mark-failure.mjs'), '7', root],
    {
      timeout: 10_000,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_TOKEN: 'fixture',
        GITHUB_RUN_ID: '100',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_API_URL: 'http://127.0.0.1:' + server.address().port,
        FACTORY_CHECKPOINT_AVAILABLE: 'true',
      },
    },
  );
  const notice = mutations.find((item) => item.url.endsWith('/comments')).body
    .body;
  assert.match(notice, /已停止自动修复，待诊断/);
  assert.match(notice, /相同失败已出现 3 次/);
  assert.match(notice, /累计验证 3 轮、修复 2 轮/);
  assert.match(notice, /task-diagnostic.md.*task-diagnostic.json/);
  assert.match(notice, /unknown/);
  assert.doesNotMatch(notice, /recovery_run_id|Run workflow/);
  assert.ok(
    mutations
      .find((item) => item.url === '/repos/o/r/issues/7')
      .body.labels.includes('agent:failed'),
  );
});

test('a runner timeout is reported as a timeout, not as a manual cancel', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-stop-notice-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, 'pipeline-state.json'),
    JSON.stringify({ phase: 'repair', outcome: 'running' }),
  );
  writeFileSync(path.join(root, 'task-metadata.json'), '{}');
  const mutations = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (req.method !== 'GET')
      mutations.push({ url: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.startsWith('/repos/o/r/labels') && req.method === 'GET'
          ? []
          : { number: 7, labels: [] },
      ),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await exec(
    process.execPath,
    [path.resolve(import.meta.dirname, '../mark-failure.mjs'), '7', root],
    {
      timeout: 10_000,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_TOKEN: 'fixture',
        GITHUB_RUN_ID: '100',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_API_URL: 'http://127.0.0.1:' + server.address().port,
        // The workflow sets both: GitHub reports a timed-out job as cancelled.
        FACTORY_RUN_CANCELLED: 'true',
        FACTORY_RUN_TIMED_OUT: 'true',
      },
    },
  );
  const notice = mutations.find((item) => item.url.endsWith('/comments')).body
    .body;
  assert.match(notice, /超过 GitHub runner 的 6 小时上限/);
  assert.doesNotMatch(notice, /本次运行已取消/);
  assert.doesNotMatch(notice, /本次搭建未完成/);
});

async function failedRunNotice(t, env) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-stop-notice-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, 'pipeline-state.json'),
    JSON.stringify({ phase: 'done', outcome: 'failed' }),
  );
  writeFileSync(path.join(root, 'task-metadata.json'), '{}');
  const mutations = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (req.method !== 'GET')
      mutations.push({ url: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.startsWith('/repos/o/r/labels') && req.method === 'GET'
          ? []
          : { number: 7, labels: [] },
      ),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await exec(
    process.execPath,
    [path.resolve(import.meta.dirname, '../mark-failure.mjs'), '7', root],
    {
      timeout: 10_000,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_TOKEN: 'fixture',
        GITHUB_RUN_ID: '100',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_API_URL: 'http://127.0.0.1:' + server.address().port,
        FACTORY_RUN_TIMED_OUT: 'false',
        ...env,
      },
    },
  );
  return mutations.find((item) => item.url.endsWith('/comments')).body.body;
}

test('a later job that timed out is reported as a failure, with its preview packaging', async (t) => {
  // The run itself was not cancelled; the packaging job hit its timeout,
  // which GitHub reports as cancelled.
  const notice = await failedRunNotice(t, {
    FACTORY_RUN_CANCELLED: 'false',
    FACTORY_PREVIEW_BUILD_RESULT: 'cancelled',
  });
  assert.doesNotMatch(notice, /本次运行已取消/);
  assert.match(notice, /已尝试为失败实现打包预览，但未生成可用部署包/);
});

test('a cancelled run does not also report its cancelled packaging as failed', async (t) => {
  const notice = await failedRunNotice(t, {
    FACTORY_RUN_CANCELLED: 'true',
    FACTORY_PREVIEW_BUILD_RESULT: 'cancelled',
  });
  assert.match(notice, /本次运行已取消/);
  assert.doesNotMatch(notice, /打包预览/);
  // A packaging job that failed on its own is still reported.
  const failed = await failedRunNotice(t, {
    FACTORY_RUN_CANCELLED: 'true',
    FACTORY_PREVIEW_BUILD_RESULT: 'failure',
  });
  assert.match(failed, /已尝试为失败实现打包预览，但未生成可用部署包/);
});

test('only a real cancellation of the run makes the notice say cancelled', () => {
  const workflow = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'),
    'utf8',
  );
  const jobOf = (name) =>
    workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  const report = jobOf('report-failure');
  // A timed-out verify-final or packaging job is 'cancelled' in needs.* too,
  // and a step-level cancelled() in an always() job is always false.
  assert.doesNotMatch(report, /contains\(needs\.\*\.result, 'cancelled'\)/);
  assert.doesNotMatch(report, /^\s+if: cancelled\(\)$/m);
  assert.match(
    report,
    /FACTORY_RUN_CANCELLED: \$\{\{ needs\.run-cancelled\.result == 'success' \}\}/,
  );
  const needsOf = (job) =>
    /needs:\s*\[([^\]]+)\]/
      .exec(job)[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  // report-failure waits for it, and its always() keeps a skipped one harmless.
  assert.deepEqual(needsOf(report), [
    'prepare',
    'agent',
    'verify-final',
    'publish',
    'publish-failed',
    'preview-build-failed',
    'run-cancelled',
  ]);
  assert.match(report, /^ {4}if: >-\n {6}always\(\) &&/m);
  const cancelledJob = jobOf('run-cancelled');
  assert.match(cancelledJob, /^ {4}if: cancelled\(\)$/m);
  assert.deepEqual(needsOf(cancelledJob), needsOf(report).slice(0, -1));
  assert.match(cancelledJob, /^ {4}permissions: \{\}$/m);
  assert.match(cancelledJob, /^ {4}timeout-minutes: 2$/m);
});
