import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectReviewProcess, digest, loadBuildReview, moduleRoundResult, validateBuildReview, validateEvaluation } from '../build-review.mjs';
import { createReviewSnapshot, materializeEvidence, runBuildReview } from '../run-build-review.mjs';
import { aggregate, collectUsage, emptyUsage, validateRecord } from '../task-usage.mjs';
import { makeDeliveryReport } from '../delivery-report.mjs';
import { renderHtml } from '../../reports/render-report.mjs';

const here = path.resolve(import.meta.dirname, '../..');
const example = () => JSON.parse(readFileSync(path.join(here, 'reports/example.review.json'), 'utf8'));
const facts = () => JSON.parse(readFileSync(path.join(here, 'reports/example.facts.json'), 'utf8'));
const put = (root, relative, content) => {
  const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  return file;
};
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'build-review-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), artifacts = path.join(root, 'artifacts'), snapshot = path.join(root, 'snapshot');
  mkdirSync(workspace); mkdirSync(artifacts); mkdirSync(snapshot);
  const source = put(workspace, 'server/customer.ts', 'export const customer = 1;\n');
  put(workspace, 'package.json', { name: 'review-fixture' });
  put(workspace, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
  put(workspace, '.gitignore', 'node_modules\n.env\n');
  put(workspace, '.agents/skills/example/SKILL.md', '# Installed guidance\nUse customer.\n');
  put(workspace, 'config.yml', 'auth: { secret: must-not-reach-review }\n');
  execFileSync('git', ['init', '-q'], { cwd: workspace });
  execFileSync('git', ['add', '.'], { cwd: workspace });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'fixture'], { cwd: workspace });
  put(workspace, 'node_modules/@nocobase/example/package.json', { name: '@nocobase/example', version: '3.0.0-fixture' });
  put(workspace, 'node_modules/@nocobase/example/dist/index.d.ts', 'export declare const customer: number;\n');
  const metadata = { repository: 'owner/factory', issue: { number: 21 }, task: { requirements: 'Manage customers', reviewCriteria: 'Review used modules independently' } };
  put(artifacts, 'task-metadata.json', metadata);
  put(artifacts, 'agent.patch', 'sealed fixture patch\n');
  put(artifacts, 'repair-summary.json', { verificationAttempts: 2, repairAttempts: 1, finalVerificationAttempt: 2 });
  for (const [round, status] of [[1, 'failed'], [2, 'passed']]) put(artifacts, `verify-${round}/browser-acceptance/report.json`, {
    passed: status === 'passed', checks: [{ id: 'B01', criterion: 'Create customer', status, actions: ['Click save'], evidence: ['Observed result'], screenshots: [] }],
  });
  const env = { ...process.env, GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1', FACTORY_CONTROL_SHA: 'b'.repeat(40), FACTORY_BUILD_REVIEW: 'full',
    CODE_AGENT_ENGINE: 'pi', CODE_AGENT_API_KEY: 'private-review-fixture-key', CODE_AGENT_API_ENDPOINT: 'https://fixture.invalid/v1', CODE_AGENT_MODEL: 'fixture-model' };
  delete env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS; delete env.FACTORY_AGENT_INSTALL_RECORD;
  return { root, workspace, artifacts, snapshot, source, metadata, env };
}
function installMock(f, behavior = 'success') {
  const bin = path.join(f.root, 'bin'); mkdirSync(bin);
  put(bin, 'pi', `#!/usr/bin/env node
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync('review-input.json', 'utf8'));
if (process.env.FACTORY_AGENT_ROLE !== 'review' || process.env.GITHUB_TOKEN || process.env.FACTORY_ADMIN_PASSWORD) process.exit(7);
const score = {score:73,reason:'Fixture framework contract and usage',evidence:['E2','E1']};
const review = {version:input.rubricVersion,inputHash:input.basis.inputHash,progress:{complete:true,pendingModules:[]},summary:'Fixture-only review',
 modules:[{name:'Data access',scope:'Customer creation',limitations:'No concurrency coverage',criteria:['B01'],
 targets:[{kind:'library',name:'@nocobase/example',entrypoints:['customer'],evidence:['E2']}],
 requirements:[{need:'Create customer',responsibility:'Framework supplies data contract, application supplies customer rules',support:'composition',recommendedUsage:'Use the declared customer value',actualUsage:'Uses customer in application',gapOwner:'none',evidence:['E1','E2']}],
 scores:{requirementFit:score,usability:score,design:score,reliability:{score:null,reason:'No implementation coverage',evidence:[]},agentFriendliness:score}}],
 findings:[],ui:{status:'not-reviewed',score:null,reason:'No image inspection',evidence:[]},
 evidence:[{id:'E1',kind:'code',path:'app/server/customer.ts',lines:[1,1],observation:'Read actual captured source',excerpt:'MODEL FABRICATION',mediaId:'MODEL FABRICATION'}, {id:'E2',kind:'package',path:'packages/@nocobase/example/dist/index.d.ts',lines:[1,1],observation:'Read framework declaration'}],limitations:[]};
if (${JSON.stringify(behavior)} === 'old-rubric') review.version = 1;
if (${JSON.stringify(behavior)} === 'wrong-hash') review.inputHash = 'c'.repeat(64);
if (${JSON.stringify(behavior)} === 'modify') {fs.chmodSync('app/server/customer.ts',0o600);fs.writeFileSync('app/server/customer.ts','modified');}
fs.writeFileSync('assessment.json', ${JSON.stringify(behavior)} === 'malformed' ? '{oops' : JSON.stringify(review));
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',usage:{input:100,output:20,cacheRead:5,cacheWrite:0,totalTokens:125}}}));
console.log(JSON.stringify({type:'agent_end'}));
`);
  chmodSync(path.join(bin, 'pi'), 0o755);
  f.env.PATH = `${bin}:${process.env.PATH}`;
}

test('rubric accepts numeric scores and explicit unknowns, never boolean or fabricated defaults', () => {
  const report = example(); validateBuildReview(report, report.basis);
  for (const bad of [-1, 101, 80.5, true, '85', undefined]) {
    const review = example().evaluation; review.modules[0].scores.design.score = bad;
    assert.throws(() => validateEvaluation(review, review.inputHash), /score/);
  }
  const review = example().evaluation; review.modules[0].scores.design.evidence = [];
  assert.throws(() => validateEvaluation(review, review.inputHash), /requires evidence/);
});
test('unknown evidence, missing misleading comparison and uninspected UI fail explicitly', () => {
  let review = example().evaluation; review.modules[0].scores.design.evidence = ['E999'];
  assert.throws(() => validateEvaluation(review, review.inputHash), /Unknown evidence/);
  review = example().evaluation; delete review.findings.find(f => f.kind === 'misleading').claimed;
  assert.throws(() => validateEvaluation(review, review.inputHash), /claimed/);
  review = example().evaluation; review.ui.score = 99;
  assert.throws(() => validateEvaluation(review, review.inputHash), /evidence|Unreviewed/);
  review = example().evaluation; review.ui.status = 'reviewed';
  assert.throws(() => validateEvaluation(review, review.inputHash), /two actual screenshots/);
});
test('snapshot captures installed versions and Skill, omits credentials, and never links to original source', t => {
  const f = fixture(t); put(f.workspace, '.env', 'SECRET=not-for-review');
  symlinkSync(f.source, path.join(f.workspace, 'linked.ts'));
  const captured = createReviewSnapshot(f.workspace, f.artifacts, f.snapshot);
  assert.ok(captured.files.some(file => file.path === 'app/.agents/skills/example/SKILL.md'));
  assert.ok(captured.files.some(file => file.path === 'packages/@nocobase/example/dist/index.d.ts'));
  assert.deepEqual(captured.packages, [{ name: '@nocobase/example', version: '3.0.0-fixture' }]);
  assert.equal(captured.files.some(file => /config.yml|\.env|linked.ts/.test(file.path)), false);
  chmodSync(path.join(f.snapshot, 'app/server/customer.ts'), 0o600);
  put(f.snapshot, 'app/server/customer.ts', 'edited copy');
  assert.equal(readFileSync(f.source, 'utf8'), 'export const customer = 1;\n');
});
test('path and line references are checked against captured files; excerpts are extracted, not model-supplied', t => {
  const f = fixture(t), captured = createReviewSnapshot(f.workspace, f.artifacts, f.snapshot);
  const review = { version: 1, inputHash: 'a'.repeat(64), summary: 'Fixture', modules: [], findings: [], limitations: [],
    ui: { status: 'not-reviewed', score: null, reason: 'No images', evidence: [] },
    evidence: [{ id: 'E1', kind: 'code', path: 'app/server/customer.ts', lines: [1, 1], observation: 'A declaration', excerpt: 'invented', mediaId: 'invented' }] };
  validateEvaluation(review, review.inputHash, captured.files);
  const resolved = materializeEvidence(review, f.snapshot, captured.files);
  assert.equal(resolved.evidence[0].excerpt, 'export const customer = 1;');
  assert.equal(resolved.evidence[0].sha256, digest(readFileSync(f.source)));
  assert.equal(resolved.evidence[0].mediaId, undefined);
  review.evidence[0].lines = [1, 999]; assert.throws(() => validateEvaluation(review, review.inputHash, captured.files), /line/);
  review.evidence[0].path = 'app/../secret'; assert.throws(() => validateEvaluation(review, review.inputHash, captured.files), /path/);
});
test('process retains original failure; focused QA and a resumed Run cannot stand in for first/full QA', t => {
  const f = fixture(t), module = { criteria: ['B01'] };
  let process = collectReviewProcess(f.artifacts);
  assert.equal(moduleRoundResult(module, process, 1), 'failed');
  assert.equal(moduleRoundResult(module, process, 2), 'passed');
  rmSync(path.join(f.artifacts, 'verify-1'), { recursive: true });
  rmSync(path.join(f.artifacts, 'verify-2'), { recursive: true });
  put(f.artifacts, 'verify-7/browser-focused/report.json', { passed: true, checks: [{ id: 'B01', status: 'passed' }] });
  put(f.artifacts, 'repair-summary.json', { verificationAttempts: 1, repairAttempts: 0, finalVerificationAttempt: 7 });
  process = collectReviewProcess(f.artifacts);
  assert.equal(moduleRoundResult(module, process, 1), 'unknown');
  assert.equal(moduleRoundResult(module, process, 7), 'unknown');
  assert.equal(process.verificationAttempts, 1);
});
test('missing, malformed and stale review cannot add scores or erase original process', t => {
  const f = fixture(t), identity = { repository: 'owner/factory', issue: 21, runId: 100, attempt: 1 };
  assert.equal(loadBuildReview(f.artifacts, identity).state, 'not-reviewed');
  put(f.artifacts, 'build-review.json', '{broken');
  assert.equal(loadBuildReview(f.artifacts, identity).state, 'failed');
  put(f.artifacts, 'build-review.json', example());
  const report = loadBuildReview(f.artifacts, identity);
  assert.equal(report.evaluation, null); assert.equal(report.process.rounds[0].reports[0].checks[0].status, 'failed');
});
test('full independent mock CLI path records provenance, real excerpts and separate usage, without changing sealed patch', async t => {
  const f = fixture(t); installMock(f);
  f.env.GITHUB_TOKEN = 'never-give-reviewer-publication-rights'; f.env.FACTORY_ADMIN_PASSWORD = 'private-test-password';
  const report = await runBuildReview(f.workspace, f.artifacts, f.env);
  assert.equal(report.state, 'completed', report.reason);
  assert.equal(report.evaluation.modules[0].scores.design.score, 73);
  assert.equal(report.evaluation.evidence[0].excerpt, 'export const customer = 1;');
  assert.equal(report.evaluation.evidence[0].mediaId, undefined);
  assert.match(report.basis.baseSha, /^[a-f0-9]{40}$/);
  assert.equal(report.basis.patchHash, digest('sealed fixture patch\n'));
  assert.equal(report.basis.packages[0].version, '3.0.0-fixture');
  assert.equal(readFileSync(path.join(f.artifacts, 'agent.patch'), 'utf8'), 'sealed fixture patch\n');
  const usage = await collectUsage(f.artifacts);
  assert.equal(usage.phases.review.totalTokens, 125); assert.equal(usage.phases.implementation.totalTokens, 0);
  const normalized = JSON.parse(readFileSync(path.join(f.artifacts, 'agent-review.jsonl.result.json'), 'utf8'));
  assert.equal(normalized.version, 1); assert.equal(normalized.role, 'review');
  const record = { version: 1, repository: 'owner/factory', issue: 21, runId: 100, attempt: 1, status: 'delivered', start: 1, end: 2, jobs: [], agentJobId: null, usage };
  const result = await makeDeliveryReport({ record, records: [record], cumulative: aggregate([record]), timings: [] }, f.artifacts);
  assert.match(result.html, /独立 Agent 评审/); assert.match(result.html, /73<small>/);
  assert.equal(result.facts.buildReview.process.rounds[0].reports[0].checks[0].status, 'failed');
});
for (const behavior of ['wrong-hash', 'modify', 'malformed', 'old-rubric']) test(`review ${behavior} fails softly and keeps delivery intact`, async t => {
  const f = fixture(t); installMock(f, behavior);
  const result = await runBuildReview(f.workspace, f.artifacts, f.env);
  assert.equal(result.state, 'failed'); assert.equal(result.evaluation, null);
  assert.equal(readFileSync(f.source, 'utf8'), 'export const customer = 1;\n');
  assert.equal(readFileSync(path.join(f.artifacts, 'agent.patch'), 'utf8'), 'sealed fixture patch\n');
  assert.equal((await collectUsage(f.artifacts)).phases.review.totalTokens, 125);
});
test('disabled and exhausted-budget runs do not invoke any CLI or invent scores', async t => {
  for (const setting of [{ FACTORY_BUILD_REVIEW: 'off' }, { FACTORY_RUN_DEADLINE_EPOCH_SECONDS: String(Math.floor(Date.now() / 1000) + 10) }]) {
    const f = fixture(t);
    const result = await runBuildReview(f.workspace, f.artifacts, { ...f.env, ...setting });
    assert.equal(result.state, 'not-reviewed'); assert.equal(result.evaluation, null);
    assert.equal(existsSync(path.join(f.artifacts, 'agent-review.jsonl')), false);
  }
});
test('old usage receipts still aggregate, without adding a fictitious reviewer invocation', () => {
  const usage = emptyUsage(); delete usage.phases.review;
  const record = { version: 1, repository: 'owner/factory', issue: 21, runId: 100, attempt: 1, start: 1, end: 2, jobs: [], agentJobId: null, usage };
  validateRecord(record, 'owner/factory', 21);
  assert.equal(record.usage.phases.review.totalTokens, 0); assert.equal(aggregate([record]).total, 0);
});
test('shared HTML includes independent scores, unknowns, first failure and positive/negative feedback, while escaping all text', async () => {
  const f = facts(); f.buildReview = example();
  f.buildReview.evaluation.findings[0].title = '<img src=x onerror=alert(1)>';
  const result = await renderHtml(f, null, path.join(here, 'reports'));
  for (const text of ['模块评审', '做得好的地方', '误导或明显错误', '文档 / API 声称', '实际观察', '未评估', '首轮 QA', '最终轮 QA', '证据与原文']) assert.ok(result.html.includes(text), text);
  assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(result.html, /<img src=x/);
  assert.equal(f.checks[0].status, 'failed');
});
test('review execution is wired after patch seal, before artifact upload and never gates publication', () => {
  const workflow = readFileSync(path.join(here, 'workflows/code-agent-task.yml'), 'utf8');
  const start = workflow.indexOf('- name: Review build quality and framework feedback');
  assert.ok(start > workflow.indexOf('pipeline-state.mjs seal'));
  assert.ok(start < workflow.indexOf('- name: Upload Code Agent patch and diagnostics'));
  const step = workflow.slice(start, workflow.indexOf('- name: Prepare runner handoff metadata', start));
  assert.match(step, /continue-on-error: true/); assert.match(step, /!cancelled\(\)/);
  assert.match(step, /handoff != 'true'/); assert.match(step, /env: \*agent-run-env/);
});

test('publication retry keeps producer attempt and requires matching metadata, patch, rubric and QA', async t => {
  const f = fixture(t); installMock(f);
  f.metadata.run = { id: 100, attempt: 1 };
  f.metadata.controlSha = f.env.FACTORY_CONTROL_SHA;
  f.metadata.applicationBase = { sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.workspace, encoding: 'utf8' }).trim() };
  put(f.artifacts, 'task-metadata.json', f.metadata);
  const original = await runBuildReview(f.workspace, f.artifacts, f.env);
  const identity = { repository: 'owner/factory', issue: 21, runId: 100, attempt: 2 };
  const adopted = loadBuildReview(f.artifacts, identity);
  assert.equal(adopted.state, 'completed', adopted.reason); assert.equal(adopted.basis.attempt, 1);
  assert.equal(loadBuildReview(f.artifacts, { ...identity, runId: 101 }).evaluation, null);
  assert.equal(loadBuildReview(f.artifacts, { ...identity, attempt: 0 }).evaluation, null);
  put(f.artifacts, 'agent.patch', 'different candidate');
  assert.match(loadBuildReview(f.artifacts, identity).reason, /patch mismatch/);
  put(f.artifacts, 'agent.patch', 'sealed fixture patch\n');
  put(f.artifacts, 'verify-1/browser-acceptance/report.json', { passed: true, checks: [] });
  assert.match(loadBuildReview(f.artifacts, identity).reason, /evidence fingerprint mismatch/);
  assert.equal(original.evaluation.modules[0].scores.design.score, 73);
});

test('legacy timeout diagnostic is preserved across publication retry, never promoted to scores', t => {
  const f = fixture(t);
  f.metadata.run = { id: 100, attempt: 1 }; f.metadata.controlSha = 'b'.repeat(40);
  put(f.artifacts, 'task-metadata.json', f.metadata);
  put(f.artifacts, 'build-review.json', { version: 1, state: 'failed', reason: 'Original timeout', evaluation: null,
    basis: { repository: 'owner/factory', issue: 21, runId: '100', attempt: 1, controlSha: f.metadata.controlSha } });
  const report = loadBuildReview(f.artifacts, { repository: 'owner/factory', issue: 21, runId: 100, attempt: 2 });
  assert.equal(report.reason, 'Original timeout'); assert.equal(report.evaluation, null);
});

test('compact entry is fingerprinted and excludes full catalog; replay preserves original installation', async t => {
  const f = fixture(t); installMock(f);
  const original = await runBuildReview(f.workspace, f.artifacts, f.env);
  const input = readReviewJsonForTest(f.artifacts, 'build-review-input.json');
  assert.equal(input.files, undefined); assert.equal(input.catalog.path, 'review-files.json');
  assert.ok(input.catalog.count > 0); assert.equal(input.budgetSeconds, 900);
  const source = { ...original.basis };
  const replay = await runBuildReview(f.workspace, f.artifacts, { ...f.env, GITHUB_RUN_ID: '200', GITHUB_RUN_ATTEMPT: '1' }, { source });
  assert.equal(replay.state, 'completed', replay.reason);
  assert.equal(replay.basis.runId, '100'); assert.equal(replay.reviewer.runId, '200');
  assert.equal(replay.reviewer.replay, true);
  put(f.workspace, 'pnpm-lock.yaml', 'changed lockfile');
  assert.match((await runBuildReview(f.workspace, f.artifacts, f.env, { source })).reason, /lockfile differs/);
});
const readReviewJsonForTest = (root, name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));

test('budget exhaustion preserves only a valid evidenced checkpoint as partial', async t => {
  const { finalizeAssessment } = await import('../run-build-review.mjs');
  const f = fixture(t); installMock(f);
  const original = await runBuildReview(f.workspace, f.artifacts, f.env);
  const captured = createReviewSnapshot(f.workspace, f.artifacts, f.snapshot);
  put(f.snapshot, 'assessment.json', original.evaluation);
  const partial = finalizeAssessment(f.snapshot, captured, original.basis, false);
  assert.equal(partial.partial, true); assert.equal(partial.evaluation.modules[0].scores.design.score, 73);
  const report = { ...original, state: 'partial', evaluation: partial.evaluation };
  validateBuildReview(report);
  const view = facts(); view.buildReview = report;
  const rendered = await renderHtml(view, null, path.join(here, 'reports'));
  assert.match(rendered.html, /部分评审 · 尚未全覆盖/); assert.match(rendered.html, /73<small>/);
  put(f.snapshot, 'assessment.json', { ...original.evaluation, evidence: [] });
  assert.throws(() => finalizeAssessment(f.snapshot, captured, original.basis, false), /Unknown evidence/);
  put(f.snapshot, 'assessment.json', { ...original.evaluation, inputHash: '0'.repeat(64) });
  assert.throws(() => finalizeAssessment(f.snapshot, captured, original.basis, false), /identity mismatch/);
  put(f.snapshot, 'assessment.json', { ...original.evaluation, modules: [], evidence: [] });
  assert.throws(() => finalizeAssessment(f.snapshot, captured, original.basis, false), /No assessed module/);
});

test('new assessment revision changes the public HTML identity for the same publication attempt', async () => {
  const f = facts(); f.buildReview = example();
  const original = await renderHtml(f, null, path.join(here, 'reports'));
  f.buildReview.evaluation.modules[0].scores.design.score = 66;
  const updated = await renderHtml(f, null, path.join(here, 'reports'));
  assert.notEqual(original.reportId, updated.reportId);
});

test('malformed supplemental JSON cannot erase an already valid original assessment', async t => {
  const f = fixture(t); installMock(f);
  await runBuildReview(f.workspace, f.artifacts, f.env);
  put(f.artifacts, 'build-review.supplement.json', '{broken');
  const report = loadBuildReview(f.artifacts, { repository: 'owner/factory', issue: 21, runId: 100, attempt: 1 });
  assert.equal(report.state, 'completed'); assert.ok(report.process.warnings.some(w => /后补评审未采用/.test(w)));
});
