import {
  diagnosisCategories,
  findingKinds,
  owners,
} from '../scripts/build-review.mjs';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export const isFrameworkFinding = (finding) =>
  ['framework', 'plugin', 'template', 'documentation'].includes(finding.owner);
export const severityLabels = {
  critical: '严重',
  major: '重要',
  minor: '轻微',
  info: '信息',
};
export const findingCategory = (finding) =>
  ['strength', 'improvement'].includes(finding.kind)
    ? findingKinds[finding.kind]
    : diagnosisCategories[finding.diagnosis?.category] ||
      (finding.owner === 'documentation'
        ? '指引问题'
        : findingKinds[finding.kind]);
export const findingStatus = (status) =>
  ({
    open: '原评审：未解决',
    resolved: '原评审：已解决',
    unknown: '原评审：处理状态未知',
    'not-applicable': '原评审：状态不适用',
  })[status];
export const orderFindings = (findings) =>
  [...findings].sort(
    (a, b) =>
      Object.keys(severityLabels).indexOf(a.severity) -
      Object.keys(severityLabels).indexOf(b.severity),
  );
const tag = (label, kind = '') =>
  `<span class="tag ${kind}">${escape(label)}</span>`;
const refs = (ids) =>
  `<span class="review-refs">${ids.map((id) => `<a href="#review-evidence-${escape(id)}">${escape(id)}</a>`).join(' ')}</span>`;
const metric = (label, number, note) =>
  `<div class="card metric"><div class="metric-head">${escape(label)}</div><div class="metric-value">${escape(number)}</div><div class="metric-note">${escape(note)}</div></div>`;

// The caller validates the report first. This is a view of frozen findings, not
// another assessment, a current-upstream check, or a conversion of v1 scores.
export function renderFrameworkOverview(report) {
  const review = ['completed', 'partial'].includes(report?.state)
    ? report.evaluation
    : null;
  if (!review || review.version !== 2) {
    const state = review
      ? '旧口径报告，尚无 v2 框架评测。'
      : report?.execution?.buildReviewMode === 'off'
        ? '本轮采用轻量模式，未进行独立评测。'
        : report?.state === 'failed'
          ? '独立评测未完成或结果无效，当前材料不足。'
          : '本轮未进行独立评测。';
    return `<div class="card report-empty framework-empty"><strong>框架问题尚未评估</strong><p>${state}不能把缺少评测显示为零问题，也不能用业务验收通过替代框架结论。</p>${report?.reason ? `<p>${escape(report.reason)}</p>` : ''}<p>最新 NocoBase3 源码：未复核。已有记录保留在<a class="text-link" href="#problems">问题与改进</a>。</p></div>`;
  }
  const findings = review.findings.filter(
    (finding) => finding.kind !== 'strength',
  );
  const framework = findings.filter(isFrameworkFinding);
  const issues = framework.filter((finding) => finding.kind !== 'improvement');
  const confirmed = issues.filter(
    (finding) => finding.confidence === 'confirmed',
  );
  const suspected = issues.filter(
    (finding) => finding.confidence === 'suspected',
  );
  const suggestions = framework.filter(
    (finding) => finding.kind === 'improvement',
  );
  const unknown = findings.filter((finding) => finding.owner === 'unknown');
  const background = findings.filter((finding) =>
    ['application', 'factory', 'environment'].includes(finding.owner),
  );
  let html = `<div class="framework-basis">${tag(report.state === 'partial' ? '独立评测部分完成' : '独立评测完成', report.state === 'partial' ? 'warn' : '')}<span>范围：本任务冻结的依赖与指引 · 源 Run ${escape(report.basis.runId)} / attempt ${escape(report.basis.attempt)}</span><a class="text-link" href="#review-basis">查看版本与指纹 →</a></div>`;
  html += `<div class="metrics framework-metrics">${metric('有证据的问题', confirmed.length, '评审者判断；尚非最新上游确认')}${metric('待确认的问题', suspected.length, '已有线索，仍需核对推断与归因')}${metric('改进建议', suggestions.length, '不直接当作实现缺陷')}${metric('最新源码复核', '未执行', '业务通过、应用绕行均不代表上游已修复')}</div>`;
  html += `<p class="section-intro">${escape(review.summary)}</p>`;
  if (report.state === 'partial')
    html += `<p class="report-banner">仅展示已完成部分；未覆盖项不等于无问题。${escape(report.reason || '')} 待评估：${escape(review.progress.pendingModules.join('、') || '见覆盖限制')}。</p>`;
  html +=
    '<p class="check-source">问题数包含原评审标记已解决的记录，不能当作当前未修复总数。以下按原评审严重度排序，不自动推导排期优先级。</p>';
  if (framework.length) {
    html += '<div class="improvement-index" aria-label="NocoBase3 改进清单">';
    for (const finding of orderFindings(framework)) {
      const targets = [
        ...new Set(
          review.modules.flatMap((module) =>
            module.targets
              .filter((target) =>
                target.evidence.some((id) => finding.evidence.includes(id)),
              )
              .map((target) => target.name),
          ),
        ),
      ];
      const targetHtml = `<p class="check-source">相关对象：${targets.length ? targets.map((name) => `<code>${escape(name)}</code>`).join(' · ') : '尚未通过引用定位到具体框架对象'}</p>`;
      html += `<article class="card improvement-index-item"><div class="improvement-index-main"><div class="review-badges">${tag(findingCategory(finding))}${tag(severityLabels[finding.severity], ['critical', 'major'].includes(finding.severity) ? 'warn' : '')}${tag(finding.confidence === 'confirmed' ? '冻结材料有据' : '待确认', finding.confidence === 'suspected' ? 'warn' : '')}</div><h3><a class="text-link" href="#review-finding-${escape(finding.id)}">${escape(finding.id)} · ${escape(finding.title)} →</a></h3><p><strong>影响</strong>${escape(finding.impact)}</p>${targetHtml}<div class="check-source">${escape(owners[finding.owner])} · ${escape(findingStatus(finding.status))}</div></div><div class="improvement-index-action"><span class="eyebrow">建议改动</span><p>${escape(finding.suggestedChange)}</p>${refs(finding.evidence)}</div></article>`;
    }
    html += '</div>';
  } else {
    html += `<p class="card report-empty">${report.state === 'partial' ? '已评测部分' : '本轮评测'}未提出归属于 NocoBase3 的问题或建议，不等于整个框架没有问题。</p>`;
  }
  html += `<p class="check-source">另有 ${unknown.length} 条归因待确认、${background.length} 条业务 / 工厂 / 环境观察，单独保留在<a class="text-link" href="#problems">问题详情</a>，未计入框架问题数。应用交付情况见<a class="text-link" href="#delivery">业务交付</a>。</p>`;
  return html;
}
