import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dimensionsFor, loadBuildReview, rubricVersion, validateBuildReview, validateEvaluation } from '../build-review.mjs';
import { renderHtml } from '../../reports/render-report.mjs';

const reports = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name = 'example.framework-review.json') => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
const validate = evaluation => validateEvaluation(evaluation, evaluation.inputHash);

test('framework rubric has five framework dimensions; legacy four keep their original meanings', () => {
  assert.equal(rubricVersion, 2);
  assert.deepEqual(Object.keys(dimensionsFor(2)), ['requirementFit', 'usability', 'agentFriendliness', 'design', 'reliability']);
  assert.equal(dimensionsFor(1).outputQuality, 'Agent 产出质量');
  assert.throws(() => dimensionsFor(3), /Unsupported/);
  const report = fixture(); validateBuildReview(report);
  assert.throws(() => validateEvaluation(report.evaluation, report.basis.inputHash, undefined, 1), /identity/);
  const legacy = fixture('example.review.json'); validateBuildReview(legacy);
  legacy.basis.rubricVersion = 2;
  assert.throws(() => validateBuildReview(legacy), /identity/);
});

test('v2 cannot relabel the old outputQuality field or silently omit a framework dimension', () => {
  const review = fixture().evaluation;
  review.modules[0].scores.outputQuality = review.modules[0].scores.requirementFit;
  assert.throws(() => validate(review), /five dimensions/);
  delete review.modules[0].scores.outputQuality;
  delete review.modules[0].scores.usability;
  assert.throws(() => validate(review), /five dimensions/);
});

test('each capability unit names exact NocoBase3 targets and a requirement-to-capability mapping', () => {
  let review = fixture().evaluation;
  review.modules[0].targets = [];
  assert.throws(() => validate(review), /explicit library/);
  review = fixture().evaluation;
  review.modules[0].targets[0].name = 'app/server/crm.ts';
  assert.throws(() => validate(review), /NocoBase3 package/);
  review = fixture().evaluation;
  review.modules[0].requirements = [];
  assert.throws(() => validate(review), /requirement-to-capability/);
  review = fixture().evaluation;
  delete review.modules[0].requirements[0].responsibility;
  assert.throws(() => validate(review), /responsibility/);
});

test('all five numeric dimensions require declared framework evidence, not just business code or QA', () => {
  for (const key of Object.keys(dimensionsFor(2))) {
    const review = fixture().evaluation;
    review.modules[0].scores[key].evidence = ['E3', 'E4'];
    assert.throws(() => validate(review), /numeric framework score requires evidence/);
  }
  const review = fixture().evaluation;
  review.modules[0].targets[0].evidence = ['E3'];
  review.evidence.find(e => e.id === 'E3').kind = 'package';
  assert.throws(() => validate(review), /Target evidence/);
});

test('package manifests identify versions, not behavior; guidance paths cannot be business files', () => {
  let review = fixture().evaluation;
  review.evidence[0].path = 'packages/@nocobase/example-data/package.json';
  assert.throws(() => validate(review), /Target evidence/);
  review = fixture().evaluation;
  review.modules[0].targets[1].name = 'app/server/customers.ts';
  assert.throws(() => validate(review), /Guidance target/);
  review = fixture().evaluation;
  review.modules[0].targets[0].name = '@nocobase/some-other-library';
  assert.throws(() => validate(review), /Target evidence/);
});

test('declarations or documentation plus successful QA cannot claim library implementation reliability', () => {
  const review = fixture().evaluation;
  const module = review.modules[1];
  module.scores.reliability = { score: 90, reason: 'QA passed', evidence: ['E5', 'E6', 'E4'] };
  assert.throws(() => validate(review), /implementation evidence/);
  module.scores.reliability.score = null;
  assert.doesNotThrow(() => validate(review));
});

test('unknown and out-of-scope needs cannot receive a fit score; normal business composition is explicit', () => {
  const review = fixture().evaluation, module = review.modules[0];
  assert.equal(module.requirements[0].support, 'composition');
  assert.equal(module.requirements[0].gapOwner, 'none');
  for (const support of ['unknown', 'out-of-scope']) {
    module.requirements[0].support = support;
    assert.throws(() => validate(review), /cannot receive a fit score/);
  }
  module.scores.requirementFit.score = null;
  assert.doesNotThrow(() => validate(review));
  module.requirements[0].support = 'workaround';
  assert.throws(() => validate(review), /gap needs attribution/);
  module.requirements[0].gapOwner = 'unknown';
  assert.doesNotThrow(() => validate(review));
});

test('v2 progress remains explicit and missing source coverage permits null scores, never fabricated defaults', () => {
  const review = fixture().evaluation;
  delete review.progress;
  assert.throws(() => validate(review), /explicit progress/);
  review.progress = { complete: false, pendingModules: ['Unreviewed capability'] };
  const module = review.modules[0];
  module.targets.forEach(target => { target.evidence = []; });
  review.findings = []; // No confirmed feedback when its framework sources were not captured.
  Object.values(module.scores).forEach(score => { score.score = null; score.reason = 'Framework source was not captured'; score.evidence = []; });
  assert.doesNotThrow(() => validate(review));
});

test('v2 renders three primary scores, framework targets and support mapping; app findings stay separate', async () => {
  const facts = fixture('example.facts.json'); facts.buildReview = fixture();
  facts.buildReview.evaluation.modules[0].requirements[0].need = '<img src=x onerror=alert(1)>';
  const { html } = await renderHtml(facts, null, reports);
  const matrix = html.split('class="card table-wrap review-matrix framework-matrix"')[1].split('</table>')[0];
  for (const label of ['需求满足度', '使用便利度', 'Agent 友好度']) assert.ok(matrix.includes(label));
  assert.doesNotMatch(matrix, /首轮 QA|最终轮 QA|Agent 产出质量|实现完整性/);
  for (const label of ['@nocobase/example-data', '0.0.0-fixture', '框架职责与业务边界', '正常组合', '业务首轮 QA', '业务最终轮 QA', '业务实现与执行环境观察 · 不计入框架得分', '业务界面观察 · 非框架评分']) assert.ok(html.includes(label), label);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.ok(html.indexOf('业务调用位置错误（不直接扣框架分）') > html.indexOf('业务实现与执行环境观察 · 不计入框架得分'));
  assert.equal(facts.checks[0].status, 'failed');
});

test('legacy rendering preserves actual scores and says not to reuse them as framework fit/usability', async () => {
  const facts = fixture('example.facts.json'); facts.buildReview = fixture('example.review.json');
  const before = JSON.stringify(facts.buildReview);
  const { html } = await renderHtml(facts, null, reports);
  assert.match(html, /旧口径 v1 · 不作为新框架评分/);
  assert.match(html, /<th>Agent 产出质量<\/th>/);
  assert.doesNotMatch(html, /<th>需求满足度<\/th>/);
  assert.equal(JSON.stringify(facts.buildReview), before);
});

test('new partial rubric may coexist with complete v1, without downgrading v2 on a stale replay', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'framework-rubric-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const old = fixture('example.review.json'), next = fixture();
  next.state = 'partial'; next.evaluation.progress = { complete: false, pendingModules: ['Next module'] };
  const save = (name, report) => writeFileSync(path.join(root, name), JSON.stringify(report));
  save('build-review.json', old); save('build-review.supplement.json', next);
  let loaded = loadBuildReview(root);
  assert.equal(loaded.state, 'partial'); assert.equal(loaded.basis.rubricVersion, 2);
  assert.deepEqual(loaded.legacyReview, old);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'build-review.json'))), old);
  save('build-review.json', next); save('build-review.supplement.json', old);
  loaded = loadBuildReview(root);
  assert.equal(loaded.basis.rubricVersion, 2);
});

test('a malformed original cannot prevent a valid new assessment from being adopted', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'framework-rubric-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'verify-1'));
  writeFileSync(path.join(root, 'build-review.json'), JSON.stringify({ state: 'completed' }));
  writeFileSync(path.join(root, 'build-review.supplement.json'), JSON.stringify(fixture()));
  assert.equal(loadBuildReview(root).basis.rubricVersion, 2);
});

test('default example and runner use v2; only explicit legacy preview uses v1', () => {
  const runner = readFileSync(new URL('../run-build-review.mjs', import.meta.url), 'utf8');
  const prompt = readFileSync(new URL('../../prompts/build-review.md', import.meta.url), 'utf8');
  assert.match(runner, /import \{ finalizeAssessment \} from '\.\/check-review-draft\.mjs'/);
  const checker = readFileSync(new URL('../check-review-draft.mjs', import.meta.url), 'utf8');
  assert.match(checker, /validateEvaluation\(raw, basis\.inputHash, captured\.files, basis\.rubricVersion\)/);
  assert.match(runner, /version: rubricVersion, inputHash/);
  for (const phrase of ['业务需求是测试场景', '正常编写业务规则', '不能仅凭错误次数', '旧 task.reviewCriteria']) {
    assert.ok(prompt.includes(phrase), phrase);
  }
  assert.doesNotMatch(prompt, /"outputQuality"\s*:/);
});


test('confirmed framework feedback cannot rely solely on author reports; suspected attribution remains possible', () => {
  const review = fixture().evaluation;
  review.findings[0].evidence = ['E3', 'E4'];
  assert.throws(() => validate(review), /Confirmed framework feedback/);
  review.findings[0].confidence = 'suspected';
  assert.doesNotThrow(() => validate(review));
});

test('v2 report binds scored package identities and explicit completion', () => {
  const report = fixture();
  report.basis.packages = [];
  assert.throws(() => validateBuildReview(report), /was not installed/);
  const next = fixture();
  next.evaluation.progress = { complete: false, pendingModules: ['Unreviewed capability'] };
  assert.throws(() => validateBuildReview(next), /unfinished progress/);
  next.state = 'partial';
  assert.doesNotThrow(() => validateBuildReview(next));
});
