import { shortSha, upstreamEntry, upstreamStatus } from './upstream-check.mjs';

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
// Severity is graded by consequence, the same wording the review prompt uses.
export const severityRubric = {
  critical: '阻塞交付，或造成数据丢失、安全问题，且没有合理绕行',
  major: '按指引或公开 API 正常使用会静默得到错误结果，或只能用非公开手段绕行',
  minor: '能完成，但要多花排查成本或在应用侧绕行',
  info: '措辞、示例完整度等不影响结果的改进',
};
// Display-only taxonomy. The review schema keeps `kind` and
// `diagnosis.category`; readers get one type axis so "guidance is wrong" and
// "guidance is missing" no longer hide under the same "improvement" heading.
export const findingTypes = {
  'runtime-defect': '实现缺陷',
  'capability-gap': '能力缺口',
  'guidance-error': '指引错误',
  'guidance-gap': '指引缺失',
  usability: '易用性改进',
  unclassified: '未分类问题',
  strength: '做得好的地方',
};
export const typeRubric = {
  'runtime-defect': '实现违背文档或公开约定',
  'capability-gap': '需求属于框架职责，但缺少能力或公开接入',
  'guidance-error': '指引、示例或注释写错，或彼此矛盾，照做会出错',
  'guidance-gap': '指引缺少必要说明或示例，需要读源码或试探',
  usability: '现有能力可用，但有改进空间',
  unclassified: '原评审未给出可映射的分类',
};
export const findingType = (finding) => {
  if (finding.kind === 'strength') return 'strength';
  const category = finding.diagnosis?.category;
  if (category === 'runtime-defect' || category === 'capability-gap')
    return category;
  if (finding.kind === 'misleading') return 'guidance-error';
  if (category === 'guidance-gap') return 'guidance-gap';
  if (category === 'usability-improvement' || finding.kind === 'improvement')
    return 'usability';
  return finding.owner === 'documentation' ? 'guidance-gap' : 'unclassified';
};
// A recheck may regrade; readers sort and triage by the latest judgement while
// the original stays visible next to it.
export const effectiveSeverity = (finding, check) =>
  upstreamEntry(check, finding)?.suggestedSeverity ?? finding.severity;
export const effectiveType = (finding, check) =>
  upstreamEntry(check, finding)?.suggestedType ?? findingType(finding);
export const findingCategory = (finding, check) =>
  findingTypes[effectiveType(finding, check)];
export const findingStatus = (status) =>
  ({
    open: '原评审：未解决',
    resolved: '原评审：已解决',
    unknown: '原评审：处理状态未知',
    'not-applicable': '原评审：状态不适用',
  })[status];
const severityOrder = Object.keys(severityLabels);
const typeOrder = Object.keys(findingTypes);
export const orderFindings = (findings, check) =>
  [...findings].sort(
    (a, b) =>
      severityOrder.indexOf(effectiveSeverity(a, check)) -
        severityOrder.indexOf(effectiveSeverity(b, check)) ||
      typeOrder.indexOf(effectiveType(a, check)) -
        typeOrder.indexOf(effectiveType(b, check)),
  );
// Colour carries the two axes readers triage by; the label text is always
// present so the page still reads in print and for colour-blind readers.
const sevChip = (severity, extra = '') =>
  `<span class="sev sev-${escape(severity)}${extra}" title="${escape(severityRubric[severity])}">${escape(severityLabels[severity])}</span>`;
const typeChipOf = (type, extra = '') =>
  `<span class="ftype ftype-${type}${extra}" title="${escape(typeRubric[type] ?? '')}"><i aria-hidden="true"></i>${escape(findingTypes[type])}</span>`;
const regrade = (was, now, label) =>
  `<span class="regrade" title="${escape(label)}">${was}<span class="regrade-arrow" aria-label="复核建议改为">→</span>${now}</span>`;
export const severityChip = (finding, check) => {
  const now = effectiveSeverity(finding, check);
  if (now === finding.severity) return sevChip(now);
  return regrade(
    sevChip(finding.severity, ' is-was'),
    sevChip(now),
    `原评审${severityLabels[finding.severity]}，上游复核建议${severityLabels[now]}`,
  );
};
export const typeChip = (finding, check) => {
  const was = findingType(finding);
  const now = effectiveType(finding, check);
  if (now === was) return typeChipOf(now);
  return regrade(
    typeChipOf(was, ' is-was'),
    typeChipOf(now),
    `原评审${findingTypes[was]}，上游复核建议${findingTypes[now]}`,
  );
};
// Only departures from the default (confirmed, open) earn a badge.
export const exceptionChips = (finding) =>
  (finding.confidence === 'suspected'
    ? '<span class="tag warn">待确认</span>'
    : '') +
  (finding.status !== 'open'
    ? `<span class="tag">${escape(findingStatus(finding.status))}</span>`
    : '');
export const upstreamChip = (finding, check) => {
  const entry = upstreamEntry(check, finding);
  if (!entry) return '<span class="up up-none">上游未复核</span>';
  return `<span class="up up-${escape(entry.status)}" title="${escape(`${check.repository} ${check.ref}@${shortSha(check)}，${check.checkedAt}`)}">${escape(upstreamStatus[entry.status])}</span>`;
};
export const findingTargets = (review, finding) => [
  ...new Set(
    review.modules.flatMap((module) =>
      // Rubric v1 modules have no targets.
      (module.targets ?? [])
        .filter((target) =>
          target.evidence.some((id) => finding.evidence.includes(id)),
        )
        .map((target) => target.name),
    ),
  ),
];
export function upstreamScope(check, findings) {
  if (!check)
    return '<b>最新 NocoBase3 源码未复核</b>，问题可能已在上游修复';
  const present = findings.filter(
    (finding) => upstreamEntry(check, finding)?.status === 'present',
  ).length;
  const checked = findings.filter((finding) =>
    upstreamEntry(check, finding),
  ).length;
  return `<b>最新上游已复核</b>：${escape(check.checkedAt)} 对照 <code>${escape(check.repository)}</code> ${escape(check.ref)}@${escape(shortSha(check))}，${checked} / ${findings.length} 条已复核、${present} 条仍存在`;
}

// The caller validates the report first. This is a triage index of the frozen
// findings (plus an optional upstream recheck), not another assessment.
export function renderFrameworkOverview(report, check = null) {
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
  const suspected = framework.filter(
    (finding) => finding.confidence === 'suspected',
  ).length;
  const unknown = findings.filter((finding) => finding.owner === 'unknown');
  const background = findings.filter((finding) =>
    ['application', 'factory', 'environment'].includes(finding.owner),
  );
  let html = '';
  if (report.state === 'partial')
    html += `<p class="report-banner">仅展示已完成部分；未覆盖项不等于无问题。${escape(report.reason || '')} 待评估：${escape(review.progress.pendingModules.join('、') || '见覆盖限制')}。</p>`;
  if (framework.length) {
    html += `<div class="card fb-table" aria-label="NocoBase3 问题清单"><div class="fb-table-head"><h2>${framework.length} 条 NocoBase3 框架问题</h2><span>${suspected ? `其中 ${suspected} 条待确认 · ` : ''}按等级排序 · 点击查看详情与证据</span></div>`;
    for (const finding of orderFindings(framework, check)) {
      const targets = findingTargets(review, finding);
      html += `<a class="fb-item sev-${escape(effectiveSeverity(finding, check))}" href="#review-finding-${escape(finding.id)}"><span class="fb-chips">${severityChip(finding, check)}${typeChip(finding, check)}</span><span class="fb-item-main"><strong>${escape(finding.id)} · ${escape(finding.title)}</strong><span class="fb-item-impact">${escape(finding.impact)}</span><span class="fb-item-targets">${targets.length ? targets.map((name) => `<code>${escape(name)}</code>`).join('') : '尚未定位到具体框架对象'}</span></span><span class="fb-item-side">${upstreamChip(finding, check)}${exceptionChips(finding)}</span></a>`;
    }
    html += '</div>';
  } else {
    html += `<p class="card report-empty">${report.state === 'partial' ? '已评测部分' : '本轮评测'}未提出归属于 NocoBase3 的问题或建议，不等于整个框架没有问题。</p>`;
  }
  if (unknown.length || background.length)
    html += `<p class="check-source">另有 ${unknown.length} 条归因待确认、${background.length} 条业务 / 工厂 / 环境观察，单独保留在<a class="text-link" href="#problems">问题详情</a>，未计入框架问题数。</p>`;
  html += `<p class="fb-scope">${upstreamScope(check, framework)} · 评审基于本任务冻结的依赖与指引（源 Run ${escape(report.basis.runId)} / attempt ${escape(report.basis.attempt)}）· 排序不代表排期优先级 · <a class="text-link" href="#review-basis">版本与指纹 →</a></p>`;
  return html;
}
