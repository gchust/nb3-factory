import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { beginInvocation, stageReply } from '../agent-invocation-record.mjs';
import { selectHistorySource } from '../agent-history-source.mjs';
import { packHistory } from '../agent-history.mjs';
import { scrubHistoryFile } from '../history-redaction.mjs';
import { isManualIssue } from '../issue-presets.mjs';
import { coordinate } from '../dispatch-comment-builds.mjs';

const exec = promisify(execFile);
const script = path.resolve(import.meta.dirname, '../agent-history.mjs');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const put = (root, name, content) => {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
};
const fixture = t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'history-capture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const run = { id: 123, run_attempt: 2, status: 'completed', conclusion: 'success',
  head_repository: { full_name: 'owner/repo' }, path: '.github/workflows/code-agent-task.yml',
  event: 'repository_dispatch', display_title: 'Factory issue #42 build 99 from 0' };
const job = (name, id = 1, extra = {}) => ({ name, id, conclusion: 'success',
  started_at: '2026-09-23T08:00:00Z', completed_at: '2026-09-23T08:10:00Z', ...extra });
const artifact = (name, id = 10, extra = {}) => ({ name, id, created_at: '2026-09-23T08:05:00Z', expired: false, ...extra });
const source = { version: 1, repository: 'owner/repo', issue: 42, runId: 123, attempt: 2,
  artifacts: ['agent', 'final', 'reply'].map(role => ({ role, state: 'available' })) };
function invocation(root, name) {
  const prompt = put(root, 'input.md', 'Small user task');
  const log = path.join(root, name);
  const capture = beginInvocation({ log, prompt, workspace: root, engine: 'pi', phase: 'implementation', secrets: [],
    env: { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' } });
  capture.start({ command: 'pi', args: ['--print'], model: 'test' });
  put(root, name, '{"type":"turn_end"}\n');
  put(root, `${name}.result.json`, { version: 1, status: 'completed' });
  capture.finish();
  return capture;
}

test('captures prompt and available context hashes independently of CLI output', t => {
  const root = fixture(t);
  put(root, 'AGENTS.md', 'Read relevant Skills');
  put(root, '.agents/skills/example/SKILL.md', 'Use the public API');
  symlinkSync(root, path.join(root, '.agents/skills/loop'));
  const secret = 'quoted"credential\\value';
  const prompt = put(root, 'input.md', `Use ${secret}, password=hunter123`);
  const log = path.join(root, 'agent-implement.jsonl');
  const capture = beginInvocation({ log, prompt, workspace: root, engine: 'pi', phase: 'implementation', secrets: [secret],
    env: { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', FACTORY_CONTROL_SHA: 'abc' } });
  capture.start({ command: 'pi', args: ['--prompt', secret], model: 'test', actualVersion: '1' });
  capture.finish(new Error(`Failed with ${secret}`));
  const record = json(`${log}.invocation.json`);
  assert.match(record.id, /^123:2:implementation:/);
  assert.equal(record.status, 'failed');
  assert.equal(record.invoked, true);
  assert.equal(record.controlSha, 'abc');
  assert.equal(record.context.length, 2);
  assert.equal(record.promptSha256, createHash('sha256').update(readFileSync(`${log}.prompt.md`)).digest('hex'));
  assert.doesNotMatch(readFileSync(`${log}.prompt.md`, 'utf8'), /quoted|hunter123/);
  assert.equal(record.args[1], '[REDACTED]');
  assert.match(record.boundary, /not CLI-internal/);
});

test('setup failures retain an input record without inventing a model invocation', t => {
  const root = fixture(t), log = path.join(root, 'agent-implement.jsonl');
  const capture = beginInvocation({ log, prompt: put(root, 'p.md', 'task'), workspace: root, engine: 'pi', phase: 'implementation', secrets: [] });
  capture.finish(new Error('configuration missing'));
  assert.equal(json(`${log}.invocation.json`).invoked, false);
  const packed = packHistory({ artifacts: root, output: path.join(root, 'out'), issue: 42, runId: 123, attempt: 2 });
  assert.equal(packed.manifest.completeness.invocations[0].invoked, false);
  assert.equal(packed.manifest.completeness.problems.length, 0);
});

test('always-path stages partial comment logs, results, reply and metadata with valid JSON', t => {
  const root = fixture(t);
  const secret = 'my"key\\value';
  put(root, 'comment-artifacts/comment-agent.jsonl', JSON.stringify({ text: secret }) + '\npartial TOKEN=abcd1234');
  put(root, 'comment-artifacts/comment-agent.jsonl.result.json', { error: secret, API_KEY: 'other-key' });
  put(root, 'comment-artifacts/comment-agent.jsonl.prompt.md', secret);
  put(root, 'comment-reply.md', `Answer ${secret}`);
  const metadata = put(root, 'task.json', { issue: { number: 42 } });
  stageReply(root, metadata, { CODE_AGENT_API_KEY: secret });
  assert.equal(json(path.join(root, 'comment-artifacts/comment-agent.jsonl.result.json')).error, '[REDACTED]');
  assert.equal(json(path.join(root, 'comment-artifacts/comment-agent.jsonl.result.json')).API_KEY, '[REDACTED]');
  assert.equal(json(path.join(root, 'comment-artifacts/task-metadata.json')).issue.number, 42);
  assert.doesNotMatch(readFileSync(path.join(root, 'comment-artifacts/comment-agent.jsonl'), 'utf8'), /my|abcd1234/);
  assert.doesNotMatch(readFileSync(path.join(root, 'comment-artifacts/comment-reply.md'), 'utf8'), /my/);
});

test('JSON-aware publication redaction preserves structure', () => {
  const text = scrubHistoryFile(JSON.stringify({ password: 'hidden', message: 'TOKEN=not-public', usage: { totalTokens: 50 } }), 'a.json');
  assert.deepEqual(JSON.parse(text), { password: '[REDACTED]', message: 'TOKEN=[REDACTED]', usage: { totalTokens: 50 } });
});

test('source includes task, final and reply artifacts by exact IDs', () => {
  const data = selectHistorySource(run, [job('prepare'), job('agent'), job('verify-final'), job('reply'), job('publish')],
    [artifact('factory-task-42', 10), artifact('factory-agent-42', 11), artifact('factory-final-42', 12), artifact('factory-comment-reply-99', 13)], 'owner/repo');
  assert.equal(data.status, 'delivered');
  assert.deepEqual(data.artifacts.map(a => a.id), [10, 11, 12, 13]);
});

test('reply-only and failed/no-artifact calls resolve without falsely inventing implementation', () => {
  const jobs = [job('prepare'), job('agent', 2, { conclusion: 'skipped' }), job('reply', 3, {
    conclusion: 'failure', steps: [{ name: 'Answer source comment from current code', started_at: '2026-09-23T08:01:00Z', conclusion: 'failure' }] })];
  const data = selectHistorySource(run, jobs, [artifact('factory-task-42')], 'owner/repo');
  assert.deepEqual(data.artifacts.map(a => a.role), ['task', 'reply']);
  assert.equal(data.artifacts[1].state, 'missing');
  assert.equal(data.artifacts[1].invocationExpected, true);
  assert.equal(selectHistorySource(run, [job('prepare')], [], 'owner/repo'), null);
});

test('old attempt artifacts cannot be downloaded into a later attempt', () => {
  const data = selectHistorySource(run, [job('agent')], [artifact('factory-agent-42', 10, { created_at: '2026-09-22T08:05:00Z' })], 'owner/repo');
  assert.equal(data.artifacts[0].state, 'missing');
  assert.equal(data.artifacts[0].id, null);
});

test('expired, ambiguous and foreign evidence is not silently accepted', () => {
  assert.equal(selectHistorySource(run, [job('agent')], [artifact('factory-agent-42', 10, { expired: true })], 'owner/repo').artifacts[0].state, 'expired');
  assert.throws(() => selectHistorySource(run, [job('agent')], [artifact('factory-agent-42'), artifact('factory-agent-42', 11)], 'owner/repo'), /Ambiguous/);
  assert.throws(() => selectHistorySource(run, [], [artifact('factory-task-43')], 'owner/repo'), /Ambiguous/);
  assert.throws(() => selectHistorySource(run, [], [], 'different/repo'), /same-repository/);
});

test('namespaced archive includes final diagnostics and comment capture, not media', t => {
  const root = fixture(t);
  invocation(root, 'agent/agent-implement.jsonl');
  invocation(root, 'reply/comment-agent.jsonl');
  put(root, 'final/verify-final.log', 'verification completed');
  put(root, 'final/timings.jsonl', '{"step":"build"}\n');
  put(root, 'reply/comment-reply.md', 'answer');
  put(root, 'agent/verify-1/browser-acceptance/evidence/example.png', 'not text');
  const args = { artifacts: root, output: path.join(root, 'out'), issue: 42, runId: 123, attempt: 2, source };
  const one = packHistory(args), two = packHistory(args);
  assert.equal(one.asset, two.asset, 'unchanged content has a stable asset name');
  assert.equal(one.manifest.completeness.status, 'captured');
  assert.equal(one.manifest.completeness.invocations.length, 2);
  assert.ok(one.manifest.files.some(f => f.name === 'final/verify-final.log'));
  assert.ok(one.manifest.files.every(f => f.sha256.length === 64 && !f.name.endsWith('.png')));
  rmSync(path.join(root, 'reply/comment-agent.jsonl.result.json'));
  const partial = packHistory(args);
  assert.notEqual(partial.asset, one.asset, 'incomplete replay cannot overwrite successful asset');
  assert.equal(partial.manifest.completeness.status, 'partial');
  assert.ok(partial.manifest.completeness.problems.some(p => p.name.endsWith('.result.json')));
});

test('legacy, interrupted, failed-download and missing invocations are explicit', t => {
  const root = fixture(t);
  put(root, 'agent/agent-implement.jsonl', '{}');
  put(root, 'reply/comment-reply.md', 'legacy final answer only');
  const packed = packHistory({ artifacts: root, output: path.join(root, 'out'), issue: 42, runId: 123, attempt: 2,
    source: { ...source, artifacts: [...source.artifacts, { role: 'reply', state: 'available', invocationExpected: true }] }, downloads: { final: 'failure' } });
  const reasons = packed.manifest.completeness.problems.map(p => p.reason);
  assert.ok(reasons.includes('legacy_or_invalid_invocation'));
  assert.ok(reasons.includes('download_failed'));
  assert.ok(reasons.includes('expected_invocation_not_captured'));
});

test('empty pack creates a nullable manifest instead of failing to create its directory', t => {
  const root = fixture(t), manifest = path.join(root, 'nested/manifest.json');
  const result = spawnSync(process.execPath, [script, 'pack', '--artifacts', root, '--output', path.join(root, 'out'), '--manifest', manifest,
    '--issue', '42', '--run', '123', '--attempt', '2'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(json(manifest), null);
});

test('failed replay preserves earlier archive and maintains a single history index', async t => {
  const root = fixture(t), comments = [];
  const old = '<!-- factory-agent-history:123:2 -->\n本轮可观察调用文件齐全\nhttps://github.com/owner/repo/releases/download/factory-history/old.tar.gz';
  comments.push({ id: 1, body: old, user: { login: 'github-actions[bot]' } });
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify(comments));
    const body = JSON.parse(raw).body;
    if (req.method === 'POST') { const c = { id: comments.length + 1, body, user: { login: 'github-actions[bot]' } }; comments.push(c); return res.end(JSON.stringify(c)); }
    const id = Number(req.url.split('/').at(-1));
    const c = comments.find(c => c.id === id); c.body = body; res.end(JSON.stringify(c));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const args = [script, 'publish', '--manifest', path.join(root, 'missing.json'), '--source', put(root, 'source.json', source),
    '--issue', '42', '--run', '123', '--attempt', '2', '--asset-url', '', '--fallback-url', 'https://github.com/owner/repo/actions/runs/123'];
  const env = { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'test' };
  delete env.GITHUB_STEP_SUMMARY;
  await exec(process.execPath, args, { env }); await exec(process.execPath, args, { env });
  assert.equal(comments.length, 2);
  assert.ok(comments[0].body.startsWith(old));
  assert.match(comments[0].body, /保留上次/);
  assert.match(comments[1].body, /factory-agent-history-index/);
  assert.match(comments[1].body, /issuecomment-1/);
});

test('maintenance Issues cannot enter either build or comment queues', async () => {
  assert.equal(isManualIssue({ labels: ['factory:manual'] }), true);
  assert.equal(isManualIssue({ labels: [{ name: 'factory:manual' }] }), true);
  assert.equal(isManualIssue({ labels: ['factory:preset'] }), false);
  await coordinate({ getIssue: async () => ({ labels: ['factory:manual'] }) }, 42);
  const prepare = readFileSync(path.resolve(import.meta.dirname, '../prepare-task.mjs'), 'utf8');
  assert.ok(prepare.indexOf('if (isManualIssue(issue))') < prepare.indexOf('if (isPresetIssue(issue))'));
});

test('workflow preserves failed replies, separates artifact roles and always reports publication failure', () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'), 'utf8');
  assert.match(workflow, /name: Collect comment reply diagnostics\n\s+if: always\(\)/);
  assert.match(workflow, /name: Save reply for trusted publisher\n\s+if: always\(\)/);
  assert.match(workflow, /comment-artifacts\/comment-agent.jsonl/);
  assert.match(workflow, /dispatch-reply-history:/);
  const history = readFileSync(path.resolve(import.meta.dirname, '../../workflows/publish-agent-history.yml'), 'utf8');
  assert.equal((history.match(/artifact-ids:/g) || []).length, 4);
  assert.match(history, /Report published or missing history on the task Issue\n\s+if: always\(\)/);
  assert.doesNotMatch(history, /CODE_AGENT_API_KEY|run-agent.mjs|pnpm/);
});
