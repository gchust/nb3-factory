import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commitPrepared, exportDraft, prepareRevision } from '../evaluation-archive.mjs';
import { keyDigest } from '../evaluation-identity.mjs';
import { commitRevision, readBytes, readOutbox, recordDeliveries } from '../evaluation-registry.mjs';
import { buildArtifacts, digest, fakeGitHub, put, reportFor, temporary, usageRecord, writeReview } from './evaluation-fixtures.mjs';

const exporter = { controlSha: 'e'.repeat(40), runId: 900, attempt: 1 };
const disabled = { FACTORY_EVALUATION_DELIVERY: 'false' };
const enabled = { FACTORY_EVALUATION_DELIVERY: 'true', EVALUATION_ENDPOINT: 'https://receiver.example/api/evaluations/import' };

async function register(t, client, root, report, { env = disabled, runId = 900, html = null } = {}) {
  const exported = temporary(t), prepared = temporary(t);
  exportDraft({ report, artifacts: root, task: null, html, output: exported, exporter: { ...exporter, runId } });
  const registration = await prepareRevision(client, { input: exported, output: prepared });
  const committed = await commitPrepared(client, { input: prepared, env, runId, attempt: 1, artifactId: registration.upload ? runId + 1 : null });
  return { registration, committed, bytes: readFileSync(path.join(prepared, 'evaluation.json')), prepared };
}

test('identical facts reuse the revision and its original bytes; new facts append without rewriting history', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const first = await register(t, client, root, report);
  assert.equal(first.registration.revision, 1);
  assert.equal(first.registration.reused, false);
  const key = JSON.parse(first.bytes).run.key;
  const dir = `evaluations/subjects/${keyDigest(key)}`;
  assert.deepEqual(client.file(`${dir}/r1/evaluation.json`), first.bytes);
  const refAfterFirst = client.ref();
  // Replay after a delay (different reporter run, same facts): same revision, same createdAt and bytes.
  await new Promise(resolve => setTimeout(resolve, 15));
  const replay = await register(t, client, root, report, { runId: 901 });
  assert.equal(replay.registration.reused, true);
  assert.equal(replay.registration.revision, 1);
  assert.deepEqual(replay.bytes, first.bytes);
  assert.equal(replay.registration.bundleSha256, first.registration.bundleSha256);
  const index = JSON.parse(client.file(`${dir}/index.json`));
  assert.equal(index.revisions.length, 1);
  assert.deepEqual(index.revisions[0].bundle.locations.map(l => l.runId), [900, 901]); // re-packed identical bytes add a retained copy
  assert.notEqual(client.ref(), refAfterFirst);
  // A reassessment is new content: revision 2; revision 1 keeps its exact bytes.
  const supplement = writeReview(root, 'completed', {}, 'build-review.supplement.json',
    { engine: 'pi', model: 'm', version: '1', runId: '700', attempt: 1, controlSha: 'd'.repeat(40), replay: true });
  supplement.supplementalUsage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 2, records: 1, incomplete: 0, runId: 700, attempt: 1 };
  put(root, 'build-review.supplement.json', supplement);
  const reassessed = await register(t, client, root, report, { runId: 902 });
  assert.equal(reassessed.registration.revision, 2);
  assert.deepEqual(client.file(`${dir}/r1/evaluation.json`), first.bytes);
  const document = JSON.parse(reassessed.bytes);
  assert.equal(document.metrics.counts.businessBuilds, 1);
  assert.ok(document.executions.some(e => e.kind === 'review' && e.runId === 700));
  assert.equal(JSON.parse(client.file(`${dir}/index.json`)).current, 2);
});

test('a late, older producer report is kept as history but never becomes the current view', async t => {
  const client = fakeGitHub(), first = temporary(t), second = temporary(t);
  buildArtifacts(first, { runId: 100, rounds: [], chainVerifications: 0, outcome: 'handoff', review: 'none' });
  const early = reportFor(first, usageRecord({ runId: 100, status: 'handoff', start: 1_000_000 }));
  buildArtifacts(second, { runId: 200, rounds: [{ round: 2, scope: 'full', statuses: ['passed', 'passed'] }], chainVerifications: 2 });
  const late = reportFor(second, usageRecord({ runId: 200, start: 2_000_000, event: 'repository_dispatch', previousRunId: 100 }), [early.record]);
  const newer = await register(t, client, second, late);
  const delayed = await register(t, client, first, { ...early, records: [early.record, late.record] });
  assert.equal(newer.registration.revision, 1);
  assert.equal(delayed.registration.revision, 2);
  const stale = JSON.parse(delayed.bytes);
  assert.equal(stale.precedence.knownLaterExecutions, 1);
  assert.ok(stale.limitations.some(l => l.code === 'later-executions'));
  const index = JSON.parse(client.file(`evaluations/subjects/${keyDigest(stale.run.key)}/index.json`));
  assert.equal(index.current, 1, 'the largest revision is only archive order');
});

test('racing reporters retry under CAS and can never store different content under one revision number', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const exported = temporary(t), a = temporary(t), b = temporary(t);
  exportDraft({ report: reportFor(root, usageRecord()), artifacts: root, html: null, output: exported, exporter });
  await prepareRevision(client, { input: exported, output: a });
  // A second reporter prepared different content against the same empty registry.
  const other = temporary(t), otherExport = temporary(t);
  buildArtifacts(other, { rounds: [{ round: 1, scope: 'full', statuses: ['failed', 'failed'] }], outcome: 'failed' });
  exportDraft({ report: reportFor(other, usageRecord({ status: 'failure' })), artifacts: other, html: null, output: otherExport, exporter });
  await prepareRevision(client, { input: otherExport, output: b });
  client.injectConflicts(2);
  await commitPrepared(client, { input: a, env: disabled, runId: 900, attempt: 1, artifactId: 1 });
  await assert.rejects(commitPrepared(client, { input: b, env: disabled, runId: 901, attempt: 1, artifactId: 2 }), /already holds different content/);
  // Rerunning the loser re-plans: it receives the next revision instead of overwriting.
  const retry = temporary(t);
  assert.equal((await prepareRevision(client, { input: otherExport, output: retry })).revision, 2);
});

test('large documents are stored as exact blobs, and delivery is queued only when explicitly enabled', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const off = await register(t, client, root, report);
  assert.equal(off.committed.queued, false);
  assert.equal((await readOutbox(client)).outbox.entries.length, 0);
  const on = await register(t, client, root, report, { env: enabled, runId: 905 });
  assert.equal(on.committed.queued, true);
  const { outbox } = await readOutbox(client);
  assert.equal(outbox.entries.length, 1);
  assert.equal(outbox.entries[0].state, 'pending');
  assert.equal(outbox.entries[0].bundleSha256, off.registration.bundleSha256);
  assert.ok(!JSON.stringify(outbox).includes('receiver.example'), 'only a target hash is archived');
  const invalid = await register(t, client, root, report, { env: { ...enabled, EVALUATION_ENDPOINT: 'http://receiver.example/x?token=1' }, runId: 906 });
  assert.equal(invalid.committed.queued, false);
  assert.match(invalid.committed.warning, /https/);
  const big = Buffer.from('x'.repeat(1_200_000));
  const document = JSON.parse(off.bytes);
  document.run.key = 'owner/factory/issues/1/initial';
  await commitRevision(client, { document, evaluationBytes: big, manifestBytes: Buffer.from('{}'), fingerprint: 'f'.repeat(64),
    bundle: { sha256: 'a'.repeat(64), size: 1 }, location: null });
  const file = `evaluations/subjects/${keyDigest(document.run.key)}/r1/evaluation.json`;
  assert.deepEqual(await readBytes(client, file, 'gh-pages'), big, 'the contents API omits >1 MiB; the blob API returns the exact bytes');
});

test('delivery receipts update the outbox under CAS and a stored receipt is final', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const { registration } = await register(t, client, root, reportFor(root, usageRecord()), { env: enabled });
  const [entry] = (await readOutbox(client)).outbox.entries;
  const base = { id: entry.id, targetId: entry.targetId, type: entry.type, key: entry.key, revision: entry.revision, bundleSha256: registration.bundleSha256 };
  await recordDeliveries(client, [{ ...base, state: 'pending', attempts: [{ outcome: 'retryable', httpStatus: 503 }], receipt: null, reason: 'http-503' }]);
  await recordDeliveries(client, [{ ...base, state: 'stored', attempts: [{ outcome: 'stored', httpStatus: 201 }], receipt: { receiptId: 'r1', state: 'stored', httpStatus: 201 } }]);
  client.injectConflicts(1);
  await recordDeliveries(client, [{ ...base, state: 'pending', attempts: [{ outcome: 'retryable', httpStatus: 502 }], receipt: null }]);
  const [after] = (await readOutbox(client)).outbox.entries;
  assert.equal(after.state, 'stored');
  assert.equal(after.attempts, 2);
  assert.equal(after.receipt.receiptId, 'r1');
  await assert.rejects(recordDeliveries(client, [{ ...base, id: `${entry.id}x`, state: 'pending', attempts: [] }]), /identity/);
  await assert.rejects(recordDeliveries(client, [{ ...base, state: 'rejected', bundleSha256: digest('other'), attempts: [] }]), /differs/);
});

test('a run that failed before its Agent artifact still exports metadata and receipts, without inventing QA', async t => {
  const client = fakeGitHub(), task = temporary(t), full = temporary(t);
  buildArtifacts(full, { review: 'none' });
  put(task, 'task-metadata.json', JSON.parse(readFileSync(path.join(full, 'task-metadata.json'))));
  const record = usageRecord({ status: 'failure', agentJobId: null, records: 0 });
  record.jobs = [{ id: 1, name: 'prepare', seconds: 20 }];
  const exported = temporary(t), prepared = temporary(t);
  exportDraft({ report: { record, records: [record] }, artifacts: path.join(task, 'absent'), task, html: null, output: exported, exporter });
  const registration = await prepareRevision(client, { input: exported, output: prepared });
  const document = JSON.parse(readFileSync(path.join(prepared, 'evaluation.json')));
  assert.equal(registration.revision, 1);
  assert.equal(document.run.identity, 'recorded');
  assert.deepEqual([document.outcome.execution, document.outcome.acceptance, document.outcome.delivery], ['completed', 'unknown', 'not-published']);
  assert.equal(document.qa.coverage, 'none');
  assert.equal(document.reviews[0].state, 'not-reviewed');
  assert.equal(document.metrics.usage.totals.total, null, 'no Agent job: usage stays unknown instead of zero');
});
