import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  clusterOccurrences,
  collectOccurrences,
  renderFindingsIndex,
} from '../../reports/findings-index.mjs';

import {
  createClassificationInput,
  finalizeClassification,
} from '../../reports/findings-classification.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, name), 'utf8'));
// A published report.json wraps the render facts in `delivery`.
function report(issue, edit = () => {}) {
  const facts = fixture('example.facts.json');
  facts.meta = {
    ...facts.meta,
    issue,
    runId: String(9000 + issue),
    attempt: 1,
    snapshotDate: `2026-09-${String((issue % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  };
  facts.buildReview = fixture('example.framework-review.json');
  edit(facts.buildReview.evaluation.findings, facts);
  return { delivery: facts };
}
const unrelated = (findings) => {
  findings[1].title = 'Scheduler 缺少立即执行入口';
  findings[1].detail =
    '按需验证只能等待 cron 周期触发，没有经同一执行记录的手动运行接口。';
  findings[1].suggestedChange = '提供 runNow 并记录同一 execution。';
};

function classified(reports, groups) {
  const input = createClassificationInput(
    collectOccurrences(reports).occurrences,
  );
  return finalizeClassification(
    {
      version: 1,
      inputHash: input.inputHash,
      groups: groups.map((indexes) => ({
        title: input.findings[indexes[0]].finding.title,
        reason: '根据触发条件、入口和引文核对同一根因。',
        members: indexes.map((i) => input.findings[i].id),
      })),
    },
    input,
  );
}

test('the same problem reported by different tasks merges into one entry with every occurrence linked', async () => {
  const reports = [report(101), report(102), report(103, unrelated)];
  const html = await renderFindingsIndex(reports, {
    classification: classified(reports, [[0, 1], [2]]),
  });
  assert.match(html, /3 条框架发现展示为 <b>2 个分组<\/b>/);
  assert.match(html, /反复出现 <span>1 个问题/);
  assert.match(html, /class="fx-count is-repeat">2 个任务/);
  assert.ok(
    html.includes(
      'href="../issues/101/runs/9101/attempt-1/index.html#review-finding-F2"',
    ),
  );
  assert.ok(
    html.includes(
      'href="../issues/102/runs/9102/attempt-1/index.html#review-finding-F2"',
    ),
  );
  assert.match(html, /Scheduler 缺少立即执行入口/);
});

test('two findings of the same report never merge, even when identical', () => {
  const duplicate = report(201, (findings) =>
    findings.push({ ...findings[1], id: 'F9' }),
  );
  const reports = [duplicate, report(202)];
  assert.throws(() => classified(reports, [[0, 1, 2]]), /same report/);
  const { occurrences } = collectOccurrences(reports);
  const clusters = clusterOccurrences(
    occurrences,
    classified(reports, [[0, 2], [1]]),
  );
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
      version: 1,
      repository: 'nocobase/nocobase3',
      ref: 'develop',
      sha: 'c'.repeat(40),
      checkedAt: '2026-09-27',
      checker: '测试',
      findings: {
        F2: {
          status: 'fixed',
          summary: '已修复',
          evidence: [
            { label: '现状', path: 'docs/a.md', lines: [1, 1], excerpt: 'ok' },
          ],
        },
      },
    };
  });
  const classification = classified([older, newer], [[0, 1]]);
  const [cluster] = clusterOccurrences(
    collectOccurrences([older, newer]).occurrences,
    classification,
  ).filter((item) => item.items.length > 1);
  assert.equal(cluster.severity, 'major');
  assert.equal(cluster.type, 'guidance-error');
  assert.equal(cluster.upstream.entry.status, 'fixed');
  assert.match(
    await renderFindingsIndex([older, newer], { classification }),
    /class="up up-fixed"[^>]*>上游已修复/,
  );
});

test('only valid v2 framework findings are indexed; everything else is reported, never guessed', async () => {
  const legacy = {
    delivery: {
      ...report(401).delivery,
      buildReview: fixture('example.review.json'),
    },
  };
  const failed = {
    delivery: {
      ...report(402).delivery,
      buildReview: { state: 'failed', reason: 'timeout' },
    },
  };
  const invalid = report(403, (findings) => {
    findings[1].evidence = ['E9999'];
  });
  const escaped = report(404, (findings) => {
    findings[1].title = '<img src=x onerror=alert(1)>';
  });
  const html = await renderFindingsIndex([legacy, failed, invalid, escaped]);
  assert.match(
    html,
    /其中 1 份有可用的 v2 独立评审（另有 1 份评审数据不符合当前格式，未纳入）/,
  );
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x|业务调用位置错误/);
  assert.match(html, /可能误合并或漏合并/);
  assert.doesNotMatch(html, /<script/);
});

test('without a validated Agent decision even identical descriptions remain pending', async () => {
  const reports = [report(501), report(502)];
  const clusters = clusterOccurrences(collectOccurrences(reports).occurrences);
  assert.equal(clusters.length, 2);
  assert.ok(clusters.every((group) => !group.reviewed));
  const html = await renderFindingsIndex(reports);
  assert.match(html, /2 条待 Agent 归类/);
  assert.doesNotMatch(html, /class="fx-count is-repeat"/);
});

test('Agent membership can join different wording and keep similar wording separate', () => {
  const reports = [report(601), report(602, unrelated), report(603)];
  const groups = clusterOccurrences(
    collectOccurrences(reports).occurrences,
    classified(reports, [[0, 1], [2]]),
  );
  assert.deepEqual(
    groups
      .find((group) => group.items.length === 2)
      .items.map((item) => item.issue)
      .sort(),
    [601, 602],
  );
  assert.ok(
    groups.some(
      (group) => group.items.length === 1 && group.items[0].issue === 603,
    ),
  );
});

test('each evidence row shows its own recorded NocoBase App version, never an inferred package version', async () => {
  const reports = [
    report(701, (_, facts) => {
      facts.baseline.templateVersion = '1.0.0-beta.47';
    }),
    report(702, (_, facts) => {
      facts.baseline.templateVersion = '1.0.0-beta.48';
    }),
    report(703, (_, facts) => {
      delete facts.baseline;
    }),
  ];
  const html = await renderFindingsIndex(reports, {
    classification: classified(reports, [[0, 1, 2]]),
  });
  assert.match(html, /<th>NocoBase App 版本<\/th>/);
  for (const [issue, version] of [
    [701, '1.0.0-beta.47'],
    [702, '1.0.0-beta.48'],
    [703, '未记录'],
  ]) {
    const row = html.match(
      new RegExp('<tr><td><a[^>]+>#' + issue + '[\\s\\S]*?<\\/tr>'),
    )?.[0];
    assert.ok(row?.includes('>' + version + '</td>'), row);
  }
});

test('classification prose and version cells are escaped', async () => {
  const reports = [
    report(801, (_, facts) => {
      facts.baseline.templateVersion = '<img src=x>';
    }),
  ];
  const classification = classified(reports, [[0]]);
  classification.groups[0].title = '<script>alert(1)</script>';
  classification.groups[0].reason = '<img src=x onerror=alert(1)>';
  const html = await renderFindingsIndex(reports, { classification });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<script|<img src=x/);
});
