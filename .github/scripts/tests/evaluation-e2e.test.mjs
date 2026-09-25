// Model-free end-to-end acceptance: frozen plan → simulated samples → fixture
// artifacts and existing review fixtures → registered bundles → local receiver
// → receipts and replay → batch manifest, sample identities and revisions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commitPrepared, exportDraft, prepareRevision } from '../evaluation-archive.mjs';
import { activeBatches, advanceBatch, batchDocument, startBatch, validatePlans } from '../evaluation-batch.mjs';
import { writeZip } from '../evaluation-bundle.mjs';
import { deliverBundle, deliveryConfig } from '../evaluation-delivery.mjs';
import { readSubject } from '../evaluation-registry.mjs';
import { resolveSample, SAMPLE_LABEL } from '../evaluation-sample.mjs';
import { buildArtifacts, fakeRepository, put, reportFor, startReceiver, temporary, usageRecord, writeReview } from './evaluation-fixtures.mjs';

const control = 'c'.repeat(40);
const plans = validatePlans({ schemaVersion: 1, plans: [{ key: 'repeat', enabled: false, schedule: null, baselineRef: 'develop',
  cases: [{ key: 'F00', presetIssueNumber: 176, samples: 5 }], execution: { maxConcurrentSamples: 1, maxRepairAttempts: 2, maxActiveSecondsPerSample: 3600, maxContinuations: 3 },
  reviewMode: 'full' }] }, { defaultBranch: 'develop' });

test('5 samples, one with two handoffs, a report resent 3 times and one reassessment stay 5 business samples', async t => {
  const client = fakeRepository();
  let now = Date.parse('2026-09-25T02:00:00Z');
  const tick = () => (now += 3_600_000);
  const started = await startBatch(client, { plans, planKey: 'repeat', trigger: 'manual', now, runId: 1, controlSha: control, env: {} });
  let batch = await advanceBatch(client, started.batch, { now });
  const registered = new Map();
  let runId = 1000, artifactId = 50_000;

  // Export → register → keep the bundle as an artifact, exactly as the reporter jobs do.
  async function report(sample, root, record, prior) {
    const exported = temporary(t), prepared = temporary(t), task = temporary(t);
    // The prepare job's own task artifact, which the Agent cannot modify.
    put(task, 'task-metadata.json', JSON.parse(readFileSync(path.join(root, 'task-metadata.json'))));
    const built = reportFor(root, record, prior);
    exportDraft({ report: built, artifacts: root, task, html: null, output: exported, exporter: { controlSha: control, runId: 9000 + record.runId, attempt: 1 } });
    const registration = await prepareRevision(client, { input: exported, output: prepared });
    const id = artifactId++;
    if (registration.upload) client.pages.addArtifact({ id, name: registration.artifactName, runId: 9000 + record.runId,
      files: writeZip([{ path: 'evaluation-bundle.zip', data: readFileSync(path.join(prepared, 'evaluation-bundle.zip')) }]) });
    await commitPrepared(client, { input: prepared, env: {}, runId: 9000 + record.runId, attempt: 1, artifactId: id });
    const document = JSON.parse(readFileSync(path.join(prepared, 'evaluation.json')));
    registered.set(sample, { document, root, record: built.record, registration, zip: registration.upload ? readFileSync(path.join(prepared, 'evaluation-bundle.zip')) : null });
    return built.record;
  }

  for (let index = 1; index <= 5; index++) {
    const issue = client.samples().at(-1);
    const { receipt } = await resolveSample(client, issue.number);
    assert.equal(receipt.sampleIndex, index, 'samples are created strictly one after another');
    const sample = { batchKey: receipt.batchKey, caseKey: 'F00', sampleIndex: index };
    const records = [];
    const executions = index === 2 ? ['handoff', 'handoff', 'delivered'] : ['delivered'];
    let previous = null;
    for (const [step, status] of executions.entries()) {
      const id = ++runId;
      client.run(issue.number, { id, delivered: status === 'delivered', handoff: status === 'handoff', previous: previous ?? 0 });
      const root = temporary(t);
      const final = status === 'delivered';
      buildArtifacts(root, { issue: issue.number, runId: id, sample, rounds: final ? [{ round: step + 1, scope: 'full', statuses: ['passed', 'passed'] }] : [],
        chainVerifications: final ? step + 1 : 0, outcome: final ? 'passed' : 'handoff', review: final ? 'completed' : 'none' });
      const record = usageRecord({ issue: issue.number, runId: id, status, start: now + step * 1000, event: previous ? 'repository_dispatch' : 'workflow_dispatch', previousRunId: previous });
      records.push(await report(index, root, record, records));
      previous = id;
      batch = await advanceBatch(client, (await activeBatches(client))[0], { now: tick() });
      if (!final) assert.equal(client.samples().length, index, 'a handoff keeps the serial slot');
    }
  }
  // The last sample ended and every report is registered; the coordinator stays open
  // until the final batch snapshot is archived through the same registration path.
  assert.equal(batch.state.state, 'completed');
  const batchExport = temporary(t), batchBundle = temporary(t);
  put(batchExport, 'draft.json', batchDocument(batch));
  put(batchExport, 'files.json', []);
  await prepareRevision(client, { input: batchExport, output: batchBundle });
  await commitPrepared(client, { input: batchBundle, env: {}, runId: 9999, attempt: 1, artifactId: 1 });
  batch = await advanceBatch(client, (await activeBatches(client))[0], { now: tick() });
  assert.equal(batch.coordinator.state, 'closed');
  assert.deepEqual(await activeBatches(client), []);
  const summary = batchDocument(batch);
  assert.equal(summary.summary.planned, 5);
  assert.equal(summary.summary.byState.passed, 5);
  assert.equal(summary.summary.reports.available, 5);
  assert.equal(client.samples().length, 5);

  // Five business samples: five run keys; the two handoffs are executions of sample 2.
  const documents = [...registered.values()].map(item => item.document);
  assert.equal(new Set(documents.map(d => d.run.key)).size, 5);
  assert.equal(documents.reduce((n, d) => n + d.metrics.counts.businessBuilds, 0), 5);
  assert.deepEqual(registered.get(2).document.executions.map(e => e.kind), ['implementation', 'continuation', 'continuation']);
  assert.equal(registered.get(2).document.qa.firstFull.status, 'unknown');

  // Resend one report three times: same bytes, one stored record, no new revision or model usage.
  const receiver = await startReceiver(t, { faults: ['drop-after-store'] });
  const config = deliveryConfig({ EVALUATION_ENDPOINT: receiver.url, EVALUATION_TOKEN: receiver.token }, { allowInsecureLoopback: true });
  const one = registered.get(1);
  const subject = { type: 'evaluation-report', key: one.document.run.key, revision: one.document.revision, sourceInstance: one.document.source.instance };
  const receipts = [];
  for (let i = 0; i < 3; i++) receipts.push(await deliverBundle({ zip: one.zip, subject, config, pause: () => Promise.resolve() }));
  assert.ok(receipts.every(r => r.state === 'stored' && r.receipt.receiptId === receipts[0].receipt.receiptId));
  assert.equal(receiver.stored.size, 1);
  assert.equal((await readSubject(client, 'evaluation-report', one.document.run.key, 'gh-pages')).revisions.length, 1);

  // Reassess sample 3 once: new revision and one independent review usage source, still one business build.
  const three = registered.get(3);
  const supplement = writeReview(three.root, 'completed', { issue: three.record.issue, runId: three.record.runId }, 'build-review.supplement.json',
    { engine: 'pi', model: 'fixture-model', version: '0.86.1', runId: '777', attempt: 1, controlSha: control, replay: true });
  supplement.supplementalUsage = { input: 40, output: 4, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 44, records: 1, incomplete: 0, runId: 777, attempt: 1 };
  put(three.root, 'build-review.supplement.json', supplement);
  await report(3, three.root, three.record, []);
  const reassessed = registered.get(3).document;
  assert.equal(reassessed.revision, 2);
  assert.equal(reassessed.metrics.counts.businessBuilds, 1);
  assert.equal(reassessed.metrics.usage.sources.filter(s => s.key.startsWith('review-run:')).length, 1);
  assert.equal(reassessed.executions.filter(e => e.kind === 'review').length, 1);
  assert.equal((await readSubject(client, 'evaluation-report', reassessed.run.key, 'gh-pages')).revisions.length, 2);

  // Similar findings from independent samples remain two occurrences with their own sources.
  const occurrences = documents.filter(d => d.run.key !== reassessed.run.key).slice(0, 2)
    .map(d => ({ run: d.run.key, finding: d.reviews[0].findings.find(f => f.localId === 'F1') }));
  assert.equal(occurrences.length, 2);
  assert.notEqual(occurrences[0].run, occurrences[1].run);
  assert.equal(occurrences[0].finding.title, occurrences[1].finding.title);
  assert.notEqual(`${occurrences[0].run}#${occurrences[0].finding.id}`, `${occurrences[1].run}#${occurrences[1].finding.id}`);
  assert.equal(client.samples().filter(issue => issue.labels.some(l => (l.name ?? l) === SAMPLE_LABEL)).length, 5);
});
