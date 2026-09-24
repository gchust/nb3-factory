import { adoptionStates, capabilityStates, findingKinds, moduleRoundResult, owners, primaryFrameworkDimensions, reviewDimensions, targetKinds, validateBuildReview } from '../scripts/build-review.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = (label, kind = '') => `<span class="tag ${kind}">${escape(label)}</span>`;
const states = { passed: '报告通过', failed: '报告未通过', blocked: '环境受阻', not_run: '未执行', unknown: '未验证' };
const result = state => tag(states[state] ?? states.unknown, state === 'failed' ? 'bad' : state === 'passed' ? 'good' : 'warn');
const refs = ids => `<span class="review-refs">${ids.map(id => `<a href="#review-evidence-${escape(id)}">${escape(id)}</a>`).join(' ')}</span>`;
const value = score => score === null ? '<span class="review-na">未评估</span>' : `<strong class="review-score">${score}<small>/100</small></strong>`;
const list = values => values.length ? `<ul class="compact-list">${values.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="muted">未提供额外说明。</p>';
const frameworkOwners = new Set(['framework', 'plugin', 'template', 'documentation']);

function processHtml(process) {
  if (!process || !Array.isArray(process.rounds)) return '<p class="report-empty">本轮未采集验证过程，不推断一轮完成。</p>';
  const metric = (label, number) => `<div><span>${label}</span><strong>${Number.isSafeInteger(number) ? number : '未提供'}</strong></div>`;
  const rows = process.rounds.flatMap(round => round.reports.length ? round.reports.map(report => `<tr><td>验证 ${round.round}</td><td>${report.scope === 'full' ? '全量浏览器 QA' : '失败项复测（非全量）'}</td><td>${result(report.passed === true ? 'passed' : report.passed === false ? 'failed' : 'unknown')}</td><td>${report.checks.filter(c => c.status === 'failed').map(c => `${escape(c.id ?? '无 ID')} ${escape(c.criterion)}`).join('<br>') || '未记录 failed 项；不代表全部操作完成'}</td></tr>`) : [`<tr><td>验证 ${round.round}</td><td colspan="3">没有浏览器 QA 记录，不能推断业务通过；检查构建日志。</td></tr>`]);
  return `<div class="review-process">${metric('本 Run 验证轮次', process.verificationAttempts)}${metric('本 Run 工厂修复轮次', process.repairAttempts)}${metric('已保留验证轮次', process.rounds.length)}</div>
    <p class="check-source">${escape(process.scope)}</p>
    <details class="card raw-record"><summary>首轮与修复过程 · 查看逐轮原始状态</summary><div class="subsection-body"><div class="table-wrap"><table><thead><tr><th>轮次</th><th>范围</th><th>原始结论</th><th>失败项</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4">无记录；不是 0 次失败。</td></tr>'}</tbody></table></div>${list(process.warnings)}</div></details>`;
}

function findingsHtml(findings) {
  const confidence = { confirmed: '评审者判断 · 有证据', suspected: '待确认' };
  const status = { open: '未解决', resolved: '已解决', unknown: '处理状态未知', 'not-applicable': '不适用' };
  const severity = { info: '信息', minor: '轻微', major: '重要', critical: '严重' };
  return Object.entries(findingKinds).map(([kind, label]) => {
    const group = findings.filter(finding => finding.kind === kind);
    let html = `<div class="review-group"><h3>${label} <span>${group.length}</span></h3>`;
    if (!group.length) html += '<p class="muted">本轮未记录此类发现，不代表不存在。</p>';
    for (const finding of group) {
      const important = ['major', 'critical'].includes(finding.severity) && finding.status !== 'resolved';
      html += `<details class="card review-finding" ${important ? 'open' : ''}><summary><div><strong>${escape(finding.title)}</strong><div class="review-badges">${tag(owners[finding.owner])}${tag(confidence[finding.confidence], finding.confidence === 'suspected' ? 'warn' : '')}${tag(severity[finding.severity], important ? 'bad' : '')}${tag(status[finding.status])}</div></div><span>⌄</span></summary><div class="subsection-body"><p>${escape(finding.detail)}</p>${kind === 'misleading' ? `<div class="review-contrast"><div><h4>文档 / API 声称</h4><p>${escape(finding.claimed)}</p></div><div><h4>实际观察</h4><p>${escape(finding.observed)}</p></div></div>` : ''}<dl class="retro-fields"><div><dt>实际影响 / 提供的帮助</dt><dd>${escape(finding.impact)}</dd></div><div><dt>建议改法 / 应保留的能力</dt><dd>${escape(finding.suggestedChange)}</dd></div></dl>${refs(finding.evidence)}</div></details>`;
    }
    return html + '</div>';
  }).join('');
}

export function renderBuildReview(input) {
  let report = input;
  if (['completed', 'partial'].includes(report?.state)) {
    try { validateBuildReview(report); }
    catch { report = { state: 'failed', reason: '评审数据无效，未采用评分；原始验收仍保留。', process: input.process }; }
  }
  const review = ['completed', 'partial'].includes(report?.state) ? report.evaluation : null;
  const framework = review?.version === 2;
  let html = `<section class="section" id="build-review"><div class="section-head"><div><div class="eyebrow">Framework assessment</div><h2>NocoBase3 基础框架评测</h2></div>${tag(review ? '独立 Agent 评审' : '未完成独立评审', review ? '' : 'warn')}</div>`;
  html += '<div class="review-disclaimer">评测主体是 NocoBase3 的内部库、内置插件与开发指引；业务应用是测试场景。分数是有范围的评审意见，不是 NocoBase3 全局评分，业务 QA 不自动证明框架好坏。</div>';
  if (review && !framework) html += '<div class="report-banner"><strong>历史混合口径 · rubric v1</strong><p>以下原始分数同时包含框架接入与业务产出评价，不应作为纯框架评分或与 v2 比较。需要按新规则重新评审，不能直接改名或换算。</p></div>';
  if (report?.basis) html += `<p class="check-source">评审源产物：Run ${escape(report.basis.runId)} / attempt ${escape(report.basis.attempt)}${report.reviewer?.replay ? ` · 后补评审 Run ${escape(report.reviewer.runId)} / attempt ${escape(report.reviewer.attempt)}` : ''}。发布重试不改变评审源产物编号。</p>`;
  if (report?.state === 'partial') html += `<div class="report-banner"><strong>部分评审 · 尚未全覆盖</strong><p>${escape(report.reason)}</p></div>`;
  if (report?.supplementalUsage) html += `<p class="check-source">本次后补评审用量（独立于原搭建）：${escape(report.supplementalUsage.totalTokens ?? '未提供')} Token（含缓存）；不重复计入原搭建。</p>`;
  if (!review) return html + `<div class="card report-empty"><strong>本轮不显示评分</strong><p>${escape(report?.reason || '没有独立评审记录，不能据此声称没有问题。')}</p></div>${processHtml(report?.process)}</section><section class="section" id="framework-feedback"><div class="section-head"><h2>NocoBase3 的帮助与问题</h2></div><div class="card report-empty">尚无独立评审结论；已有实现者自述仍保留在“遇到的问题”和“可改进的点”。</div></section>`;
  const dimensions = reviewDimensions(review);
  const mainDimensions = framework ? primaryFrameworkDimensions : dimensions;
  const scored = review.modules.reduce((n, module) => n + Object.keys(mainDimensions).filter(key => module.scores[key].score !== null).length, 0);
  html += `<p class="review-summary">${escape(review.summary)}</p><div class="review-caption">${review.modules.length} 个模块 · ${scored} / ${review.modules.length * Object.keys(mainDimensions).length} 项主评分 · 未评估项不补分，不生成平均分</div>`;
  html += `<div class="card table-wrap review-matrix${framework ? ' review-framework' : ''}"><table><thead><tr><th>${framework ? '框架能力 / 被评对象' : '历史混合模块 / 本次范围'}</th>${Object.values(mainDimensions).map(label => `<th>${label}</th>`).join('')}${framework ? '<th>能力与采用情况</th>' : '<th>首轮 QA</th><th>最终轮 QA</th>'}</tr></thead><tbody>`;
  for (const [index, module] of review.modules.entries()) {
    html += `<tr><td><a href="#review-module-${index}"><strong>${escape(module.name)}</strong></a>${framework ? module.targets.map(target => `<p><code>${escape(target.id)}</code></p>`).join('') : `<p>${escape(module.scope)}</p>`}</td>${Object.entries(mainDimensions).map(([key, label]) => `<td data-label="${escape(label)}">${value(module.scores[key].score)}</td>`).join('')}${framework ? `<td>${tag(capabilityStates[module.capability.status])}${tag(adoptionStates[module.capability.adoption])}</td>` : `<td>${result(moduleRoundResult(module, report.process, 1))}</td><td>${result(moduleRoundResult(module, report.process, report.process?.finalRound))}</td>`}</tr>`;
  }
  html += '</tbody></table></div><p class="check-source">框架设计合理性、实现完整性与具体证据见模块详情；未使用不等于不支持，正常业务扩展不等于绕行。</p><div class="review-modules">';
  for (const [index, module] of review.modules.entries()) {
    html += `<details class="card review-module" id="review-module-${index}"><summary><strong>${escape(module.name)}</strong><span>展开模块评审理由与证据</span></summary><div class="subsection-body"><p>${escape(module.scope)}</p>`;
    if (framework) {
      html += module.targets.map(target => `<p>${tag(targetKinds[target.kind])} <code>${escape(target.id)}</code> · ${escape(target.api)} ${refs(target.evidence)}</p>`).join('');
      html += `<p><strong>需求与采用：</strong>${escape(module.capability.reason)} ${refs(module.capability.evidence)}</p>`;
    }
    html += `<div class="review-dimensions">${Object.entries(dimensions).map(([key, label]) => {
      const score = module.scores[key];
      return `<article><header><h3>${label}</h3>${value(score.score)}</header><p>${escape(score.reason)}</p>${refs(score.evidence)}</article>`;
    }).join('')}</div><p class="check-source">覆盖限制：${escape(module.limitations)}</p><p class="check-source">场景验收映射：${escape(module.criteria.join(', ') || '未建立映射')}</p></div></details>`;
  }
  html += '</div></section><section class="section" id="framework-feedback"><div class="section-head"><div><div class="eyebrow">Infrastructure feedback</div><h2>NocoBase3 的帮助与问题</h2></div></div><p class="section-intro">先看库、插件和指引提供的帮助、能力缺口、使用阻力与改进位置。“有证据 / 待确认”均为评审者判断，仍需人工核对。</p>';
  html += findingsHtml(review.findings.filter(finding => frameworkOwners.has(finding.owner)));
  html += '</section><section class="section" id="application-observations"><div class="section-head"><h2>业务场景与搭建侧观察</h2></div><p class="section-intro">以下是验证框架的场景结果，不计入框架主评分。Agent 用错、工厂或环境问题只有进一步归因后，才能说明框架或指引需要改进。</p>';
  if (framework) {
    html += '<div class="card table-wrap"><table><thead><tr><th>相关框架能力</th><th>应用产出质量（独立）</th><th>首轮 QA</th><th>最终轮 QA</th></tr></thead><tbody>';
    for (const module of review.modules) html += `<tr><td>${escape(module.name)}</td><td>${value(module.applicationOutcome.score)}<p>${escape(module.applicationOutcome.reason)}</p>${refs(module.applicationOutcome.evidence)}</td><td>${result(moduleRoundResult(module, report.process, 1))}</td><td>${result(moduleRoundResult(module, report.process, report.process?.finalRound))}</td></tr>`;
    html += '</tbody></table></div>';
  }
  html += `<p class="check-source">映射由评审者提供，状态读取原始全量 QA。缺少首轮或映射时显示未验证；最终通过不抹去首轮失败，首轮失败也不自动判定框架失败。</p>${processHtml(report?.process)}`;
  html += `<article class="card review-ui"><header><h3>界面样式与交互一致性（场景观察）</h3>${value(review.ui.score)}</header><p>${escape(review.ui.reason)}</p>${refs(review.ui.evidence)}<p class="check-source">${review.ui.status === 'reviewed' ? '评审者声明已审阅所引用的图像；请展开证据核对观察，不以文件存在代替人工确认。' : '未执行跨页面图像审阅，不能因使用相同组件库而判为视觉一致。'}</p></article>`;
  const otherFindings = review.findings.filter(finding => !frameworkOwners.has(finding.owner));
  if (otherFindings.length) html += findingsHtml(otherFindings);
  html += `<details class="card raw-record" open><summary>本次评审的覆盖限制</summary><div class="subsection-body">${list(review.limitations)}</div></details>`;
  html += `<details class="card raw-record"><summary>评审基线与版本指纹</summary><div class="subsection-body"><p>评审针对已封存候选补丁，不是 PR 后续最新 head。版本不同的评分不自动转换，补跑不修改业务补丁。</p><pre>${escape(JSON.stringify({ reviewer: report.reviewer, ...report.basis }, null, 2))}</pre></div></details>`;
  html += '<div class="review-evidence"><h3>证据与原文</h3>';
  for (const evidence of review.evidence) {
    html += `<details class="card raw-record" id="review-evidence-${escape(evidence.id)}"><summary><strong>${escape(evidence.id)}</strong> · ${escape(evidence.path)}${evidence.lines ? `:${evidence.lines.join('–')}` : ''}</summary><div class="subsection-body"><p>${escape(evidence.observation)}</p>${evidence.kind === 'screenshot' ? evidence.mediaId ? `<button class="btn small" data-open="${escape(evidence.mediaId)}">查看原始截图</button>` : '<p class="check-source">截图未内嵌；请从本轮 Artifact 核对，缺图不伪装成已展示。</p>' : `<pre>${escape(evidence.excerpt)}</pre>`}<p class="check-source">原文件 SHA-256：${escape(evidence.sha256)}</p></div></details>`;
  }
  return html + '</div></section>';
}
