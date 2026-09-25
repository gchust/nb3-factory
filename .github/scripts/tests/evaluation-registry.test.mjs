import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
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
  // A replay within the retention window neither re-uploads nor commits anything.
  assert.deepEqual(index.revisions[0].bundle.locations.map(l => l.runId), [900]);
  assert.equal(client.ref(), refAfterFirst);
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

// A reassessment adopted with its trusted review time (the Actions API time of its review artifact).
function reassess(root, runId, totalTokens, reviewedAt, { records = 1, incomplete = 0 } = {}) {
  const supplement = writeReview(root, 'completed', {}, 'build-review.supplement.json',
    { engine: 'pi', model: 'm', version: '1', runId: String(runId), attempt: 1, controlSha: 'd'.repeat(40), replay: true });
  supplement.supplementalUsage = { input: totalTokens - 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens, records, incomplete,
    runId, attempt: 1, reviewedAt };
  put(root, 'build-review.supplement.json', supplement);
}
const currentOf = (client, key) => {
  const dir = `evaluations/subjects/${keyDigest(key)}`;
  const index = JSON.parse(client.file(`${dir}/index.json`));
  return { index, document: JSON.parse(client.file(`${dir}/r${index.current}/evaluation.json`)) };
};
const selectedReviewer = document => document.reviews.find(review => review.selected).reviewer.runId;
const reviewKeys = document => document.metrics.usage.sources.filter(s => s.key.startsWith('review-run:')).map(s => s.key);

test('an older reassessment exported again, or for the first time after a newer one, never becomes current', async t => {
  for (const order of [['A', 'B', 'A'], ['B', 'A']]) {
    const client = fakeGitHub(), root = temporary(t);
    buildArtifacts(root);
    const report = reportFor(root, usageRecord());
    const original = JSON.parse((await register(t, client, root, report)).bytes);
    const reviews = { A: [700, 11, '2026-09-25T03:00:00Z'], B: [701, 15, '2026-09-25T04:00:00Z'] };
    for (const [index, name] of order.entries()) {
      reassess(root, ...reviews[name]);
      await register(t, client, root, report, { runId: 910 + index });
    }
    const { index, document } = currentOf(client, original.run.key);
    const label = order.join(' → ');
    assert.equal(index.revisions.length, order.length + 1, `${label}: every distinct export is kept as history`);
    assert.equal(selectedReviewer(document), 701, `${label}: the newer review stays current`);
    assert.deepEqual(document.precedence.review, { kind: 'reassessment', at: '2026-09-25T04:00:00Z', runId: 701, attempt: 1 });
    if (order.length === 2) assert.ok(document.reviews.some(r => !r.selected && r.reviewer?.runId === 700), 'the late older review is kept, unselected');
    assert.deepEqual(reviewKeys(document).sort(), ['review-run:700:1', 'review-run:701:1']);
    assert.equal(document.metrics.usage.totals.total, original.metrics.usage.totals.total + 11 + 15);
    assert.deepEqual(document.executions.filter(e => e.kind === 'review').map(e => e.runId), [700, 701], `${label}: reviews in the order they ran`);
    assert.equal(document.metrics.counts.businessBuilds, 1);
  }
});

test('a late older review is counted by the current view even when its screenshots cannot be re-packed', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const original = JSON.parse((await register(t, client, root, report)).bytes);
  reassess(root, 701, 15, '2026-09-25T04:00:00Z');
  await register(t, client, root, report, { runId: 910 });
  rmSync(path.join(root, 'verify-1/browser-acceptance/evidence/b01.png'));
  reassess(root, 700, 11, '2026-09-25T03:00:00Z');
  const refreshed = await register(t, client, root, report, { runId: 911 });
  const { index, document } = currentOf(client, original.run.key);
  assert.equal(index.current, 3);
  assert.equal(selectedReviewer(document), 701, 'the newer review stays selected');
  assert.deepEqual([document.metrics.usage.totals.total, document.metrics.usage.totals.complete], [original.metrics.usage.totals.total + 11 + 15, true]);
  // The screenshot keeps its path and digest but is not attached, and nothing is re-created.
  const shot = document.evidence.find(item => item.origin.kind === 'qa' && item.kind === 'screenshot' && item.path.endsWith('b01.png'));
  assert.deepEqual([shot.attachment, shot.availability, shot.sha256], [null, 'reference-only', original.evidence.find(item => item.id === shot.id).sha256]);
  assert.ok(document.limitations.some(l => l.code === 'evidence-omitted'));
  assert.ok(!JSON.parse(client.file(`evaluations/subjects/${keyDigest(original.run.key)}/r3/manifest.json`)).files.some(f => f.path.endsWith('b01.png')));
  assert.equal(refreshed.registration.reused, false);
});

test('one record per usage source: a completed record is never replaced by an earlier incomplete one', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const original = JSON.parse((await register(t, client, root, report)).bytes);
  const base = original.metrics.usage.totals.total;
  const totals = () => { const { document } = currentOf(client, original.run.key); return [document.metrics.usage.totals.total, document.metrics.usage.totals.complete]; };
  reassess(root, 700, 6, '2026-09-25T03:00:00Z', { records: 1, incomplete: 1 });
  await register(t, client, root, report, { runId: 901 });
  assert.deepEqual(totals(), [base + 6, false]);
  // The same review run collected again, now complete: it replaces the incomplete record, never adds to it.
  reassess(root, 700, 11, '2026-09-25T03:00:00Z', { records: 2 });
  await register(t, client, root, report, { runId: 902 });
  assert.deepEqual(totals(), [base + 11, true]);
  reassess(root, 701, 15, '2026-09-25T04:00:00Z');
  await register(t, client, root, report, { runId: 903 });
  assert.deepEqual(totals(), [base + 11 + 15, true], 'history keeps the completed record, whatever order it is read in');
  // An incomplete record arriving later does not downgrade it either.
  reassess(root, 700, 6, '2026-09-25T03:00:00Z', { records: 1, incomplete: 1 });
  await register(t, client, root, report, { runId: 904 });
  assert.deepEqual(totals(), [base + 11 + 15, true]);
  // Two complete but different records of one review run cannot be reconciled: reported, not guessed.
  reassess(root, 700, 12, '2026-09-25T03:00:00Z', { records: 2 });
  await register(t, client, root, report, { runId: 905 });
  const { document } = currentOf(client, original.run.key);
  assert.equal(document.metrics.usage.totals.complete, false);
  assert.ok(document.limitations.some(l => l.code === 'usage-source-conflict'));
  assert.equal(document.metrics.usage.sources.filter(s => s.key === 'review-run:700:1').length, 1);
  assert.equal(document.metrics.usage.sources.find(s => s.key === 'review-run:700:1').phases.review.total, 11, 'the record registered first is kept');
  // An unresolvable conflict stays reported by later revisions.
  reassess(root, 702, 20, '2026-09-25T05:00:00Z');
  await register(t, client, root, report, { runId: 906 });
  const later = currentOf(client, original.run.key).document;
  assert.equal(selectedReviewer(later), 702);
  assert.deepEqual([later.metrics.usage.totals.complete, later.limitations.some(l => l.code === 'usage-source-conflict')], [false, true]);
});

test('a review-history gap stays incomplete across re-exports and new reviews until the revision is readable again', async t => {
  const client = fakeGitHub(), root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const original = JSON.parse((await register(t, client, root, report)).bytes);
  reassess(root, 700, 11, '2026-09-25T03:00:00Z');
  const a = JSON.parse((await register(t, client, root, report, { runId: 901 })).bytes);
  const stored = client.file(`evaluations/subjects/${keyDigest(original.run.key)}/r${a.revision}/evaluation.json`);
  stored.fill(0x20, 0, 1);
  const gap = document => [document.metrics.usage.totals.complete, document.limitations.some(l => l.code === 'usage-history-unavailable')];
  reassess(root, 701, 15, '2026-09-25T04:00:00Z');
  const b = JSON.parse((await register(t, client, root, report, { runId: 902 })).bytes);
  assert.deepEqual(gap(b), [false, true]);
  // The same material again: the gap is still there, so it may not turn complete.
  const again = await register(t, client, root, report, { runId: 903 });
  assert.equal(again.registration.reused, true);
  assert.deepEqual(gap(JSON.parse(again.bytes)), [false, true]);
  reassess(root, 702, 20, '2026-09-25T05:00:00Z');
  const c = JSON.parse((await register(t, client, root, report, { runId: 904 })).bytes);
  assert.deepEqual(gap(c), [false, true], 'a later review does not close an earlier gap');
  assert.deepEqual(reviewKeys(c).sort(), ['review-run:701:1', 'review-run:702:1']);
  // Once the revision is readable again its review is verified and carried; only then complete.
  stored.fill(0x7b, 0, 1);
  const restored = JSON.parse((await register(t, client, root, report, { runId: 905 })).bytes);
  assert.deepEqual(gap(restored), [true, false]);
  assert.deepEqual(reviewKeys(restored).sort(), ['review-run:700:1', 'review-run:701:1', 'review-run:702:1']);
  assert.equal(restored.metrics.usage.totals.total, original.metrics.usage.totals.total + 11 + 15 + 20);
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
