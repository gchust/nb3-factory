import { readFileSync } from 'node:fs';
import { phases } from './task-usage.mjs';
import { outcomeLabels } from './task-outcome.mjs';

const names = {
  implementation: '初始实现',
  repair: '应用修复',
  qa: '完整业务 QA',
  qaFocused: '失败路径复测',
  qaReport: 'QA 补报告',
  compaction: '上下文压缩',
};
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const number = (value) =>
  Number.isFinite(value) ? value.toLocaleString('en-US') : '未采集';
const duration = (seconds) =>
  Number.isFinite(seconds)
    ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`
    : '未采集';

// Timings are nested spans; report each stage independently, never sum these
// values to derive execution/wall time. Only completed spans can be measured.
export function readStageTimings(file) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const stages = new Map();
  for (const line of content.split('\n').filter(Boolean)) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      typeof row.stage !== 'string' ||
      !Number.isFinite(row.durationMs) ||
      row.durationMs < 0
    )
      continue;
    const stage = stages.get(row.stage) || {
      stage: row.stage,
      calls: 0,
      durationMs: 0,
    };
    stage.calls++;
    stage.durationMs += row.durationMs;
    stages.set(row.stage, stage);
  }
  return [...stages.values()].sort((a, b) => b.durationMs - a.durationMs);
}

export function renderTaskReport({
  record,
  cumulative,
  records = [record],
  timings = [],
}) {
  const usage = cumulative.usage;
  const total = (key) =>
    phases.reduce((n, phase) => n + (usage.phases[phase]?.[key] || 0), 0);
  const incomplete = Boolean(usage.missing || usage.incomplete);
  const measured = usage.records > 0;
  const tokens = (value) => (measured ? number(value) : '未取得可用 usage');
  const runUrl = `https://github.com/${record.repository}/actions/runs/${record.runId}/attempts/${record.attempt}`;
  const metric = (title, value, note) =>
    `<article><small>${title}</small><strong>${escape(value)}</strong><p>${note}</p></article>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Factory · Issue #${record.issue}</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#18181b;background:#fafafa;line-height:1.6}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:40px 24px 64px}header{border-bottom:1px solid #e4e4e7;padding-bottom:24px}h1{font-size:32px;letter-spacing:-1px;margin:6px 0}h2{font-size:20px;margin:0 0 16px}small,.muted{color:#71717a}a{color:inherit;text-underline-offset:4px}.badge{display:inline-block;border:1px solid #d4d4d8;padding:4px 10px;border-radius:7px;font-size:13px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0}article,section{border:1px solid #e4e4e7;border-radius:12px;background:white;padding:20px}article strong{display:block;font-size:23px;margin:8px 0;overflow-wrap:anywhere}article p{font-size:12px;color:#71717a;margin:0}section{margin:18px 0}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}td,th{padding:12px;text-align:right;border-bottom:1px solid #f0f0f1}td:first-child,th:first-child{text-align:left}th{color:#71717a;font-weight:500}.notice{padding:12px 16px;background:#f4f4f5;border-radius:8px;font-size:14px}summary{cursor:pointer;font-weight:600;padding:6px 0}details p{color:#52525b}footer{font-size:12px;color:#71717a;margin-top:24px}@media(max-width:800px){.metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:440px){.metrics{grid-template-columns:1fr}main{padding:20px 14px}}
</style></head><body><main>
<header><small>NOCOBASE FACTORY / DELIVERY REPORT</small><h1>Issue #${record.issue} · 搭建报告</h1><p class="muted">${escape(record.repository)} · 已采集 ${cumulative.runs} 个 Run / ${cumulative.attempts} 次运行尝试</p><span class="badge">${escape(outcomeLabels[record.status] || '未完成')}</span> · <a href="${escape(runUrl)}">本轮运行</a> · <a href="https://github.com/${escape(record.repository)}/issues/${record.issue}">需求与交付链接</a></header>
<div class="metrics">${metric('累计执行时间', duration(cumulative.seconds), '唯一搭建 Job 时长，不含排队')}${metric('非缓存输入 Token', tokens(total('input')), '已记录输入，不混入缓存读取')}${metric('输出 Token', tokens(total('output')), '包含思考，不重复相加')}${metric('端到端时间', duration(cumulative.elapsed), '包含续跑与等待间隔')}</div>
<p class="notice">${incomplete ? '用量不完整：以下仅为已采集值，不能当作完整消耗或账单。' : '统计来自已采集 API usage，不等同于供应商账单。'} 费用：未知（未配置实际计费口径）。</p>
<section><h2>Token 花在哪里</h2><div class="table"><table><thead><tr><th>阶段</th><th>非缓存输入</th><th>输出</th><th>缓存读取</th><th>缓存写入</th></tr></thead><tbody>${phases
    .map((phase) => {
      const t = usage.phases[phase];
      return `<tr><td>${names[phase]}</td>${['input', 'output', 'cacheRead', 'cacheWrite'].map((key) => `<td>${tokens(t?.[key] || 0)}</td>`).join('')}</tr>`;
    })
    .join(
      '',
    )}</tbody></table></div><p class="muted">含缓存总量 ${tokens(cumulative.total)}；缓存读取 ${tokens(total('cacheRead'))}。历史记录未拆分 QA 与补报告时保留在“完整业务 QA”，不推算拆分值。</p></section>
<section><details><summary>本轮阶段耗时</summary><p>来自已完成的计时记录；嵌套阶段不可相加为总耗时。记录未结束或未取得时不视为零。</p><div class="table"><table><tr><th>阶段</th><th>次数</th><th>累计时长</th></tr>${timings.map((t) => `<tr><td>${escape(t.stage)}</td><td>${t.calls}</td><td>${duration(Math.round(t.durationMs / 1000))}</td></tr>`).join('')}</table></div>${timings.length ? '' : '<p>本轮阶段计时未采集。</p>'}</details></section>
<section><details><summary>运行历史与统计口径</summary><div class="table"><table><tr><th>Run / attempt</th><th>状态</th><th>API 用量记录</th></tr>${[
    ...records,
  ]
    .sort((a, b) => a.start - b.start)
    .map(
      (r) =>
        `<tr><td>${r.runId} / ${r.attempt}</td><td>${escape(outcomeLabels[r.status] || r.status)}</td><td>${number(r.usage.records)}</td></tr>`,
    )
    .join(
      '',
    )}</table></div><p>用量记录 ${number(usage.records)}；缺少用量的记录 ${number(usage.missing)}；日志/分项不完整标记 ${number(usage.incomplete)}。零值可能表示阶段未运行；缺失数据不代表免费。问答与媒体处理不计入本报告的搭建用量。截图、预览和 PR 在原 Issue/PR 查看。</p><p>状态依据实际发布和交接步骤，不把 Workflow success 自动解释为业务交付；PR 发布也不等于人工合并。</p></details></section>
<footer>由工厂固定模板与实际记录生成 · 不调用模型统计或渲染 · 单文件，离线可读</footer></main></body></html>`;
}
