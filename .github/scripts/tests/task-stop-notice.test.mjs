import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
