import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderHtml } from '../../reports/render-report.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
function facts() {
  const value = fixture('example.facts.json');
  value.retro = null;
  value.buildReview = fixture('example.framework-review.json');
  return value;
}
const section = (html, id) => html.split(`<section class="section" id="${id}">`)[1]?.split('</section>')[0] ?? '';
const render = value => renderHtml(value, null, root);
const assertNoPlaceholders = html => assert.doesNotMatch(html, /问题复盘未提供|改进建议未提供/);

test('review findings render once in unified feedback without retro; strengths and evidence stay separate', async () => {
  const value = facts();
  const before = structuredClone(value);
  const { html, retroUsed } = await render(value);
  const feedback = section(html, 'problems');
  const help = section(html, 'framework-feedback');
  assertNoPlaceholders(html);
  assert.equal(retroUsed, false);
  assert.match(feedback, /本轮未提供可选/);
  for (const finding of value.buildReview.evaluation.findings) {
    assert.equal(html.split(`id="review-finding-${finding.id}"`).length - 1, 1);
    assert.ok((finding.kind === 'strength' ? help : feedback).includes(finding.title));
    assert.ok(!(finding.kind === 'strength' ? feedback : help).includes(finding.title));
  }
  assert.match(feedback, /评审发现不等于本轮实际阻塞/);
  assert.match(feedback, /业务实现与执行环境观察 · 不计入框架得分/);
  assert.match(html, /id="review-evidence-E5"/);
  assert.match(feedback, /href="#review-evidence-E5"/);
  assert.match(html, /id="improvements"/);
  assert.doesNotMatch(html, /<section[^>]+id="improvements"/);
  assert.deepEqual(value, before); // No changes to scores, QA, usage, or source data.
});

test('an explicit empty retro cannot hide findings or turn them into resolved blockers', async () => {
  const value = facts();
  value.retro = { version: 1, summary: '', blockers: [], improvements: [] };
  const { html } = await render(value);
  const feedback = section(html, 'problems');
  assert.match(feedback, /实现者未记录具体阻塞/);
  assert.match(feedback, /弹窗指引/);
  assert.match(feedback, /待确认/);
  assert.match(feedback, /未解决/);
  assertNoPlaceholders(html);
});

test('invalid optional notes and invalid review are independent and cannot erase QA', async () => {
  const value = facts();
  value.retro = { version: 100, summary: 'invalid-retro-record' };
  let result = await render(value);
  assert.match(result.html, /复盘格式无效/);
  assert.match(result.html, /invalid-retro-record/);
  assert.match(section(result.html, 'problems'), /id="process-notes" open/);
  assert.match(section(result.html, 'problems'), /弹窗指引/);
  const acceptance = section(result.html, 'acceptance');
  value.buildReview.evaluation.findings[1].evidence = ['DOES-NOT-EXIST'];
  result = await render(value);
  assert.match(section(result.html, 'problems'), /独立评测未完成或结果无效/);
  assert.doesNotMatch(section(result.html, 'problems'), /弹窗指引/);
  assert.equal(section(result.html, 'acceptance'), acceptance);
});

test('lightweight, missing, failed, completed-empty and partial feedback have different meanings', async () => {
  const value = facts();
  value.buildReview.evaluation.findings = [];
  let { html } = await render(value);
  assert.match(section(html, 'problems'), /已完成独立评测，本轮未提出/);
  value.buildReview.state = 'partial';
  value.buildReview.evaluation.progress = { complete: false, pendingModules: ['未覆盖能力'] };
  ({ html } = await render(value));
  assert.match(section(html, 'problems'), /评测仅部分完成/);
  assert.match(section(html, 'problems'), /其余尚未评测/);
  assert.doesNotMatch(section(html, 'problems'), /已完成独立评测，本轮未提出/);
  value.buildReview = { state: 'not-reviewed', execution: { buildReviewMode: 'off' }, evaluation: null };
  ({ html } = await render(value));
  assert.match(section(html, 'problems'), /轻量模式，未进行独立评测/);
  value.buildReview = { state: 'failed', reason: 'timeout', evaluation: null };
  ({ html } = await render(value));
  assert.match(section(html, 'problems'), /未完成或结果无效/);
  value.buildReview = undefined;
  ({ html } = await render(value));
  assert.match(section(html, 'problems'), /本轮未进行独立评测/);
  assertNoPlaceholders(html);
});

test('partial and legacy feedback remain labelled, with original producer and replay identity', async () => {
  const value = facts();
  value.buildReview.state = 'partial';
  value.buildReview.evaluation.progress = { complete: false, pendingModules: ['未覆盖能力'] };
  let { html } = await render(value);
  assert.match(section(html, 'problems'), /评测仅部分完成/);
  assert.match(section(html, 'problems'), /弹窗指引/);
  value.buildReview.reviewer = { ...value.buildReview.reviewer, replay: true, runId: '98765', attempt: 2 };
  ({ html } = await render(value));
  assert.ok(section(html, 'problems').includes(`源 Run ${value.buildReview.basis.runId}`));
  assert.match(section(html, 'problems'), /后补评审 Run 98765 \/ attempt 2/);
  value.buildReview = fixture('example.review.json');
  ({ html } = await render(value));
  assert.match(section(html, 'problems'), /口径 v1/);
  assert.match(html, /旧口径 v1 · 不作为新框架评分/);
  assert.ok(section(html, 'problems').includes(`源 Run ${value.buildReview.basis.runId}`));
});

test('identical supplementary proposals link to existing findings, but differing detail and process status survive', async () => {
  const value = facts(), finding = value.buildReview.evaluation.findings[1];
  value.retro = {
    version: 1, summary: '实现者记录', source: 'Agent · retro.json',
    blockers: [{ phase: 'implementation', title: finding.title, symptom: '开发时的现场现象',
      rootCause: '实现者推测', resolution: '应用临时绕行', cost: '', status: 'unknown' }],
    improvements: [
      { category: 'skills-docs', title: finding.title, detail: finding.detail, suggestedChange: finding.suggestedChange, mechanizable: true },
      { category: 'tooling', title: finding.title, detail: '同名但另一个独特观察', suggestedChange: finding.suggestedChange, mechanizable: false },
    ],
  };
  const { html } = await render(value);
  const feedback = section(html, 'problems').split('<details class="card raw-record"><summary>查看原始复盘数据')[0];
  assert.match(feedback, /同一建议已收录/);
  assert.match(feedback, /href="#review-finding-F2"/);
  assert.match(feedback, /id="improvement-2"/);
  assert.match(feedback, /同名但另一个独特观察/);
  assert.match(feedback, /开发时的现场现象/);
  assert.match(feedback, /处理结果未提供/);
  assert.match(feedback, /实现者推测/);
  // The upstream issue draft deliberately restates the finding; only the
  // rendered finding and the supplementary proposals must not repeat it.
  const withoutDrafts = feedback.replace(/<pre id="issue-draft-[^"]+">[\s\S]*?<\/pre>/g, '');
  assert.equal(withoutDrafts.split(finding.detail).length - 1, 1);
  assert.match(html, /查看原始复盘数据/);
});

test('failed or missing review never suppresses optional process recommendations', async () => {
  const value = facts();
  value.buildReview = { state: 'failed', reason: 'review failed', evaluation: null };
  value.retro = { version: 1, summary: '', blockers: [],
    improvements: [{ title: '仍须保留的建议', detail: '自述未核验', category: 'tooling', suggestedChange: '检查工具', mechanizable: false }] };
  const { html } = await render(value);
  assert.match(section(html, 'problems'), /仍须保留的建议/);
  assert.match(section(html, 'problems'), /自述未核验/);
  assert.match(section(html, 'problems'), /id="process-notes" open/);
  assert.match(section(html, 'overview'), /0 个问题、1 条改进建议/);
  assert.match(section(html, 'problems'), /未完成或结果无效/);
});

test('recorded process issues and suggestions stay visible even when independent review fails', async () => {
  const value = facts();
  value.retro = fixture('example.facts.json').retro;
  const count = `${value.retro.blockers.length} 个问题、${value.retro.improvements.length} 条改进建议`;
  const before = structuredClone(value.retro);
  for (const state of ['failed', 'missing', 'off', 'completed', 'partial', 'invalid']) {
    value.buildReview = fixture('example.framework-review.json');
    if (state === 'failed') value.buildReview = { state: 'failed', reason: '连续 180 秒没有输出（stalled）', evaluation: null };
    if (state === 'missing') delete value.buildReview;
    if (state === 'off') value.buildReview = { state: 'not-reviewed', execution: { buildReviewMode: 'off' }, evaluation: null };
    if (state === 'partial') {
      value.buildReview.state = 'partial';
      value.buildReview.evaluation.progress = { complete: false, pendingModules: ['未覆盖能力'] };
    }
    if (state === 'invalid') value.buildReview.evaluation.findings[1].evidence = ['MISSING'];
    const { html } = await render(value);
    assert.ok(section(html, 'overview').includes(count), state);
    assert.match(section(html, 'overview'), /不计入独立确认的框架问题数/);
    assert.match(section(html, 'problems'), /<details class="card raw-record process-notes" id="process-notes" open>/);
    assert.match(section(html, 'overview'), /href="#process-notes" data-expand="process-notes"/);
    assert.deepEqual(value.retro, before);
  }
});

test('absent or empty notes do not claim zero independent findings or open an empty section', async () => {
  const value = facts();
  value.buildReview = { state: 'failed', reason: 'stalled', evaluation: null };
  for (const retro of [null, { version: 1, summary: '', blockers: [], improvements: [] }]) {
    value.retro = retro;
    const { html } = await render(value);
    assert.doesNotMatch(section(html, 'overview'), /实现者过程记录：|0 个问题/);
    assert.match(section(html, 'overview'), /框架问题尚未评估/);
    assert.doesNotMatch(section(html, 'problems'), /id="process-notes" open/);
  }
});

test('findings, optional prose and source metadata are escaped; provenance is not inferred', async () => {
  const value = facts();
  value.buildReview.evaluation.findings[1].title = '<img src=x onerror=alert(1)>';
  value.retro = { version: 1, summary: '<script>bad()</script>', blockers: [], improvements: [] };
  const { html } = await render(value);
  assert.match(section(html, 'problems'), /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(section(html, 'problems'), /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>bad|<img src=x/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const links = [...html.matchAll(/href="#(review-(?:finding|evidence)-[^"]+)"/g)].map(match => match[1]);
  for (const id of links) assert.ok(ids.includes(id), `missing target ${id}`);
  assert.match(html, /factory-template-version" content="9"/);
});
