import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  clusterOccurrences,
  collectOccurrences,
  renderFindingsIndex,
} from '../../reports/findings-index.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, name), 'utf8'));
// A published report.json wraps the render facts in `delivery`.
function report(issue, edit = () => {}) {
  const facts = fixture('example.facts.json');
  facts.meta = { ...facts.meta, issue, runId: String(9000 + issue), attempt: 1, snapshotDate: `2026-09-${String(issue % 28 + 1).padStart(2, '0')}T00:00:00.000Z` };
  facts.buildReview = fixture('example.framework-review.json');
  edit(facts.buildReview.evaluation.findings, facts);
  return { delivery: facts };
}
const unrelated = (findings) => {
  findings[1].title = 'Scheduler 缺少立即执行入口';
  findings[1].detail = '按需验证只能等待 cron 周期触发，没有经同一执行记录的手动运行接口。';
  findings[1].suggestedChange = '提供 runNow 并记录同一 execution。';
};

test('the same problem reported by different tasks merges into one entry with every occurrence linked', async () => {
  const html = await renderFindingsIndex([report(101), report(102), report(103, unrelated)]);
  assert.match(html, /3 条框架发现归并为 <b>2 个问题<\/b>/);
  assert.match(html, /反复出现 <span>1 个问题/);
  assert.match(html, /class="fx-count is-repeat">2 个任务/);
  assert.ok(html.includes('href="../issues/101/runs/9101/attempt-1/index.html#review-finding-F2"'));
  assert.ok(html.includes('href="../issues/102/runs/9102/attempt-1/index.html#review-finding-F2"'));
  assert.match(html, /Scheduler 缺少立即执行入口/);
});

test('two findings of the same report never merge, even when identical', () => {
  const duplicate = report(201, (findings) => findings.push({ ...findings[1], id: 'F9' }));
  const { occurrences } = collectOccurrences([duplicate, report(202)]);
  const clusters = clusterOccurrences(occurrences);
  for (const cluster of clusters) {
    const reports = cluster.items.map((item) => item.report);
    assert.equal(reports.length, new Set(reports).size);
  }
  assert.equal(clusters.length, 2);
});

test('a merged problem keeps the highest grade, the most specific type and any upstream recheck', async () => {
  const older = report(301, (findings) => {
    findings[1].kind = 'improvement';
    delete findings[1].claimed;
    delete findings[1].observed;
    findings[1].severity = 'info';
  });
  const newer = report(302, (findings, facts) => {
    findings[1].severity = 'major';
    facts.upstreamCheck = {
      version: 1, repository: 'nocobase/nocobase3', ref: 'develop', sha: 'c'.repeat(40), checkedAt: '2026-09-27', checker: '测试',
      findings: { F2: { status: 'fixed', summary: '已修复', evidence: [{ label: '现状', path: 'docs/a.md', lines: [1, 1], excerpt: 'ok' }] } },
    };
  });
  const [cluster] = clusterOccurrences(collectOccurrences([older, newer]).occurrences).filter((item) => item.items.length > 1);
  assert.equal(cluster.severity, 'major');
  assert.equal(cluster.type, 'guidance-error');
  assert.equal(cluster.upstream.entry.status, 'fixed');
  assert.match(await renderFindingsIndex([older, newer]), /class="up up-fixed"[^>]*>上游已修复/);
});

test('only valid v2 framework findings are indexed; everything else is reported, never guessed', async () => {
  const legacy = { delivery: { ...report(401).delivery, buildReview: fixture('example.review.json') } };
  const failed = { delivery: { ...report(402).delivery, buildReview: { state: 'failed', reason: 'timeout' } } };
  const invalid = report(403, (findings) => { findings[1].evidence = ['E9999']; });
  const escaped = report(404, (findings) => { findings[1].title = '<img src=x onerror=alert(1)>'; });
  const html = await renderFindingsIndex([legacy, failed, invalid, escaped]);
  assert.match(html, /其中 1 份有可用的 v2 独立评审（另有 1 份评审数据不符合当前格式，未纳入）/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x|业务调用位置错误/);
  assert.match(html, /可能误合并或漏合并/);
  assert.doesNotMatch(html, /<script/);
});
