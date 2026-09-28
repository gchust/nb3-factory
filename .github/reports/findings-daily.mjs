/** Daily archive of NocoBase3 framework findings. Closing a day freezes every
 * finding the factory had published by then into that day, so the day's page
 * and its Feishu digest describe the same set. No GitHub, network or model access. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { occurrenceId } from './findings-classification.mjs';
import {
  findingTypes,
  severityLabels,
  severityRubric,
  typeRubric,
} from './framework-overview.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TIME_ZONE = 'Asia/Shanghai';
export const DAILY_ROOT = 'reports/findings/daily';
export const LEDGER = `${DAILY_ROOT}/index.json`;
export const INDEX_PAGE = `${DAILY_ROOT}/index.html`;
export const dayFile = (date) => `${DAILY_ROOT}/${date}.json`;
export const dayPage = (date) => `${DAILY_ROOT}/${date}.html`;
// A digest still unsent after this many days is dropped instead of sent late.
export const PENDING_DAYS = 7;
export const NO_FEATURE = '未归入功能点';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-f0-9]{24}$/;
const severityOrder = Object.keys(severityLabels);
const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function dayOf(time) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid time');
  const value = Object.fromEntries(
    parts.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}
// Asia/Shanghai has no daylight saving time, so a day is always 24 hours.
export const previousDay = (now) => dayOf(new Date(now).getTime() - 86_400_000);
const shiftDay = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const clip = (value, max) =>
  !value || value.length <= max ? value || '' : `${value.slice(0, max - 1)}…`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const bySeverity = (a, b) =>
  severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) ||
  b.issue - a.issue;

// Stable across republication of the same report; a rewritten finding under the
// same ID is a new discovery.
export const entryKey = (item) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        occurrenceId(item),
        item.finding.title.trim().replace(/\s+/g, ' ').toLowerCase(),
      ]),
    )
    .digest('hex')
    .slice(0, 24);

// Public: the archive lives on GitHub Pages, so it names feature points, never people.
export function dailyEntry(
  item,
  cluster,
  { archivedAt, featureOf = () => null },
) {
  const place = featureOf(item.subjectKeys ?? []) ?? {};
  return {
    key: entryKey(item),
    id: occurrenceId(item),
    issue: item.issue,
    runId: Number(item.runId),
    attempt: Number(item.attempt),
    findingId: item.finding.id,
    runDay: dayOf(item.endedAt),
    archivedAt,
    title: item.finding.title,
    summary: clip(item.finding.detail, 600),
    severity: item.severity,
    type: item.type,
    owner: item.finding.owner,
    targets: [...item.targets],
    subjectKeys: [...(item.subjectKeys ?? [])],
    featurePoint: place.featurePoint ?? null,
    // Every feature point the cited subjects touch; routes an unplaced entry.
    candidates: [...(place.candidates ?? [])],
    taskTitle: item.taskTitle,
    appVersion: item.appVersion ?? null,
    group: cluster?.reviewed
      ? {
          title: cluster.title,
          issues: cluster.issues,
          first: dayOf(cluster.first.endedAt),
        }
      : null,
    report: `reports/issues/${item.issue}/runs/${item.runId}/attempt-${item.attempt}/index.html#review-finding-${item.finding.id}`,
  };
}

export function validateLedger(ledger) {
  if (ledger === null || ledger === undefined) return null;
  assert(
    ledger.version === 1 &&
      ledger.timeZone === TIME_ZONE &&
      DAY.test(ledger.closedThrough ?? '') &&
      Array.isArray(ledger.days) &&
      Array.isArray(ledger.keys) &&
      Array.isArray(ledger.pending),
    'Invalid daily findings ledger',
  );
  assert(
    ledger.keys.every((key) => KEY.test(key)) &&
      ledger.days.every(
        (day) => DAY.test(day?.date ?? '') && Number.isSafeInteger(day.count),
      ) &&
      ledger.pending.every(
        (item) => DAY.test(item?.date ?? '') && KEY.test(item.key ?? ''),
      ),
    'Invalid daily findings ledger entry',
  );
  return ledger;
}

export function validateDay(document, date) {
  if (document === null || document === undefined) return null;
  assert(
    document.version === 1 &&
      document.date === date &&
      Array.isArray(document.entries) &&
      document.entries.every((entry) => KEY.test(entry?.key ?? '')),
    `Invalid daily findings for ${date}`,
  );
  return document;
}

const tally = (entries) => {
  const severities = Object.fromEntries(severityOrder.map((key) => [key, 0]));
  for (const entry of entries) severities[entry.severity] += 1;
  return severities;
};

// Plans closing `day`. The first archive rebuilds history by each run's own end
// date and only queues the closed day's digest; afterwards every finding not yet
// archived whose run ended by `day` belongs to `day`, late replays included.
export function planDailyArchive({
  occurrences,
  clusters = [],
  ledger = null,
  day,
  now = new Date(),
  notify = true,
  featureOf,
}) {
  assert(DAY.test(day ?? ''), 'Day must be YYYY-MM-DD');
  assert(day <= dayOf(now), 'Cannot close a day that has not started');
  assert(
    !ledger || day >= ledger.closedThrough,
    `Days up to ${ledger?.closedThrough} are already closed`,
  );
  const archivedAt = new Date(now).toISOString();
  const known = new Set(ledger?.keys ?? []);
  const clusterOf = new Map();
  for (const cluster of clusters)
    for (const item of cluster.items)
      clusterOf.set(occurrenceId(item), cluster);
  const added = new Map();
  for (const item of occurrences) {
    const entry = dailyEntry(item, clusterOf.get(occurrenceId(item)), {
      archivedAt,
      featureOf,
    });
    // A run that ended after the closed day waits for its own day.
    if (entry.runDay > day || known.has(entry.key)) continue;
    known.add(entry.key);
    const date = ledger ? day : entry.runDay;
    added.set(date, [...(added.get(date) ?? []), entry]);
  }
  const days = new Map((ledger?.days ?? []).map((item) => [item.date, item]));
  for (const [date, entries] of added) {
    const before = days.get(date);
    const severities = tally(entries);
    for (const [key, count] of Object.entries(before?.severities ?? {}))
      severities[key] = (severities[key] ?? 0) + count;
    days.set(date, {
      date,
      count: (before?.count ?? 0) + entries.length,
      severities,
      late:
        (before?.late ?? 0) +
        entries.filter((entry) => entry.runDay < date).length,
      updatedAt: archivedAt,
    });
  }
  const cutoff = shiftDay(day, -PENDING_DAYS);
  const previous = ledger?.pending ?? [];
  const pending = [
    ...previous.filter((item) => item.date > cutoff),
    ...(notify ? (added.get(day) ?? []) : []).map((entry) => ({
      date: day,
      key: entry.key,
    })),
  ];
  return {
    added: [...added]
      .map(([date, entries]) => ({ date, entries }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    dropped:
      previous.length - previous.filter((item) => item.date > cutoff).length,
    ledger: {
      version: 1,
      timeZone: TIME_ZONE,
      startedAt: ledger?.startedAt ?? archivedAt,
      closedThrough: day,
      days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
      keys: [...known],
      pending,
    },
  };
}

export function mergeDay(document, date, entries) {
  const known = new Set((document?.entries ?? []).map((entry) => entry.key));
  return {
    version: 1,
    date,
    timeZone: TIME_ZONE,
    entries: [
      ...(document?.entries ?? []),
      ...entries.filter((entry) => !known.has(entry.key)),
    ],
  };
}

// Mentions and page sections share one grouping: feature point, most severe first.
export function groupByFeature(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const name = entry.featurePoint ?? NO_FEATURE;
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  return [...groups]
    .map(([name, items]) => ({
      name,
      featurePoint: items[0].featurePoint,
      items: items.sort(bySeverity),
    }))
    .sort(
      (a, b) =>
        (a.featurePoint === null) - (b.featurePoint === null) ||
        bySeverity(a.items[0], b.items[0]) ||
        b.items.length - a.items.length ||
        a.name.localeCompare(b.name),
    );
}

// Entries whose run ended before the day they were archived under are late.
export function summaryOf(entries, date) {
  return {
    count: entries.length,
    tasks: new Set(entries.map((entry) => entry.issue)).size,
    late: entries.filter((entry) => entry.runDay < date).length,
    severities: tally(entries),
  };
}

const sevChip = (severity) =>
  `<span class="sev sev-${severity}" title="${escape(severityRubric[severity])}">${severityLabels[severity]}</span>`;
const typeChip = (type) =>
  `<span class="ftype ftype-${type}" title="${escape(typeRubric[type] ?? '')}"><i aria-hidden="true"></i>${findingTypes[type] ?? escape(type)}</span>`;
const severityLine = (severities) =>
  severityOrder
    .filter((key) => severities[key])
    .map((key) => `${severityLabels[key]} ${severities[key]}`)
    .join(' · ');

async function page(title, body) {
  const template = await readFile(
    resolve(HERE, 'report.template.html'),
    'utf8',
  );
  const style = template.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!style) throw new Error('模板缺少样式');
  const css = `${style}
.fd-main{max-width:1180px;margin:0 auto;padding:48px 32px 60px}.fd-head h1{font-size:clamp(24px,2.6vw,32px);letter-spacing:-.6px;margin:10px 0 6px}
.fd-section{margin-top:28px}.fd-section>h2{font-size:18px;margin-bottom:12px}.fd-section>h2 span{font-size:12px;color:var(--muted);font-weight:500;margin-left:8px}
.fd-list{display:grid;gap:10px}.fd-day{display:grid;grid-template-columns:140px minmax(0,1fr) auto;gap:18px;align-items:center;padding:14px 18px}
.fd-count{font-size:12px;font-weight:700;color:var(--muted)}.fd-note{font-size:11px;color:var(--muted)}.fd-body{padding:4px 18px 12px}.fd-body table{min-width:640px;width:100%;table-layout:fixed}
.fd-c-sev{width:128px}.fd-c-report{width:112px}.fd-c-group{width:176px}.fd-nowrap{white-space:nowrap}
@media(max-width:760px){.fd-main{padding:28px 16px 40px}.fd-day{grid-template-columns:1fr;gap:6px}}`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(title)} · NocoBase3 改进报告</title><style>${css}</style></head><body>${body}</body></html>`;
}

const reportHref = (entry) => `../../${entry.report.slice('reports/'.length)}`;
const groupNote = (entry) =>
  !entry.group
    ? '待 Agent 归类'
    : entry.group.issues > 1
      ? `反复出现 · ${entry.group.issues} 个任务 · 最早 ${entry.group.first}`
      : '首次出现';

export async function renderDailyPage(document) {
  const summary = summaryOf(document.entries, document.date);
  const row = (entry) => {
    const notes = [
      entry.taskTitle,
      !entry.featurePoint && entry.candidates?.length
        ? `涉及 ${entry.candidates.join('、')}`
        : '',
      entry.runDay < document.date ? `补录：运行于 ${entry.runDay} 结束` : '',
    ].filter(Boolean);
    const targets = entry.targets
      .slice(0, 3)
      .map((name) => `<code>${escape(name)}</code>`)
      .join(' ');
    return `<tr><td><span class="fb-chips">${sevChip(entry.severity)}${typeChip(entry.type)}</span></td><td>${escape(entry.title)}<p class="check-source">${notes.map(escape).join(' · ')}${targets ? ` · ${targets}` : ''}</p></td><td class="fd-nowrap"><a class="text-link" href="${escape(reportHref(entry))}">#${entry.issue} · ${escape(entry.findingId)}</a></td><td class="fd-note">${escape(groupNote(entry))}</td></tr>`;
  };
  const sections = groupByFeature(document.entries)
    .map(
      (group) =>
        `<section class="fd-section"><h2>${escape(group.name)} <span>${group.items.length} 条</span></h2><div class="card fd-body"><div class="table-wrap"><table><colgroup><col class="fd-c-sev"><col><col class="fd-c-report"><col class="fd-c-group"></colgroup><thead><tr><th>等级与类型</th><th>问题与任务</th><th>报告</th><th>跨任务</th></tr></thead><tbody>${group.items.map(row).join('')}</tbody></table></div></div></section>`,
    )
    .join('');
  const body = `<main class="fd-main"><header class="fd-head"><div class="eyebrow">NocoBase3 框架反馈 · 按日期归档 · <a class="text-link" href="./">全部日期 →</a> · <a class="text-link" href="../">问题汇总 →</a></div><h1>${escape(document.date)} 新发现的框架问题</h1><p class="fb-scope">${summary.count} 条框架发现，来自 ${summary.tasks} 个任务${summary.count ? ` · ${severityLine(summary.severities)}` : ''}${summary.late ? ` · 其中 ${summary.late} 条来自更早结束的运行（补录）` : ''}</p><p class="fb-scope">收录截至本日（${TIME_ZONE}）结束、此前尚未归档的框架、插件、模板和文档发现；开启飞书日报时，当天发送的就是这一批。按评审证据引用的包归入功能点；涉及多个功能点或无法确定的列在“${NO_FEATURE}”，并注明涉及的功能点。归档后不再改动：后来的重跑或重新评审出现在它发布后的那一天。</p></header>
${sections || '<section class="fd-section"><p class="card report-empty">这一天没有新发现。</p></section>'}
<footer class="report-footer">生成自已归档的 report.json；不重新评审原问题，也不代表 NocoBase3 当前最新状态。</footer></main>`;
  return page(`${document.date} 框架问题`, body);
}

export async function renderDailyIndex(ledger) {
  const days = ledger.days.filter((day) => day.count > 0);
  const rows = days
    .map(
      (day) =>
        `<a class="card fd-day" href="${escape(day.date)}.html"><strong class="mono">${escape(day.date)}</strong><span class="fb-scope">${escape(severityLine(day.severities ?? {}))}${day.late ? ` · 补录 ${day.late} 条` : ''}</span><span class="fd-count">${day.count} 条</span></a>`,
    )
    .join('');
  const body = `<main class="fd-main"><header class="fd-head"><div class="eyebrow">NocoBase3 框架反馈 · <a class="text-link" href="../">问题汇总 →</a> · <a class="text-link" href="../../index.html">全部报告 →</a></div><h1>框架问题 · 按日期归档</h1><p class="fb-scope">每天（${TIME_ZONE}）收录此前尚未归档的框架发现，截至 ${escape(ledger.closedThrough)}。自 ${escape(ledger.startedAt.slice(0, 10))} 起逐日归档，更早的发现按各自运行的结束日期补建。</p></header>
<section class="fd-section"><div class="fd-list">${rows || '<p class="card report-empty">暂无归档的框架发现。</p>'}</div></section>
<footer class="report-footer">开启飞书日报时，每一天的清单与当天发送的日报一致；没有新发现的日子不列出。</footer></main>`;
  return page('框架问题 · 按日期归档', body);
}
