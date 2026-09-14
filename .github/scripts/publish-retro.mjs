import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { scrubSecrets } from './agent-history.mjs';
import { readJson } from './visual-report.mjs';
import { waitForTaskRun } from './wait-for-task-run.mjs';

// The retrospective is the one place where an agent describes *why* a build was
// slow. It is published to the source Issue as an updatable comment, and a short
// version is appended to a single ledger Issue so the suggestions survive the
// individual task Issues.
export const MARKER = (runId, attempt) =>
  `<!-- factory-retro:${runId}:${attempt} -->`;
export const LEDGER_MARKER = (runId, attempt) =>
  `<!-- factory-retro-log:${runId}:${attempt} -->`;
export const LEDGER_LABEL = 'factory:retro-log';
export const LEDGER_TITLE = '搭建复盘台账';

export const CATEGORIES = {
  'template-overlay': '模板 overlay / compatibilityFixes',
  'skills-docs': 'Skill 文档缺失或误导',
  'scaffold-defaults': 'create-app 脚手架默认值',
  verification: '工厂验证脚本误报或漏报',
  tooling: '本地命令 / 依赖 / 构建',
  other: '其他',
};

const PHASES = {
  implementation: '初始实现',
  verify: '工厂验证',
  qa: '浏览器验收',
  repair: '修复轮次',
  other: '未分类',
};

const CONCLUSIONS = {
  success: '已交付',
  failure: '失败',
  cancelled: '已取消',
  timed_out: '超时',
  action_required: '需人工介入',
  skipped: '跳过',
};

const LIMIT = 800;
const repository = process.env.GITHUB_REPOSITORY;
const output = (name, value) =>
  process.env.GITHUB_OUTPUT &&
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);

async function api(method, route, body, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(
        `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}${route}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: globalThis.AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error(`GitHub ${method} failed (${response.status})`);
      return response.status === 204 ? null : response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1_000 * attempt);
    }
  }
  throw lastError;
}

async function list(route, key) {
  const result = [];
  for (let page = 1; page <= 30; page++) {
    const response = await api(
      'GET',
      `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    const items = key ? response[key] : response;
    if (!Array.isArray(items)) throw new Error('Invalid GitHub list response');
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error('GitHub pagination limit reached');
}

function text(value) {
  return scrubSecrets(
    String(value ?? '')
      .replaceAll(/\s+/gu, ' ')
      .trim(),
  ).slice(0, LIMIT);
}

function entries(value) {
  return Array.isArray(value) ? value.slice(0, 20) : [];
}

/**
 * Agents produce JSON but sometimes wrap it in prose or a fence. Anything we
 * cannot parse is kept verbatim and published under a clearly labelled
 * fallback section, so a malformed retro never loses the whole report.
 */
export function parseRetro(raw) {
  const source = String(raw ?? '').trim();
  const empty = { summary: '', blockers: [], improvements: [] };
  if (!source) return { structured: false, data: empty, raw: null };
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu))
    candidates.push(match[1].trim());
  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      continue;
    return { structured: true, data: normalizeRetro(parsed), raw: null };
  }
  return { structured: false, data: empty, raw: scrubSecrets(source) };
}

export function normalizeRetro(parsed) {
  return {
    summary: text(parsed.summary),
    blockers: entries(parsed.blockers)
      .map((item) =>
        item && typeof item === 'object'
          ? {
              phase: PHASES[item.phase] ? item.phase : 'other',
              title: text(item.title),
              symptom: text(item.symptom),
              rootCause: text(item.rootCause),
              resolution: text(item.resolution),
              cost: text(item.cost),
            }
          : null,
      )
      .filter((item) => item && item.title),
    improvements: entries(parsed.improvements)
      .map((item) =>
        item && typeof item === 'object'
          ? {
              category: CATEGORIES[item.category] ? item.category : 'other',
              title: text(item.title),
              detail: text(item.detail),
              suggestedChange: text(item.suggestedChange),
              mechanizable: item.mechanizable === true,
            }
          : null,
      )
      .filter((item) => item && item.title),
  };
}

export function renderRetro({
  issue,
  runId,
  attempt,
  runUrl,
  targetBranch,
  conclusion,
  retro,
  structured,
  raw,
  repair,
}) {
  const rounds = Number.isSafeInteger(repair?.verificationAttempts)
    ? repair.verificationAttempts
    : null;
  const repairs = Number.isSafeInteger(repair?.repairAttempts)
    ? repair.repairAttempts
    : null;
  const lines = [
    MARKER(runId, attempt),
    '## 搭建复盘：这次卡在哪，下次怎么不卡',
    '',
    `本轮 [run ${runId} / attempt ${attempt}](${runUrl}) · ${CONCLUSIONS[conclusion] ?? '已结束'} · Issue #${issue} · 目标分支 \`${targetBranch}\``,
    '',
  ];
  if (retro.summary) lines.push(`**一句话**：${retro.summary}`, '');
  else if (!structured && !raw)
    lines.push(
      '> 本轮 Agent 没有产出复盘文件（`retro.json`）。下面只有流水线统计。',
      '',
    );

  const stats = [
    rounds === null ? null : `| 验证轮次 | ${rounds} |`,
    repairs === null ? null : `| 修复轮次 | ${repairs} |`,
    `| Agent 记录卡点 | ${retro.blockers.length} |`,
    `| 基线优化建议 | ${retro.improvements.length} |`,
  ].filter(Boolean);
  if (stats.length) {
    lines.push('| 指标 | 值 |', '| --- | ---: |', ...stats, '');
  }

  lines.push('### 一、这次遇到了什么问题，怎么解决的', '');
  if (retro.blockers.length) {
    retro.blockers.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.title}**（${PHASES[item.phase]}）`);
      for (const [label, value] of [
        ['现象', item.symptom],
        ['根因', item.rootCause],
        ['解决', item.resolution],
        ['代价', item.cost],
      ])
        if (value) lines.push(`   - ${label}：${value}`);
    });
  } else {
    lines.push(
      repair?.handoff
        ? '本轮跑到 Runner 预算上限后交接，未记录卡点。'
        : '本轮没有记录卡点（一次通过，或 Agent 未填写）。',
    );
  }
  lines.push('');

  lines.push('### 二、如何优化 NocoBase 3 基线，避免下次再踩', '');
  if (retro.improvements.length) {
    lines.push(
      '| 分类 | 建议 | 落地改法 | 可机械化 |',
      '| --- | --- | --- | --- |',
    );
    for (const item of retro.improvements)
      lines.push(
        `| ${CATEGORIES[item.category]} | ${item.title} | ${item.suggestedChange || item.detail || '—'} | ${item.mechanizable ? '是' : '否'} |`,
      );
    lines.push('');
    for (const item of retro.improvements)
      if (item.detail && item.suggestedChange)
        lines.push(`- **${item.title}**：${item.detail}`);
    lines.push('');
  } else {
    lines.push('本轮没有提出基线优化建议。', '');
  }
  lines.push(
    `> 分类：${Object.entries(CATEGORIES)
      .map(([key, label]) => `\`${key}\` ${label}`)
      .join(' · ')}`,
    '',
  );

  if (raw) {
    lines.push(
      '<details><summary>原始复盘（JSON 解析失败，原文照录）</summary>',
      '',
      '```text',
      scrubSecrets(raw).slice(0, 20_000),
      '```',
      '',
      '</details>',
      '',
    );
  }
  return lines.join('\n');
}

export function renderLedger({
  issue,
  runId,
  attempt,
  runUrl,
  retro,
  commentUrl,
}) {
  const counts = new Map();
  for (const item of retro.improvements)
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([key, count]) => `${CATEGORIES[key]} × ${count}`)
    .join('、');
  const lines = [
    LEDGER_MARKER(runId, attempt),
    `### Issue #${issue} · run ${runId} · attempt ${attempt}`,
    '',
    retro.summary || '（Agent 未填写一句话总结）',
    '',
    summary
      ? `建议分布：${summary}（共 ${retro.improvements.length} 条）`
      : '本轮无基线优化建议。',
    '',
    commentUrl ? `[查看完整复盘](${commentUrl})` : `本轮运行：${runUrl}`,
  ];
  return lines.join('\n');
}

async function upsert(issue, marker, body) {
  const existing = (await list(`/issues/${issue}/comments`)).find(
    (comment) =>
      comment.user?.login === 'github-actions[bot]' &&
      comment.body?.includes(marker),
  );
  if (existing?.body === body) return { comment: existing, unchanged: true };
  const created = await api(
    existing ? 'PATCH' : 'POST',
    existing ? `/issues/comments/${existing.id}` : `/issues/${issue}/comments`,
    { body },
  );
  return { comment: existing ?? created, unchanged: false };
}

export function selectRetroArtifact(run, artifacts, repo = repository) {
  if (
    run.path !== '.github/workflows/code-agent-task.yml' ||
    run.head_repository?.full_name !== repo ||
    !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event)
  )
    throw new Error('Not a same-repository Code Agent task run');
  if (run.status !== 'completed') return null;
  const artifact = artifacts.find((item) =>
    /^factory-agent-\d+$/.test(item?.name ?? ''),
  );
  if (!artifact) return null;
  return {
    artifact,
    issue: Number(artifact.name.slice('factory-agent-'.length)),
  };
}

/**
 * Unlike the media report, a retro is published for failed runs and handoffs
 * too: those are exactly the runs that explain what to fix next. It therefore
 * does not require a successful delivery, only a completed run of the task
 * workflow that produced an agent artifact.
 */
async function select(args) {
  output('ready', 'false');
  const repo = await api('GET', '');
  const run = await waitForTaskRun(api, {
    runId: args.runId,
    attempt: args.attempt,
    repository,
    defaultBranch: repo.default_branch,
  });
  const latest = await api('GET', `/actions/runs/${args.runId}`);
  if (latest.run_attempt !== run.run_attempt) {
    console.log('Source attempt was superseded; skipping stale retro.');
    return;
  }
  const artifacts = await list(
    `/actions/runs/${args.runId}/artifacts`,
    'artifacts',
  );
  const selected = selectRetroArtifact(run, artifacts, repository);
  if (!selected) {
    console.log('No agent artifact for this run; skipping retro.');
    return;
  }
  writeFileSync(
    args.source,
    JSON.stringify({
      repository,
      runId: args.runId,
      runUrl: `https://github.com/${repository}/actions/runs/${args.runId}`,
      runAttempt: run.run_attempt,
      artifact: selected.artifact,
      issue: selected.issue,
      conclusion: run.conclusion ?? '',
    }),
  );
  output('artifact', selected.artifact.name);
  output('issue', String(selected.issue));
  output('ready', 'true');
}

async function ensureLedger() {
  try {
    await api('GET', `/labels/${encodeURIComponent(LEDGER_LABEL)}`);
  } catch {
    await api('POST', '/labels', {
      name: LEDGER_LABEL,
      color: '5319e7',
      description: 'Aggregated factory build retrospectives',
    });
  }
  const found = (
    await list(`/issues?labels=${encodeURIComponent(LEDGER_LABEL)}&state=all`)
  ).find((issue) => issue.title === LEDGER_TITLE && !issue.pull_request);
  if (found) return found;
  return api('POST', '/issues', {
    title: LEDGER_TITLE,
    labels: [LEDGER_LABEL],
    body: [
      '每次搭建任务结束后，流水线会把 Agent 的复盘摘要追加到这里。',
      '',
      '完整内容（问题与解法、基线优化建议）留在各自 Issue 的「搭建复盘」评论里，',
      '这里只做按时间累积的索引，方便定期把可机械化的修复合并进 NocoBase 3 基线',
      '（`factory-template.json` 的 compatibilityFixes、模板 overlay 脚本）和',
      '`skills/nocobase-app-development/`。',
    ].join('\n'),
  });
}

async function publish(args) {
  const source = JSON.parse(readFileSync(args.source, 'utf8'));
  if (source.repository !== repository || source.runId !== args.runId)
    throw new Error('Source mismatch');
  const attempt = source.runAttempt;
  const metadata = readJson(args.artifacts, 'task-metadata.json');
  const issue = metadata.issue?.number;
  if (
    metadata.repository !== repository ||
    !Number.isSafeInteger(issue) ||
    issue < 1 ||
    issue !== source.issue ||
    source.artifact.name !== `factory-agent-${issue}` ||
    !/^apps\/[a-z0-9][a-z0-9./_-]*$/.test(metadata.task?.targetBranch ?? '')
  )
    throw new Error('Task metadata mismatch');

  // A run that never reached verification has no repair summary, and a run
  // whose agent ignored the retro instruction has no retro file. Both are
  // reportable: the comment then says so instead of failing the workflow.
  let repair = null;
  try {
    repair = readJson(args.artifacts, 'repair-summary.json');
  } catch {
    /* no repair summary */
  }
  let raw = null;
  try {
    raw = readFileSync(path.join(args.artifacts, 'retro.json'), 'utf8');
  } catch {
    /* no retro file */
  }
  const { structured, data: retro, raw: fallback } = parseRetro(raw);
  const body = renderRetro({
    issue,
    runId: args.runId,
    attempt,
    runUrl: source.runUrl,
    targetBranch: metadata.task.targetBranch,
    conclusion: source.conclusion ?? '',
    retro,
    structured,
    raw: fallback,
    repair,
  });
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`);

  const { comment, unchanged } = await upsert(
    issue,
    MARKER(args.runId, attempt),
    body,
  );
  console.log(
    unchanged
      ? `Retro for run ${args.runId} is already reported.`
      : `Retro reported to Issue #${issue} for run ${args.runId}.`,
  );

  if (!retro.improvements.length && !retro.blockers.length) {
    console.log('Nothing to record in the ledger for this run.');
    return;
  }
  const ledger = await ensureLedger();
  const ledgerBody = renderLedger({
    issue,
    runId: args.runId,
    attempt,
    runUrl: source.runUrl,
    retro,
    commentUrl: comment?.id
      ? `https://github.com/${repository}/issues/${issue}#issuecomment-${comment.id}`
      : '',
  });
  const { unchanged: ledgerUnchanged } = await upsert(
    ledger.number,
    LEDGER_MARKER(args.runId, attempt),
    ledgerBody,
  );
  console.log(
    ledgerUnchanged
      ? `Ledger entry for run ${args.runId} is already recorded.`
      : `Ledger updated on Issue #${ledger.number}.`,
  );
}

function main() {
  const [mode, ...argv] = process.argv.slice(2);
  const args = Object.fromEntries(
    Array.from({ length: argv.length / 2 }, (_, i) => [
      argv[i * 2].replace(/^--/, ''),
      argv[i * 2 + 1],
    ]),
  );
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''))
    throw new Error('Invalid repository');
  args.runId = Number(args['run-id']);
  if (!Number.isSafeInteger(args.runId) || args.runId < 1)
    throw new Error('Invalid source run ID');
  if (mode === 'select') return select(args);
  if (mode === 'publish') return publish(args);
  throw new Error(
    'Usage: publish-retro.mjs <select|publish> --run-id N [--source F] [--artifacts D]',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(`Retro report failed: ${error.message}`);
    process.exitCode = 1;
  }
}
