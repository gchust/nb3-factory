import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateRecovery, validateRecoveryBase } from '../handoff-recovery.mjs';
import { resolveControlSha, verifyControlSha } from '../handoff-control.mjs';
import { initialize, restoreState, saveState } from '../pipeline-state.mjs';
import { classifyAgentFailure, collectAgentFailure } from '../agent-failure.mjs';
import { createResult } from '../agent-result.mjs';
import { parseEvent } from '../agents/pi.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const A = 'a'.repeat(40), B = 'b'.repeat(40);
const repository = 'gchust/nb3-factory';
const sha256 = value => createHash('sha256').update(value).digest('hex');
function directory(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-recovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, value) {
  const dest = path.join(root, file); mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  return dest;
}
function fixture(t) {
  const root = directory(t);
  const task = { schemaVersion: 1, repository, controlSha: A, issue: { number: 182 },
    workBranch: 'agent/issue-182', applicationBase: { ref: 'issues-182', sha: B },
    task: { targetBranch: 'issues-182', requirements: 'Customer list', acceptanceCriteria: 'B01. QA-only sentinel', sampleData: 'yes' } };
  const event = { inputs: { issue_number: '182', recovery_run_id: '12345' }, repository: { full_name: repository } };
  const run = { id: 12345, run_attempt: 1, path: '.github/workflows/code-agent-task.yml',
    head_repository: { full_name: repository }, event: 'issues', status: 'completed', conclusion: 'failure' };
  const state = initialize(path.join(root, 'pipeline-state.json'), task);
  Object.assign(state, { controlSha: A, phase: 'implementation', outcome: 'failed', patchHash: sha256('patch') });
  saveState(path.join(root, 'pipeline-state.json'), state);
  write(root, 'task-metadata.json', task); write(root, 'agent.patch', 'patch');
  return { root, task, event, run, state, checkpointTask: structuredClone(task), patch: Buffer.from('patch') };
}

test('503 auth_unavailable is a provider outage, not a caller API-key error', () => {
  assert.deepEqual(classifyAgentFailure('503: auth_unavailable: no auth available (last upstream: HTTP 401)'), { category: 'provider_unavailable', retryable: true });
  for (const value of ['401: invalid key', 'HTTP 403', 'invalid_api_key']) assert.equal(classifyAgentFailure(value).category, 'auth_configuration');
  assert.equal(classifyAgentFailure('429 insufficient_quota').retryable, false);
  assert.equal(classifyAgentFailure('429 too many requests').category, 'rate_limited');
  assert.equal(classifyAgentFailure('ECONNRESET').category, 'network_error');
  assert.equal(classifyAgentFailure('TypeScript failed at file.ts:503').category, 'agent_failure');
});

function fakePi(t, body) {
  const root = directory(t), bin = path.join(root, 'bin'), workspace = path.join(root, 'workspace');
  mkdirSync(bin); mkdirSync(workspace); write(root, 'prompt.md', 'Implement only the task.');
  writeFileSync(path.join(bin, 'pi'), `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  const log = path.join(root, 'artifacts/agent-implement.jsonl');
  const result = spawnSync(process.execPath, [path.join(scripts, 'run-agent.mjs'),
    '--workspace', workspace, '--prompt', path.join(root, 'prompt.md'), '--log', log, '--agentDir', path.join(root, 'config')],
    { encoding: 'utf8', timeout: 12_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
      CODE_AGENT_ENGINE: 'pi', CODE_AGENT_API_ENDPOINT: 'https://secret-host.invalid/v1', CODE_AGENT_API_KEY: 'do-not-publish-secret',
      CODE_AGENT_MODEL: 'test-model', CODE_AGENT_IDLE_TIMEOUT_SECONDS: '10', FACTORY_RUN_DEADLINE_EPOCH_SECONDS: '' } });
  return { root, workspace, result, normalized: JSON.parse(readFileSync(`${log}.result.json`, 'utf8')) };
}
const emit = `const emit = value => console.log(JSON.stringify(value));
const error = { role: 'assistant', stopReason: 'error', errorMessage: '503: auth_unavailable do-not-publish-secret' };`;

test('a temporary 503 keeps the invocation alive through retry and clears its terminal failure', t => {
  const f = fakePi(t, `${emit}
    require('node:fs').appendFileSync('partial.txt', 'one invocation');
    emit({ type: 'message_end', message: error });
    emit({ type: 'agent_end', messages: [error], willRetry: true });
    emit({ type: 'auto_retry_start', attempt: 1, delayMs: 3200 });
    setTimeout(() => {
      emit({ type: 'agent_start' });
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
      emit({ type: 'agent_end', messages: [{ role: 'assistant', stopReason: 'stop' }] });
    }, 3200);`);
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal(f.normalized.status, 'completed'); assert.equal(f.normalized.failure, undefined);
  assert.equal(f.normalized.retryAttempts, 1);
  assert.equal(readFileSync(path.join(f.workspace, 'partial.txt'), 'utf8'), 'one invocation');
  const settings = JSON.parse(readFileSync(path.join(f.root, 'config/settings.json'), 'utf8'));
  assert.deepEqual(settings.retry, { enabled: true, maxRetries: 6, baseDelayMs: 5000, maxAgentDelayMs: 60000, provider: { maxRetries: 0 } });
});

test('exhausted retries fail even with CLI exit zero and keep the partial workspace and diagnostics', t => {
  const f = fakePi(t, `${emit}
    require('node:fs').writeFileSync('partial.txt', 'keep this code');
    for (let attempt = 1; attempt <= 6; attempt++) emit({ type: 'auto_retry_start', attempt });
    emit({ type: 'message_end', message: error });
    emit({ type: 'agent_end', messages: [error], willRetry: false });`);
  assert.equal(f.result.status, 1, f.result.stderr);
  assert.equal(f.normalized.exitCode, 0); assert.equal(f.normalized.retryAttempts, 6);
  assert.deepEqual(f.normalized.failure, { category: 'provider_unavailable', retryable: true });
  assert.equal(readFileSync(path.join(f.workspace, 'partial.txt'), 'utf8'), 'keep this code');
  assert.doesNotMatch(JSON.stringify(f.normalized) + f.result.stdout + f.result.stderr, /do-not-publish-secret/);
  const publicFailure = collectAgentFailure(path.join(f.root, 'artifacts'));
  assert.equal(publicFailure.retryAttempts, 6);
  assert.doesNotMatch(JSON.stringify(publicFailure), /do-not-publish-secret|errorMessage/);
});

test('permanent auth errors stop without a factory-level rerun', t => {
  const f = fakePi(t, `console.log(JSON.stringify({type:'message_end', message:{role:'assistant',stopReason:'error',errorMessage:'401: invalid_api_key'}}));`);
  assert.equal(f.result.status, 1); assert.equal(f.normalized.retryAttempts, 0);
  assert.deepEqual(f.normalized.failure, { category: 'auth_configuration', retryable: false });
});

test('a later successful invocation prevents stale provider failure attribution', t => {
  const root = directory(t);
  write(root, 'agent-implement.jsonl.result.json', { version: 1, status: 'failed', endedAt: 100, error: '503: outage' });
  write(root, 'agent-repair-1.jsonl.result.json', { version: 1, status: 'completed', endedAt: 200 });
  assert.equal(collectAgentFailure(root), null);
});

test('failed artifacts without handoff.json become a valid pinned handoff without changing source state', t => {
  const f = fixture(t), data = validateRecovery(f);
  assert.equal(existsSync(path.join(f.root, 'handoff.json')), false);
  write(f.root, 'handoff.json', data.handoff);
  assert.equal(resolveControlSha(data.event, B, f.root, f.task), A);
  assert.equal(verifyControlSha(data.event, A, f.root), A);
  const restored = restoreState(f.root, path.join(f.root, 'restored'), f.task);
  assert.equal(restored.phase, 'implementation'); assert.equal(restored.outcome, 'running');
  assert.equal(restored.verificationAttempts, 0); assert.equal(restored.repairAttempts, 0);
  assert.equal(JSON.parse(readFileSync(path.join(f.root, 'pipeline-state.json'))).outcome, 'failed');
});

test('recovery preserves original build-comment identity for queue claim continuation', t => {
  const f = fixture(t); f.task.buildCommentId = 555; f.checkpointTask.buildCommentId = 555;
  assert.equal(validateRecovery(f).event.client_payload.build_comment_id, 555);
});

test('legacy application base must be explicit; workflow head SHA is never substituted', t => {
  const f = fixture(t); delete f.task.applicationBase; delete f.checkpointTask.applicationBase;
  f.run.head_sha = A;
  assert.throws(() => validateRecovery(f), /recovery_base_sha/);
  assert.equal(validateRecovery({ ...f, legacyBaseSha: B }).recovery.baseSha, B);
  assert.throws(() => validateRecovery({ ...f, legacyBaseSha: 'develop' }), /SHA/);
});

test('wrong run, repo, attempt, input, hash, pin and completed delivery cannot be recovered', t => {
  const f = fixture(t);
  for (const run of [{ ...f.run, id: 999 }, { ...f.run, conclusion: 'success' }, { ...f.run, status: 'in_progress' },
    { ...f.run, path: '.github/workflows/other.yml' }, { ...f.run, head_repository: { full_name: 'other/repo' } }, { ...f.run, run_attempt: 2 }]) {
    assert.throws(() => validateRecovery({ ...f, run }));
  }
  for (const state of [{ ...f.state, inputHash: 'bad' }, { ...f.state, controlSha: B }, { ...f.state, outcome: 'passed' }, { ...f.state, phase: 'done' }]) assert.throws(() => validateRecovery({ ...f, state }));
  assert.throws(() => validateRecovery({ ...f, patch: Buffer.from('tampered') }), /patch/);
  assert.throws(() => validateRecovery({ ...f, checkpointTask: { ...f.task, repository: 'other/repo' } }), /same Issue/);
  f.task.run = f.checkpointTask.run = { id: 12345, attempt: 2 };
  assert.equal(validateRecovery({ ...f, run: { ...f.run, run_attempt: 2 } }).recovery.sourceAttempt, 2);
});

test('recovery rejects moved application branches and changed live business input', t => {
  const f = fixture(t), { recovery } = validateRecovery(f);
  validateRecoveryBase(recovery, f.task, f.task, 'issues-182', B);
  assert.throws(() => validateRecoveryBase(recovery, f.task, f.task, 'issues-182', A), /branch moved/);
  assert.throws(() => validateRecoveryBase(recovery, f.task, { ...f.task, task: { ...f.task.task, requirements: 'changed' } }, 'issues-182', B), /input changed/);
  assert.throws(() => validateRecoveryBase(recovery, f.task, { ...f.task, task: { ...f.task.task, discussionContext: 'new user request' } }, 'issues-182', B), /input changed/);
});

test('recovery retains repair/QA phase and pending criteria but no browser or DB evidence is reused', t => {
  const f = fixture(t);
  Object.assign(f.state, { phase: 'qa-focused', pendingCriteria: ['B06'], verificationAttempts: 4, repairAttempts: 3 });
  saveState(path.join(f.root, 'pipeline-state.json'), f.state);
  write(f.root, 'database.sqlite', 'stale DB'); write(f.root, 'report.json', { passed: true });
  validateRecovery(f);
  const restored = restoreState(f.root, path.join(f.root, 'restored'), f.task);
  assert.equal(restored.phase, 'qa-focused'); assert.deepEqual(restored.pendingCriteria, ['B06']);
  assert.equal(restored.verificationAttempts, 4); assert.equal(restored.repairAttempts, 3);
  assert.equal(existsSync(path.join(f.root, 'restored/database.sqlite')), false);
  assert.equal(existsSync(path.join(f.root, 'restored/report.json')), false);
});

test('real Git recovery applies a saved patch on its original base and restores implementation state', t => {
  const f = fixture(t), repo = path.join(f.root, 'repo'); mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-b', 'issues-182'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  write(repo, 'app.txt', 'original\n'); git('add', '.'); git('commit', '-m', 'base'); const base = git('rev-parse', 'HEAD');
  write(repo, 'app.txt', 'partial implementation\n');
  const patch = execFileSync('git', ['-C', repo, 'diff', '--binary', '--full-index', 'HEAD']);
  writeFileSync(path.join(f.root, 'agent.patch'), patch); git('reset', '--hard', 'HEAD');
  f.state.patchHash = sha256(patch); saveState(path.join(f.root, 'pipeline-state.json'), f.state);
  f.task.applicationBase.sha = base; f.checkpointTask = structuredClone(f.task);
  const data = validateRecovery({ ...f, patch });
  validateRecoveryBase(data.recovery, f.task, f.task, 'issues-182', base);
  execFileSync(process.execPath, [path.join(scripts, 'apply-patch.mjs'), '--workspace', repo, '--patch', path.join(f.root, 'agent.patch'), '--branch', f.task.workBranch], { stdio: 'pipe' });
  assert.equal(readFileSync(path.join(repo, 'app.txt'), 'utf8'), 'partial implementation\n');
  assert.equal(restoreState(f.root, path.join(f.root, 'restored'), f.task).phase, 'implementation');
});

test('normalization CLI validates source run over HTTP and writes no QA input into continuation context', async t => {
  const f = fixture(t); write(f.root, 'event.json', f.event);
  const requested = [];
  const server = createServer((req, res) => {
    requested.push(req.url); res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/actions/runs/12345')) res.end(JSON.stringify(f.run));
    else if (req.url.endsWith('/heads/issues-182')) res.end(JSON.stringify({ object: { sha: B } }));
    else res.writeHead(404).end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, [path.join(scripts, 'handoff-recovery.mjs'), 'normalize', '--event', path.join(f.root, 'event.json'),
    '--task', path.join(f.root, 'task-metadata.json'), '--checkpoint', f.root, '--output', path.join(f.root, 'output')],
    { env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: repository, GITHUB_TOKEN: 'test-only', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ['ignore','pipe','pipe'] });
  child.stdout.resume(); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 5000); t.after(() => clearTimeout(timer));
  const [code] = await once(child, 'exit'); assert.equal(code, 0, stderr);
  assert.deepEqual(requested, [`/repos/${repository}/actions/runs/12345`, `/repos/${repository}/git/ref/heads/agent%2Fissue-182`, `/repos/${repository}/git/ref/heads/issues-182`]);
  const prompt = write(f.root, 'implement.md', 'original requirements');
  execFileSync(process.execPath, [path.join(scripts, 'handoff-recovery.mjs'), 'context', '--checkpoint', f.root, '--prompt', prompt]);
  assert.match(readFileSync(prompt, 'utf8'), /Inspect the existing files and git diff/);
  assert.doesNotMatch(readFileSync(prompt, 'utf8'), /QA-only sentinel/);
});

test('workflow restores failure artifacts before implementation and preserves independent verification gates', () => {
  const workflow = readFileSync(path.join(scripts, '../workflows/code-agent-task.yml'), 'utf8');
  const prepare = workflow.split('  prepare:')[1].split('  agent:')[0];
  const agent = workflow.split('  agent:')[1].split('  verify-final:')[0];
  assert.ok(prepare.indexOf('handoff-recovery.mjs normalize') < prepare.indexOf('handoff-control.mjs resolve'));
  assert.ok(prepare.indexOf('handoff-recovery.mjs check-base') < prepare.indexOf('Save normalized recovery checkpoint'));
  assert.match(agent, /name: factory-recovery-/);
  assert.ok(agent.indexOf('handoff-control.mjs verify') < agent.indexOf('apply-patch.mjs'));
  assert.ok(agent.indexOf('pipeline-state.mjs restore') < agent.indexOf('Run Code Agent implementation'));
  assert.match(agent, /steps.resume.outputs.phase == 'implementation'/);
  assert.match(workflow, /if: needs.agent.result == 'success' && needs.agent.outputs.handoff != 'true'/);
  assert.match(workflow, /if: needs.verify-final.result == 'success'/);
  assert.doesNotMatch(agent, /if:.*retryable/);
});

test('identical native retry notifications in separate outage episodes are both counted', t => {
  const root = directory(t), log = path.join(root, 'agent-implement.jsonl');
  const result = createResult({ engine: 'pi', phase: 'implementation' });
  for (let episode = 0; episode < 2; episode++) {
    for (const event of [{ type: 'auto_retry_start', attempt: 1, delayMs: 5000, errorMessage: '503 unavailable' },
      { type: 'auto_retry_end', success: true }, { type: 'agent_start' }]) {
      result.observe(parseEvent(event), JSON.stringify(event));
    }
  }
  assert.equal(result.save(log, { status: 'completed', exitCode: 0 }, value => value).retryAttempts, 2);
});
