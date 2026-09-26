import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderHtml } from '../../reports/render-report.mjs';
import { validateBuildReview } from '../build-review.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const section = (html, id) =>
  html
    .split(`<section class="section" id="${id}">`)[1]
    ?.split('</section>')[0] ?? '';
const diagnostic = () => ({
  category: 'guidance-gap',
  trigger: '依照示例接入弹窗',
  expected: '示例完整列出上下文前提',
  actual: '示例省略上下文',
  workaround: '应用将调用移动到 Provider 内，代价未测量',
  acceptance: '按完整示例接入时不再出现上下文缺失错误',
});
function facts() {
  const value = fixture('example.facts.json');
  value.retro = null;
  value.buildReview = fixture('example.framework-review.json');
  return value;
}
function addFinding(value, overrides) {
  const findings = value.buildReview.evaluation.findings;
  const base = structuredClone(findings[1]);
  findings.push({ ...base, id: `F${findings.length + 1}`, ...overrides });
  return findings.at(-1);
}
const render = (value) => renderHtml(value, null, root);

test('per-task improvement overview precedes scores and successful business delivery', async () => {
  const value = facts();
  value.delivery.status = 'pr-ready';
  value.delivery.qaSummary = '业务全部通过的独立摘要';
  for (const check of value.checks) {
    check.status = 'passed';
    check.evidenceUnavailable = true;
  }
  const before = structuredClone(value);
  const { html } = await renderHtml(
    value,
    { version: 1, summary: '业务交付说明', highlights: [], flow: [] },
    root,
  );
  const overview = section(html, 'overview');
  assert.match(overview, /框架|NocoBase3/);
  assert.match(overview, /弹窗指引/);
  assert.doesNotMatch(
    overview,
    /业务交付说明|业务全部通过的独立摘要|Agent 原始验收|已提交 PR/,
  );
  assert.match(section(html, 'delivery'), /业务交付说明|已提交 PR/);
  const ids = [
    'overview',
    'problems',
    'build-review',
    'framework-feedback',
    'delivery',
    'acceptance',
    'evidence',
    'execution',
  ];
  for (let i = 1; i < ids.length; i++)
    assert.ok(
      html.indexOf(`id="${ids[i - 1]}"`) < html.indexOf(`id="${ids[i]}"`),
    );
  assert.deepEqual(value, before);
});

test('overview lists only framework findings as triage rows, sorted by severity', async () => {
  const value = facts();
  addFinding(value, {
    title: '冻结源码支持的重要问题',
    kind: 'issue',
    owner: 'plugin',
    severity: 'major',
    confidence: 'confirmed',
    status: 'resolved',
  });
  addFinding(value, {
    title: '可选的易用性建议',
    kind: 'improvement',
    owner: 'template',
    confidence: 'confirmed',
  });
  addFinding(value, {
    title: '尚未归因的观察',
    owner: 'unknown',
    confidence: 'suspected',
  });
  addFinding(value, { title: '只属于工厂的问题', owner: 'factory' });
  addFinding(value, { title: '只属于环境的问题', owner: 'environment' });
  const { html } = await render(value);
  const overview = section(html, 'overview');
  // One triage row per framework finding; no count cards or distributions.
  assert.equal((overview.match(/class="fb-item /g) ?? []).length, 3);
  assert.match(overview, /3 条 NocoBase3 框架问题/);
  assert.doesNotMatch(overview, /class="metric-value"|fb-summary/);
  assert.match(overview, /待确认/);
  assert.match(overview, /原评审：已解决/);
  assert.doesNotMatch(overview, /class="tag good">[^<]*已解决/);
  assert.ok(
    overview.includes('另有 1 条归因待确认、3 条业务 / 工厂 / 环境观察'),
  );
  assert.doesNotMatch(
    overview,
    /只属于工厂的问题|只属于环境的问题|尚未归因的观察|查询入口支持正常业务组合/,
  );
  assert.ok(
    overview.indexOf('冻结源码支持的重要问题') < overview.indexOf('弹窗指引'),
  );
  assert.match(overview, /最新 NocoBase3 源码未复核/);
  assert.match(overview, /排序不代表排期优先级/);
});

test('application workaround and resolved review never become verified upstream fixes', async () => {
  const value = facts();
  const finding = value.buildReview.evaluation.findings[1];
  finding.status = 'resolved';
  finding.confidence = 'confirmed';
  finding.severity = 'major';
  finding.diagnosis = diagnostic();
  value.retro = {
    version: 1,
    summary: '过程记录',
    blockers: [
      {
        phase: 'repair',
        title: '应用绕行',
        symptom: '接入失败',
        rootCause: '原文推测',
        resolution: '更改调用位置',
        status: 'resolved',
      },
    ],
    improvements: [],
  };
  const { html } = await render(value);
  const problems = section(html, 'problems');
  assert.match(problems, /原评审：已解决/);
  assert.match(problems, /本任务已处理/);
  assert.match(problems, /最新上游状态：未复核/);
  assert.match(problems, /应用将调用移动到 Provider 内/);
  assert.match(problems, /id="review-finding-F2" open/);
  assert.doesNotMatch(problems, /class="tag good">[^<]*(?:已解决|已处理)/);
  assert.ok(
    problems.indexOf('id="review-finding-F2"') <
      problems.indexOf('class="card raw-record process-notes"'),
  );
});

test('missing, failed, invalid, lightweight and legacy reviews show unknown rather than zero framework issues', async () => {
  const invalid = fixture('example.framework-review.json');
  invalid.evaluation.findings[1].evidence = ['E9999'];
  for (const review of [
    undefined,
    { state: 'failed', reason: 'timeout' },
    { state: 'not-reviewed', execution: { buildReviewMode: 'off' } },
    fixture('example.review.json'),
    invalid,
  ]) {
    const value = facts();
    value.buildReview = review;
    const overview = section((await render(value)).html, 'overview');
    assert.match(overview, /框架问题尚未评估/);
    assert.doesNotMatch(overview, /class="metric-value">0|弹窗指引/);
  }
});

test('completed-empty and partial coverage cannot claim all of NocoBase3 is issue free', async () => {
  const value = facts();
  value.buildReview.evaluation.findings = [];
  let overview = section((await render(value)).html, 'overview');
  assert.match(overview, /本轮评测未提出/);
  assert.match(overview, /不等于整个框架没有问题/);
  value.buildReview.state = 'partial';
  value.buildReview.evaluation.progress = {
    complete: false,
    pendingModules: ['权限隔离尚未评测'],
  };
  overview = section((await render(value)).html, 'overview');
  assert.match(overview, /独立评测部分完成|已评测部分未提出/);
  assert.match(overview, /权限隔离尚未评测/);
  assert.match(overview, /未覆盖项不等于无问题/);
});

test('optional structured diagnosis is validated while archived v2 still works', () => {
  const report = fixture('example.framework-review.json');
  delete report.evaluation.findings[1].diagnosis;
  assert.doesNotThrow(() => validateBuildReview(report));
  report.evaluation.findings[1].diagnosis = diagnostic();
  assert.doesNotThrow(() => validateBuildReview(report));
  for (const key of [
    'trigger',
    'expected',
    'actual',
    'workaround',
    'acceptance',
  ]) {
    const invalid = structuredClone(report);
    delete invalid.evaluation.findings[1].diagnosis[key];
    assert.throws(
      () => validateBuildReview(invalid),
      new RegExp(`diagnosis.${key}`),
    );
  }
  report.evaluation.findings[1].diagnosis.category =
    'latest-upstream-confirmed';
  assert.throws(() => validateBuildReview(report), /diagnosis category/);
});

test('all new fields are escaped and finding, evidence and baseline links reach unique targets', async () => {
  const value = facts();
  const finding = value.buildReview.evaluation.findings[1];
  finding.diagnosis = diagnostic();
  const payload = '<img src=x onerror=alert(1)>';
  for (const key of ['title', 'impact', 'suggestedChange'])
    finding[key] = payload;
  for (const key of [
    'trigger',
    'expected',
    'actual',
    'workaround',
    'acceptance',
  ])
    finding.diagnosis[key] = payload;
  const { html } = await render(value);
  assert.doesNotMatch(html, /<img src=x/);
  assert.ok(
    section(html, 'overview').includes('&lt;img src=x onerror=alert(1)&gt;'),
  );
  assert.ok(
    section(html, 'problems').includes('&lt;img src=x onerror=alert(1)&gt;'),
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.includes(id), `Missing ${id}`);
});
