import { dimensions, findingKinds, moduleRoundResult, owners, validateBuildReview } from '../scripts/build-review.mjs';

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

export function renderBuildReview(input) {
  let report = input;
  if (report?.state === 'completed') {
    try { validateBuildReview(report); }
    catch { report = { state: 'failed', reason: '评审数据无效，未采用评分；原始验收仍保留。', process: input.process }; }
  }
  const review = report?.state === 'completed' ? report.evaluation : null;
  let html = `<section class="section" id="build-review"><div class="section-head"><div><div class="eyebrow">Build assessment</div><h2>搭建质量与模块评审</h2></div>${tag(review ? '独立 Agent 评审' : '未完成独立评审', review ? '' : 'warn')}</div>`;
  html += `<div class="review-disclaimer">评分是评审者基于本次覆盖范围的意见，不是客观测量，也不是 NocoBase3 整体评分。业务 QA、评分和证据完整性分开呈现。</div>`;
  html += processHtml(report?.process);
  if (!review) return html + `<div class="card report-empty"><strong>本轮不显示评分</strong><p>${escape(report?.reason || '没有独立评审记录，不能据此声称没有问题。')}</p></div></section><section class="section" id="framework-feedback"><div class="section-head"><h2>NocoBase3 的帮助与问题</h2></div><div class="card report-empty">尚无独立评审结论；已有实现者自述仍保留在“遇到的问题”和“可改进的点”。</div></section>`;
  html += `<p class="review-summary">${escape(review.summary)}</p>`;
  const scored = review.modules.reduce((n, module) => n + Object.keys(dimensions).filter(key => module.scores[key].score !== null).length, 0);
  html += `<div class="review-caption">${review.modules.length} 个模块 · ${scored} / ${review.modules.length * 4} 项已评分 · 未评估项不进入任何平均值</div><div class="card table-wrap review-matrix"><table><thead><tr><th>基础模块 / 本次范围</th>${Object.values(dimensions).map(label => `<th>${label}</th>`).join('')}<th>首轮 QA</th><th>最终轮 QA</th></tr></thead><tbody>`;
  for (const [index, module] of review.modules.entries()) {
    html += `<tr><td><a href="#review-module-${index}"><strong>${escape(module.name)}</strong></a><p>${escape(module.scope)}</p></td>${Object.keys(dimensions).map(key => `<td>${value(module.scores[key].score)}</td>`).join('')}<td>${result(moduleRoundResult(module, report.process, 1))}</td><td>${result(moduleRoundResult(module, report.process, report.process?.finalRound))}</td></tr>`;
  }
  html += `</tbody></table></div><p class="check-source">模块与验收项的映射由评审者提供，状态读取原始全量 QA。缺少首轮、缺少映射或只有定向复测时显示未验证；最终通过不抹去首轮失败。</p><div class="review-modules">`;
  for (const [index, module] of review.modules.entries()) {
    html += `<details class="card review-module" id="review-module-${index}"><summary><strong>${escape(module.name)}</strong><span>展开四项理由与证据</span></summary><div class="subsection-body"><p>${escape(module.scope)}</p><div class="review-dimensions">${Object.entries(dimensions).map(([key, label]) => {
      const score = module.scores[key];
      return `<article><header><h3>${label}</h3>${value(score.score)}</header><p>${escape(score.reason)}</p>${refs(score.evidence)}</article>`;
    }).join('')}</div><p class="check-source">覆盖限制：${escape(module.limitations)}</p><p class="check-source">映射验收项：${escape(module.criteria.join(', ') || '未建立映射')}</p></div></details>`;
  }
  html += `</div><article class="card review-ui"><header><h3>界面样式与交互一致性</h3>${value(review.ui.score)}</header><p>${escape(review.ui.reason)}</p>${refs(review.ui.evidence)}<p class="check-source">${review.ui.status === 'reviewed' ? '评审者声明已审阅所引用的图像；请展开证据核对观察，不以文件存在代替人工确认。' : '未执行跨页面图像审阅，不能因使用相同组件库而判为视觉一致。'}</p></article></section>`;
  html += `<section class="section" id="framework-feedback"><div class="section-head"><div><div class="eyebrow">Infrastructure feedback</div><h2>NocoBase3 的帮助与问题</h2></div></div><p class="section-intro">优点说明具体帮助；问题区分内核、插件、模板、文档、业务实现和测试环境。下列“有证据 / 待确认”均为独立评审者的判断。</p>`;
  const confidence = { confirmed: '评审者判断 · 有证据', suspected: '待确认' };
  const status = { open: '未解决', resolved: '已解决', unknown: '处理状态未知', 'not-applicable': '不适用' };
  const severity = { info: '信息', minor: '轻微', major: '重要', critical: '严重' };
  for (const [kind, label] of Object.entries(findingKinds)) {
    const findings = review.findings.filter(finding => finding.kind === kind);
    html += `<div class="review-group"><h3>${label} <span>${findings.length}</span></h3>`;
    if (!findings.length) html += `<p class="muted">本轮未记录此类发现，不代表不存在。</p>`;
    for (const finding of findings) {
      const important = ['major', 'critical'].includes(finding.severity) && finding.status !== 'resolved';
      html += `<details class="card review-finding" ${important ? 'open' : ''}><summary><div><strong>${escape(finding.title)}</strong><div class="review-badges">${tag(owners[finding.owner])}${tag(confidence[finding.confidence], finding.confidence === 'suspected' ? 'warn' : '')}${tag(severity[finding.severity], important ? 'bad' : '')}${tag(status[finding.status])}</div></div><span>⌄</span></summary><div class="subsection-body"><p>${escape(finding.detail)}</p>${kind === 'misleading' ? `<div class="review-contrast"><div><h4>文档 / API 声称</h4><p>${escape(finding.claimed)}</p></div><div><h4>实际观察</h4><p>${escape(finding.observed)}</p></div></div>` : ''}<dl class="retro-fields"><div><dt>实际影响 / 提供的帮助</dt><dd>${escape(finding.impact)}</dd></div><div><dt>建议改法 / 应保留的能力</dt><dd>${escape(finding.suggestedChange)}</dd></div></dl>${refs(finding.evidence)}</div></details>`;
    }
    html += '</div>';
  }
  html += `<details class="card raw-record" open><summary>本次评审的覆盖限制</summary><div class="subsection-body">${list(review.limitations)}</div></details>`;
  html += `<details class="card raw-record"><summary>评审基线与版本指纹</summary><div class="subsection-body"><p>评审发生于独立最终验证前的已封存候选补丁；与 PR 当前最新提交不是同一概念。评审后不会修改该补丁。</p><pre>${escape(JSON.stringify({ reviewer: report.reviewer, ...report.basis }, null, 2))}</pre></div></details>`;
  html += '<div class="review-evidence"><h3>证据与原文</h3>';
  for (const evidence of review.evidence) {
    html += `<details class="card raw-record" id="review-evidence-${escape(evidence.id)}"><summary><strong>${escape(evidence.id)}</strong> · ${escape(evidence.path)}${evidence.lines ? `:${evidence.lines.join('–')}` : ''}</summary><div class="subsection-body"><p>${escape(evidence.observation)}</p>${evidence.kind === 'screenshot' ? evidence.mediaId ? `<button class="btn small" data-open="${escape(evidence.mediaId)}">查看原始截图</button>` : '<p class="check-source">截图未内嵌；请从本轮 Artifact 核对，缺图不伪装成已展示。</p>' : `<pre>${escape(evidence.excerpt)}</pre>`}<p class="check-source">原文件 SHA-256：${escape(evidence.sha256)}</p></div></details>`;
  }
  return html + '</div></section>';
}
