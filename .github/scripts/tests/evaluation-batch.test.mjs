import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { activeBatches, advanceBatch, batchDocument, cancelBatch, PLAN_LIMITS, startBatch, validatePlans } from '../evaluation-batch.mjs';
import { commitRevision } from '../evaluation-registry.mjs';
import { claimSample, markers, readManifest, resolveSample, SAMPLE_LABEL, verifyAncestor } from '../evaluation-sample.mjs';
import { readSnapshot } from '../issue-presets.mjs';
import { loadContract, validateSchema } from '../json-schema.mjs';
import { control, fakeRepository, human, lock, names, presetBody, repository } from './evaluation-fixtures.mjs';

const bot = { login: 'github-actions[bot]', type: 'Bot' };

const plansFile = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../evaluations/plans.json'), 'utf8'));
const plan = (samples = 3, extra = {}) => validatePlans({ schemaVersion: 1, plans: [{ key: 'smoke', enabled: true, schedule: 'daily', baselineRef: 'develop',
  cases: [{ key: 'F00', presetIssueNumber: 176, samples }], execution: { maxConcurrentSamples: 1, maxRepairAttempts: 2, maxActiveSecondsPerSample: 3600, maxContinuations: 2 },
  reviewMode: 'inherit', ...extra }] }, { defaultBranch: 'develop' });
async function start(client, plans = plan(), now = Date.parse('2026-09-25T02:00:00Z'), trigger = 'manual') {
  const result = await startBatch(client, { plans, planKey: 'smoke', trigger, now, runId: 4242, controlSha: control, env: { GITHUB_SHA: 'e'.repeat(40) } });
  if (result.batch) await advanceBatch(client, result.batch, { now });
  return result;
}
const current = async client => (await activeBatches(client))[0];

test('plans are bounded, schema-checked and v1 serial; the checked-in plans are valid', () => {
  const plans = validatePlans(plansFile, { defaultBranch: 'develop' });
  assert.deepEqual(plans.map(p => [p.key, p.enabled, p.cases[0].presetIssueNumber]), [['nb3-daily-smoke', false, 176], ['nb3-customer-memo', false, 155]]);
  const base = structuredClone(plansFile.plans[0]);
  const bad = mutate => { const item = structuredClone(base); mutate(item); return () => validatePlans({ schemaVersion: 1, plans: [item] }, { defaultBranch: 'develop' }); };
  assert.throws(bad(p => { p.execution.maxConcurrentSamples = 2; }), /one complete sample/);
  assert.throws(bad(p => { p.cases[0].samples = 11; }), /1–10 samples/);
  assert.throws(bad(p => { p.cases = Array.from({ length: 3 }, (_, i) => ({ key: `C${i}`, presetIssueNumber: 1 + i, samples: 8 })); }), /at most 20/);
  assert.throws(bad(p => { p.execution.maxActiveSecondsPerSample = 999_999; }), /600–86400/);
  assert.throws(bad(p => { p.execution.maxRepairAttempts = 50; }), /0–10/);
  assert.throws(bad(p => { p.baselineRef = 'feature/x'; }), /default branch/);
  assert.throws(bad(p => { p.execution.controlSha = control; }), /unsupported/);
  assert.throws(bad(p => { p.cases[0].command = 'rm -rf /'; }), /unsupported/);
  assert.throws(bad(p => { p.reviewMode = 'maybe'; }), /reviewMode/);
  assert.throws(() => validatePlans({ schemaVersion: 1, plans: [base, base] }, { defaultBranch: 'develop' }), /duplicate plan/);
  assert.equal(PLAN_LIMITS.samplesPerPlan, 20);
});

test('start freezes control, base, lockfile and case input once, records all planned samples and dispatches only one', async () => {
  const client = fakeRepository();
  const result = await start(client);
  assert.equal(result.status, 'started');
  const coordinator = client.state.issues.get(result.coordinator);
  assert.deepEqual(names(coordinator).sort(), ['factory:evaluation-batch', 'factory:manual']);
  const { manifest } = readManifest(client.state.comments.get(coordinator.number));
  assert.equal(manifest.controlSha, control);
  assert.equal(manifest.applicationBaseSha, control);
  assert.equal(manifest.entrySha, 'e'.repeat(40));
  assert.equal(manifest.lockfileSha256, createHash('sha256').update(lock).digest('hex'));
  assert.equal(manifest.templateVersion, '1.0.0-beta.45');
  assert.equal(manifest.cases[0].buildReviewMode, 'off'); // inherited from the preset's own choice
  assert.deepEqual(manifest.samples.map(s => s.key), [1, 2, 3].map(i => `${result.batchKey}/F00/${i}`));
  assert.equal(client.samples().length, 1, 'serial: one complete sample chain at a time');
  assert.equal(client.state.dispatches.length, 1);
  assert.deepEqual(client.state.dispatches[0], { ref: 'develop', inputs: { issue_number: String(client.samples()[0].number) } });
  const sample = await resolveSample(client, client.samples()[0].number);
  assert.equal(sample.receipt.controlSha, control);
  assert.equal(sample.receipt.budget.maxRepairAttempts, 2);
  const comments = client.state.comments.get(sample.receipt.issueNumber);
  assert.ok(comments.some(c => c.body.startsWith('<!-- factory-task-base-v1:') && c.body.includes(control)));
  const issue = client.state.issues.get(sample.receipt.issueNumber);
  assert.match(issue.body, /^<!-- factory-preset-ready:[a-f0-9]{64} -->/);
  assert.ok(issue.body.includes(markers.sample(sample.receipt.sampleKey)));
  const document = batchDocument(await current(client));
  assert.deepEqual(validateSchema(loadContract('evaluation-batch.v1'), { ...document, revision: 1, createdAt: '2026-09-25T02:00:00Z' }), []);
  assert.equal(document.summary.planned, 3);
  assert.equal(document.summary.byState.planned, 2);
  assert.equal(document.summary.reports.missing, 3);
  assert.ok(document.limitations.some(l => l.code === 'no-global-score'));
});

test('later samples use the frozen capture even after the source preset changes', async () => {
  const client = fakeRepository();
  await start(client);
  const first = client.samples()[0].number;
  client.state.issues.get(176).body = presetBody.replace('做一个计数器', '改成完全不同的需求');
  client.state.comments.get(176).push({ id: 91, user: human, body: '新的评论', created_at: '2026-09-25T03:00:00Z' });
  client.run(first, { id: 7001 });
  await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T03:00:00Z') });
  const [one, two] = client.samples();
  const snapshot = number => readSnapshot(client.state.comments.get(number), number, /^<!-- factory-preset-ready:([a-f0-9]{64})/.exec(client.state.issues.get(number).body)[1]).snapshot;
  assert.equal(snapshot(two.number).source.body, snapshot(one.number).source.body);
  assert.equal(snapshot(two.number).comments.length, 1);
  assert.doesNotMatch(snapshot(two.number).source.body, /完全不同/);
  assert.equal((await current(client)).state.samples[`${(await current(client)).manifest.batchKey}/F00/1`].state, 'passed');
});

test('an interrupted sample creation resumes on the same Issue instead of creating another', async () => {
  const client = fakeRepository();
  client.state.fail = (method, route, body) => method === 'POST' && /\/issues\/5\d\d\/comments$/.test(route) && body.body.includes('factory-task-base-v1');
  await assert.rejects(start(client), /Injected failure/);
  assert.equal(client.samples().length, 1);
  assert.equal(client.state.dispatches.length, 0);
  await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T02:10:00Z') });
  assert.equal(client.samples().length, 1, 'the retry finds the created Issue by its marker');
  const comments = client.state.comments.get(client.samples()[0].number);
  assert.equal(comments.filter(c => c.body.startsWith('<!-- factory-task-base-v1:')).length, 1);
  assert.equal(comments.filter(c => c.body.startsWith(markers.receipt)).length, 1);
  assert.equal(client.state.dispatches.length, 1);
});

test('duplicate or reordered dispatches never build a sample twice', async () => {
  const client = fakeRepository();
  await start(client);
  const number = client.samples()[0].number;
  const sample = await resolveSample(client, number);
  assert.equal(await claimSample(client, sample, 111), true);
  assert.equal(await claimSample(client, sample, 111), true, 'a re-run attempt of the claiming run continues');
  assert.equal(await claimSample(client, await resolveSample(client, number), 222), false);
  // A dispatch whose receipt update was lost is not repeated once a run exists.
  client.run(number, { id: 111, status: 'in_progress' });
  await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T04:00:00Z') });
  assert.equal(client.state.dispatches.length, 1);
});

test('handoffs keep the serial slot and the budget-exhausted state comes from the sample report', async () => {
  const client = fakeRepository();
  await start(client);
  const number = client.samples()[0].number;
  client.run(number, { id: 8001, delivered: false, handoff: true });
  let batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T03:00:00Z') });
  const key = `${batch.manifest.batchKey}/F00/1`;
  assert.equal(batch.state.samples[key].state, 'running');
  assert.equal(client.samples().length, 1, 'exit 75 is not terminal and does not release the slot');
  client.run(number, { id: 8002, conclusion: 'failure', delivered: false, previous: 8001 });
  const runKey = batch.manifest.samples[0].runKey;
  await commitRevision(client.pages, { document: { type: 'evaluation-report', revision: 1, createdAt: '2026-09-25T04:00:00Z', source: { instance: repository },
    run: { key: runKey }, outcome: { execution: 'budget-exhausted', acceptance: 'unknown', delivery: 'not-published' },
    precedence: { producer: { runId: 8002, attempt: 1, startedAt: '2026-09-25T03:30:00Z' }, reviewState: 'not-reviewed', reviewRubric: 0, qaCoverage: 'partial' } },
  evaluationBytes: Buffer.from('{}'), manifestBytes: Buffer.from('{}'), fingerprint: 'a'.repeat(64), bundle: { sha256: 'b'.repeat(64), size: 1 }, location: null });
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T05:00:00Z') });
  assert.equal(batch.state.samples[key].state, 'budget-exhausted');
  assert.equal(batch.state.samples[key].report.revision, 1);
  assert.equal(client.samples().length, 2, 'the next sample starts only after the whole chain ended');
});

test('cancel stops new samples, keeps executions, and a cancelled batch refuses continuations', async () => {
  const client = fakeRepository();
  const { batchKey } = await start(client);
  const number = client.samples()[0].number;
  client.run(number, { id: 9001, status: 'in_progress' });
  let batch = await cancelBatch(client, batchKey, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(batch.state.cancelled, true);
  assert.deepEqual(Object.values(batch.state.samples).map(s => s.state), ['running', 'cancelled', 'cancelled']);
  assert.equal((await resolveSample(client, number)).cancelled, true);
  client.state.runs[0].status = 'completed';
  client.state.runs[0].conclusion = 'cancelled';
  client.state.jobs.set(9001, [{ name: 'agent', conclusion: 'cancelled', steps: [] }]);
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T12:00:00Z') });
  assert.equal(batch.state.samples[`${batchKey}/F00/1`].state, 'cancelled');
  assert.equal(batch.state.state, 'active', 'stays open briefly so the last sample report can still arrive');
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T19:00:00Z') });
  assert.equal(batch.state.state, 'cancelled');
  assert.equal(client.state.issues.get(batch.manifest.coordinatorIssue).state, 'closed');
  assert.equal(client.samples().length, 1);
  const document = batchDocument(batch);
  assert.equal(document.summary.byState.cancelled, 3);
  assert.ok(document.limitations.some(l => l.code === 'batch-cancelled'));
});

test('scheduled starts are idempotent per slot; one active batch at a time; disabled plans never start on schedule', async () => {
  const client = fakeRepository();
  const day = Date.parse('2026-09-25T01:23:00Z');
  const first = await start(client, plan(), day, 'schedule');
  const again = await startBatch(client, { plans: plan(), planKey: 'smoke', trigger: 'schedule', now: day + 3_600_000, runId: 1, controlSha: control, env: {} });
  assert.equal(again.batchKey, first.batchKey);
  assert.equal([...client.state.issues.values()].filter(i => names(i).includes('factory:evaluation-batch')).length, 1);
  await assert.rejects(startBatch(client, { plans: plan(), planKey: 'smoke', trigger: 'manual', now: day, runId: 2, controlSha: control, env: {} }), /one active batch/);
  const disabled = plan(3, { enabled: false });
  assert.equal((await startBatch(fakeRepository(), { plans: disabled, planKey: 'smoke', trigger: 'schedule', now: day, runId: 3, controlSha: control, env: {} })).status, 'skipped');
  const preview = await startBatch(fakeRepository(), { plans: plan(), planKey: 'smoke', trigger: 'manual', now: day, runId: 3, controlSha: control, env: {}, dryRun: true });
  assert.equal(preview.status, 'planned');
});

test('forged or inconsistent receipts cannot select a control plane; ordinary Issues are untouched', async () => {
  const client = fakeRepository();
  await start(client);
  const number = client.samples()[0].number;
  assert.equal(await resolveSample(client, 176), null);
  const receipt = client.state.comments.get(number).find(c => c.body.startsWith(markers.receipt));
  const original = receipt.body;
  receipt.body = original.replace(control, 'd'.repeat(40));
  await assert.rejects(resolveSample(client, number), /does not match its batch manifest/);
  receipt.body = original; receipt.user = human;
  await assert.rejects(resolveSample(client, number), /receipt is missing/);
  receipt.user = bot;
  client.state.issues.get(number).user = human;
  await assert.rejects(resolveSample(client, number), /created only by the batch coordinator/);
  client.state.issues.get(number).user = bot;
  const coordinator = client.state.issues.get(JSON.parse(original.split('\n')[0].slice(markers.receipt.length, -4)).coordinatorIssue);
  coordinator.labels = [{ name: 'factory:evaluation-batch' }];
  await assert.rejects(resolveSample(client, number), /not trusted/);
  client.state.compare = 'diverged';
  await assert.rejects(verifyAncestor(client, control, 'develop'), /default branch history/);
});
