import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderHtml } from '../../reports/render-report.mjs';
import { severityRubric } from '../../reports/framework-overview.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const section = (html, id) =>
  html
    .split(`<section class="section" id="${id}">`)[1]
    ?.split('</section>')[0] ?? '';
const SHA = 'b'.repeat(40);
function facts(upstreamCheck) {
  const value = fixture('example.facts.json');
  value.retro = null;
  value.buildReview = fixture('example.framework-review.json');
  if (upstreamCheck) value.upstreamCheck = upstreamCheck;
  return value;
}
const check = (overrides = {}) => ({
  version: 1,
  repository: 'nocobase/nocobase3',
  ref: 'develop',
  sha: SHA,
  checkedAt: '2026-09-26',
  checker: '测试复核',
  findings: {
    F2: {
      status: 'present',
      summary: '最新源码仍缺少 Provider 前提说明',
      suggestedSeverity: 'major',
      suggestedType: 'runtime-defect',
      note: '<b>按后果定级</b>应为重要',
      evidence: [
        {
          label: '文档仍这样写',
          path: 'packages/libs/router/skills/SKILL.md',
          lines: [3, 4],
          excerpt: '<script>alert(1)</script>',
        },
      ],
      ...overrides,
    },
  },
});
const render = (value) => renderHtml(value, null, root);

test('upstream recheck regrades visibly without rewriting the original assessment', async () => {
  const value = facts(check());
  const before = structuredClone(value);
  const { html, reportId } = await render(value);
  const overview = section(html, 'overview');
  const problems = section(html, 'problems');
  // The original grade stays on screen, struck through, next to the new one.
  assert.match(overview, /class="sev sev-minor is-was"[^>]*>轻微<\/span><span class="regrade-arrow"[^>]*>→<\/span><span class="sev sev-major"/);
  assert.match(overview, /class="ftype ftype-guidance-error is-was"/);
  assert.match(overview, /class="up up-present"[^>]*>上游仍存在/);
  assert.match(overview, /最新上游已复核/);
  assert.match(overview, /develop@bbbbbbbb/);
  assert.match(problems, /id="review-finding-F2" open/);
  assert.ok(
    problems.includes(
      `https://github.com/nocobase/nocobase3/blob/${SHA}/packages/libs/router/skills/SKILL.md#L3-L4`,
    ),
  );
  assert.match(problems, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(problems, /&lt;b&gt;按后果定级&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>alert|<b>按后果/);
  const draft = problems.match(/<pre id="issue-draft-F2">([\s\S]*?)<\/pre>/)[1];
  assert.match(draft, /\[重要\]\[实现缺陷\]/);
  assert.match(draft, /原评审定级轻微/);
  assert.match(draft, /已于 2026-09-26 对照最新上游复核/);
  assert.match(reportId, /:upstream-[a-f0-9]{16}$/);
  assert.deepEqual(value, before);
});

test('an invalid recheck is dropped with a visible note and never blocks the report', async () => {
  for (const [name, bad] of [
    ['short sha', { ...check(), sha: 'abc' }],
    ['unknown finding', { ...check(), findings: { F99: check().findings.F2 } }],
    ['path traversal', check({ evidence: [{ ...check().findings.F2.evidence[0], path: '../secrets' }] })],
    ['reversed lines', check({ evidence: [{ ...check().findings.F2.evidence[0], lines: [5, 2] }] })],
    ['unknown status', check({ status: 'maybe' })],
    ['unknown severity', check({ suggestedSeverity: 'p0' })],
  ]) {
    const { html } = await render(facts(bad));
    const problems = section(html, 'problems');
    assert.match(problems, /上游复核数据无效，未采用/, name);
    assert.doesNotMatch(problems, /class="rf-upstream/, name);
    assert.match(section(html, 'overview'), /最新 NocoBase3 源码未复核/, name);
  }
});

test('without a recheck every framework finding says upstream is not rechecked', async () => {
  const { html } = await render(facts());
  assert.match(section(html, 'overview'), /class="up up-none">上游未复核/);
  const draft = section(html, 'problems').match(/<pre id="issue-draft-F2">([\s\S]*?)<\/pre>/)[1];
  assert.match(draft, /尚未复核最新上游源码/);
  assert.doesNotMatch(draft, /github\.com\/nocobase/);
  assert.match(html, /data-copy="issue-draft-F2"/);
});

test('severity is explained by consequence and scores stay folded behind one line', async () => {
  const { html } = await render(facts());
  const problems = section(html, 'problems');
  assert.match(problems, /等级与类型怎么定/);
  for (const text of Object.values(severityRubric)) assert.ok(problems.includes(text), text);
  const scores = section(html, 'build-review');
  assert.match(scores, /class="scores-line"/);
  assert.ok(scores.indexOf('id="scores-detail"') < scores.indexOf('review-matrix'));
  assert.ok(scores.indexOf('class="scores-line"') < scores.indexOf('id="scores-detail"'));
});
