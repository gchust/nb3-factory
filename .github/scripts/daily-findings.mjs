#!/usr/bin/env node
// Closes one Asia/Shanghai day of NocoBase3 framework findings into the gh-pages
// archive, then sends that day's digest to a Feishu group, mentioning the owners
// of each feature point. The archive and the Actions log are public, so owners
// live in a repository secret, which the runner masks, and are never written to
// either. Only the `notify` step receives the webhook, its signing secret and the
// owners. No model calls.
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from './factory-lib.mjs';
import { loadRules, ruleFeaturePaths } from './problem-classification.mjs';
import {
  BRANCH,
  commitFindings,
  getJson,
  pagesUrl,
  readFindingsSnapshot,
} from './report-pages.mjs';
import {
  clusterOccurrences,
  collectOccurrences,
} from '../reports/findings-index.mjs';
import {
  INDEX_PAGE,
  LEDGER,
  dayFile,
  dayPage,
  groupByFeature,
  mergeDay,
  planDailyArchive,
  previousDay,
  renderDailyIndex,
  renderDailyPage,
  summaryOf,
  validateDay,
  validateLedger,
} from '../reports/findings-daily.mjs';
import { severityLabels } from '../reports/framework-overview.mjs';

const conflict = (error) => /409|422/.test(error.message);
const clip = (value, max) =>
  !value || value.length <= max ? value || '' : `${value.slice(0, max - 1)}…`;

export async function archiveDay(
  client,
  { day, now = new Date(), notify = true, rules = loadRules() } = {},
) {
  day ||= previousDay(now);
  const featureOf = (keys) => ruleFeaturePaths(keys, rules);
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await readFindingsSnapshot(client);
    if (!snapshot)
      return { changed: false, commitSha: null, day, added: 0, pending: 0 };
    const { occurrences } = collectOccurrences(snapshot.reports);
    const clusters = clusterOccurrences(occurrences, snapshot.classification);
    const ledger = validateLedger(await getJson(client, LEDGER, snapshot.sha));
    const plan = planDailyArchive({
      occurrences,
      clusters,
      ledger,
      day,
      now,
      notify,
      featureOf,
    });
    const files = [];
    for (const { date, entries } of plan.added) {
      const existing = await getJson(client, dayFile(date), snapshot.sha);
      const document = mergeDay(validateDay(existing, date), date, entries);
      files.push(
        [dayFile(date), JSON.stringify(document, null, 2)],
        [dayPage(date), await renderDailyPage(document)],
      );
    }
    files.push(
      [LEDGER, JSON.stringify(plan.ledger, null, 2)],
      [INDEX_PAGE, await renderDailyIndex(plan.ledger, { occurrences })],
    );
    try {
      const commitSha = await commitFindings(
        client,
        snapshot.sha,
        files,
        `report: archive framework findings through ${day}`,
      );
      return {
        changed: commitSha !== snapshot.sha,
        commitSha,
        day,
        added: plan.added.reduce((sum, item) => sum + item.entries.length, 0),
        pending: plan.ledger.pending.length,
        dropped: plan.dropped,
      };
    } catch (error) {
      if (attempt === 2 || !conflict(error)) throw error;
    }
  }
}

// Open IDs, user IDs or `all`; anything else would be rendered as text.
const MENTION = /^[A-Za-z0-9_-]{1,64}$/;
export function parseOwners(text) {
  if (!text?.trim()) return { featurePoints: {}, default: [] };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    // The parser's message quotes the input, which must stay out of the log.
    throw new Error('FEISHU_PROBLEM_OWNERS is not valid JSON');
  }
  const list = (ids, where) => {
    if (
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === 'string' && MENTION.test(id))
    )
      throw new Error(`FEISHU_PROBLEM_OWNERS: invalid mentions for ${where}`);
    return [...new Set(ids)];
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('FEISHU_PROBLEM_OWNERS must be a JSON object');
  // A misspelled key would silently mention nobody.
  const unknown = Object.keys(value).filter(
    (key) => !['featurePoints', 'default'].includes(key),
  );
  if (unknown.length)
    throw new Error(
      `FEISHU_PROBLEM_OWNERS: unknown keys ${unknown.join(', ')} (expected featurePoints and default)`,
    );
  const featurePoints = {};
  for (const [name, ids] of Object.entries(value.featurePoints ?? {}))
    featurePoints[name] = list(ids, name);
  return { featurePoints, default: list(value.default ?? [], 'default') };
}

// Mapping keys that no rule can produce: a feature point or dimension typo.
export function unknownOwnerKeys(owners, rules) {
  const known = new Set(
    rules.rules.flatMap((rule) => [
      rule.featurePoint,
      rule.featurePoint.split('/')[0],
    ]),
  );
  return Object.keys(owners.featurePoints).filter((name) => !known.has(name));
}

// A feature point's own owners, else its dimension's, else the default ones.
export function ownersOf(owners, featurePoint) {
  if (featurePoint) {
    const own = owners.featurePoints[featurePoint];
    const dimension = owners.featurePoints[featurePoint.split('/')[0]];
    if (own ?? dimension) return own ?? dimension;
  }
  return owners.default;
}

export const MAX_DIGEST_BYTES = 18_000;
const text = (value) => ({ tag: 'text', text: value });
const link = (label, href) => ({ tag: 'a', text: label, href });
const mention = (id) => ({ tag: 'at', user_id: id });

// A rich-text post: untrusted titles stay in text/link nodes, which Feishu does
// not parse, so a finding cannot inject a mention. Mentions are `at` nodes.
export function feishuDigest({
  date,
  entries,
  owners,
  pageUrl,
  reportUrl,
  maxBytes = MAX_DIGEST_BYTES,
}) {
  const summary = summaryOf(entries, date);
  const severities = Object.keys(severityLabels)
    .filter((key) => summary.severities[key])
    .map((key) => `${severityLabels[key]} ${summary.severities[key]}`)
    .join(' · ');
  const groups = groupByFeature(entries);
  const build = (limit) => {
    const content = [
      [
        text(
          `新增 ${summary.count} 条框架发现（${severities}），来自 ${summary.tasks} 个任务${summary.late ? `；其中 ${summary.late} 条来自更早结束的运行` : ''}。`,
        ),
        link('查看当日归档', pageUrl),
      ],
    ];
    for (const group of groups) {
      const leads = ownersOf(owners, group.featurePoint);
      content.push([
        text(`【${group.name}】${group.items.length} 条 `),
        ...leads.map(mention),
      ]);
      for (const entry of group.items.slice(0, limit)) {
        // An unplaced entry also reaches the owners of each feature point it touches.
        const related = group.featurePoint ? [] : (entry.candidates ?? []);
        const extra = [
          ...new Set(related.flatMap((name) => ownersOf(owners, name))),
        ].filter((id) => !leads.includes(id));
        content.push([
          text(`· ${severityLabels[entry.severity]}｜`),
          link(clip(entry.title, 80), reportUrl(entry.report)),
          text(
            ` · #${entry.issue} ${clip(entry.taskTitle, 40)}${entry.group?.issues > 1 ? ` · 已在 ${entry.group.issues} 个任务出现` : ''}${related.length ? ` · 涉及 ${related.join('、')} ` : ''}`,
          ),
          ...extra.map(mention),
        ]);
      }
      if (group.items.length > limit)
        content.push([
          text(`· 另有 ${group.items.length - limit} 条，见`),
          link('当日归档', pageUrl),
        ]);
    }
    return {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: { title: `NocoBase3 框架问题日报 · ${date}`, content },
        },
      },
    };
  };
  for (let limit = 8; limit > 0; limit--) {
    const message = build(limit);
    if (Buffer.byteLength(JSON.stringify(message)) <= maxBytes) return message;
  }
  return build(0);
}

// Feishu signs with HMAC-SHA256 keyed by "timestamp\nsecret" over an empty body.
export const feishuSign = (secret, timestamp) =>
  createHmac('sha256', `${timestamp}\n${secret}`).digest('base64');

export function feishuConfig(env) {
  const raw = env.FEISHU_WEBHOOK_URL?.trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('FEISHU_WEBHOOK_URL is not a URL');
  }
  if (
    url.protocol !== 'https:' ||
    !['open.feishu.cn', 'open.larksuite.com'].includes(url.hostname) ||
    !url.pathname.startsWith('/open-apis/bot/v2/hook/') ||
    url.username ||
    url.password
  )
    throw new Error(
      'FEISHU_WEBHOOK_URL must be a Feishu or Lark custom bot webhook',
    );
  return {
    url: url.href,
    secret: env.FEISHU_WEBHOOK_SECRET?.trim() || null,
    owners: parseOwners(env.FEISHU_PROBLEM_OWNERS),
  };
}

// Errors never include the webhook URL: Actions logs of this repository are public.
// Connection errors raised before any request bytes were sent.
export const NEVER_SENT = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export async function sendFeishu(
  config,
  message,
  { fetcher = fetch, now = Date.now, pause = sleep, attempts = 3 } = {},
) {
  for (let attempt = 1; ; attempt++) {
    const timestamp = String(Math.floor(now() / 1000));
    const body = config.secret
      ? { timestamp, sign: feishuSign(config.secret, timestamp), ...message }
      : message;
    let error, retry;
    try {
      const response = await fetcher(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json().catch(() => null);
      const code = result?.code ?? result?.StatusCode;
      if (response.ok && code === 0) return;
      // 429 and 503 mean Feishu did not take the message. Any other 5xx (a
      // 502 or 504 from a proxy in front of it) may follow a post that already
      // reached the chat, so it is treated like a timeout: no resend in this
      // run, and the day stays pending.
      retry = response.status === 429 || response.status === 503;
      error = new Error(
        `Feishu rejected the digest (HTTP ${response.status}, code ${code ?? 'none'}: ${clip(String(result?.msg ?? result?.StatusMessage ?? ''), 200)})`,
      );
    } catch (failure) {
      // Resend only when the request can't have reached Feishu. After a
      // timeout or a dropped connection the digest may already be in the
      // chat, and a second copy would break the one-set rule: the day stays
      // pending and the next run decides, as for any other failure.
      // DOMException.code is a legacy number (23 for a timeout): use its name.
      const code =
        failure.cause?.code ??
        (typeof failure.code === 'string' ? failure.code : failure.name);
      retry = NEVER_SENT.has(code);
      error = new Error(
        `Feishu request failed (${code})${retry ? '' : '; it may have been delivered, so it is not resent in this run'}`,
      );
    }
    if (!retry || attempt >= attempts) throw error;
    await pause(2000 * attempt);
  }
}

// Sends one digest per pending day, oldest first, then forgets what was sent.
// A failed day stays pending for the next run until it is PENDING_DAYS old.
export async function notifyPending(
  client,
  config,
  { baseUrl, send = sendFeishu } = {},
) {
  const sha = (await client.getRef(BRANCH, true))?.object?.sha;
  const ledger = sha
    ? validateLedger(await getJson(client, LEDGER, sha))
    : null;
  const pending = ledger?.pending ?? [];
  if (!pending.length || !config)
    return { sent: [], failed: [], remaining: pending.length };
  const done = new Set();
  const sent = [];
  const failed = [];
  for (const date of [...new Set(pending.map((item) => item.date))].sort()) {
    const keys = new Set(
      pending.filter((item) => item.date === date).map((item) => item.key),
    );
    const document = validateDay(
      await getJson(client, dayFile(date), sha),
      date,
    );
    const entries = (document?.entries ?? []).filter((entry) =>
      keys.has(entry.key),
    );
    try {
      if (entries.length)
        await send(
          config,
          feishuDigest({
            date,
            entries,
            owners: config.owners,
            pageUrl: pagesUrl(baseUrl, dayPage(date)),
            reportUrl: (report) => pagesUrl(baseUrl, report),
          }),
        );
      keys.forEach((key) => done.add(key));
      sent.push({ date, count: entries.length });
    } catch (error) {
      failed.push({ date, error: error.message });
    }
  }
  for (let attempt = 0; done.size && attempt < 3; attempt++) {
    const head = (await client.getRef(BRANCH, true)).object.sha;
    const current = validateLedger(await getJson(client, LEDGER, head));
    const next = {
      ...current,
      pending: current.pending.filter((item) => !done.has(item.key)),
    };
    try {
      await commitFindings(
        client,
        head,
        [[LEDGER, JSON.stringify(next, null, 2)]],
        'report: record sent daily findings digest',
      );
      break;
    } catch (error) {
      if (attempt === 2 || !conflict(error)) throw error;
    }
  }
  return { sent, failed, remaining: pending.length - done.size };
}

// The conventional project Pages base, as the TestManage3 delivery uses.
export const defaultPagesBase = (repository) => {
  const [owner, name] = repository.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, ...argv] = process.argv.slice(2);
  if (argv.length % 2) throw new Error('Expected --name value arguments');
  const args = Object.fromEntries(
    Array.from({ length: argv.length / 2 }, (_, i) => [
      argv[i * 2].replace(/^--/, ''),
      argv[i * 2 + 1],
    ]),
  );
  const output = (values) => {
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(values)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(''),
      );
  };
  const summary = (line) => {
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  };
  const client = new GitHubClient({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    apiUrl: process.env.GITHUB_API_URL,
  });
  if (mode === 'archive') {
    const result = await archiveDay(client, {
      day: args.date || undefined,
      notify: args.notify !== 'false',
    });
    const line = `Closed ${result.day}: ${result.added} new finding(s) archived, ${result.pending} waiting for the Feishu digest${result.dropped ? `, ${result.dropped} unsent for over a week dropped` : ''}.`;
    console.log(line);
    summary(line);
    output({
      changed: result.changed,
      commit_sha: result.commitSha ?? '',
      added: result.added,
      pending: result.pending,
    });
  } else if (mode === 'notify') {
    const config = feishuConfig(process.env);
    const result = await notifyPending(client, config, {
      baseUrl:
        args['base-url'] || defaultPagesBase(process.env.GITHUB_REPOSITORY),
    });
    if (!config)
      console.log(
        `::warning::FEISHU_WEBHOOK_URL is not set; ${result.remaining} digest entr(ies) stay pending.`,
      );
    for (const name of config
      ? unknownOwnerKeys(config.owners, loadRules())
      : [])
      console.log(
        `::warning::FEISHU_PROBLEM_OWNERS names ${name}, which no feature point rule produces.`,
      );
    for (const item of result.sent) {
      const line = `Feishu digest for ${item.date}: ${item.count} finding(s).`;
      console.log(line);
      summary(line);
    }
    for (const item of result.failed)
      console.log(`::error::Feishu digest for ${item.date}: ${item.error}`);
    if (result.failed.length) process.exitCode = 1;
  } else
    throw new Error(
      'Usage: daily-findings.mjs <archive|notify> [--date YYYY-MM-DD] [--notify true|false] [--base-url URL]',
    );
}
