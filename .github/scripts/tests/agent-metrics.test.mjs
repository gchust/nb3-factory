import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aggregateAgentMetrics, collectAgentMetrics, metricsReceipt, readMetricsReceipts, renderAgentMetrics } from '../agent-metrics.mjs';
import { packHistory } from '../agent-history.mjs';

const source = { repository: 'owner/repo', issue: 42, runId: 100, attempt: 1,
  artifacts: [{ role: 'agent', jobId: 101, invocationExpected: true, state: 'available' },
    { role: 'reply', jobId: 102, invocationExpected: true, state: 'available' }] };
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-metrics-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = [], invocations = [];
  const put = (name, data) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), typeof data === 'string' ? data : JSON.stringify(data));
    files.push({ name });
  };
  put('task/task-metadata.json', { repository: source.repository, issue: { number: 42 },
    preset: { inputHash: 'input', reviewHash: 'review' }, controlSha: 'control', applicationBase: { sha: 'app' } });
  const call = (log, id, options = {}) => {
    const phase = log.startsWith('reply/') ? 'reply' : 'implementation';
    put(`${log}.invocation.json`, { version: 1, id, invoked: true, status: 'finished', phase, context: [], ...options.invocation });
    put(`${log}.prompt.md`, 'test'); put(log, '{}\n');
    if (options.result !== null) put(`${log}.result.json`, { version: 1, engine: 'pi', phase,
      status: 'completed', invalidEvents: 0, startedAt: 1000, endedAt: 1500,
      measurements: [{ usage: { input: 60, output: 30, cacheRead: 10, totalTokens: 100 } }], ...options.result });
    invocations.push({ log, missing: options.result === null ? [`${log}.result.json`] : [] });
  };
  const collect = (s = source) => collectAgentMetrics(root, { source: s, files,
    completeness: { status: 'captured', problems: [], invocations } });
  return { root, call, collect, put, files, invocations };
}
const record = m => ({ body: metricsReceipt(m), user: { login: 'github-actions[bot]' } });

test('implementation and reply remain separate and replay/reused Jobs are counted once', t => {
  const f = fixture(t);
  f.call('agent/agent-implement.jsonl', 'a'); f.call('reply/comment-agent.jsonl', 'b');
  const m = f.collect();
  const sameJobNewAttempt = { ...m, attempt: 2 };
  const sum = aggregateAgentMetrics([m, m, sameJobNewAttempt]);
  assert.equal(sum.jobs, 2);
  assert.equal(sum.phases.implementation.invocations, 1);
  assert.equal(sum.phases.reply.invocations, 1);
  assert.equal(sum.phases.reply.tokens.totalTokens.reported, 100);
  assert.equal(sum.phases.reply.milliseconds.reported, 500);
  assert.equal(sum.phases.reply.tokens.cacheWrite.reported, null);
  assert.equal(sum.phases.reply.tokens.cacheWrite.missing, 1);
  assert.match(renderAgentMetrics([m]), /评论问答/);
  assert.match(renderAgentMetrics([m]), /不是流水线墙钟时间/);
});

test('reply-only phase cannot invent implementation calls or use incomplete zero-cost data', t => {
  const f = fixture(t);
  f.call('reply/comment-agent.jsonl', 'b', { result: { status: 'failed', measurements: [] } });
  const m = f.collect({ ...source, artifacts: [source.artifacts[1]] });
  const sum = aggregateAgentMetrics([m]);
  assert.equal(sum.phases.implementation, undefined);
  assert.equal(sum.phases.reply.tokens.totalTokens.reported, null);
  assert.equal(sum.phases.reply.incompleteUsage, 1);
  assert.equal(sum.phases.reply.completed, 0);
});

test('missing/invalid results stay unknown; richer previous capture survives partial replay', t => {
  const f = fixture(t);
  f.call('agent/agent-implement.jsonl', 'a');
  const full = f.collect();
  f.put('agent/agent-implement.jsonl.result.json', { version: 99, measurements: [{ usage: { totalTokens: 999999 } }] });
  const partial = f.collect();
  assert.equal(partial.jobs[0].phases.implementation.tokens.totalTokens.reported, null);
  assert.equal(aggregateAgentMetrics([full, partial]).phases.implementation.tokens.totalTokens.reported, 100);
  assert.equal(aggregateAgentMetrics([partial, full]).phases.implementation.tokens.totalTokens.reported, 100);
  assert.equal(partial.retention.jobsMissingCapture, 1);
});

test('capture identity deduplicates copied files and a non-invoked setup is not a call', t => {
  const f = fixture(t);
  f.call('agent/agent-implement.jsonl', 'same');
  f.call('agent/agent-repair-1.jsonl', 'same');
  f.call('reply/comment-agent.jsonl', 'setup', { invocation: { invoked: false }, result: null });
  const sum = aggregateAgentMetrics([f.collect()]);
  assert.equal(sum.phases.implementation.invocations, 1);
  assert.equal(sum.phases.reply.notInvoked, 1);
  assert.equal(sum.phases.reply.invocations, 0);
  assert.equal(sum.phases.reply.tokens.totalTokens.reported, null);
});

test('reported zeros remain zeros; total fallback does not double count reasoning', t => {
  const f = fixture(t);
  f.call('agent/agent-implement.jsonl', 'a', { result: {
    measurements: [{ usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } }] } });
  f.call('reply/comment-agent.jsonl', 'b', { result: {
    incomplete: true, measurements: [{ usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, reasoning: 5 } }] } });
  const sum = aggregateAgentMetrics([f.collect()]);
  assert.equal(sum.phases.implementation.tokens.totalTokens.reported, 0);
  assert.equal(sum.phases.reply.tokens.totalTokens.reported, 30);
  assert.equal(sum.phases.reply.incompleteUsage, 1);
});

test('only matching bot receipts with valid counters are counted; unknown baseline not inferred', t => {
  const f = fixture(t); f.call('reply/comment-agent.jsonl', 'b');
  const m = f.collect();
  assert.ok(m.comparison.key);
  const wrongIssue = { ...m, issue: 3 };
  const negative = structuredClone(m); negative.jobs[1].phases.reply.invocations = -1;
  const receipts = readMetricsReceipts([record(m), record(wrongIssue), record(negative),
    { ...record(m), user: { login: 'owner' } }], 'owner/repo', 42);
  assert.equal(receipts.length, 1);
  f.put('task/task-metadata.json', { issue: { number: 42 } });
  assert.equal(f.collect().comparison, null);
});

test('archive contains metrics without exposing raw prompts in inline numeric receipts', t => {
  const f = fixture(t); f.call('reply/comment-agent.jsonl', 'b');
  const packed = packHistory({ artifacts: f.root, output: path.join(f.root, 'out'),
    source, issue: 42, runId: 100, attempt: 1 });
  assert.equal(packed.manifest.metrics.version, 1);
  assert.equal(packed.manifest.metrics.calls.length, 1);
  assert.doesNotMatch(metricsReceipt(packed.manifest.metrics), /\.prompt\.md|command|args|"calls"/);
});


test('automatic module review is retained, classified and counted once beside implementation', t => {
  const f = fixture(t);
  f.call('agent/agent-implement.jsonl', 'implementation');
  f.call('agent/agent-review.jsonl', 'review', { invocation: {phase:'review'}, result:{phase:'review'} });
  const packed = packHistory({ artifacts:f.root,output:path.join(f.root,'archive'),source:{...source,artifacts:[source.artifacts[0]]},issue:42,runId:100,attempt:1 });
  const metrics = packed.manifest.metrics;
  assert.equal(metrics.calls.length, 2);
  assert.equal(aggregateAgentMetrics([metrics,metrics]).phases.review.invocations, 1);
  assert.equal(aggregateAgentMetrics([metrics,metrics]).phases.review.tokens.totalTokens.reported, 100);
  assert.match(renderAgentMetrics([metrics]), /模块评审/);
});
test('older reviewer result can identify its phase but cannot invent a missing capture', t => {
  const f = fixture(t);
  f.call('agent/agent-review.jsonl', 'old-review', {result:{phase:'review'}});
  rmSync(path.join(f.root,'agent/agent-review.jsonl.invocation.json'));
  const packed = packHistory({ artifacts:f.root,output:path.join(f.root,'archive'),source:{...source,artifacts:[source.artifacts[0]]},issue:42,runId:100,attempt:1 });
  assert.equal(packed.manifest.completeness.status, 'partial');
  assert.equal(packed.manifest.metrics.calls[0].phase, 'review');
  assert.equal(packed.manifest.metrics.calls[0].captured, false);
});
