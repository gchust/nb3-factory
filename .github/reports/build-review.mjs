import { dimensionsFor, findingKinds, moduleRoundResult, owners, supportLabels, targetKinds, validateBuildReview } from '../scripts/build-review.mjs';
import { findingCategory, findingStatus, isFrameworkFinding, orderFindings, renderFrameworkOverview, severityLabels } from './framework-overview.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = (label, kind = '') => `<span class="tag ${kind}">${escape(label)}</span>`;
const states = { passed: '报告通过', failed: '报告未通过', blocked: '环境受阻', not_run: '未执行', unknown: '未验证' };
const result = state => tag(states[state] ?? states.unknown, state === 'failed' ? 'bad' : state === 'passed' ? 'good' : 'warn');
const refs = ids => `<span class="review-refs">${ids.map(id => `<a href="#review-evidence-${escape(id)}">${escape(id)}</a>`).join(' ')}</span>`;
const value = score => score === null ? '<span class="review-na">未评估</span>' : `<strong class="review-score">${score}<small>/100</small></strong>`;
const list = values => values.length ? `<ul class="compact-list">${values.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="muted">未提供额外说明。</p>';

function processHtml(process) {
  if (!process || !Array.isArray(process.rounds)) return '<p class="report-empty">本轮未采集验证过程，不推断一轮完成。</p>';
  const metric = (label, number) => `<div><span>${label}</span><strong>${Number.isSafeInteger(number) ? number : '未提供'}</strong></div>`;
  const rows = process.rounds.flatMap(round => round.reports.length ? round.reports.map(report => `<tr><td>验证 ${round.round}</td><td>${report.scope === 'full' ? '全量浏览器 QA' : '失败项复测（非全量）'}</td><td>${result(report.passed === true ? 'passed' : report.passed === false ? 'failed' : 'unknown')}</td><td>${report.checks.filter(c => c.status === 'failed').map(c => `${escape(c.id ?? '无 ID')} ${escape(c.criterion)}`).join('<br>') || '未记录 failed 项；不代表全部操作完成'}</td></tr>`) : [`<tr><td>验证 ${round.round}</td><td colspan="3">没有浏览器 QA 记录，不能推断业务通过；检查构建日志。</td></tr>`]);
  return `<div class="review-process">${metric('本 Run 验证轮次', process.verificationAttempts)}${metric('本 Run 工厂修复轮次', process.repairAttempts)}${metric('已保留验证轮次', process.rounds.length)}</div>
    <p class="check-source">${escape(process.scope)}</p>
    <details class="card raw-record"><summary>首轮与修复过程 · 查看逐轮原始状态</summary><div class="subsection-body"><div class="table-wrap"><table><thead><tr><th>轮次</th><th>范围</th><th>原始结论</th><th>失败项</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4">无记录；不是 0 次失败。</td></tr>'}</tbody></table></div>${list(process.warnings)}</div></details>`;
}

function targetList(module, report) {
  return `<div class="review-targets">${module.targets.map(target => {
    const version = report.basis.packages?.find(pkg => pkg.name === target.name)?.version;
    return `<div><span class="eyebrow">${escape(targetKinds[target.kind])}</span><strong>${escape(target.name)}</strong><span class="check-source">${escape(version || '版本见冻结输入')}</span><p>${escape(target.entrypoints.join(' · '))}</p>${refs(target.evidence)}</div>`;
  }).join('')}</div>`;
}
function requirementList(module) {
  return `<div class="review-requirements"><h3>需求 → 框架职责 → 推荐与实际接入</h3>${module.requirements.map(item => `<article><header><strong>${escape(item.need)}</strong>${tag(supportLabels[item.support], ['missing', 'workaround'].includes(item.support) ? 'warn' : '')}</header><dl class="retro-fields"><div><dt>框架职责与业务边界</dt><dd>${escape(item.responsibility)}</dd></div><div><dt>推荐使用方式</dt><dd>${escape(item.recommendedUsage)}</dd></div><div><dt>Agent 实际使用</dt><dd>${escape(item.actualUsage)}</dd></div><div><dt>缺口归因</dt><dd>${escape(item.gapOwner === 'none' ? '未记录能力缺口' : owners[item.gapOwner])}</dd></div></dl>${refs(item.evidence)}</article>`).join('')}</div>`;
}
function retainedLegacy(report) {
  if (!report?.legacyReview) return '';
  try { validateBuildReview(report.legacyReview); } catch { return '<p class="check-source">附带历史评分无效，未展示；当前框架评测不受影响。</p>'; }
  if (report.legacyReview.basis.rubricVersion !== 1 || !report.legacyReview.evaluation) return '';
  return `<details class="card raw-record review-legacy"><summary>保留的旧口径 v1 评分 · 不转换为框架得分</summary><div class="subsection-body"><p>历史分数、理由、证据及其原始含义保持不变，不与本次五项框架维度比较或平均。</p><pre>${escape(JSON.stringify(report.legacyReview, null, 2))}</pre></div></details>`;
}

function renderFindings(findings, framework) {
  let html = '';
  const confidence = { confirmed: '评审者判断 · 冻结材料有据', suspected: '待确认' };
  const groups = framework ? [
    { title: 'NocoBase3 库、插件、模板与指引', findings: findings.filter(isFrameworkFinding) },
    { title: '归因待确认 · 不直接扣框架分', findings: findings.filter(f => f.owner === 'unknown') },
    { title: '业务实现与执行环境观察 · 不计入框架得分', findings: findings.filter(f => ['application', 'factory', 'environment'].includes(f.owner)), collapsed: true },
  ] : [{ title: '', findings: findings }];
  for (const group of groups.filter(group => group.findings.length)) {
    if (group.collapsed) html += `<details class="card raw-record"><summary>${group.title}（${group.findings.length}）</summary><div class="subsection-body">`;
    else if (group.title) html += `<h3 class="review-owner-title">${group.title}</h3>`;
    for (const [kind, label] of Object.entries(findingKinds)) {
      const findings = group.findings.filter(finding => finding.kind === kind);
      if (!findings.length) continue;
      html += `<div class="review-group"><h3>${label} <span>${findings.length}</span></h3>`;
      for (const finding of orderFindings(findings)) {
        const important = kind !== 'strength' && isFrameworkFinding(finding) && ['major', 'critical'].includes(finding.severity);
        const diagnosis = finding.diagnosis;
        const diagnosisHtml = diagnosis ? `<dl class="retro-fields diagnosis-fields">${[['trigger', '触发条件'], ['expected', '应有能力 / 行为'], ['actual', '实际观察'], ['workaround', '应用绕行与代价'], ['acceptance', '改进后的验收标准']].map(([key, label]) => `<div><dt>${label}</dt><dd>${escape(diagnosis[key])}</dd></div>`).join('')}</dl>` : framework && kind !== 'strength' ? '<p class="check-source">本条未提供结构化触发条件、绕行与回归标准，请按原文和证据复核，不自动补造。</p>' : '';
        html += `<details class="card review-finding" id="review-finding-${escape(finding.id)}" ${important ? 'open' : ''}><summary><div><strong>${escape(finding.title)}</strong><div class="review-badges">${tag(owners[finding.owner])}${tag(findingCategory(finding))}${tag(confidence[finding.confidence], finding.confidence === 'suspected' ? 'warn' : '')}${tag(severityLabels[finding.severity], important ? 'bad' : '')}${tag(findingStatus(finding.status))}</div></div><span>⌄</span></summary><div class="subsection-body"><p>${escape(finding.detail)}</p>${kind === 'misleading' ? `<div class="review-contrast"><div><h4>文档 / API 声称</h4><p>${escape(finding.claimed)}</p></div><div><h4>实际观察</h4><p>${escape(finding.observed)}</p></div></div>` : ''}<dl class="retro-fields"><div><dt>实际影响 / 提供的帮助</dt><dd>${escape(finding.impact)}</dd></div><div><dt>建议改法 / 应保留的能力</dt><dd>${escape(finding.suggestedChange)}</dd></div></dl>${diagnosisHtml}${framework && kind !== 'strength' && isFrameworkFinding(finding) ? '<p class="check-source upstream-boundary">最新上游状态：未复核。原评审“已解决”不作为上游修复证明；应用绕行、业务 QA 通过均不关闭框架问题。</p>' : ''}${refs(finding.evidence)}</div></details>`;
      }
      html += '</div>';
    }
    if (group.collapsed) html += '</div></details>';
  }
  return html;
}

export function renderHistoryCoverage(report) {
  const input = report?.basis?.history;
  if (input?.version !== 2) return '';
  const checked = report.evaluation?.historyCoverage;
  const label = {
    available: '完整纳入已捕获记录',
    partial: '部分缺失',
    unavailable: '不可用',
  };
  const size = (value) =>
    Number.isFinite(value)
      ? (value / 1024 / 1024).toFixed(2) + ' MiB'
      : '未记录';
  return (
    '<article class="card"><h3>原始搭建历史覆盖</h3><p>输入覆盖：' +
    escape(label[input.coverage] ?? '未知') +
    ' · 原始记录 ' +
    escape(size(input.sourceBytes)) +
    ' · 脱敏后纳入 ' +
    escape(size(input.capturedBytes)) +
    '</p><p>原事件引用覆盖：' +
    escape(
      checked
        ? checked.referencedInvocations + '/' + checked.invocations + ' 次调用'
        : '未完成核对',
    ) +
    ' · 显式错误信号核对：' +
    escape(
      checked
        ? checked.assessedErrorSignals + '/' + checked.errorSignals
        : '未完成核对',
    ) +
    '</p><p class="check-source">输入完整、引用覆盖和评审推理是不同维度。文件存在不证明 Agent 阅读过；错误信号不等于框架缺陷，已引用也不证明通读或理解了每一字节。</p>' +
    list(input.limitations) +
    '</article>'
  );
}

// Return separate presentation slots after one validation; findings are shared
// only for exact supplementary-note links, never to rewrite source assessments.
export function renderBuildReview(input) {
  let report = input;
  if (['completed', 'partial'].includes(report?.state)) {
    try { validateBuildReview(report); }
    catch { report = { state: 'failed', reason: '评审数据无效，未采用评分；原始验收仍保留。', process: input.process }; }
  }
  const review = ['completed', 'partial'].includes(report?.state) ? report.evaluation : null;
  const overviewHtml = renderFrameworkOverview(report);
  const framework = review?.version === 2;
  const dimensions = dimensionsFor(framework ? 2 : 1);
  const primary = framework ? ['requirementFit', 'usability', 'agentFriendliness'] : Object.keys(dimensions);
  let html = `<section class="section" id="build-review"><div class="section-head"><div><div class="eyebrow">${framework ? 'NocoBase3 framework assessment' : 'Build assessment'}</div><h2>${framework ? 'NocoBase3 基础框架评测' : review ? '旧口径搭建质量与模块评审' : 'NocoBase3 基础框架评测'}</h2></div>${tag(review ? `独立 Agent 评审 · 口径 v${review.version}` : '未完成独立评审', review ? '' : 'warn')}</div>`;
  html += `<div class="review-disclaimer">${framework ? '评的是库、插件与指引是否满足需求、容易使用、对 Agent 友好。业务代码与 QA 是使用证据，不是评分主体。' : '评分是评审者基于本次覆盖范围的意见，不是客观测量，也不是 NocoBase3 整体评分。'} 未评估不是零分或满分，不计算综合平均分。</div>`;
  html += renderHistoryCoverage(report);
  if (review && !framework) html += '<div class="report-banner"><strong>旧口径 v1 · 不作为新框架评分</strong><p>历史四项分数保留原含义，包括 Agent 产出质量。不得改名为需求满足度或使用便利度；需要按口径 v2 重新独立评审。</p></div>';
  if (!framework) html += processHtml(report?.process);
  if (report?.basis) html += `<p class="check-source">评审源产物：Run ${escape(report.basis.runId)} / attempt ${escape(report.basis.attempt)}${report.reviewer?.replay ? ` · 后补评审 Run ${escape(report.reviewer.runId)} / attempt ${escape(report.reviewer.attempt)}` : ''}。发布重试不改变评审源产物编号。</p>`;
  if (report?.state === 'partial') html += `<div class="report-banner"><strong>部分评审 · 尚未全覆盖</strong><p>${escape(report.reason)}</p></div>`;
  if (report?.supplementalUsage) html += `<p class="check-source">本次后补评审用量（独立于原搭建）：${escape(report.supplementalUsage.totalTokens ?? '未提供')} Token（含缓存）；不重复计入原搭建。</p>`;
  if (!review) {
    const state = report?.execution?.buildReviewMode === 'off' ? '本轮采用轻量模式，未进行独立评测。'
      : report?.state === 'failed' ? '独立评测未完成或结果无效，当前材料不足。'
        : '本轮未进行独立评测，不能据此声称没有问题或建议。';
    return {
      overviewHtml,
      html: html + `<div class="card report-empty"><strong>本轮不显示评分</strong><p>${escape(report?.reason || state)}</p></div></section><section class="section" id="framework-feedback"><div class="section-head"><h2>框架帮助与证据</h2></div><p class="muted">尚无独立评审结论；已有过程记录见<a class="text-link" href="#problems">问题与改进</a>。</p></section>`,
      feedbackHtml: `<p class="muted">${state}</p>${report?.reason ? `<p class="check-source">${escape(report.reason)}</p>` : ''}`,
      findings: [],
    };
  }
  html += `<p class="review-summary">${escape(review.summary)}</p>`;
  const scored = review.modules.reduce((n, module) => n + Object.keys(dimensions).filter(key => module.scores[key].score !== null).length, 0);
  html += `<div class="review-caption">${review.modules.length} 个${framework ? '框架能力单元' : '模块'} · ${scored} / ${review.modules.length * Object.keys(dimensions).length} 项已评分${framework ? ' · 主表展示三项重点，设计与可靠性见详情' : ''}</div><div class="card table-wrap review-matrix ${framework ? 'framework-matrix' : ''}"><table><thead><tr><th>${framework ? '框架能力 / 具体被评对象' : '基础模块 / 本次范围'}</th>${primary.map(key => `<th>${dimensions[key]}</th>`).join('')}${framework ? '' : '<th>首轮 QA</th><th>最终轮 QA</th>'}</tr></thead><tbody>`;
  for (const [index, module] of review.modules.entries()) {
    html += `<tr><td><a href="#review-module-${index}"><strong>${escape(module.name)}</strong></a><p>${escape(framework ? module.targets.map(target => target.name).join(' · ') : module.scope)}</p></td>${primary.map(key => `<td data-label="${dimensions[key]}">${value(module.scores[key].score)}</td>`).join('')}${framework ? '' : `<td>${result(moduleRoundResult(module, report.process, 1))}</td><td>${result(moduleRoundResult(module, report.process, report.process?.finalRound))}</td>`}</tr>`;
  }
  html += `</tbody></table></div><p class="check-source">${framework ? '正常业务组合不等于框架缺陷；Agent 用错、工厂误报和环境问题需要分别归因。数字仅适用于列出的职责与覆盖范围。' : '模块与验收项的映射由评审者提供，状态读取原始全量 QA。缺少首轮、缺少映射或只有定向复测时显示未验证；最终通过不抹去首轮失败。'}</p><div class="review-modules">`;
  for (const [index, module] of review.modules.entries()) {
    html += `<details class="card review-module" id="review-module-${index}"><summary><strong>${escape(module.name)}</strong><span>${framework ? '对象、需求覆盖、五项理由与证据' : '展开四项理由与证据'}</span></summary><div class="subsection-body"><p>${escape(module.scope)}</p>${framework ? targetList(module, report) + requirementList(module) : ''}<div class="review-dimensions">${Object.entries(dimensions).map(([key, label]) => {
      const score = module.scores[key];
      return `<article><header><h3>${label}</h3>${value(score.score)}</header><p>${escape(score.reason)}</p>${refs(score.evidence)}</article>`;
    }).join('')}</div><p class="check-source">覆盖限制：${escape(module.limitations)}</p><p class="check-source">映射验收项：${escape(module.criteria.join(', ') || '未建立映射')}</p>${framework ? `<div class="review-badges"><span>业务首轮 QA</span>${result(moduleRoundResult(module, report.process, 1))}<span>业务最终轮 QA</span>${result(moduleRoundResult(module, report.process, report.process?.finalRound))}</div><p class="check-source">这是业务验证背景，不直接换算框架分数；首轮失败不会被最终通过覆盖。</p>` : ''}</div></details>`;
  }
  html += '</div>' + retainedLegacy(report);
  if (framework) html += `<details class="card raw-record"><summary>业务验证背景 · 不计入框架评分</summary><div class="subsection-body">${processHtml(report?.process)}</div></details>`;
  html += `<article class="card review-ui"><header><h3>${framework ? '业务界面观察 · 非框架评分' : '界面样式与交互一致性'}</h3>${value(review.ui.score)}</header><p>${escape(review.ui.reason)}</p>${refs(review.ui.evidence)}<p class="check-source">${review.ui.status === 'reviewed' ? '评审者声明已审阅所引用的图像；请展开证据核对观察，不以文件存在代替人工确认。' : '未执行跨页面图像审阅，不能因使用相同组件库而判为视觉一致。'}</p></article></section>`;
  html += `<section class="section" id="framework-feedback"><div class="section-head"><div><div class="eyebrow">Infrastructure feedback</div><h2>${framework ? '框架帮助与证据' : '旧口径帮助与证据'}</h2></div></div><p class="section-intro">保留具体基础能力的帮助、覆盖范围与原始证据。“有证据 / 待确认”均为独立评审者判断，不代替人工核验。</p>`;
  const findings = review.findings.filter(finding => finding.kind !== 'strength');
  html += renderFindings(review.findings.filter(finding => finding.kind === 'strength'), framework);
  html += '<p class="check-source">问题、误导与建议统一收录在<a class="text-link" href="#problems">问题与改进</a>，不在此重复展示。</p>';
  const provenance = `来源：独立评审 · 口径 v${review.version} · 源 Run ${escape(report.basis.runId)} / attempt ${escape(report.basis.attempt)}${report.reviewer?.replay ? ` · 后补评审 Run ${escape(report.reviewer.runId)} / attempt ${escape(report.reviewer.attempt)}` : ''}`;
  const feedbackHtml = `<p class="check-source">${provenance}</p>${report.state === 'partial' ? `<p class="report-banner">评测仅部分完成；以下仅为已有发现，未覆盖部分不能推断为无问题。${escape(report.reason)}</p>` : ''}${findings.length ? renderFindings(findings, framework) : `<p class="muted">${report.state === 'partial' ? '已完成部分未提出问题或改进建议；其余尚未评测。' : '已完成独立评测，本轮未提出问题或改进建议；不等于不存在问题。'}</p>`}`;
  html += `<details class="card raw-record" open><summary>本次评审的覆盖限制</summary><div class="subsection-body">${list(review.limitations)}</div></details>`;
  html += `<details class="card raw-record" id="review-basis"><summary>评审基线与版本指纹</summary><div class="subsection-body"><p>评审针对已封存候选补丁与当时的依赖；可能在原搭建内或之后单独补跑。与 PR 或 NocoBase3 当前最新提交不是同一概念。评审只读冻结材料，引用运行日志不代表评审者重新复现；此报告未执行最新上游源码复核。</p><pre>${escape(JSON.stringify({ reviewer: report.reviewer, ...report.basis }, null, 2))}</pre></div></details>`;
  html += '<div class="review-evidence"><h3>证据与原文</h3>';
  for (const evidence of review.evidence) {
    html += `<details class="card raw-record" id="review-evidence-${escape(evidence.id)}"><summary><strong>${escape(evidence.id)}</strong> · ${escape(evidence.path)}${evidence.lines ? `:${evidence.lines.join('–')}` : ''}</summary><div class="subsection-body"><p>${escape(evidence.observation)}</p>${evidence.kind === 'screenshot' ? evidence.mediaId ? `<button class="btn small" data-open="${escape(evidence.mediaId)}">查看原始截图</button>` : '<p class="check-source">截图未内嵌；请从本轮 Artifact 核对，缺图不伪装成已展示。</p>' : `<pre>${escape(evidence.excerpt)}</pre>`}<p class="check-source">原文件 SHA-256：${escape(evidence.sha256)}</p></div></details>`;
  }
  return { html: html + '</div></section>', feedbackHtml, findings, overviewHtml };
}
