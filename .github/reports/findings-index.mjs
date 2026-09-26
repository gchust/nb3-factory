#!/usr/bin/env node
/** Cross-report index of NocoBase3 framework findings. Reads archived report.json
 * files only; no network access, model calls, or publishing. Node.js 22+. */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBuildReview } from '../scripts/build-review.mjs';
import {
  effectiveSeverity,
  effectiveType,
  findingTargets,
  findingTypes,
  isFrameworkFinding,
  severityLabels,
  severityRubric,
  typeRubric,
} from './framework-overview.mjs';
import {
  shortSha,
  upstreamEntry,
  upstreamStatus,
  validateUpstreamCheck,
} from './upstream-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const severityOrder = Object.keys(severityLabels);
const typeOrder = Object.keys(findingTypes);
// Two findings merge when their wording is close, or reasonably close and they
// cite the same framework files. Wording alone separates paraphrases poorly and
// files alone merge unrelated findings about one busy file, so both count.
// Tuned on the archived reports; a wrong merge stays visible because every
// occurrence keeps its own title and link.
export const MERGE_RULE = { text: 0.33, textWithFiles: 0.15, combined: 0.28 };

// Skills are cited either as the synchronized copy or the package source.
const normalizePath = (path) =>
  path
    .replace(/^app\//, '')
    .replace(/^packages\/@nocobase\/[^/]+\/skills\//, '.agents/skills/');
const frameworkPath = (path) =>
  /^(packages\/|\.agents\/skills\/|AGENTS\.md$)/.test(path);

// Identifiers (createdAt, belongsTo, …) and CJK bigrams; the title counts twice.
function textTokens(finding) {
  const text = [finding.title, finding.title, finding.detail, finding.suggestedChange].join(' ').toLowerCase();
  const tokens = (text.match(/[a-z][a-z0-9_.-]{2,}/g) ?? []).map((word) => `w:${word}`);
  const cjk = text.replace(/[^一-鿿]+/g, ' ').split(' ');
  for (const run of cjk)
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  return tokens;
}

export function collectOccurrences(reports) {
  const occurrences = [];
  const skipped = [];
  for (const record of reports) {
    const facts = record.delivery ?? record;
    const meta = facts?.meta;
    const review = facts?.buildReview;
    if (!meta || !['completed', 'partial'].includes(review?.state)) continue;
    if (review.evaluation?.version !== 2) continue;
    try {
      validateBuildReview(review);
    } catch (error) {
      skipped.push({ issue: meta.issue, reason: error.message });
      continue;
    }
    let check = null;
    if (facts.upstreamCheck) {
      try {
        validateUpstreamCheck(
          facts.upstreamCheck,
          new Set(review.evaluation.findings.map((finding) => finding.id)),
        );
        check = facts.upstreamCheck;
      } catch {
        check = null;
      }
    }
    const evaluation = review.evaluation;
    const evidence = new Map(evaluation.evidence.map((item) => [item.id, item]));
    for (const finding of evaluation.findings) {
      if (finding.kind === 'strength' || !isFrameworkFinding(finding)) continue;
      const paths = [
        ...new Set(
          finding.evidence
            .map((id) => evidence.get(id))
            .filter((item) => item && ['code', 'package', 'skill'].includes(item.kind))
            .map((item) => normalizePath(item.path))
            .filter(frameworkPath),
        ),
      ];
      occurrences.push({
        report: `${meta.issue}:${meta.runId}:${meta.attempt}`,
        issue: meta.issue,
        runId: meta.runId,
        attempt: meta.attempt,
        date: meta.snapshotDate.slice(0, 10),
        taskTitle: meta.title,
        finding,
        severity: effectiveSeverity(finding, check),
        type: effectiveType(finding, check),
        targets: findingTargets(evaluation, finding),
        paths,
        tokens: textTokens(finding),
        upstream: check && upstreamEntry(check, finding) ? { check, entry: upstreamEntry(check, finding) } : null,
      });
    }
  }
  return { occurrences, skipped };
}

function weights(lists) {
  const df = new Map();
  for (const list of lists) for (const item of new Set(list)) df.set(item, (df.get(item) ?? 0) + 1);
  const n = lists.length;
  return lists.map((list) => {
    const vector = new Map();
    for (const item of list) vector.set(item, (vector.get(item) ?? 0) + Math.log(1 + n / df.get(item)));
    const norm = Math.hypot(...vector.values()) || 1;
    for (const [key, value] of vector) vector.set(key, value / norm);
    return vector;
  });
}
const cosine = (a, b) => {
  let sum = 0;
  for (const [key, value] of a) sum += value * (b.get(key) ?? 0);
  return sum;
};

// Greedy average-free linkage: strongest pairs first, never two findings of the
// same report in one cluster (they are distinct observations by construction).
export function clusterOccurrences(occurrences, rule = MERGE_RULE) {
  const texts = weights(occurrences.map((item) => item.tokens));
  const paths = weights(occurrences.map((item) => item.paths));
  const pairs = [];
  for (let i = 0; i < occurrences.length; i++)
    for (let j = i + 1; j < occurrences.length; j++) {
      if (occurrences[i].report === occurrences[j].report) continue;
      const text = cosine(texts[i], texts[j]);
      const score = 0.7 * text + 0.3 * cosine(paths[i], paths[j]);
      if (text >= rule.text || (text >= rule.textWithFiles && score >= rule.combined)) pairs.push([score, i, j]);
    }
  pairs.sort((a, b) => b[0] - a[0]);
  const parent = occurrences.map((_, i) => i);
  const members = occurrences.map((item) => new Set([item.report]));
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [, i, j] of pairs) {
    const a = find(i), b = find(j);
    if (a === b || [...members[a]].some((report) => members[b].has(report))) continue;
    parent[b] = a;
    for (const report of members[b]) members[a].add(report);
  }
  const groups = new Map();
  occurrences.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()].map((items) => {
    items.sort((a, b) => b.date.localeCompare(a.date) || b.issue - a.issue);
    const latest = items[0];
    const issues = new Set(items.map((item) => item.issue));
    const severity = items.map((item) => item.severity).sort((a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b))[0];
    const rechecked = items.find((item) => item.upstream);
    // The most specific type any occurrence reached; older reviews without a
    // diagnosis category only fall back to "unclassified" when nothing better exists.
    const type = items.map((item) => item.type).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)).find((value) => value !== 'unclassified') ?? 'unclassified';
    return {
      title: latest.finding.title,
      severity,
      type,
      issues: issues.size,
      first: items.at(-1),
      latest,
      targets: [...new Set(items.flatMap((item) => item.targets))],
      upstream: rechecked?.upstream ?? null,
      items,
    };
  }).sort((a, b) => b.issues - a.issues || severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) || b.latest.date.localeCompare(a.latest.date));
}

const sevChip = (severity) => `<span class="sev sev-${severity}" title="${escape(severityRubric[severity])}">${severityLabels[severity]}</span>`;
const typeChip = (type) => `<span class="ftype ftype-${type}" title="${escape(typeRubric[type] ?? '')}"><i aria-hidden="true"></i>${findingTypes[type]}</span>`;
const reportLink = (item) => `../issues/${item.issue}/runs/${item.runId}/attempt-${item.attempt}/index.html`;
const upChip = (upstream) => upstream
  ? `<span class="up up-${escape(upstream.entry.status)}" title="${escape(`${upstream.check.repository} ${upstream.check.ref}@${shortSha(upstream.check)}，${upstream.check.checkedAt}`)}">${escape(upstreamStatus[upstream.entry.status])}</span>`
  : '<span class="up up-none">上游未复核</span>';

function clusterRow(cluster, index) {
  const rows = cluster.items.map((item) => `<tr><td><a class="text-link" href="${escape(reportLink(item))}#review-finding-${escape(item.finding.id)}">#${item.issue} · ${escape(item.finding.id)}</a></td><td class="mono">${escape(item.date)}</td><td><span class="fb-chips">${sevChip(item.severity)}${typeChip(item.type)}</span></td><td>${escape(item.finding.title)}<p class="check-source">${escape(item.taskTitle)}</p></td></tr>`).join('');
  return `<details class="card fx-cluster sev-${cluster.severity}" id="cluster-${index + 1}"><summary class="fx-row"><span class="fb-chips">${sevChip(cluster.severity)}${typeChip(cluster.type)}</span><span class="fb-item-main"><strong>${escape(cluster.title)}</strong><span class="fb-item-targets">${cluster.targets.slice(0, 4).map((name) => `<code>${escape(name)}</code>`).join('')}${cluster.targets.length > 4 ? `<span>等 ${cluster.targets.length} 个对象</span>` : ''}</span></span><span class="fb-item-side"><span class="fx-count${cluster.issues > 1 ? ' is-repeat' : ''}">${cluster.issues} 个任务</span><span class="fx-when">最近 #${cluster.latest.issue} · ${escape(cluster.latest.date)}</span>${upChip(cluster.upstream)}</span></summary><div class="fx-body"><div class="table-wrap"><table><thead><tr><th>报告</th><th>日期</th><th>当时定级</th><th>原标题与任务</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>`;
}

export async function renderFindingsIndex(reports, { generatedAt } = {}) {
  const { occurrences, skipped } = collectOccurrences(reports);
  const clusters = clusterOccurrences(occurrences);
  const repeated = clusters.filter((cluster) => cluster.issues > 1);
  const single = clusters.filter((cluster) => cluster.issues === 1);
  const reviewed = new Set(occurrences.map((item) => item.report)).size;
  const date = generatedAt ?? occurrences.map((item) => item.date).sort().at(-1) ?? '';
  const template = await readFile(resolve(HERE, 'report.template.html'), 'utf8');
  const style = template.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!style) throw new Error('模板缺少样式');
  const list = (items, offset) => items.map((cluster, i) => clusterRow(cluster, offset + i)).join('');
  const body = `<main class="fx-main"><header class="fx-head"><div class="eyebrow">NocoBase3 框架反馈 · 跨报告汇总 · <a class="text-link" href="../index.html">全部报告 →</a></div><h1>框架问题汇总</h1><p class="fb-scope">来自 ${reports.length} 份已发布报告，其中 ${reviewed} 份有可用的 v2 独立评审${skipped.length ? `（另有 ${skipped.length} 份评审数据不符合当前格式，未纳入）` : ''} · ${occurrences.length} 条框架发现归并为 <b>${clusters.length} 个问题</b> · 截至 ${escape(date)}</p><p class="fb-scope">按问题描述的相似度与共同的框架证据文件自动归并，可能误合并或漏合并；同一份报告内的两条发现不会合并。每个问题都列出原始报告链接，可逐条核对。等级取各次中最高的一次（有上游复核时按复核建议）。</p></header>
<section class="fx-section"><h2>反复出现 <span>${repeated.length} 个问题 · 出现在 2 个及以上任务</span></h2><div class="fx-list">${list(repeated, 0) || '<p class="card report-empty">暂无跨任务重复出现的问题。</p>'}</div></section>
<section class="fx-section"><h2>只出现一次 <span>${single.length} 个问题</span></h2><div class="fx-list">${list(single, repeated.length)}</div></section>
<footer class="report-footer">生成自已归档的 report.json；不调用模型、不重新评审，也不代表 NocoBase3 当前最新状态。未复核上游的问题可能已被修复。</footer></main>`;
  const css = `${style}
.fx-main{max-width:1180px;margin:0 auto;padding:48px 32px 60px}.fx-head h1{font-size:clamp(24px,2.6vw,32px);letter-spacing:-.6px;margin:10px 0 6px}
.fx-section{margin-top:34px}.fx-section>h2{font-size:18px;margin-bottom:12px}.fx-section>h2 span{font-size:12px;color:var(--muted);font-weight:500;margin-left:8px}
.fx-list{display:grid;gap:10px}.fx-cluster{border-left:4px solid var(--sev-bar,var(--border));overflow:hidden}
.fx-row{display:grid;grid-template-columns:200px minmax(0,1fr) auto;gap:18px;align-items:start;padding:14px 18px}.fx-row:hover{background:#fcfcfc}
.fx-count{font-size:12px;font-weight:700;color:var(--muted)}.fx-count.is-repeat{color:#fff;background:#18181b;border-radius:999px;padding:2px 10px}.fx-when{font-size:11px;color:var(--muted)}
.fx-body{padding:0 18px 16px}.fx-body table{min-width:640px}
@media(max-width:760px){.fx-main{padding:28px 16px 40px}.fx-row{grid-template-columns:1fr;gap:8px}.fb-item-side{flex-direction:row;align-items:center;flex-wrap:wrap}}`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>框架问题汇总 · NocoBase3 改进报告</title><style>${css}</style></head><body>${body}</body></html>`;
}

async function readReports(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    // rubric-N/ keeps superseded assessments of the same attempt; skip them.
    if (entry.isFile() && entry.name === 'report.json' && !/[\\/]rubric-\d+$/.test(entry.parentPath ?? entry.path))
      out.push(JSON.parse(await readFile(join(entry.parentPath ?? entry.path, entry.name), 'utf8')));
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) {
    console.error('用法: node findings-index.mjs <含 report.json 的目录> <输出.html>');
    process.exitCode = 1;
  } else {
    const reports = await readReports(root);
    const html = await renderFindingsIndex(reports);
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, html, 'utf8');
    console.log(JSON.stringify({ output: resolve(output), reports: reports.length, bytes: Buffer.byteLength(html) }));
  }
}
