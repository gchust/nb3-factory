import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureReviewHistory, historyFingerprint, historyLimits, preserveReviewHistory } from '../review-history.mjs';

const put = (root, name, value) => {
  const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) chmodSync(file, 0o600);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file;
};
const metadata = (id = 101, extra = {}) => ({ repository: 'owner/factory', issue: { number: 7 },
  controlSha: 'a'.repeat(40), run: { id, attempt: 1 },
  task: { requirements: 'Manage files', acceptanceCriteria: 'A cannot read B files', targetBranch: 'develop' }, ...extra });
function fixture(t, value = metadata()) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'review-history-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, 'task-metadata.json', value); return root;
}
function invocation(root, log = 'agent-implement.jsonl', options = {}) {
  put(root, log, `${JSON.stringify({ type: 'tool_result', content: 'Original failed attempt' })}\n`);
  put(root, `${log}.prompt.md`, 'Original user requirement, not a generated summary.\n');
  put(root, `${log}.invocation.json`, { version: 1, invoked: true, status: 'finished', ...options });
  put(root, `${log}.result.json`, { status: 'completed', measurements: [] });
}
function capture(root, redact) {
  const output = path.join(root, 'snapshot');
  const result = captureReviewHistory(root, output, redact);
  return { ...result, output, index: JSON.parse(readFileSync(path.join(output, result.input.path), 'utf8')) };
}
function content(result, source) {
  return result.index.files.find(item => item.source === source)?.chunks
    .map(chunk => readFileSync(path.join(result.output, chunk.path), 'utf8')).join('') ?? '';
}

test('captures original prompts, tools, implementation, repair and both QA scopes without a summary', t => {
  const root = fixture(t);
  for (const log of ['agent-implement.jsonl', 'agent-repair-1.jsonl',
    'verify-1/browser-acceptance/agent-browser-acceptance.jsonl',
    'verify-2/browser-focused/agent-browser-report-repair-1.jsonl']) invocation(root, log);
  put(root, 'agent-review.jsonl', 'Do not evaluate previous reviewer opinions');
  put(root, 'comment-agent.jsonl', 'Unrelated discussion');
  put(root, 'config.yml', 'Never capture arbitrary files');
  const result = capture(root);
  assert.equal(result.input.invocations, 4);
  assert.equal(result.input.coverage, 'available');
  assert.match(content(result, 'agent-implement.jsonl'), /Original failed attempt/);
  assert.match(content(result, 'agent-implement.jsonl.prompt.md'), /Original user requirement/);
  assert.ok(result.index.files.every(entry => !/agent-review|comment-agent|config.yml/.test(entry.source)));
  assert.ok(!existsSync(path.join(root, 'retro.json')));
  for (const file of result.files) {
    const data = readFileSync(path.join(result.output, file.path));
    assert.equal(file.sha256, createHash('sha256').update(data).digest('hex'));
    assert.equal(file.lines, data.toString('utf8').split('\n').length);
  }
});

test('reuses structural and known-secret redaction before creating any reviewer file', t => {
  const root = fixture(t); invocation(root);
  const secret = 'private-"quoted"-credential';
  put(root, 'agent-implement.jsonl', `${JSON.stringify({ type: 'tool_result', api_key: 'must-not-leak',
    content: `Secret ${secret}; Factory-QA-abc-123`, nested: { password: 'another-secret' } })}\n`);
  put(root, 'agent-implement.jsonl.prompt.md', `Actual prompt ${secret}\nPASSWORD=not-public\n`);
  const before = historyFingerprint(root);
  const result = capture(root, text => text.replaceAll(secret, '[REDACTED]'));
  const all = result.files.map(file => readFileSync(path.join(result.output, file.path), 'utf8')).join('\n');
  for (const value of ['private-', 'must-not-leak', 'Factory-QA-abc-123', 'another-secret', 'not-public']) assert.ok(!all.includes(value), value);
  assert.equal(JSON.parse(content(result, 'agent-implement.jsonl')).nested.password, '[REDACTED]');
  assert.equal(historyFingerprint(root), before, 'capture never rewrites original logs');
});

test('large logs are split at line boundaries, with a reconstructable redacted source range', t => {
  const root = fixture(t); invocation(root);
  const text = [1, 2, 3].map(n => JSON.stringify({ n, content: 'x'.repeat(600_000) })).join('\n') + '\n';
  put(root, 'agent-implement.jsonl', text);
  const result = capture(root), entry = result.index.files.find(item => item.source === 'agent-implement.jsonl');
  assert.equal(entry.chunks.length, 3);
  assert.deepEqual(entry.chunks.map(chunk => chunk.redactedLines), [[1, 1], [2, 2], [3, 3]]);
  assert.equal(content(result, entry.source), text);
  assert.ok(entry.chunks.every(chunk => Buffer.byteLength(readFileSync(path.join(result.output, chunk.path))) <= historyLimits.chunkBytes));
});

test('oversized individual events are explicitly omitted, never truncated into fake tool output', t => {
  const root = fixture(t); invocation(root);
  put(root, 'agent-implement.jsonl', `${JSON.stringify({ content: 'x'.repeat(historyLimits.chunkBytes) })}\n{"content":"kept"}\n`);
  const result = capture(root), entry = result.index.files.find(item => item.source === 'agent-implement.jsonl');
  assert.equal(result.input.coverage, 'partial');
  assert.match(entry.omitted[0], /line-too-large/);
  assert.equal(content(result, entry.source), '{"content":"kept"}\n');
  assert.deepEqual(entry.chunks[0].redactedLines, [2, 2]);
});

test('oversized files and missing sidecars do not masquerade as complete history', t => {
  const root = fixture(t);
  const file = put(root, 'agent-implement.jsonl', ''); truncateSync(file, historyLimits.fileBytes + 1);
  const result = capture(root);
  assert.equal(result.input.coverage, 'partial');
  assert.ok(result.input.limitations.some(reason => reason.includes('超限')));
  assert.ok(result.index.invocations[0].missing.includes('agent-implement.jsonl.prompt.md'));
  assert.equal(content(result, 'agent-implement.jsonl'), '');
});

test('a setup failure records a non-invocation without requiring fabricated CLI output', t => {
  const root = fixture(t); invocation(root, 'agent-implement.jsonl', { invoked: false, status: 'failed' });
  rmSync(path.join(root, 'agent-implement.jsonl')); rmSync(path.join(root, 'agent-implement.jsonl.result.json'));
  const result = capture(root);
  assert.equal(result.input.coverage, 'available');
  assert.deepEqual(result.index.invocations[0].missing, []);
});

test('missing history remains unavailable, not evidence of an easy first attempt', t => {
  const result = capture(fixture(t));
  assert.equal(result.input.coverage, 'unavailable');
  assert.equal(result.input.invocations, 0);
  assert.ok(result.input.limitations.length);
});

test('history fingerprint changes for original evidence but ignores the reviewer and mutable timing', t => {
  const root = fixture(t); invocation(root);
  const before = historyFingerprint(root);
  put(root, 'agent-review.jsonl', 'new reviewer output'); put(root, 'timings.jsonl', 'new timings');
  assert.equal(historyFingerprint(root), before);
  put(root, 'agent-implement.jsonl.prompt.md', 'Changed original prompt');
  assert.notEqual(historyFingerprint(root), before);
});

test('Handoff preserves same-task original history separately and carries ancestors forward', t => {
  const first = fixture(t), second = fixture(t, metadata(102)), third = fixture(t, metadata(103));
  invocation(first); put(first, 'verify-1/browser-acceptance/report.json', { passed: false });
  preserveReviewHistory(first, second, metadata(102));
  invocation(second, 'agent-repair-1.jsonl');
  preserveReviewHistory(second, third, metadata(103));
  invocation(third, 'agent-repair-2.jsonl');
  const result = capture(third);
  assert.equal(result.input.invocations, 3);
  assert.equal(result.input.coverage, 'available');
  assert.deepEqual(result.index.invocations.map(item => item.runId).sort(), [101, 102, 103]);
  assert.match(content(result, 'review-history/run-101-attempt-1/agent-implement.jsonl'), /Original failed attempt/);
  assert.equal(existsSync(path.join(third, 'agent-implement.jsonl')), false);
  assert.equal(existsSync(path.join(third, 'verify-1')), false, 'past QA never becomes a current verdict');
});

test('another Issue, changed business task, or different control plane is not imported', t => {
  for (const extra of [{ issue: { number: 8 } }, { task: { requirements: 'Other build' } }, { controlSha: 'b'.repeat(40) }]) {
    const first = fixture(t), second = fixture(t, metadata(102, extra)); invocation(first);
    preserveReviewHistory(first, second, metadata(102, extra));
    const result = capture(second);
    assert.equal(result.input.invocations, 0);
    assert.ok(result.input.limitations.some(reason => reason.includes('上一轮历史')));
  }
});

test('tampered ancestor logs are not admitted as historical evidence', t => {
  const first = fixture(t), second = fixture(t, metadata(102)); invocation(first);
  preserveReviewHistory(first, second, metadata(102));
  const original = historyFingerprint(second);
  put(second, 'review-history/run-101-attempt-1/agent-implement.jsonl', 'fabricated history');
  const result = capture(second);
  assert.notEqual(result.fingerprint, original);
  assert.equal(content(result, 'review-history/run-101-attempt-1/agent-implement.jsonl'), '');
  assert.equal(result.input.coverage, 'partial');
});

test('file and directory symlinks cannot pull unrelated credentials into review', t => {
  const root = fixture(t), outside = fixture(t); invocation(outside);
  symlinkSync(path.join(outside, 'agent-implement.jsonl'), path.join(root, 'agent-implement.jsonl'));
  symlinkSync(outside, path.join(root, 'verify-1'));
  const result = capture(root);
  assert.equal(result.input.invocations, 0);
  assert.ok(result.input.limitations.some(reason => reason.includes('链接')));
  assert.ok(!result.files.some(file => file.source));
});

test('invalid ancestor manifests cannot escape their frozen source', t => {
  const first = fixture(t), second = fixture(t, metadata(102)); invocation(first);
  preserveReviewHistory(first, second, metadata(102));
  const file = 'review-history/run-101-attempt-1/source.json';
  const manifest = JSON.parse(readFileSync(path.join(second, file), 'utf8'));
  manifest.files[0].path = '../../task-metadata.json'; put(second, file, manifest);
  const result = capture(second);
  assert.equal(result.input.invocations, 0);
  assert.ok(result.input.limitations.some(reason => reason.includes('清单无法验证')));
});

// These are the production checkpoint / publication functions, not mock gates.
const { initialize, inputHash, restoreState, saveState } = await import('../pipeline-state.mjs');
const { collectReviewProcess, resolveReviewIdentity } = await import('../build-review.mjs');

test('validated checkpoint restoration also preserves history without restoring old QA as current QA', t => {
  const first = fixture(t), second = fixture(t, metadata(102)); invocation(first);
  put(first, 'agent.patch', 'sealed-patch');
  const file = path.join(first, 'pipeline-state.json');
  const state = initialize(file, metadata());
  state.patchHash = createHash('sha256').update('sealed-patch').digest('hex');
  state.verificationAttempts = 2; state.repairAttempts = 1; saveState(file, state);
  put(first, 'verify-1/browser-acceptance/report.json', { passed: false, checks: [] });
  const restored = restoreState(first, second, metadata(102));
  assert.equal(restored.inputHash, inputHash(metadata(102)));
  assert.equal(restored.verificationAttempts, 2);
  assert.equal(restored.repairAttempts, 1);
  assert.equal(capture(second).input.invocations, 1);
  assert.deepEqual(collectReviewProcess(second).rounds, []);
});

test('invalid checkpoint rejects restoration before copying any ancestor evidence', t => {
  const first = fixture(t), second = fixture(t, metadata(102)); invocation(first);
  put(first, 'agent.patch', 'changed');
  const state = initialize(path.join(first, 'pipeline-state.json'), metadata());
  state.patchHash = '0'.repeat(64); saveState(path.join(first, 'pipeline-state.json'), state);
  assert.throws(() => restoreState(first, second, metadata(102)), /patch hash/);
  assert.equal(existsSync(path.join(second, 'review-history')), false);
});

test('publication and supplement identity validation bind new raw history but keep legacy reports readable', t => {
  const root = fixture(t); invocation(root);
  const report = { basis: { historyHash: historyFingerprint(root) } };
  assert.doesNotThrow(() => resolveReviewIdentity(root, report));
  put(root, 'agent-implement.jsonl', 'modified original tools');
  assert.throws(() => resolveReviewIdentity(root, report), /history fingerprint mismatch/);
  assert.doesNotThrow(() => resolveReviewIdentity(root, { basis: {} }));
});
