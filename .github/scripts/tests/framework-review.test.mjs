import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateBuildReview, validateEvaluation } from '../build-review.mjs';
import { renderBuildReview } from '../../reports/build-review.mjs';

const here = path.resolve(import.meta.dirname, '../../reports');
const fixture = () => JSON.parse(readFileSync(path.join(here, 'example.framework-review.json'), 'utf8'));
const check = review => validateEvaluation(review, review.inputHash);

test('v2 assesses concrete framework targets, preserving unknown implementation coverage', () => {
  const report = fixture(); validateBuildReview(report, report.basis);
  assert.equal(report.evaluation.version, 2);
  assert.equal(report.evaluation.modules[0].scores.completeness.score, null);
});
for (const key of ['requirementFit', 'usability', 'agentFriendliness', 'design', 'completeness']) {
  test(`${key} cannot score the framework using application evidence alone`, () => {
    const review = fixture().evaluation;
    review.modules[0].scores[key] = { score: 99, reason: 'The application passed', evidence: ['E1'] };
    assert.throws(() => check(review), /direct framework\/guide evidence/);
  });
}
test('a target must cite its own package/guide, not an unrelated library or manifest', () => {
  let review = fixture().evaluation;
  review.modules[0].targets[0].id = '@nocobase/unrelated';
  assert.throws(() => check(review), /Target evidence/);
  review = fixture().evaluation;
  review.evidence.find(e => e.id === 'E4').path = 'packages/@nocobase/example/package.json';
  assert.throws(() => check(review), /Target evidence/);
  review = fixture().evaluation;
  review.modules[1].targets[0].evidence = ['E4'];
  assert.throws(() => check(review), /Target evidence/);
});
test('types cannot stand in for actual framework implementation coverage', () => {
  const review = fixture().evaluation;
  review.modules[0].scores.completeness = { score: 99, reason: 'Only types were read', evidence: ['E4'] };
  assert.throws(() => check(review), /implementation or tests/);
});
test('requirement fit needs the scenario as well as the actual framework API', () => {
  const review = fixture().evaluation;
  review.modules[0].scores.requirementFit.evidence = ['E4'];
  assert.throws(() => check(review), /scenario observation/);
});
test('unknown capability cannot have an invented fit score; non-use is independent', () => {
  let review = fixture().evaluation;
  review.modules[0].capability.status = 'unknown';
  assert.throws(() => check(review), /Unknown capability/);
  review = fixture().evaluation;
  review.modules[0].capability.adoption = 'not-used';
  check(review); // Static API evidence may exist without adoption; no automatic deduction.
});
test('application output quality must remain outside framework scores', () => {
  const review = fixture().evaluation;
  review.modules[0].scores.outputQuality = review.modules[0].applicationOutcome;
  assert.throws(() => check(review), /Application outcome/);
});
test('missing framework material stays unknown rather than manufacturing a new package', () => {
  const review = fixture().evaluation;
  const module = review.modules[0];
  module.targets[0].evidence = [];
  module.capability = { status: 'unknown', adoption: 'unknown', reason: 'Package source unavailable', evidence: [] };
  for (const key of Object.keys(module.scores)) module.scores[key] = { score: null, reason: 'Source unavailable', evidence: [] };
  check(review);
  module.targets = [];
  assert.throws(() => check(review), /explicit library/);
});
test('rubric versions cannot be relabeled to upgrade old mixed scores', () => {
  const legacy = JSON.parse(readFileSync(path.join(here, 'example.review.json'), 'utf8'));
  validateBuildReview(legacy);
  legacy.basis.rubricVersion = 2;
  assert.throws(() => validateBuildReview(legacy), /recorded rubric/);
  const legacyHtml = renderBuildReview(JSON.parse(readFileSync(path.join(here, 'example.review.json'), 'utf8')));
  assert.match(legacyHtml, /历史混合口径/);
  assert.match(legacyHtml, /Agent 产出质量/);
  assert.doesNotMatch(legacyHtml, /<th>需求满足度<\/th>/);
});
test('primary matrix shows framework fit/usability/friendliness, not app score or QA', () => {
  const report = fixture();
  report.evaluation.findings.push({ id: 'F99', kind: 'issue', owner: 'application', severity: 'minor', confidence: 'suspected', status: 'open',
    title: 'APPLICATION_ONLY_SENTINEL', detail: 'Application error, not automatically a framework defect', impact: 'Application screen', suggestedChange: 'Fix business call site', evidence: ['E1'] });
  const html = renderBuildReview(report);
  const main = html.slice(html.indexOf('review-matrix'), html.indexOf('</table>', html.indexOf('review-matrix')));
  for (const label of ['需求满足度', '开发易用性', 'Agent 友好度', '@nocobase/example']) assert.ok(main.includes(label));
  for (const label of ['首轮 QA', '最终轮 QA', '应用产出质量', 'Agent 产出质量']) assert.ok(!main.includes(label));
  assert.match(html, /框架设计合理性/); assert.match(html, /框架实现完整性/);
  const frameworkFeedback = html.slice(html.indexOf('id="framework-feedback"'), html.indexOf('id="application-observations"'));
  assert.doesNotMatch(frameworkFeedback, /APPLICATION_ONLY_SENTINEL/);
  assert.match(html.slice(html.indexOf('id="application-observations"')), /APPLICATION_ONLY_SENTINEL/);
  assert.match(html, /首轮 QA/); assert.match(html, /最终轮 QA/);
});
test('framework target names, API and capability text are escaped', () => {
  const report = fixture(); report.evaluation.modules[0].targets[0].api = '<img src=x onerror=alert(1)>';
  const html = renderBuildReview(report);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img src=x/);
});
test('prompt keeps framework attribution, evidence boundaries and checkpoint budget explicit', () => {
  const prompt = readFileSync(path.resolve(here, '../prompts/build-review.md'), 'utf8');
  for (const term of ['内部库', '内置插件', 'requirementFit', 'usability', 'agentFriendliness', 'applicationOutcome', '未使用', 'workaround', 'assessment.tmp.json', '{{BUDGET_SECONDS}}']) assert.ok(prompt.includes(term), term);
});

test('confirmed framework findings need framework evidence, not merely implementer claims', () => {
  const review = fixture().evaluation;
  review.findings.push({ id: 'F99', kind: 'issue', owner: 'framework', severity: 'major', confidence: 'confirmed', status: 'open',
    title: 'Claimed framework bug', detail: 'Implementer said so', impact: 'Repair', suggestedChange: 'Investigate the actual library', evidence: ['E1'] });
  assert.throws(() => check(review), /Confirmed framework findings/);
  review.findings.at(-1).confidence = 'suspected';
  check(review);
});
