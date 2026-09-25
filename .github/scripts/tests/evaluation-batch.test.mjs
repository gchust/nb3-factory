import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { advanceBatch, batchDocument, cancelBatch, finalSnapshotRegistered, PLAN_LIMITS, runCoordinator, startBatch, validatePlans, writeBatchExport } from '../evaluation-batch.mjs';
import { existsSync } from 'node:fs';
import { commitPrepared, prepareRevision } from '../evaluation-archive.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { commitRevision, readSubject } from '../evaluation-registry.mjs';
import { admitSample, claimSample, gateSample, markers, readManifest, recordTerminal, resolveSample, sampleUsage, SAMPLE_LABEL, verifyAncestor } from '../evaluation-sample.mjs';
import { readSnapshot } from '../issue-presets.mjs';
import { loadContract, validateSchema } from '../json-schema.mjs';
import { control, fakeRepository, human, lock, names, openBatches, presetBody, repository } from './evaluation-fixtures.mjs';

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
const current = async client => (await openBatches(client))[0];

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

test('one ordered gate: frozen control before the claim, incremental builds only stop for a cancelled batch', async () => {
  const client = fakeRepository();
  const { batchKey } = await start(client, plan(2));
  const number = client.samples()[0].number;
  const claims = () => client.state.comments.get(number).filter(c => c.body.includes('factory-evaluation-sample-claim')).length;
  const fresh = { runId: 501, fresh: true, controlSha: control };
  // A dispatch from another control SHA is rejected before it can take the claim.
  assert.equal((await gateSample(client, await resolveSample(client, number), { ...fresh, controlSha: 'd'.repeat(40) })).decision, 'rejected');
  assert.equal(claims(), 0);
  assert.deepEqual(await gateSample(client, await resolveSample(client, number), fresh), { decision: 'run', used: { activeSeconds: 0, executions: 0 } });
  assert.equal((await gateSample(client, await resolveSample(client, number), { ...fresh, runId: 502 })).decision, 'duplicate');
  assert.equal(claims(), 1);
  // Once the sample is released only an incremental /build (an ordinary task) may start on its Issue.
  client.run(number, { id: 501, conclusion: 'failure', delivered: false });
  await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal((await gateSample(client, await resolveSample(client, number), { runId: 503 })).decision, 'released');
  assert.equal((await gateSample(client, await resolveSample(client, number), { runId: 503, incremental: true })).decision, 'run');
  await cancelBatch(client, batchKey, { now: Date.parse('2026-09-25T04:00:00Z') });
  assert.equal((await gateSample(client, await resolveSample(client, number), { runId: 504, incremental: true })).decision, 'cancelled');
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
  assert.equal(client.state.issues.get(batch.manifest.coordinatorIssue).state, 'open', 'open until the final snapshot is archived');
  await registerBatch(client, batch);
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T20:00:00Z') });
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

async function registerBatch(client, batch) {
  const document = batchDocument(batch);
  const index = await readSubject(client.pages, 'evaluation-batch', document.batch.subjectKey, 'gh-pages');
  const revision = (index?.revisions.length ?? 0) + 1;
  return commitRevision(client.pages, { document: { ...document, revision, createdAt: '2026-09-25T00:00:00Z' },
    evaluationBytes: Buffer.from(`batch-${batch.state.sequence}`), manifestBytes: Buffer.from('{}'), fingerprint: String(batch.state.sequence).padStart(64, 'f'),
    bundle: { sha256: 'c'.repeat(64), size: 1 }, location: null });
}
async function registerReport(client, runKey, runId, outcome, attempt = 1, tag = '') {
  const index = await readSubject(client.pages, 'evaluation-report', runKey, 'gh-pages');
  return commitRevision(client.pages, { document: { type: 'evaluation-report', revision: (index?.revisions.length ?? 0) + 1,
    createdAt: '2026-09-25T04:00:00Z', source: { instance: repository }, run: { key: runKey }, outcome,
    precedence: { producer: { runId, attempt, startedAt: new Date(runId * 1000 + attempt * 60_000).toISOString() }, reviewState: 'not-reviewed', reviewRubric: 0, qaCoverage: 'partial' } },
  evaluationBytes: Buffer.from(`${runId}.${attempt}${tag}`), manifestBytes: Buffer.from('{}'), fingerprint: createHash('sha256').update(`${runId}.${attempt}.${tag}`).digest('hex'),
    bundle: { sha256: 'b'.repeat(64), size: 1 }, location: null });
}

test('a batch waits for the final run report, not an earlier handoff report', async () => {
  const client = fakeRepository();
  await start(client, plan(1));
  const number = client.samples()[0].number;
  let batch = await current(client);
  const runKey = batch.manifest.samples[0].runKey;
  client.run(number, { id: 8001, delivered: false, handoff: true });
  await registerReport(client, runKey, 8001, { execution: 'running', acceptance: 'unknown', delivery: 'not-published' });
  client.run(number, { id: 8002, conclusion: 'failure', delivered: false, previous: 8001 });
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(batch.state.state, 'active', 'the handoff report does not close the batch');
  await registerReport(client, runKey, 8002, { execution: 'budget-exhausted', acceptance: 'unknown', delivery: 'not-published' });
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T04:00:00Z') });
  const [item] = Object.values(batch.state.samples);
  assert.equal(item.state, 'budget-exhausted');
  assert.equal(item.report.revision, 2);
  assert.equal(batch.state.state, 'completed');
});

test('an invalid case freezes nothing; a manifest-less coordinator can be cancelled to unblock new batches', async () => {
  const client = fakeRepository();
  client.state.issues.get(176).labels = [];
  await assert.rejects(start(client), /factory:preset/);
  assert.equal([...client.state.issues.values()].filter(i => names(i).includes('factory:evaluation-batch')).length, 0);
  client.state.issues.get(176).labels = [{ name: 'factory:preset' }];
  client.state.fail = (method, route, body) => method === 'POST' && route.endsWith('/comments') && body.body.includes('factory-evaluation-batch-manifest-v1');
  const plans = plan();
  await assert.rejects(startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 1, runId: 5, controlSha: control, env: {} }), /Injected/);
  const key = 'smoke-r5';
  await assert.rejects(startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 2000, runId: 6, controlSha: control, env: {} }), /one active batch/);
  const closed = await cancelBatch(client, key);
  assert.equal(closed.coordinator.state, 'closed');
  assert.equal((await startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 3000, runId: 7, controlSha: control, env: {} })).status, 'started');
});

test('prepare decisions are terminal receipts, and prepare-only duplicate runs never become the sample result', async () => {
  const client = fakeRepository();
  await start(client);
  const number = client.samples()[0].number;
  client.run(number, { id: 7101 });
  // A later duplicate dispatch stopped at prepare (agent skipped): ignored.
  client.run(number, { id: 7102, delivered: false });
  client.state.jobs.set(7102, [{ name: 'agent', conclusion: 'skipped', steps: [] }]);
  let batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T03:00:00Z') });
  const [first, second] = Object.values(batch.state.samples);
  assert.equal(first.state, 'passed');
  assert.equal(first.final.runId, 7101);
  const next = client.samples()[1].number;
  client.run(next, { id: 7201, delivered: false });
  client.state.jobs.set(7201, [{ name: 'agent', conclusion: 'skipped', steps: [] }]);
  await recordTerminal(client, await resolveSample(client, next), 7201, 'budget-exhausted', '预算已用尽');
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T04:00:00Z') });
  assert.equal(Object.values(batch.state.samples)[1].state, 'budget-exhausted');
  assert.equal(Object.values(batch.state.samples)[1].stateSource, 'prepare');
  assert.equal(second.state, 'queued');
});

test('budget usage is measured from GitHub job records across runs and earlier attempts', async () => {
  const client = fakeRepository();
  client.state.runs.push({ id: 1, run_attempt: 1, display_title: 'Factory issue #9 build 0 from 0' }, { id: 2, run_attempt: 2, display_title: 'Factory issue #9 build 0 from 1' },
    { id: 3, run_attempt: 1, display_title: 'Factory issue #10 build 0 from 0' });
  const job = (attempt, minutes, conclusion = 'success') => ({ name: 'agent', run_attempt: attempt, conclusion, started_at: '2026-09-25T00:00:00Z',
    completed_at: new Date(Date.parse('2026-09-25T00:00:00Z') + minutes * 60_000).toISOString() });
  const request = client.request;
  client.request = async (method, route, options) => {
    const match = /^\/actions\/runs\/(\d+)\/jobs$/.exec(route);
    if (match) return { jobs: { 1: [job(1, 10)], 2: [job(1, 20), job(2, 5)], 3: [job(1, 99)] }[match[1]] };
    return request(method, route, options);
  };
  assert.deepEqual(await sampleUsage(client, 9, { runId: 2, attempt: 2 }), { activeSeconds: 1800, executions: 2 });
  assert.deepEqual(await sampleUsage(client, 9, { runId: 3, attempt: 1 }), { activeSeconds: 2100, executions: 3 });
});

test('a manual batch is identified by its originating run: any attempt, any time, resumes it without new samples', async () => {
  const client = fakeRepository();
  const plans = plan();
  const first = await startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: Date.parse('2026-09-25T02:00:00Z'), runId: 4242, controlSha: control, env: {} });
  await advanceBatch(client, first.batch, { now: Date.parse('2026-09-25T02:00:00Z') });
  assert.equal(first.batchKey, 'smoke-r4242');
  // Re-run attempt ten minutes later (e.g. after an archive failure).
  const again = await startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: Date.parse('2026-09-25T02:10:00Z'), runId: 4242, controlSha: control, env: {} });
  assert.equal(again.batchKey, first.batchKey);
  await advanceBatch(client, again.batch, { now: Date.parse('2026-09-25T02:10:00Z') });
  assert.equal([...client.state.issues.values()].filter(i => names(i).includes('factory:evaluation-batch')).length, 1);
  assert.equal(client.samples().length, 1);
  assert.equal(client.state.dispatches.length, 1);
  await assert.rejects(startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 1, runId: undefined, controlSha: control, env: {} }), /originating run/);
});

test('a run that is still unfinished keeps the slot; only a long-stalled handoff is released, and then refused', async () => {
  const client = fakeRepository();
  await start(client, plan(2));
  const number = client.samples()[0].number;
  client.run(number, { id: 6001, status: 'in_progress' });
  const days = n => Date.parse('2026-09-25T02:00:00Z') + n * 86400_000;
  let batch = await advanceBatch(client, await current(client), { now: days(3) });
  const [first] = Object.values(batch.state.samples);
  assert.equal(first.state, 'running', 'no progress is not termination');
  assert.match(first.reason, /不释放串行槽位/);
  assert.equal(client.samples().length, 1);
  client.state.runs[0].status = 'completed';
  client.state.jobs.set(6001, [{ name: 'agent', conclusion: 'success', steps: [{ name: 'Dispatch continuation run', conclusion: 'success' }] }]);
  batch = await advanceBatch(client, await current(client), { now: days(4) });
  assert.equal(Object.values(batch.state.samples)[0].state, 'unknown');
  assert.equal(client.samples().length, 2, 'the released slot goes to the next sample');
  const released = await resolveSample(client, number);
  assert.equal(released.released, 'unknown', 'a late continuation of the released sample is refused at prepare');
  assert.equal((await resolveSample(client, client.samples()[1].number)).released, null);
});

test('Agent settings are fingerprinted at freeze and at each dispatch; drift marks samples as not comparable', async () => {
  const client = fakeRepository();
  const env = { CODE_AGENT_ENGINE: 'pi', CODE_AGENT_MODEL: 'model-a', CODE_AGENT_API_KEY: 'secret-never-recorded' };
  const started = await startBatch(client, { plans: plan(2), planKey: 'smoke', trigger: 'manual', now: 1000, runId: 77, controlSha: control, env });
  let batch = await advanceBatch(client, started.batch, { now: 1000, env });
  assert.deepEqual(batch.manifest.agentConfig.values, { CODE_AGENT_ENGINE: 'pi', CODE_AGENT_MODEL: 'model-a' });
  assert.ok(!JSON.stringify(batch.manifest).includes('secret-never-recorded'));
  client.run(client.samples()[0].number, { id: 5501 });
  batch = await advanceBatch(client, batch, { now: 2000, env: { ...env, CODE_AGENT_MODEL: 'model-b' } });
  const document = batchDocument(batch);
  assert.deepEqual(document.samples.map(s => s.comparable), [true, false]);
  assert.equal(document.summary.comparable, false);
  assert.ok(document.limitations.some(l => l.code === 'agent-config-drift'));
  assert.deepEqual(validateSchema(loadContract('evaluation-batch.v1'), { ...document, revision: 1, createdAt: '2026-09-25T00:00:00Z' }), []);
});

test('a finished batch stays open until its final snapshot is registered, then closes without new samples', async () => {
  const client = fakeRepository();
  await start(client, plan(1));
  client.run(client.samples()[0].number, { id: 4401 });
  let batch = await current(client);
  await registerReport(client, batch.manifest.samples[0].runKey, 4401, { execution: 'completed', acceptance: 'passed', delivery: 'published' });
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(batch.state.state, 'completed');
  assert.equal(await finalSnapshotRegistered(client, batch), false);
  // The archive step failed: compensation still finds the batch and re-exports it.
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T04:00:00Z') });
  assert.equal(batch.coordinator.state, 'open');
  assert.equal((await openBatches(client)).length, 1);
  assert.equal((await startBatch(client, { plans: plan(1), planKey: 'smoke', trigger: 'manual', now: 5, runId: 99, controlSha: control, env: {} })).status, 'started',
    'a completed batch awaiting its archive does not block the next batch');
  await registerBatch(client, batch);
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T05:00:00Z') });
  assert.equal(batch.coordinator.state, 'closed');
  assert.equal(client.samples().filter(i => i.body.includes(batch.manifest.batchKey)).length, 1);
});

test('re-running only the Agent job re-admits the sample: released, cancelled or over budget starts no model', async () => {
  const client = fakeRepository();
  const { batchKey } = await start(client, plan(2));
  const number = client.samples()[0].number;
  const sample = await resolveSample(client, number);
  const metadata = { issue: { number }, evaluation: { kind: 'batch-sample', sampleKey: sample.receipt.sampleKey } };
  const jobs = new Map();
  const request = client.request;
  client.request = async (method, route, options) => {
    const match = /^\/actions\/runs\/(\d+)\/jobs$/.exec(route);
    return match ? { jobs: jobs.get(Number(match[1])) ?? [] } : request(method, route, options);
  };
  assert.deepEqual(await admitSample(client, { issue: { number: 1 }, evaluation: { kind: 'initial' } }, { runId: 1, attempt: 1 }), { admitted: true, sample: null });
  let admission = await admitSample(client, metadata, { runId: 8800, attempt: 2 });
  assert.equal(admission.admitted, true);
  // Attempt 1's Agent job already spent almost the whole budget.
  client.state.runs.push({ id: 8800, run_attempt: 2, status: 'in_progress', display_title: `Factory issue #${number} build 0 from 0`, created_at: new Date().toISOString() });
  jobs.set(8800, [{ name: 'agent', run_attempt: 1, conclusion: 'failure', started_at: '2026-09-25T00:00:00Z', completed_at: '2026-09-25T00:55:00Z' }]);
  admission = await admitSample(client, metadata, { runId: 8800, attempt: 2 });
  assert.equal(admission.admitted, false);
  assert.match(admission.reason, /预算/);
  jobs.clear();
  await cancelBatch(client, batchKey, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.match((await admitSample(client, metadata, { runId: 8800, attempt: 2 })).reason, /已取消/);
  const other = fakeRepository();
  await start(other, plan(2));
  const first = other.samples()[0].number;
  other.run(first, { id: 8900, conclusion: 'failure', delivered: false });
  await advanceBatch(other, await current(other), { now: Date.parse('2026-09-25T03:00:00Z') });
  const released = await admitSample(other, { issue: { number: first }, evaluation: { kind: 'batch-sample', sampleKey: (await resolveSample(other, first)).receipt.sampleKey } },
    { runId: 8900, attempt: 2 });
  assert.equal(released.admitted, false);
  assert.match(released.reason, /释放串行槽位/);
});

test('a re-dispatch under changed settings records them, so the sample is not comparable', async () => {
  const client = fakeRepository();
  const a = { CODE_AGENT_ENGINE: 'pi', CODE_AGENT_MODEL: 'model-a' }, b = { ...a, CODE_AGENT_MODEL: 'model-b' };
  const started = await startBatch(client, { plans: plan(1), planKey: 'smoke', trigger: 'manual', now: Date.parse('2026-09-25T02:00:00Z'), runId: 31, controlSha: control, env: a });
  let batch = await advanceBatch(client, started.batch, { now: Date.parse('2026-09-25T02:00:00Z'), env: a });
  assert.equal(client.state.dispatches.length, 1);
  // The first dispatch never produced a run; the next advance runs under settings B.
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z'), env: b });
  assert.equal(client.state.dispatches.length, 2);
  const [sample] = batchDocument(batch).samples;
  assert.equal(sample.agentConfigFingerprint, batch.state.agentConfigDrift.fingerprint);
  assert.equal(sample.comparable, false);
});

test('a report of attempt 1 never stands in for a successful attempt 2 of the same run, even after completion', async () => {
  const client = fakeRepository();
  await start(client, plan(1));
  const number = client.samples()[0].number;
  let batch = await current(client);
  const runKey = batch.manifest.samples[0].runKey, key = batch.manifest.samples[0].key;
  // Attempt 1 failed and its report is registered; the user re-ran and attempt 2 succeeded.
  client.run(number, { id: 7300 });
  await registerReport(client, runKey, 7300, { execution: 'completed', acceptance: 'failed', delivery: 'not-published' }, 1);
  Object.assign(client.state.runs.at(-1), { run_attempt: 2 });
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(batch.state.samples[key].state, 'passed', 'judged from attempt 2 itself, not from attempt 1\'s report');
  assert.equal(batch.state.samples[key].final.attempt, 2);
  assert.equal(batch.state.state, 'active', 'attempt 2\'s own report has not arrived yet');
  // The grace period passes and the batch completes; the late report still refines the open batch.
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T10:00:00Z') });
  assert.equal(batch.state.state, 'completed');
  const completedAt = batch.state.sequence;
  await registerReport(client, runKey, 7300, { execution: 'budget-exhausted', acceptance: 'unknown', delivery: 'not-published' }, 2);
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T11:00:00Z') });
  assert.equal(batch.state.samples[key].state, 'budget-exhausted');
  assert.equal(batch.state.samples[key].report.revision, 2);
  assert.ok(batch.state.sequence > completedAt, 'a new snapshot must be archived before the coordinator closes');
  assert.equal(await finalSnapshotRegistered(client, batch), false);
});

test('a finished batch awaiting its archive and a running batch are exported and registered independently', async t => {
  const client = fakeRepository();
  await start(client, plan(1));
  client.run(client.samples()[0].number, { id: 7400 });
  let first = await current(client);
  await registerReport(client, first.manifest.samples[0].runKey, 7400, { execution: 'completed', acceptance: 'passed', delivery: 'published' });
  first = await advanceBatch(client, first, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(first.state.state, 'completed');
  await startBatch(client, { plans: plan(1), planKey: 'smoke', trigger: 'manual', now: 9, runId: 9201, controlSha: control, env: {} });
  const open = await openBatches(client);
  assert.equal(open.length, 2);
  const output = mkdtempSync(path.join(os.tmpdir(), 'batch-export-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const keys = [];
  for (const batch of open) keys.push(writeBatchExport(output, await advanceBatch(client, batch, { now: Date.parse('2026-09-25T04:00:00Z') })));
  assert.equal(new Set(keys).size, 2, 'no snapshot overwrites another');
  const samplesBefore = client.samples().length;
  for (const key of keys) {
    const bundle = mkdtempSync(path.join(os.tmpdir(), 'batch-bundle-'));
    t.after(() => rmSync(bundle, { recursive: true, force: true }));
    await prepareRevision(client, { input: path.join(output, key), output: bundle });
    await commitPrepared(client, { input: bundle, env: {}, runId: 9300, attempt: 1, artifactId: null });
  }
  for (const batch of await openBatches(client)) await advanceBatch(client, batch, { now: Date.parse('2026-09-25T05:00:00Z') });
  const remaining = await openBatches(client);
  assert.deepEqual(remaining.map(b => b.manifest.batchKey), ['smoke-r9201'], 'the archived finished batch closed; the running one stays');
  assert.equal(client.samples().length, samplesBefore, 'compensation creates no business samples');
});

test('public report fields and counts use only the final execution report, in both directions', async () => {
  for (const [old, next, expected] of [['failed', 'success', 'passed'], ['passed', 'failure', 'failed']]) {
    const client = fakeRepository();
    await start(client, plan(1));
    const number = client.samples()[0].number;
    let batch = await current(client);
    const runKey = batch.manifest.samples[0].runKey;
    client.run(number, { id: 7500, conclusion: next, delivered: next === 'success' });
    await registerReport(client, runKey, 7500, { execution: 'completed', acceptance: old, delivery: 'not-published' }, 1);
    Object.assign(client.state.runs.at(-1), { run_attempt: 2 });
    batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z') });
    batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T10:00:00Z') }); // grace period passed
    assert.equal(batch.state.state, 'completed', 'finishing after the grace period is allowed');
    const document = batchDocument(batch);
    const [sample] = document.samples;
    assert.equal(sample.state, expected);
    assert.deepEqual(sample.report, { state: 'missing', revision: null, execution: null, acceptance: null }, `attempt 1's ${old} report is history only`);
    assert.deepEqual(document.summary.acceptance, { passed: 0, failed: 0, other: 1 });
    assert.deepEqual(document.summary.reports, { available: 0, missing: 1, notApplicable: 0 });
    assert.ok(document.limitations.some(l => l.code === 'reports-missing'), 'completion is not "all reports present"');
    assert.deepEqual(validateSchema(loadContract('evaluation-batch.v1'), { ...document, revision: 1, createdAt: '2026-09-25T00:00:00Z' }), []);
  }
  // Ended at prepare: no build ran, so no report is expected and none is missing.
  const client = fakeRepository();
  await start(client, plan(1));
  const number = client.samples()[0].number;
  client.run(number, { id: 7600, delivered: false });
  client.state.jobs.set(7600, [{ name: 'agent', conclusion: 'skipped', steps: [] }]);
  await recordTerminal(client, await resolveSample(client, number), 7600, 'budget-exhausted', '预算已用尽');
  const batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(batch.state.state, 'completed');
  const document = batchDocument(batch);
  assert.equal(document.samples[0].report.state, 'not-applicable');
  assert.deepEqual(document.summary.reports, { available: 0, missing: 0, notApplicable: 1 });
});

test('one batch failing to coordinate never keeps another batch from being exported and archived', async t => {
  const client = fakeRepository();
  await start(client, plan(1));
  client.run(client.samples()[0].number, { id: 7700 });
  let finished = await current(client);
  await registerReport(client, finished.manifest.samples[0].runKey, 7700, { execution: 'completed', acceptance: 'passed', delivery: 'published' });
  finished = await advanceBatch(client, finished, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(finished.state.state, 'completed');
  await startBatch(client, { plans: plan(2), planKey: 'smoke', trigger: 'manual', now: 9, runId: 9401, controlSha: control, env: {} });
  const output = mkdtempSync(path.join(os.tmpdir(), 'batch-export-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  client.state.fail = (method, route) => method === 'POST' && route.endsWith('/dispatches');
  const result = await runCoordinator(client, { action: 'advance', args: { output } });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].label, /^smoke-r9401 \(#\d+\)$/);
  assert.ok(result.exported.includes(finished.manifest.batchKey), 'the waiting batch still exports');
  assert.ok(existsSync(path.join(output, finished.manifest.batchKey, 'draft.json')));
  assert.ok(result.lines.some(line => line.includes('本轮协调失败')));
  const samples = client.samples().length;
  // The next compensation recovers the failed batch without creating another sample.
  const retry = await runCoordinator(client, { action: 'advance', args: { output } });
  assert.deepEqual(retry.failures, []);
  assert.equal(client.samples().length, samples);
  assert.equal(client.state.dispatches.filter(d => Number(d.inputs.issue_number) === client.samples().at(-1).number).length, 1);
});

test('an unreadable batch is isolated at load time; the others still advance and export', async t => {
  const client = fakeRepository();
  await start(client, plan(1));
  client.run(client.samples()[0].number, { id: 7800 });
  let finished = await current(client);
  await registerReport(client, finished.manifest.samples[0].runKey, 7800, { execution: 'completed', acceptance: 'passed', delivery: 'published' });
  finished = await advanceBatch(client, finished, { now: Date.parse('2026-09-25T03:00:00Z') });
  const running = await startBatch(client, { plans: plan(1), planKey: 'smoke', trigger: 'manual', now: 9, runId: 9501, controlSha: control, env: {} });
  const output = mkdtempSync(path.join(os.tmpdir(), 'batch-export-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  client.state.fail = (method, route) => method === 'GET' && route === `/issues/${running.coordinator}/comments`;
  const result = await runCoordinator(client, { action: 'advance', args: { output } });
  assert.deepEqual(result.failures.map(f => f.label), [`#${running.coordinator}`], 'identified by its Issue before its key is known');
  assert.ok(existsSync(path.join(output, finished.manifest.batchKey, 'draft.json')), 'the healthy batch still exports');
  // Starting a new batch still refuses when an open batch cannot be read.
  client.state.fail = (method, route) => method === 'GET' && route === `/issues/${running.coordinator}/comments`;
  await assert.rejects(startBatch(client, { plans: plan(1), planKey: 'smoke', trigger: 'manual', now: 10, runId: 9502, controlSha: control, env: {} }), /Injected/);
});

test('a failed report read keeps the confirmed report, counts and snapshot; the error stays visible', async () => {
  const client = fakeRepository();
  await start(client, plan(1));
  client.run(client.samples()[0].number, { id: 7900 });
  let batch = await current(client);
  await registerReport(client, batch.manifest.samples[0].runKey, 7900, { execution: 'completed', acceptance: 'passed', delivery: 'published' });
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z') });
  const before = { sequence: batch.state.sequence, document: batchDocument(batch) };
  assert.equal(before.document.samples[0].report.state, 'available');
  client.state.fail = (method, route) => method === 'GET' && route.startsWith('/contents/evaluations/subjects/');
  await assert.rejects(advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T04:00:00Z') }), /Injected/);
  const after = await current(client);
  assert.equal(after.state.sequence, before.sequence, 'no snapshot is committed from a failed read');
  assert.deepEqual(batchDocument(after).samples[0].report, before.document.samples[0].report);
  assert.deepEqual(batchDocument(after).summary.acceptance, { passed: 1, failed: 0, other: 0 });
  client.state.fail = (method, route) => method === 'GET' && route.startsWith('/contents/evaluations/subjects/');
  const result = await runCoordinator(client, { action: 'advance', args: {} });
  assert.equal(result.failures.length, 1, 'recorded as a coordination failure, not silently swallowed');
});

test('a newer report revision of the same execution also updates the state derived from it', async () => {
  const client = fakeRepository();
  await start(client, plan(1));
  client.run(client.samples()[0].number, { id: 8100 });
  let batch = await current(client);
  const runKey = batch.manifest.samples[0].runKey, key = batch.manifest.samples[0].key;
  // r1 was exported while the QA evidence download failed; r2 has the complete evidence.
  await registerReport(client, runKey, 8100, { execution: 'completed', acceptance: 'unknown', delivery: 'published' }, 1, 'partial');
  batch = await advanceBatch(client, batch, { now: Date.parse('2026-09-25T03:00:00Z') });
  assert.equal(batch.state.samples[key].state, 'unknown');
  await registerReport(client, runKey, 8100, { execution: 'completed', acceptance: 'passed', delivery: 'published' }, 1, 'complete');
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-25T04:00:00Z') });
  const document = batchDocument(batch);
  assert.equal(batch.state.samples[key].state, 'passed');
  assert.equal(document.samples[0].report.revision, 2);
  assert.deepEqual(document.summary.acceptance, { passed: 1, failed: 0, other: 0 });
  assert.equal(document.summary.byState.passed, 1);
  assert.equal(document.summary.byState.unknown, 0);
});

test('a start interrupted before its first state holds the slot; resuming shares the exclusion check', async () => {
  const client = fakeRepository();
  const plans = plan(1);
  const coordinatorsCount = () => [...client.state.issues.values()].filter(i => names(i).includes('factory:evaluation-batch')).length;
  client.state.fail = (method, route, body) => method === 'POST' && route.endsWith('/comments') && body.body.includes('factory-evaluation-batch-state-v1');
  await assert.rejects(startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 1, runId: 9910, controlSha: control, env: {} }), /Injected/);
  // Manifest saved, first state missing: this is an unfinished start, not a finished batch.
  await assert.rejects(startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 2, runId: 9911, controlSha: control, env: {} }), /unfinished: smoke-r9910/);
  assert.equal((await startBatch(client, { plans, planKey: 'smoke', trigger: 'schedule', now: Date.parse('2026-09-25T01:23:00Z'), runId: 1, controlSha: control, env: {} })).status, 'skipped');
  // Re-running the original start resumes it: no new coordinator, one sample dispatched.
  const resumed = await startBatch(client, { plans, planKey: 'smoke', trigger: 'manual', now: 3, runId: 9910, controlSha: control, env: {} });
  await advanceBatch(client, resumed.batch, { now: 3 });
  assert.equal(coordinatorsCount(), 1);
  assert.equal(client.state.dispatches.length, 1);
  // An unfinished start never resumes beside another active batch.
  const other = fakeRepository();
  other.state.fail = (method, route, body) => method === 'POST' && route.endsWith('/comments') && body.body.includes('factory-evaluation-batch-state-v1');
  await assert.rejects(startBatch(other, { plans, planKey: 'smoke', trigger: 'manual', now: 1, runId: 9920, controlSha: control, env: {} }), /Injected/);
  const halfStarted = [...other.state.issues.values()].find(i => names(i).includes('factory:evaluation-batch'));
  halfStarted.state = 'closed'; // simulate an inconsistent/raced record
  const b = await startBatch(other, { plans, planKey: 'smoke', trigger: 'manual', now: 2, runId: 9921, controlSha: control, env: {} });
  await advanceBatch(other, b.batch, { now: 2 });
  halfStarted.state = 'open';
  await assert.rejects(startBatch(other, { plans, planKey: 'smoke', trigger: 'manual', now: 3, runId: 9920, controlSha: control, env: {} }), /active or unfinished: smoke-r9921/);
  assert.equal(other.state.dispatches.length, 1, 'only one batch ever dispatches');
});

test('cancelling after a failed first dispatch finishes the batch and frees the slot without any run', async () => {
  const client = fakeRepository();
  client.state.fail = (method, route) => method === 'POST' && route.endsWith('/dispatches');
  const started = await startBatch(client, { plans: plan(2), planKey: 'smoke', trigger: 'manual', now: Date.parse('2026-09-25T02:00:00Z'), runId: 9930, controlSha: control, env: {} });
  await assert.rejects(advanceBatch(client, started.batch, { now: Date.parse('2026-09-25T02:00:00Z') }), /Injected/);
  let batch = await cancelBatch(client, started.batchKey, { now: Date.parse('2026-09-25T02:10:00Z') });
  assert.deepEqual(Object.values(batch.state.samples).map(s => s.state), ['cancelled', 'cancelled']);
  assert.equal(batch.state.state, 'cancelled');
  batch = await advanceBatch(client, await current(client), { now: Date.parse('2026-09-28T02:10:00Z') });
  assert.equal(batch.state.state, 'cancelled');
  assert.equal(client.state.dispatches.length, 0, 'no dispatch, no run, no model');
  assert.equal(client.state.runs.length, 0);
  assert.equal(batchDocument(batch).samples[0].report.state, 'not-applicable');
  const next = await startBatch(client, { plans: plan(1), planKey: 'smoke', trigger: 'manual', now: Date.parse('2026-09-28T03:00:00Z'), runId: 9931, controlSha: control, env: {} });
  assert.equal(next.status, 'started', 'a cancelled batch no longer blocks the next one');
  // A late run of the cancelled sample is still refused at prepare/admission.
  const sample = await resolveSample(client, client.samples()[0].number);
  assert.equal(sample.cancelled, true);
  assert.equal(sample.released, 'cancelled');
});
