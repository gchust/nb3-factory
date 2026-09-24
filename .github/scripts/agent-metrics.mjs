// Measurements of factory-visible calls. Separate from the legacy business-report
// contract so a question cannot overwrite a delivered application's report.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readResult, tokenKeys } from './agent-result.mjs';

const safeCount = n => Number.isSafeInteger(n) && n >= 0;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const METRICS_MARKER = '<!-- factory-agent-metrics-v1\n';
const phases = ['implementation', 'repair', 'qa', 'qa-focused', 'qa-report-repair', 'reply', 'review', 'unknown'];
const labels = ['初始实现', '应用修复', '浏览器验收', '定向复测', '验收报告修复', '评论问答', '模块评审', '未分类'];
function readJson(root, file) {
  try { return JSON.parse(readFileSync(path.join(root, file), 'utf8')); }
  catch { return null; }
}
function totals() {
  return { invocations: 0, notInvoked: 0, unknownInvocations: 0, completed: 0,
    incompleteUsage: 0, captured: 0, milliseconds: { reported: null, missing: 0 },
    tokens: Object.fromEntries(tokenKeys.map(k => [k, { reported: null, missing: 0 }])) };
}
function addNumber(target, number) {
  if (safeCount(number) && Number.isSafeInteger((target.reported ?? 0) + number)) {
    target.reported = (target.reported ?? 0) + number;
  } else target.missing++;
}
function callTokens(result) {
  if (!result?.measurements?.length) return {};
  return Object.fromEntries(tokenKeys.map(key => {
    const values = result.measurements.map(m => {
      if (safeCount(m.usage?.[key])) return m.usage[key];
      if (key === 'totalTokens') {
        const parts = ['input', 'output', 'cacheRead', 'cacheWrite'].map(k => m.usage?.[k]);
        if (parts.every(safeCount)) return parts.reduce((a, b) => a + b, 0);
      }
      return undefined;
    });
    return [key, values.every(safeCount) ? values.reduce((a, b) => a + b, 0) : undefined];
  }));
}
function comparison(root, files, source) {
  const metadataFile = ['task/task-metadata.json', 'agent/task-metadata.json', 'reply/task-metadata.json', 'task-metadata.json']
    .find(name => files.some(f => f.name === name));
  const m = metadataFile ? readJson(root, metadataFile) : null;
  if (!m || m.repository !== source.repository || m.issue?.number !== source.issue) return null;
  const identity = { input: m.preset?.inputHash ?? null, review: m.preset?.reviewHash ?? null,
    ...(m.task?.buildReviewMode ? { buildReviewMode: m.task.buildReviewMode } : {}),
    control: m.controlSha ?? null, application: m.applicationBase?.sha ?? null };
  // Unknown ordinary inputs are not guessed from an Issue number or mutable title.
  return identity.input && identity.control && identity.application ? { ...identity, key: hash(identity) } : null;
}

export function collectAgentMetrics(root, manifest) {
  const { source, files = [], completeness } = manifest;
  if (!source) return null;
  const rows = [];
  const byJob = new Map();
  for (const a of source.artifacts ?? []) {
    if (!['agent', 'reply'].includes(a.role) || !safeCount(a.jobId) || !a.jobId) continue;
    const calls = (completeness?.invocations ?? []).filter(i => i.log.startsWith(`${a.role}/`));
    const job = { id: a.jobId, role: a.role, expected: a.invocationExpected === true,
      missingCapture: a.invocationExpected === true && calls.length === 0,
      artifactState: a.state, phases: {}, quality: 0 };
    const seen = new Set();
    for (const item of calls) {
      const invocation = readJson(root, `${item.log}.invocation.json`);
      const id = typeof invocation?.id === 'string' && invocation.id.length <= 256 ? invocation.id : `${a.jobId}:${item.log}`;
      if (seen.has(id)) continue;
      seen.add(id);
      let result;
      try { result = readResult(path.join(root, item.log)); } catch { /* Unknown, not zero or legacy fallback. */ }
      const reportedPhase = invocation?.phase ?? result?.phase;
      const phase = a.role === 'reply' ? 'reply' : phases.includes(reportedPhase) ? reportedPhase : 'unknown';
      const row = { id, jobId: a.jobId, phase, log: item.log,
        invoked: invocation?.invoked === false ? false : invocation?.invoked === true || result ? true : null,
        status: result?.status ?? null,
        engine: result?.engine ?? invocation?.engine ?? null,
        version: result?.actualVersion ?? invocation?.actualVersion ?? null,
        model: result?.model ?? invocation?.model ?? null,
        promptSha256: invocation?.promptSha256 ?? null,
        contextSha256: Array.isArray(invocation?.context) ? hash(invocation.context) : null,
        milliseconds: result && safeCount(result.startedAt) && safeCount(result.endedAt) && result.endedAt >= result.startedAt
          ? result.endedAt - result.startedAt : null,
        tokens: callTokens(result),
        captured: invocation?.version === 1 && item.missing?.length === 0,
        incompleteUsage: !result || result.incomplete === true || result.invalidEvents > 0 ||
          result.status !== 'completed' || !result.measurements.length };
      // A rejected setup did not call a model. It contributes no guessed token count.
      const t = job.phases[phase] ??= totals();
      if (row.invoked === false) t.notInvoked++;
      else {
        if (row.invoked === true) t.invocations++; else t.unknownInvocations++;
        if (row.status === 'completed') t.completed++;
        if (row.incompleteUsage) t.incompleteUsage++;
        addNumber(t.milliseconds, row.milliseconds);
        for (const key of tokenKeys) addNumber(t.tokens[key], row.tokens[key]);
      }
      if (row.captured) t.captured++;
      job.quality += (row.captured ? 100 : 0) + (result ? 10 : 0) + Object.values(row.tokens).filter(safeCount).length;
      rows.push(row);
    }
    byJob.set(a.jobId, job);
  }
  return { version: 1, repository: source.repository, issue: source.issue,
    runId: source.runId, attempt: source.attempt, comparison: comparison(root, files, source),
    retention: { status: completeness?.status ?? 'unknown',
      expectedAgentJobs: [...byJob.values()].filter(j => j.expected).length,
      jobsMissingCapture: [...byJob.values()].filter(j => j.missingCapture).length,
      capturedInvocations: rows.filter(r => r.captured).length,
      discoveredInvocations: rows.length, missingFiles: completeness?.problems?.length ?? null },
    jobs: [...byJob.values()], calls: rows };
}

// Inline receipts contain only bounded numeric job summaries; full call identities,
// versions, prompt hashes and comparison evidence remain in the archive JSON.
export function metricsReceipt(metrics) {
  if (!metrics) return '';
  const { calls: _calls, ...summary } = metrics;
  const encoded = JSON.stringify(summary).replaceAll('<', '\\u003c');
  if (encoded.length > 20000) return '\n\n指标过多，完整指标见归档 metrics.json；此轮未纳入评论累计。';
  return `\n\n${METRICS_MARKER}${encoded}\n-->`;
}
export function readMetricsReceipts(comments, repository, issue) {
  const records = [];
  for (const c of comments) {
    if (c.user?.login !== 'github-actions[bot]') continue;
    const text = c.body?.split(METRICS_MARKER)[1]?.split('\n-->')[0];
    if (!text) continue;
    try {
      const m = JSON.parse(text);
      if (m.version !== 1 || m.repository !== repository || m.issue !== issue || !safeCount(m.runId) || !m.runId ||
        !safeCount(m.attempt) || !m.attempt || !Array.isArray(m.jobs) || m.jobs.length > 20) continue;
      if (m.jobs.some(j => !safeCount(j.id) || !j.id || !['agent', 'reply'].includes(j.role) || !safeCount(j.quality) ||
        !j.phases || Object.entries(j.phases).some(([p, t]) => !phases.includes(p) || !validTotals(t)))) continue;
      records.push(m);
    } catch { /* Malformed or incomplete receipts do not authorize numbers. */ }
  }
  return records;
}
function validTotals(t) {
  return t && ['invocations', 'notInvoked', 'unknownInvocations', 'completed', 'incompleteUsage', 'captured'].every(k => safeCount(t[k])) &&
    validNumber(t.milliseconds) && t.tokens && tokenKeys.every(k => validNumber(t.tokens[k]));
}
function validNumber(n) { return n && (n.reported === null || safeCount(n.reported)) && safeCount(n.missing); }
function combine(target, other) {
  for (const k of ['invocations', 'notInvoked', 'unknownInvocations', 'completed', 'incompleteUsage', 'captured']) {
    if (!Number.isSafeInteger(target[k] + other[k])) throw new Error('Metrics count overflow');
    target[k] += other[k];
  }
  for (const [t, o] of [[target.milliseconds, other.milliseconds], ...tokenKeys.map(k => [target.tokens[k], other.tokens[k]])]) {
    if (o.reported !== null) addNumber(t, o.reported);
    t.missing += o.missing;
  }
}
export function aggregateAgentMetrics(records) {
  const jobs = new Map();
  for (const m of records) for (const job of m.jobs) {
    const key = `${m.repository}:${job.id}`;
    const prior = jobs.get(key);
    if (!prior || job.quality > prior.quality) jobs.set(key, job);
  }
  const result = { phases: {}, missingCaptureJobs: 0, jobs: jobs.size };
  for (const job of jobs.values()) {
    if (job.missingCapture) result.missingCaptureJobs++;
    for (const [phase, t] of Object.entries(job.phases)) combine(result.phases[phase] ??= totals(), t);
  }
  return result;
}
export function renderAgentMetrics(records) {
  if (!records.length) return '';
  const sum = aggregateAgentMetrics(records);
  const format = n => n.reported === null ? '未知' : `${n.reported.toLocaleString('en-US')}${n.missing ? '（部分）' : ''}`;
  const lines = ['\n### 已报告调用与用量（按实际 Job 去重）', '', '| 阶段 | 已确认调用 | 耗时毫秒 | 已报告 Token | 用量不完整调用 |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const [i, phase] of phases.entries()) {
    const t = sum.phases[phase];
    if (t) lines.push(`| ${labels[i]} | ${t.invocations}${t.unknownInvocations ? ` + ${t.unknownInvocations} 未确认` : ''} | ${format(t.milliseconds)} | ${format(t.tokens.totalTokens)} | ${t.incompleteUsage} |`);
  }
  lines.push('', `尚有 ${sum.missingCaptureJobs} 个应调用 Agent 的 Job 缺失调用记录。设置阶段失败不计为模型调用。`,
    '这里只累计本 Issue 各阶段已报告的调用成本，不代表供应商账单；耗时为调用时长之和，不是流水线墙钟时间。缺失不填 0，未报告的子任务仍未知。不同基线、输入、引擎不可据此比较成功率；比较键与逐调用信息见各归档 metrics.json。');
  return lines.join('\n');
}
