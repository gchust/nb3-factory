import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { snapshot, validateSnapshot, shouldSend, publishProgress, renderProgress, marker } from '../task-progress.mjs';
import { initialize, saveState } from '../pipeline-state.mjs';

const repository = 'owner/factory';
const now = Date.now();
const identity = { issue: 165, runId: 123, attempt: 1 };
const progress = { phase: 'qa-focused', outcome: 'running', verificationAttempts: 3, repairAttempts: 2,
  pendingCriteria: ['B06'], phaseStartedAt: now - 60_000 };
const live = { version: 1, ...identity, ...progress, sampledAt: now, activityAt: now - 1000, qa: null };
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task-progress-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
    return target;
  };
  const metadata = { issue: { number: 165 }, task: { acceptanceCriteria: 'B01. Login\nB06. Preview file' } };
  put('progress.json', progress);
  return { root, put, metadata };
}
function fakeApi() {
  const comments = [], writes = [], reads = [];
  let run = { id: 123, run_attempt: 1, run_number: 10, display_title: 'Factory issue #165 build 0 from 0',
    path: '.github/workflows/code-agent-task.yml', head_branch: 'develop', head_repository: { full_name: repository },
    event: 'issues', status: 'in_progress', run_started_at: new Date(now - 3600_000).toISOString(), updated_at: new Date(now).toISOString() };
  let jobs = [{ name: 'prepare', conclusion: 'success' }, { name: 'agent', status: 'in_progress' }];
  const api = async (method, route, body) => {
    if (method === 'GET') {
      reads.push(route);
      if (route === '') return { default_branch: 'develop' };
      if (/\/jobs\?/u.test(route)) return { jobs };
      if (/\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/u.test(route)) return run;
      if (route.includes('/comments?')) return comments;
      if (route === '/issues/165') return { number: 165 };
      throw new Error(`Unexpected read: ${route}`);
    }
    writes.push({ method, route, body });
    if (method === 'POST') comments.push({ id: comments.length + 1, user: { login: 'github-actions[bot]' }, body: body.body });
    else comments.find((c) => route.endsWith(`/${c.id}`)).body = body.body;
  };
  return { api, comments, writes, reads, run, setRun: (v) => { run = { ...run, ...v }; }, setJobs: (v) => { jobs = v; } };
}
const publish = (f, sample = live, extra = {}) => publishProgress(f.api, repository, { runId: sample.runId, attempt: sample.attempt, live: sample, ...extra }, now);

test('samples IDs/counts and file activity, never transcript text or reporter heartbeat', (t) => {
  const f = fixture(t);
  const log = f.put('agent-implement.jsonl', 'SECRET-DO-NOT-PUBLISH');
  utimesSync(log, new Date(now - 10_000), new Date(now - 10_000));
  f.put('live-progress.log', 'Heartbeat must not count as model activity');
  f.put('verify-3/browser-focused/report.json', { checks: [{ id: 'B06', status: 'failed', recordedAt: now - 5000, evidence: ['PRIVATE'] }] });
  const s = snapshot(f.root, f.metadata, identity, now);
  assert.ok(Math.abs(s.activityAt - (now - 10_000)) <= 1);
  assert.equal(s.qa.total, 1);
  assert.equal(s.qa.recorded, 1);
  assert.equal(s.qa.failed, 1);
  assert.deepEqual(s.qa.lastCheck, { id: 'B06', at: now - 5000 });
  assert.doesNotMatch(JSON.stringify(s), /SECRET|PRIVATE|Heartbeat/);
});

test('focused success followed by full QA does not borrow focused counts', (t) => {
  const f = fixture(t);
  f.put('verify-3/browser-focused/report.json', { checks: [{ id: 'B06', status: 'passed' }] });
  f.put('progress.json', { ...progress, phase: 'qa-full' });
  const s = snapshot(f.root, f.metadata, identity, now);
  assert.equal(s.qa, null); // Missing full report is unknown, never focused success.
});

test('empty logs and symlinks never manufacture activity', (t) => {
  const f = fixture(t);
  f.put('agent-implement.jsonl', '');
  symlinkSync(f.put('private.txt', 'not-agent-output'), path.join(f.root, 'agent-repair-1.jsonl'));
  const s = snapshot(f.root, f.metadata, identity, now);
  assert.equal(s.activityAt, null);
});

test('snapshot allowlist rejects invalid IDs/counts/time and strips arbitrary payload', () => {
  assert.equal(validateSnapshot({ ...live, secret: 'private' }, now).secret, undefined);
  for (const patch of [{ pendingCriteria: ['@everyone'] }, { repairAttempts: -1 }, { phase: '[link](x)' }, { sampledAt: now + 120_000 }])
    assert.throws(() => validateSnapshot({ ...live, ...patch }, now), /Invalid/);
});

test('stage changes are coalesced at one minute; activity-only ticks at five minutes', () => {
  assert.equal(shouldSend(null, live, 0, now), true);
  assert.equal(shouldSend(live, { ...live, phase: 'repair' }, now - 30_000, now), false);
  assert.equal(shouldSend(live, { ...live, phase: 'repair' }, now - 60_000, now), true);
  assert.equal(shouldSend(live, { ...live, activityAt: now }, now - 120_000, now), false);
  assert.equal(shouldSend(live, { ...live, sampledAt: now }, now - 300_000, now), true);
});

test('phase start survives seals/outcome updates but resets on the next round', (t) => {
  const f = fixture(t);
  const file = path.join(f.root, 'pipeline-state.json');
  const state = initialize(file, f.metadata);
  f.put('progress.json', { ...state, runId: process.env.GITHUB_RUN_ID ?? '', attempt: process.env.GITHUB_RUN_ATTEMPT ?? '', phaseStartedAt: 1 });
  saveState(file, { ...state, outcome: 'handoff' });
  assert.equal(JSON.parse(readFileSync(path.join(f.root, 'progress.json'))).phaseStartedAt, 1);
  saveState(file, { ...state, verificationAttempts: 1 });
  assert.ok(JSON.parse(readFileSync(path.join(f.root, 'progress.json'))).phaseStartedAt > 1);
});

test('creates one bot comment, updates in place, ignores human lookalikes and repeats', async () => {
  const f = fakeApi();
  f.comments.push({ id: 9, user: { login: 'owner' }, body: `${marker}\nHuman comment` });
  assert.equal(await publish(f), true);
  assert.equal(await publish(f), false);
  assert.equal(await publish(f, { ...live, sampledAt: now + 1, phase: 'repair' }), true);
  assert.deepEqual(f.writes.map((v) => v.method), ['POST', 'PATCH']);
  assert.equal(f.comments[0].body, `${marker}\nHuman comment`);
});

test('late snapshots and previous runs/attempts cannot overwrite a newer result', async () => {
  const f = fakeApi();
  await publish(f);
  assert.equal(await publish(f, { ...live, sampledAt: now - 1000 }), false);
  f.setRun({ id: 124, run_number: 11 });
  await publish(f, { ...live, runId: 124 });
  f.setRun({ id: 123, run_number: 10, status: 'completed', conclusion: 'failure' });
  assert.equal(await publish(f), false);
  f.setRun({ run_attempt: 2 });
  assert.equal(await publish(f), false);
});

test('rejects foreign source, arbitrary workflow, Issue mismatch, and absent prepare', async () => {
  for (const patch of [{ head_repository: { full_name: 'other/repo' } }, { path: '.github/workflows/evil.yml' },
    { head_branch: 'agent/issue-165' }, { display_title: 'Factory issue #166 build 0 from 0' }, { event: 'pull_request' }]) {
    const f = fakeApi(); f.setRun(patch);
    await assert.rejects(publish(f), /factory task/);
    assert.equal(f.writes.length, 0);
  }
  const f = fakeApi(); f.setJobs([]);
  assert.equal(await publish(f), false);
});

test('business QA passed is not delivery; terminal status comes from source jobs', async () => {
  const f = fakeApi();
  await publish(f, { ...live, phase: 'done', outcome: 'passed' });
  assert.match(f.writes[0].body.body, /等待独立终验/);
  assert.doesNotMatch(f.writes[0].body.body, /已生成\/更新业务 PR/);
  f.setRun({ status: 'completed', conclusion: 'success' });
  f.setJobs([{ name: 'prepare', conclusion: 'success' }, { name: 'publish', conclusion: 'success' }]);
  await publishProgress(f.api, repository, { runId: 123, attempt: 1, final: true }, now + 30_000);
  assert.match(f.writes.at(-1).body.body, /已生成\/更新业务 PR/);
  assert.equal(await publish(f, { ...live, sampledAt: now + 50_000 }), false);
});

test('terminal cancellation and handoff update the existing comment without losing check time', async () => {
  const f = fakeApi();
  const qa = { scope: 'focused', total: 1, recorded: 1, passed: 0, failed: 1, blocked: 0, not_run: 0, lastCheck: { id: 'B06', at: now - 1000 } };
  await publish(f, { ...live, qa });
  await publish(f, { ...live, phase: 'repair', sampledAt: now + 1 });
  assert.match(f.writes.at(-1).body.body, /B06 · 第 3 轮/);
  f.setRun({ status: 'completed', conclusion: 'cancelled' });
  await publishProgress(f.api, repository, { runId: 123, attempt: 1, final: true }, now + 30_000);
  assert.match(f.writes.at(-1).body.body, /已取消/);
  assert.equal(f.writes.at(-1).method, 'PATCH');
  const h = fakeApi(); h.setRun({ status: 'completed', conclusion: 'success' });
  h.setJobs([{ name: 'prepare', conclusion: 'success' }, { name: 'agent', steps: [{ name: 'Dispatch continuation run', conclusion: 'success' }] }]);
  await publishProgress(h.api, repository, { runId: 123, attempt: 1, final: true }, now);
  assert.match(h.writes[0].body.body, /已保存 Handoff/);
});

test('failed publishing is visible, and rendered snapshots are explicitly not acceptance verdicts', async () => {
  const f = fakeApi();
  await assert.rejects(publishProgress(async (method, ...args) => {
    if (method === 'POST') throw new Error('HTTP 503');
    return f.api(method, ...args);
  }, repository, { runId: 123, attempt: 1, live }, now), /503/);
  const text = renderProgress({ runId: 123, attempt: 1, sampledAt: now, startedAt: now - 60_000, snapshot: live, label: '运行中' }, repository);
  assert.match(text, /日志有输出不等于验收有进展/);
  assert.match(text, /不是最终验收结论/);
});

test('observer dispatches allowlisted snapshots and flushes on stop without a model', async (t) => {
  const f = fixture(t), requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body)); res.writeHead(204); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const child = spawn(process.execPath, [path.resolve(import.meta.dirname, '../task-progress.mjs'), 'watch', f.root, f.put('metadata.json', f.metadata)], {
    env: { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'private-token', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let output = ''; child.stdout.on('data', (v) => { output += v; }); child.stderr.on('data', (v) => { output += v; });
  const exited = once(child, 'exit');
  for (let i = 0; i < 100 && !requests.length; i++) await sleep(20);
  assert.equal(requests[0]?.event_type, 'factory-progress');
  child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0, output);
  assert.equal(requests.length, 2);
  assert.doesNotMatch(JSON.stringify(requests) + output, /private-token/);
});

test('workflow isolates the writer, pins control code and always stops the observer', () => {
  const task = readFileSync(path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'), 'utf8');
  const reporter = readFileSync(path.resolve(import.meta.dirname, '../../workflows/report-task-progress.yml'), 'utf8');
  const agent = task.split('\n  agent:\n')[1].split('\n  verify-final:\n')[0];
  assert.doesNotMatch(agent, /issues: write/);
  assert.match(agent, /Flush and stop live progress observer\n\s+if: always\(\)\n\s+continue-on-error: true/);
  assert.ok(agent.indexOf('Start live progress observer') < agent.indexOf('Run Code Agent implementation'));
  assert.match(reporter, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(reporter, /types: \[factory-progress\]/);
  assert.match(reporter, /workflow_run:/);
  assert.match(reporter, /workflow_dispatch:/);
  assert.doesNotMatch(reporter, /secrets\.|run-agent|pnpm|download-artifact/);
});

test('terminal publication does not wait for an unrelated reply job to end', async () => {
  const f = fakeApi();
  f.setJobs([{ name: 'prepare', conclusion: 'success' }, { name: 'publish', status: 'completed', conclusion: 'success' }, { name: 'reply', status: 'in_progress' }]);
  await publishProgress(f.api, repository, { runId: 123, attempt: 1 }, now);
  assert.match(f.writes[0].body.body, /已生成\/更新业务 PR/);
  assert.equal(f.reads.filter((r) => /^\/actions\/runs\/123$/u.test(r)).length, 1);
});


test('a read-only question cannot overwrite the business build progress', async () => {
  const f = fakeApi();
  f.setRun({ status: 'completed', conclusion: 'success' });
  f.setJobs([{ name: 'prepare', conclusion: 'success' }, { name: 'agent', conclusion: 'skipped' }, { name: 'reply', conclusion: 'success' }]);
  assert.equal(await publishProgress(f.api, repository, { runId: 123, attempt: 1 }, now), false);
  assert.equal(f.writes.length, 0);
});
