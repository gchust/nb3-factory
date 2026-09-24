import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { taskEvaluationIdentity, resolveTaskIdentity, isRunKey } from '../evaluation-identity.mjs';
import { buildEvaluation, comparePrecedence, executionFacts, finalizeEvaluation, fingerprintEvaluation, subjectKeyOf } from '../evaluation-report.mjs';
import { assertSchema, loadContract, validateSchema } from '../json-schema.mjs';
import { buildArtifacts, control, put, reportFor, repository, temporary, usageRecord, writeReview } from './evaluation-fixtures.mjs';

const exporter = { controlSha: 'e'.repeat(40), runId: 900, attempt: 1 };
const exportOf = (root, report) => buildEvaluation({ report, root, exporter });
const finalize = (draft, revision = 1) => finalizeEvaluation(draft, { revision, createdAt: '2026-09-25T00:00:00Z' }).document;
const kinds = review => review.findings.map(f => f.kind);

test('run keys separate independent samples, incremental /build tasks and batch samples', () => {
  const initial = taskEvaluationIdentity({ repository, issueNumber: 7 });
  const build = taskEvaluationIdentity({ repository, issueNumber: 7, buildCommentId: 55 });
  const sample = taskEvaluationIdentity({ repository, issueNumber: 8, sample: { batchKey: 'daily-2026-09-25', caseKey: 'F00', sampleIndex: 2 } });
  assert.equal(initial.runKey, 'owner/factory/issues/7/initial');
  assert.equal(build.kind, 'incremental');
  assert.notEqual(build.runKey, initial.runKey);
  assert.equal(sample.runKey, 'owner/factory/batches/daily-2026-09-25/F00/2');
  for (const key of [initial.runKey, build.runKey, sample.runKey]) assert.ok(isRunKey(key));
  assert.equal(isRunKey('a/../b'), false);
  // A recorded identity must agree with the task it claims; no unsourced merge.
  assert.throws(() => resolveTaskIdentity({ repository, issue: { number: 7 }, evaluation: { ...initial, runKey: build.runKey } }), /does not match/);
  assert.equal(resolveTaskIdentity({ repository, issue: { number: 7 } }).derivation, 'legacy-derived');
  assert.equal(resolveTaskIdentity({ repository, issue: { number: 7 }, buildCommentId: '55' }).runKey, build.runKey);
});

test('first-pass build exports QA, review, usage and baseline from their own sources and matches the contract', t => {
  const root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord(), [], { number: 150, headSha: 'a'.repeat(40) });
  const { draft, attachments } = exportOf(root, report);
  const document = finalize(draft);
  assert.deepEqual(validateSchema(loadContract('evaluation-report.v1'), document), []);
  assert.equal(document.run.key, `${repository}/issues/146/initial`);
  assert.equal(document.run.identity, 'recorded');
  assert.deepEqual([document.outcome.execution, document.outcome.acceptance, document.outcome.delivery], ['completed', 'passed', 'published']);
  assert.equal(document.qa.firstFull.status, 'passed');
  assert.equal(document.qa.firstFull.round, 1);
  assert.equal(document.qa.firstPassWithoutRepair, 'yes');
  assert.equal(document.qa.coverage, 'complete');
  assert.equal(document.metrics.counts.businessBuilds, 1);
  assert.equal(document.metrics.usage.totals.total, 380);
  assert.equal(document.metrics.usage.sources[0].key, 'agent-job:1001');
  assert.equal(document.baseline.factory.controlSha, control);
  assert.equal(document.baseline.template.templateVersion, '1.0.0-beta.45');
  assert.equal(document.baseline.inputs.prompts[0].sha256, '5'.repeat(64));
  const [review] = document.reviews;
  assert.equal(review.state, 'completed');
  assert.equal(review.rubric.version, 2);
  assert.deepEqual(review.rubric.dimensions.map(d => d.key), ['requirementFit', 'usability', 'agentFriendliness', 'design', 'reliability']);
  assert.equal(review.ui.framework, false);
  assert.ok(review.findings.every(f => f.id.startsWith(`${review.key}/F`)));
  assert.ok(document.evidence.every(e => e.id.startsWith(`${review.key}/E`) || e.id.startsWith('qa/')));
  // confirmed is the reviewer's judgement, never a human confirmation or a closed receiver issue.
  const confirmed = review.findings.find(f => f.confidence === 'confirmed');
  assert.equal(confirmed.confirmedBy, 'reviewer');
  assert.ok(!Object.hasOwn(confirmed, 'status'));
  assert.deepEqual(review.modules[0].subjectKeys, ['pkg:@nocobase/example-data', 'skill:example-data']);
  assert.equal(review.modules[0].mapping, 'resolved');
  assert.ok(review.findings[0].subjectKeys.includes('pkg:@nocobase/example-data'));
  assert.equal(document.processNotes.state, 'absent');
  assert.ok(attachments.every(a => a.path.startsWith('evidence/verify-1/browser-acceptance/')));
  assert.ok(document.evidence.some(e => e.id === 'qa/1/b01.png' && e.attachment));
});

test('a first failed full QA is preserved after a repaired final pass', t => {
  const root = temporary(t);
  buildArtifacts(root, { rounds: [{ round: 1, scope: 'full', statuses: ['failed', 'passed'] },
    { round: 2, scope: 'focused', statuses: ['passed'] }, { round: 2, scope: 'full', statuses: ['passed', 'passed'] }], repairs: 1 });
  const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  assert.equal(document.qa.firstFull.status, 'failed');
  assert.equal(document.qa.finalFull.status, 'passed');
  assert.equal(document.qa.finalFull.round, 2);
  assert.equal(document.qa.firstPassWithoutRepair, 'no');
  assert.deepEqual(document.qa.criteria.map(c => [c.id, c.firstFull, c.finalFull]), [['B01', 'failed', 'passed'], ['B02', 'passed', 'passed']]);
  assert.equal(document.qa.counts.chain.repairAttempts, 1);
});

test('focused-only QA never becomes full business acceptance', t => {
  const root = temporary(t);
  buildArtifacts(root, { rounds: [{ round: 3, scope: 'focused', statuses: ['passed'] }], chainVerifications: 3, chainRepairs: 2,
    outcome: 'failed', review: 'none' });
  const document = finalize(exportOf(root, reportFor(root, usageRecord({ status: 'failure' }))).draft);
  assert.equal(document.qa.finalFull.status, 'unknown');
  assert.equal(document.outcome.acceptance, 'unknown');
  assert.ok(document.limitations.some(l => l.code === 'qa-focused-only'));
  assert.ok(document.limitations.some(l => l.code === 'first-round-unavailable'));
});

test('handoff chains link executions without doubling cumulative counters and keep the first round unknown', t => {
  const first = temporary(t), second = temporary(t);
  buildArtifacts(first, { runId: 100, rounds: [], chainVerifications: 0, outcome: 'handoff', review: 'none' });
  const firstRecord = usageRecord({ runId: 100, status: 'handoff', start: 1_000_000 });
  const firstReport = reportFor(first, firstRecord);
  const early = finalize(exportOf(first, firstReport).draft);
  assert.equal(early.outcome.execution, 'running');
  assert.equal(early.outcome.acceptance, 'unknown');
  assert.equal(early.precedence.chainTerminal, false);
  buildArtifacts(second, { runId: 200, rounds: [{ round: 2, scope: 'full', statuses: ['passed', 'passed'] }], chainVerifications: 2, chainRepairs: 1, repairs: 0 });
  const secondRecord = usageRecord({ runId: 200, start: 2_000_000, event: 'repository_dispatch', previousRunId: 100 });
  const document = finalize(exportOf(second, reportFor(second, secondRecord, [firstReport.record])).draft);
  assert.deepEqual(document.executions.map(e => [e.kind, e.runId]), [['implementation', 100], ['continuation', 200]]);
  assert.equal(document.qa.firstFull.status, 'unknown');
  assert.equal(document.qa.finalFull.status, 'passed');
  assert.equal(document.qa.firstPassWithoutRepair, 'unknown');
  assert.equal(document.qa.counts.chain.repairAttempts, 1); // cumulative checkpoint, not re-added per run
  assert.equal(document.qa.counts.execution.repairAttempts, 0);
  assert.equal(document.metrics.usage.sources.length, 2);
  assert.equal(document.metrics.counts.businessBuilds, 1);
  assert.equal(document.metrics.time.executionSeconds, 120);
  // A downstream-only rerun reuses its Agent job: it is not counted twice.
  const rerun = usageRecord({ runId: 200, attempt: 2, start: 2_100_000, agentJobId: 2001, event: 'repository_dispatch', previousRunId: 100 });
  const again = exportOf(second, reportFor(second, rerun, [firstReport.record, { ...secondRecord, evaluation: executionFacts(JSON.parse(readFileSync(path.join(second, 'task-metadata.json'))), second, secondRecord) }])).draft;
  assert.equal(again.executions.at(-1).kind, 'rerun-attempt');
  assert.equal(again.metrics.usage.sources.length, 2);
});

test('legacy receipts without identity are counted but never merged; mismatched chains are rejected', t => {
  const root = temporary(t);
  buildArtifacts(root, { runId: 300 });
  const legacy = usageRecord({ runId: 250, start: 1 });
  const foreign = usageRecord({ runId: 260, start: 2, facts: { version: 1, runKey: `${repository}/issues/146/initial`, kind: 'initial',
    derivation: 'recorded', controlSha: 'd'.repeat(40), baseSha: null, inputHash: null } });
  const document = finalize(exportOf(root, reportFor(root, usageRecord({ runId: 300, start: 3 }), [legacy, foreign])).draft);
  assert.deepEqual(document.executions.map(e => e.runId), [300]);
  assert.ok(document.limitations.some(l => l.code === 'legacy-executions-unresolved'));
  assert.ok(document.limitations.some(l => l.code === 'chain-mismatch'));
});

test('review off, failed and partial do not change business results or turn unknown scores into zeros', t => {
  for (const state of ['not-reviewed', 'failed', 'partial']) {
    const root = temporary(t);
    buildArtifacts(root, { review: state });
    const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
    assert.equal(document.outcome.acceptance, 'passed', state);
    assert.equal(document.reviews[0].state, state);
    if (state !== 'partial') {
      assert.deepEqual(document.reviews[0].modules, []);
      assert.equal(document.precedence.reviewRubric, 0);
    } else {
      assert.equal(document.reviews[0].progress.complete, false);
      assert.ok(document.limitations.some(l => l.code === 'review-partial'));
    }
  }
  const root = temporary(t);
  buildArtifacts(root, { review: 'none' });
  const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  assert.equal(document.reviews[0].state, 'not-reviewed');
  assert.ok(document.limitations.some(l => l.code === 'review-not-run'));
});

test('missing retro keeps review findings, with separate sources; a present retro is implementer self-report', t => {
  const root = temporary(t);
  buildArtifacts(root);
  let document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  assert.equal(document.processNotes.state, 'absent');
  assert.deepEqual(kinds(document.reviews[0]), ['strength', 'misleading', 'issue']);
  const other = temporary(t);
  buildArtifacts(other, { retro: true });
  document = finalize(exportOf(other, reportFor(other, usageRecord())).draft);
  assert.equal(document.processNotes.state, 'present');
  assert.equal(document.processNotes.independent, false);
  assert.match(document.processNotes.blockers[0].id, /^notes\/run\/100\/attempt\/1\/B1$/);
  assert.equal(document.reviews[0].findings.length, 3);
});

test('complete v1 and partial v2 coexist without renaming or averaging old scores', t => {
  const root = temporary(t);
  buildArtifacts(root, { review: 'v1' });
  const supplement = writeReview(root, 'partial', {}, 'build-review.supplement.json',
    { engine: 'pi', model: 'fixture-model', version: '0.86.1', runId: '700', attempt: 1, controlSha: 'd'.repeat(40), replay: true });
  supplement.supplementalUsage = { input: 5, output: 6, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 11, records: 1, incomplete: 0, runId: 700, attempt: 1 };
  put(root, 'build-review.supplement.json', supplement);
  const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  const [current, legacy] = document.reviews;
  assert.equal(current.rubric.version, 2);
  assert.equal(current.role, 'supplement');
  assert.equal(current.state, 'partial');
  assert.equal(legacy.rubric.version, 1);
  assert.equal(legacy.role, 'legacy');
  assert.deepEqual(Object.keys(legacy.modules[0].scores), ['design', 'completeness', 'agentFriendliness', 'outputQuality']);
  assert.deepEqual(legacy.rubric.dimensions.map(d => d.key), ['design', 'completeness', 'agentFriendliness', 'outputQuality']);
  assert.notEqual(current.key, legacy.key);
  assert.ok(!JSON.stringify(document).includes('average'));
  // Reassessment keeps the original producer, adds its own reviewer and usage, and no business build.
  assert.equal(current.producer.runId, 100);
  assert.equal(current.reviewer.runId, 700);
  assert.equal(document.executions.at(-1).kind, 'review');
  assert.equal(document.metrics.counts.businessBuilds, 1);
  assert.ok(document.metrics.usage.sources.some(s => s.key === 'review-run:700:1' && s.phases.review.total === 11));
  assert.equal(document.precedence.reviewRubric, 2);
});

test('an invalid supplement stays history without scores and cannot erase the valid original', t => {
  const root = temporary(t);
  buildArtifacts(root);
  const broken = writeReview(root, 'completed', {}, 'build-review.supplement.json',
    { engine: 'pi', model: 'x', version: '1', runId: '701', attempt: 1, controlSha: 'd'.repeat(40), replay: true });
  broken.basis.patchHash = '0'.repeat(64);
  put(root, 'build-review.supplement.json', broken);
  const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  assert.equal(document.reviews[0].state, 'completed');
  assert.equal(document.reviews[0].role, 'original');
  const rejected = document.reviews.find(r => r.role === 'supplement');
  assert.equal(rejected.state, 'failed');
  assert.deepEqual(rejected.modules, []);
});

test('fingerprints ignore publication details and change with facts; late older reports lose precedence', t => {
  const root = temporary(t);
  buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const a = exportOf(root, report), b = buildEvaluation({ report, root, exporter: { controlSha: 'f'.repeat(40), runId: 901, attempt: 2 } });
  assert.equal(fingerprintEvaluation(a.draft, a.attachments), fingerprintEvaluation(b.draft, b.attachments));
  const changed = structuredClone(a.draft);
  changed.outcome.acceptance = 'failed';
  assert.notEqual(fingerprintEvaluation(changed, a.attachments), fingerprintEvaluation(a.draft, a.attachments));
  const older = finalize(a.draft, 3);
  const newer = structuredClone(older);
  newer.precedence.producer = { runId: 100, attempt: 2, startedAt: '2026-09-25T01:00:00Z' };
  newer.revision = 2;
  assert.ok(comparePrecedence(newer, older) > 0, 'a higher revision number alone does not win');
  const rubricOnly = structuredClone(older);
  rubricOnly.precedence.reviewRubric = 1;
  assert.ok(comparePrecedence(older, rubricOnly) > 0);
});

test('incremental /build tasks are separate logical runs from the original initial sample', t => {
  const root = temporary(t);
  buildArtifacts(root, { buildCommentId: 555 });
  const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  assert.equal(document.run.kind, 'incremental');
  assert.equal(document.run.task.buildCommentId, 555);
  assert.equal(document.run.key, `${repository}/issues/146/build/555`);
});

test('old metadata without identity exports legacy-derived keys; missing metadata is unresolved, never merged', t => {
  const root = temporary(t);
  buildArtifacts(root, { identity: 'legacy' });
  let document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  assert.equal(document.run.identity, 'legacy-derived');
  assert.ok(document.limitations.some(l => l.code === 'identity-legacy'));
  const empty = temporary(t);
  document = finalize(buildEvaluation({ report: { record: usageRecord(), records: [usageRecord()] }, root: empty, exporter }).draft);
  assert.equal(document.run.identity, 'unresolved');
  assert.deepEqual(document.executions.map(e => [e.runId, e.event]), [[100, 'issues']]);
  assert.equal(document.outcome.acceptance, 'unknown');
  assert.ok(document.limitations.some(l => l.code === 'metadata-missing'));
  const foreign = temporary(t);
  buildArtifacts(foreign, { issue: 999 });
  assert.throws(() => exportOf(foreign, { record: usageRecord(), records: [usageRecord()] }), /does not match/);
});

test('subject keys come from validated targets; unrecognized guidance stays unmapped', () => {
  assert.equal(subjectKeyOf({ kind: 'plugin', name: '@nocobase/app-plugin-file' }), 'pkg:@nocobase/app-plugin-file');
  assert.equal(subjectKeyOf({ kind: 'guidance', name: 'packages/@nocobase/app-plugin-scheduler/skills/nocobase-app-plugin-scheduler/SKILL.md' }),
    'guide:@nocobase/app-plugin-scheduler/skills/nocobase-app-plugin-scheduler');
  assert.equal(subjectKeyOf({ kind: 'guidance', name: 'app/.agents/skills/nocobase-app-development/references/x.md' }), 'skill:nocobase-app-development');
  assert.equal(subjectKeyOf({ kind: 'library', name: 'app/server/crm.ts' }), null);
  assert.equal(subjectKeyOf({ kind: 'guidance', name: 'app/docs/with space.md' }), null);
});

test('missing screenshots stay referenced with hashes and an explicit limitation, never silently dropped', t => {
  const root = temporary(t);
  buildArtifacts(root, { review: 'none' });
  rmSync(path.join(root, 'verify-1/browser-acceptance/evidence/b02.png'));
  const { draft, attachments } = exportOf(root, reportFor(root, usageRecord()));
  const missing = draft.evidence.find(e => e.id === 'qa/1/b02.png');
  assert.equal(missing.attachment, null);
  assert.equal(missing.availability, 'reference-only');
  assert.equal(attachments.length, 1);
  assert.ok(draft.limitations.some(l => l.code === 'evidence-omitted'));
});

test('the finalized contract rejects unscoped ids, fabricated scores and oversized documents', t => {
  const root = temporary(t);
  buildArtifacts(root);
  const document = finalize(exportOf(root, reportFor(root, usageRecord())).draft);
  const schema = loadContract('evaluation-report.v1');
  const bad = structuredClone(document);
  bad.reviews[0].modules[0].scores.design.score = 101;
  assert.ok(validateSchema(schema, bad).length);
  const extra = structuredClone(document);
  extra.featurePointId = 12;
  assert.ok(validateSchema(schema, extra).some(e => e.includes('not allowed')));
  const receiver = structuredClone(document);
  receiver.outcome.execution = 'success';
  assert.throws(() => assertSchema(schema, receiver), /contract/);
  const huge = structuredClone(exportOf(root, reportFor(root, usageRecord())).draft);
  huge.evidence = Array.from({ length: 1900 }, (_, i) => ({ ...document.evidence[0], id: `qa/9/${i}.png`, observation: 'x'.repeat(3000) }));
  assert.throws(() => finalizeEvaluation(huge, { revision: 1, createdAt: '2026-09-25T00:00:00Z' }), /refusing to truncate/);
});

test('identity comes from the prepare record; an Agent-side copy cannot claim a batch sample', t => {
  const agent = temporary(t), task = temporary(t);
  buildArtifacts(agent, { sample: { batchKey: 'b-1', caseKey: 'F00', sampleIndex: 1 } });
  let document = finalize(buildEvaluation({ report: reportFor(agent, usageRecord()), root: agent, exporter }).draft);
  assert.equal(document.run.identity, 'unresolved');
  assert.ok(document.limitations.some(l => l.code === 'identity-unverified'));
  const trusted = JSON.parse(readFileSync(path.join(agent, 'task-metadata.json')));
  put(task, 'task-metadata.json', trusted);
  document = finalize(buildEvaluation({ report: reportFor(agent, usageRecord()), root: agent, taskRoot: task, exporter }).draft);
  assert.equal(document.run.key, `${repository}/batches/b-1/F00/1`);
  assert.equal(document.run.kind, 'batch-sample');
  const forged = { ...trusted, evaluation: { ...trusted.evaluation, sampleIndex: 2, sampleKey: 'b-1/F00/2', runKey: `${repository}/batches/b-1/F00/2` } };
  put(agent, 'task-metadata.json', forged);
  document = finalize(buildEvaluation({ report: { record: usageRecord(), records: [usageRecord()] }, root: agent, taskRoot: task, exporter }).draft);
  assert.equal(document.run.key, `${repository}/batches/b-1/F00/1`, 'the prepare record wins');
  assert.ok(document.limitations.some(l => l.code === 'metadata-mismatch'));
});
