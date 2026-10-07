import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderHtml } from '../../reports/render-report.mjs';
import {
  collectOccurrences,
  renderFindingsIndex,
} from '../../reports/findings-index.mjs';
import {
  createClassificationInput,
  finalizeClassification,
} from '../../reports/findings-classification.mjs';
import {
  planDailyArchive,
  renderDailyIndex,
  renderDailyPage,
} from '../../reports/findings-daily.mjs';
import { markFeedbackReviewed } from './evaluation-fixtures.mjs';
import { feishuDigest } from '../daily-findings.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const section = (html, id) =>
  html
    .split(`<section class="section" id="${id}">`)[1]
    ?.split('</section>')[0] ?? '';
const render = (value) => renderHtml(value, null, root);
function facts() {
  const value = fixture('example.facts.json');
  value.retro = null;
  value.buildReview = fixture('example.framework-review.json');
  markFeedbackReviewed(value.buildReview);
  value.buildReview.execution.feedbackReview.candidateIds =
    value.buildReview.evaluation.findings.map((f) => f.id);
  return value;
}
const feedbackReview = (status, reason = `反馈核对结果：${status}`) => ({
  status,
  reason,
  checks: [
    { kind: 'contract', reason: '核对公开约定与职责', evidence: ['E6'] },
    { kind: 'behavior', reason: '核对实际观察', evidence: ['E7'] },
    { kind: 'application', reason: '核对应用调用与正常组合', evidence: ['E3'] },
    { kind: 'environment', reason: '核对运行环境影响', evidence: ['E7'] },
    { kind: 'factory', reason: '核对工厂验证方式', evidence: ['E4'] },
    {
      kind: 'existing-capability',
      reason: '核对已有公开能力',
      evidence: ['E5'],
    },
  ],
});

test('legacy confirmed and suspected feedback remains visible as unreviewed candidates', async () => {
  for (const confidence of ['confirmed', 'suspected']) {
    const value = facts();
    const finding = value.buildReview.evaluation.findings[1];
    finding.confidence = confidence;
    finding.severity = 'critical';
    markFeedbackReviewed(value.buildReview);
    const before = structuredClone(value);
    const { html } = await render(value);
    const overview = section(html, 'overview');
    const problems = section(html, 'problems');
    assert.match(overview, /1 条 NocoBase3 框架问题与建议/);
    assert.match(overview, /证据支持 0 · 存在反证 0 · 证据不足 0 · 未复核 1/);
    for (const content of [overview, problems]) {
      assert.match(content, /候选反馈：未复核/);
      assert.ok(content.includes(confidence));
    }
    assert.match(problems, /id="review-finding-F2" open/);
    assert.match(problems, /原评审置信度不代表已排除误报/);
    assert.match(problems, /原评审：未解决/);
    assert.deepEqual(value, before);
  }
  const value = facts();
  value.buildReview = fixture('example.review.json');
  const { html } = await render(value);
  const problems = section(html, 'problems');
  assert.match(problems, /口径 v1/);
  assert.match(problems, /候选反馈：未复核/);
  assert.match(problems, /原评审置信度不代表已排除误报/);
});

test('supported, contradicted and insufficient feedback shows reasons and original evidence links without hiding findings', async () => {
  const value = facts();
  const findings = value.buildReview.evaluation.findings;
  const base = structuredClone(findings[1]);
  const labels = {
    supported: '反馈复核：证据支持',
    contradicted: '反馈复核：存在反证',
    insufficient: '候选反馈：证据不足',
  };
  for (const [index, status] of Object.keys(labels).entries()) {
    findings.push({
      ...structuredClone(base),
      id: `F${index + 4}`,
      title: `${status} 的高风险反馈`,
      severity: 'major',
      confidence: 'confirmed',
      feedbackReview: feedbackReview(status),
    });
  }
  markFeedbackReviewed(value.buildReview);
  const before = structuredClone(value);
  const { html } = await render(value);
  const overview = section(html, 'overview');
  const problems = section(html, 'problems');
  assert.equal((overview.match(/class="fb-item /g) ?? []).length, 4);
  assert.match(overview, /证据支持 1 · 存在反证 1 · 证据不足 1 · 未复核 1/);
  assert.match(overview, /证据支持不等于人工确认/);
  for (const [index, [status, label]] of Object.entries(labels).entries()) {
    assert.ok(overview.includes(label), status);
    assert.ok(problems.includes(label), status);
    assert.ok(problems.includes(`反馈核对结果：${status}`), status);
    assert.ok(
      problems.includes(`id="review-finding-F${index + 4}" open`),
      status,
    );
  }
  assert.match(problems, /应用接入与业务边界/);
  assert.match(problems, /环境因素/);
  assert.match(problems, /工厂因素/);
  assert.match(problems, /已有能力与推荐用法/);
  // E3 is deliberately outside this finding's original E5/E6/E7 evidence.
  // Review checks must retain the raw review's IDs, not renumber local lists.
  assert.match(
    problems,
    /核对应用调用与正常组合[\s\S]*?href="#review-evidence-E3"/,
  );
  assert.match(problems, /href="#review-evidence-E4"/);
  assert.match(problems, /不等于人工确认、上游修复状态或自动修复授权/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, id] of html.matchAll(
    /href="#(review-(?:finding|evidence)-[^"]+)"/g,
  ))
    assert.ok(ids.includes(id), `Missing ${id}`);
  assert.deepEqual(value, before);
});

test('ordinary advice keeps its category when evidence supports it and does not become an implementation defect', async () => {
  const value = facts();
  const finding = value.buildReview.evaluation.findings[1];
  finding.kind = 'improvement';
  finding.diagnosis.category = 'usability-improvement';
  finding.title = '可选的易用性建议';
  finding.feedbackReview = feedbackReview('supported');
  const { html } = await render(value);
  for (const content of [
    section(html, 'overview'),
    section(html, 'problems'),
  ]) {
    assert.match(content, /可选的易用性建议/);
    assert.match(content, /ftype-usability/);
    assert.match(content, /反馈复核：证据支持/);
    assert.match(content, /原评审：待确认（suspected）/);
  }
  const draft = html.match(/<pre id="issue-draft-F2">([\s\S]*?)<\/pre>/)[1];
  assert.match(draft, /\[易用性改进\]/);
  assert.doesNotMatch(draft, /\[实现缺陷\]/);
  assert.match(draft, /反馈证据核对/);
  assert.match(draft, /E3（app\/server\/customers.ts:1–2）/);
});

test('feedback review cannot rewrite the source or latest-upstream disposition', async () => {
  const value = facts();
  const finding = value.buildReview.evaluation.findings[1];
  finding.status = 'resolved';
  finding.feedbackReview = feedbackReview('contradicted');
  value.upstreamCheck = {
    version: 1,
    repository: 'nocobase/nocobase3',
    ref: 'develop',
    sha: 'b'.repeat(40),
    checkedAt: '2026-09-26',
    checker: '测试复核',
    findings: {
      F2: {
        status: 'present',
        summary: '独立的上游检查记录',
        evidence: [
          {
            label: '上游记录',
            path: 'packages/router/index.ts',
            lines: [1, 1],
            excerpt: 'snapshot',
          },
        ],
      },
    },
  };
  markFeedbackReviewed(value.buildReview);
  const before = structuredClone(value);
  const { html } = await render(value);
  for (const content of [
    section(html, 'overview'),
    section(html, 'problems'),
  ]) {
    assert.match(content, /反馈复核：存在反证/);
    assert.match(content, /原评审：已解决/);
    assert.match(content, /原评审：待确认（suspected）/);
    assert.match(content, /上游仍存在/);
  }
  assert.deepEqual(value, before);
});

test('feedback reasons and check descriptions are escaped in rendered details and the issue draft', async () => {
  const value = facts();
  const finding = value.buildReview.evaluation.findings[1];
  const payload = '<img src=x onerror="bad()"> & \'quote\'';
  finding.feedbackReview = feedbackReview('insufficient', payload);
  finding.feedbackReview.checks[0].reason = payload;
  finding.feedbackReview.checks[1].evidence = [];
  const { html } = await render(value);
  const problems = section(html, 'problems');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(
    problems,
    /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; &#39;quote&#39;/,
  );
  assert.match(problems, /未提供证据，仍需补证/);
  const draft = problems.match(/<pre id="issue-draft-F2">([\s\S]*?)<\/pre>/)[1];
  assert.match(draft, /候选反馈：证据不足/);
  assert.match(draft, /&lt;img src=x/);
  assert.match(draft, /未提供，仍需补证/);
});

function feedbackReports() {
  return [undefined, 'supported', 'contradicted', 'insufficient'].map(
    (status, index) => {
      const delivery = facts();
      delivery.meta = {
        ...delivery.meta,
        issue: 101 + index,
        runId: String(9101 + index),
        attempt: 1,
        snapshotDate: '2026-10-06T01:00:00.000Z',
      };
      const finding = delivery.buildReview.evaluation.findings[1];
      finding.kind = 'improvement';
      finding.diagnosis.category = 'usability-improvement';
      finding.confidence = 'confirmed';
      if (status)
        finding.feedbackReview = feedbackReview(
          status,
          `${status} <script>reason()</script>`,
        );
      return { delivery };
    },
  );
}
const labels = [
  '候选反馈：未复核',
  '反馈复核：证据支持',
  '反馈复核：存在反证',
  '候选反馈：证据不足',
];

test('cross-report grouping retains mixed verification states and does not promote legacy advice', async () => {
  const reports = feedbackReports();
  const before = structuredClone(reports);
  const input = createClassificationInput(
    collectOccurrences(reports).occurrences,
  );
  const classification = finalizeClassification(
    {
      version: 1,
      inputHash: input.inputHash,
      groups: [
        {
          title: '同类可选建议',
          reason: '测试归类',
          members: input.findings.map((item) => item.id),
        },
      ],
    },
    input,
  );
  const html = await renderFindingsIndex(reports, { classification });
  assert.match(html, /4 条框架发现展示为 <b>1 个分组/);
  assert.match(html, /1 个问题与建议分组/);
  const summary = html.match(
    /<summary class="fx-row">([\s\S]*?)<\/summary>/,
  )[1];
  for (const label of labels) assert.ok(summary.includes(label));
  for (const [index, label] of labels.entries()) {
    const row = html.match(
      new RegExp(`<tr><td><a[^>]+>#${101 + index}[\\s\\S]*?<\\/tr>`),
    )[0];
    assert.ok(row.includes(label), row);
    assert.match(row, /ftype-usability/);
  }
  assert.doesNotMatch(html, /<script>reason/);
  assert.match(html, /contradicted &lt;script&gt;reason\(\)&lt;\/script&gt;/);
  assert.match(html, /归类和重复出现不证明问题成立/);
  assert.deepEqual(reports, before);
});

test('future daily archives, live preview and Feishu keep verification and advice labels without rewriting closed days', async () => {
  const reports = feedbackReports();
  const occurrences = collectOccurrences(reports).occurrences;
  const plan = planDailyArchive({
    occurrences,
    day: '2026-10-06',
    now: new Date('2026-10-07T01:00:00Z'),
  });
  const entries = plan.added[0].entries;
  assert.equal(entries.length, 4);
  assert.ok(!Object.hasOwn(entries[0], 'feedbackReview'));
  for (const entry of entries.slice(1)) {
    const source = occurrences.find((item) => item.issue === entry.issue);
    assert.deepEqual(entry.feedbackReview, source.finding.feedbackReview);
    assert.notEqual(entry.feedbackReview, source.finding.feedbackReview);
    assert.deepEqual(entry.feedbackReview.checks[2].evidence, ['E3']);
  }
  const html = await renderDailyPage({
    version: 1,
    date: '2026-10-06',
    entries,
  });
  const preview = await renderDailyIndex(null, { occurrences });
  const digest = feishuDigest({
    date: '2026-10-06',
    entries,
    owners: { featurePoints: {}, default: [] },
    pageUrl: 'https://example.test/reports/findings/daily/2026-10-06.html',
    reportUrl: (href) => `https://example.test/${href}`,
  });
  const text = digest.content.post.zh_cn.content
    .flat()
    .map((node) => node.text ?? '')
    .join('\n');
  for (const label of labels) {
    assert.ok(html.includes(label));
    assert.ok(preview.includes(label));
    assert.ok(text.includes(label));
  }
  for (const content of [html, preview]) {
    assert.match(content, /易用性改进/);
    assert.doesNotMatch(content, /<script>reason/);
  }
  assert.match(html, /contradicted &lt;script&gt;reason\(\)&lt;\/script&gt;/);
  assert.match(text, /易用性改进/);
  assert.match(text, /证据支持不等于人工确认/);
  assert.equal(
    digest.content.post.zh_cn.content.flat().filter((node) => node.tag === 'at')
      .length,
    0,
  );

  // Later checks of an already archived occurrence do not rewrite its day,
  // re-enqueue the digest, or mutate the preserved feedback snapshot.
  const closed = JSON.stringify(plan);
  occurrences[0].finding.feedbackReview = feedbackReview('supported');
  occurrences[1].finding.feedbackReview.reason = '后续变化';
  const next = planDailyArchive({
    occurrences,
    ledger: plan.ledger,
    day: '2026-10-07',
    now: new Date('2026-10-08T01:00:00Z'),
  });
  assert.equal(next.added.length, 0);
  assert.deepEqual(next.ledger.pending, plan.ledger.pending);
  assert.equal(JSON.stringify(plan), closed);
});

test('legacy nested support without factory provenance stays a visible unverified candidate', async () => {
  const value = facts();
  const finding = value.buildReview.evaluation.findings.find(
    (f) => f.id === 'F2',
  );
  finding.feedbackReview = feedbackReview('supported');
  delete value.buildReview.execution;
  const { html } = await render(value);
  assert.match(section(html, 'overview'), /候选反馈：证据不足/);
  assert.match(
    section(html, 'problems'),
    /缺少与本次输入绑定的工厂定向复核完成记录/,
  );
  value.meta = {
    issue: 101,
    runId: '9101',
    attempt: 1,
    snapshotDate: '2026-10-06T01:00:00.000Z',
  };
  assert.equal(
    collectOccurrences([{ delivery: value }]).occurrences.find(
      (o) => o.finding.id === 'F2',
    ).finding.feedbackReview.status,
    'insufficient',
  );
});
