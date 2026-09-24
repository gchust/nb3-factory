import { readResult } from './agent-result.mjs';
import { collectAgentMetrics, metricsReceipt, readMetricsReceipts, renderAgentMetrics } from './agent-metrics.mjs';
import { scrubHistoryFile } from './history-redaction.mjs';
import { createHash } from 'node:crypto';
import { selectHistorySource } from './agent-history-source.mjs';
import { waitForTaskRun } from './wait-for-task-run.mjs';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The workflow artifacts expire after 14 days, so a task's agent interaction history is packed
// and published next to the Issue that produced it. Every file is re-scrubbed before it leaves
// the runner: the transcripts are redacted by the runner, but the console logs are not, and the
// repository is public.

export const HISTORY_RELEASE_TAG = 'factory-history';
export const MARKER = (runId, attempt) =>
  `<!-- factory-agent-history:${runId}:${attempt} -->`;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_DEPTH = 4;
const ARCHIVE_TIMEOUT_MS = 300_000;

// Every accepted artifact file, with the phase it belongs to. Anything not listed is left
// behind: the archive is a record of what the agents did, not a copy of the artifact.
const FILE_RULES = [
  { phase: 'reply', pattern: /^comment-agent\.jsonl(?:\.result\.json|\.prompt\.md|\.invocation\.json)?$/u },
  { phase: 'reply', pattern: /^comment-reply\.md$/u },
  { phase: 'verification', pattern: /^timings\.jsonl$/u },
  { phase: 'implementation', pattern: /^agent-implement\.jsonl(?:\.result\.json|\.prompt\.md|\.invocation\.json)?$/u },
  { phase: 'repair', pattern: /^agent-repair-[1-9]\d*\.jsonl(?:\.result\.json|\.prompt\.md|\.invocation\.json)?$/u },
  {
    phase: 'qa',
    pattern:
      /^verify-[1-9]\d*\/browser-(?:acceptance|focused)\/agent-browser-(?:acceptance|report-repair-[1-9]\d*)\.jsonl(?:\.result\.json|\.prompt\.md|\.invocation\.json)?$/u,
  },
  {
    phase: 'qa',
    pattern:
      /^verify-[1-9]\d*\/browser-acceptance\/(?:report|showcase|media-health|media-parts)\.json$/u,
  },
  { phase: 'verification', pattern: /^verify-[1-9]\d*\.log$/u },
  { phase: 'verification', pattern: /^verify-final\.log$/u },
  { phase: 'summary', pattern: /^change-summary\.json$/u },
  { phase: 'summary', pattern: /^repair-summary\.json$/u },
  { phase: 'summary', pattern: /^handoff\.json$/u },
  { phase: 'summary', pattern: /^(?:task-metadata|baseline)\.json$/u },
  { phase: 'summary', pattern: /^agent\.patch$/u },
];

const PHASE_LABELS = {
  reply: '评论问答',
  implementation: '初始实现',
  repair: '应用修复',
  qa: '浏览器验收',
  verification: '验证日志',
  summary: '变更摘要',
};

const STATUS_LABELS = {
  delivered: '已生成/更新业务 PR',
  handoff: '已保存 Handoff，等待下一轮续跑',
  failure: '失败',
  cancelled: '已取消',
  timed_out: '超时',
  success: '运行完成（未确认业务交付）',
};

// The runner redacts the secrets it knows; a log that reached the artifact before that, or a
// pattern it could not know, is caught here.
export { scrubSecrets } from './history-redaction.mjs';

function phaseOf(relative) {
  relative = relative.replace(/^(?:task|agent|final|reply)\//u, '');
  return FILE_RULES.find((rule) => rule.pattern.test(relative))?.phase ?? null;
}

export function selectHistoryFiles(root, skipped = []) {
  const files = [];
  function visit(relative = '', depth = 0) {
    const directory = path.join(root, relative);
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) visit(name, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const phase = phaseOf(name);
      if (!phase) continue;
      const bytes = statSync(path.join(root, name)).size;
      if (bytes > MAX_FILE_BYTES) { skipped.push({ name, reason: 'file_too_large' }); continue; }
      files.push({ name, phase, bytes });
    }
  }
  visit();
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

// Rewrites the selected files into a staging directory with the secrets scrubbed, then packs
// that directory. Returns null when there is nothing worth publishing.
export function packHistory({ artifacts, output, issue, runId, attempt, source, downloads = {} }) {
  const skipped = [];
  const selected = selectHistoryFiles(artifacts, skipped);
  if (!selected.length) return null;
  const staging = path.join(output, 'staging');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const files = [];
  for (const file of selected) {
    const target = path.join(staging, file.name);
    mkdirSync(path.dirname(target), { recursive: true });
    let contents;
    try {
      contents = readFileSync(path.join(artifacts, file.name), 'utf8');
    } catch {
      skipped.push({ name: file.name, reason: 'unreadable' });
      continue;
    }
    const scrubbed = scrubHistoryFile(contents, file.name);
    writeFileSync(target, scrubbed);
    files.push({
      name: file.name,
      phase: file.phase,
      bytes: Buffer.byteLength(scrubbed),
      sha256: createHash('sha256').update(scrubbed).digest('hex'),
    });
  }
  if (!files.length) return null;
  const manifest = {
    source,
    issue,
    runId,
    attempt,
    packedAt: new Date().toISOString(),
    redaction: 'Secrets known to the factory were replaced with [REDACTED].',
    files,
    completeness: inspectHistory(staging, files, source, downloads, skipped),
  };
  if (source) {
    manifest.metrics = collectAgentMetrics(staging, manifest);
    writeFileSync(path.join(staging, 'metrics.json'), `${JSON.stringify(manifest.metrics, null, 2)}\n`);
  }
  writeFileSync(
    path.join(staging, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  // New archives are content-addressed: an incomplete replay cannot overwrite
  // an earlier complete copy when some Actions artifacts have expired.
  const suffix = source ? `-${createHash('sha256').update(JSON.stringify({ files, completeness: manifest.completeness, metrics: manifest.metrics })).digest('hex').slice(0, 16)}` : '';
  const archive = path.join(
    output,
    `agent-history-issue-${issue}-run-${runId}-attempt-${attempt}${suffix}.tar.gz`,
  );
  const packed = spawnSync('tar', ['-czf', archive, '-C', staging, '.'], {
    encoding: 'utf8',
    timeout: ARCHIVE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (packed.error || packed.status !== 0)
    throw new Error(
      `tar failed: ${packed.error?.message ?? packed.stderr?.slice(0, 200)}`,
    );
  rmSync(staging, { recursive: true, force: true });
  return {
    archive,
    asset: path.basename(archive),
    bytes: statSync(archive).size,
    manifest,
  };
}

export function inspectHistory(root, files, source, downloads = {}, skipped = []) {
  const names = new Set(files.filter(f => f.bytes > 0).map(f => f.name));
  const problems = [...skipped];
  for (const artifact of source?.artifacts ?? []) {
    if (artifact.invocationExpected && !files.some(f => f.name.startsWith(`${artifact.role}/`) && f.name.includes('.jsonl.invocation.json'))) {
      problems.push({ name: artifact.role, reason: 'expected_invocation_not_captured' });
    }
    if (artifact.state !== 'available') problems.push({ name: artifact.role, reason: artifact.state });
    else if (downloads[artifact.role] !== 'success' && downloads[artifact.role] !== undefined) {
      problems.push({ name: artifact.role, reason: 'download_failed' });
    } else if (!files.some(f => f.name.startsWith(`${artifact.role}/`))) {
      problems.push({ name: artifact.role, reason: 'no_selected_files' });
    }
  }
  const logs = new Set(files.filter(f => /(?:agent-.*|comment-agent)\.jsonl(?:\.(?:invocation|result)\.json|\.prompt\.md)?$/.test(f.name))
    .map(f => f.name.replace(/\.(?:invocation|result)\.json$|\.prompt\.md$/, '')));
  const invocations = [];
  for (const log of logs) {
    let invocation;
    try { invocation = JSON.parse(readFileSync(path.join(root, `${log}.invocation.json`), 'utf8')); }
    catch { /* Legacy transcripts remain readable but are not complete captures. */ }
    const expected = [`${log}.invocation.json`, `${log}.prompt.md`];
    if (invocation?.invoked !== false) expected.push(log, `${log}.result.json`);
    const missing = expected.filter(name => !names.has(name));
    if (invocation?.version !== 1) problems.push({ name: log, reason: 'legacy_or_invalid_invocation' });
    if (invocation?.status === 'running' || invocation?.status === 'preparing') {
      problems.push({ name: log, reason: 'interrupted_capture' });
    }
    for (const name of missing) problems.push({ name, reason: 'missing' });
    if (invocation?.invoked === true && names.has(`${log}.result.json`)) {
      try { readResult(path.join(root, log)); }
      catch { problems.push({ name: `${log}.result.json`, reason: 'invalid_result' }); }
    }
    invocations.push({ id: invocation?.id ?? null, log, invoked: invocation?.invoked ?? null, missing });
  }
  return { status: problems.length ? 'partial' : invocations.length ? 'captured' : 'unknown',
    scope: 'Factory-visible inputs and CLI output only; not unreported internal context or subagents.',
    invocations, problems };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderHistory({
  issue,
  runId,
  attempt,
  status,
  bytes,
  manifest,
  assetUrl,
  fallbackUrl,
}) {
  const link = assetUrl
    ? `[agent-history-issue-${issue}-run-${runId}-attempt-${attempt}.tar.gz](${assetUrl})（${formatBytes(bytes)}，${manifest.files.length} 个文件）`
    : `记录未能上传（见 [本次运行](${fallbackUrl})），请在 Artifact 中查看`;
  const lines = [
    MARKER(runId, attempt),
    '## Agent 交互历史',
    '',
    `本轮运行：\`run ${runId}\` · attempt ${attempt}${status ? ` · ${STATUS_LABELS[status] ?? status}` : ''}`,
    '',
    `本轮已归档交互记录（凭据已替换为 \`[REDACTED]\`）：${link}`,
    '',
    `留存检查：${{ captured: '本轮可观察调用文件齐全', partial: '部分缺失', unknown: '未发现调用记录，无法确认' }[manifest.completeness?.status] ?? '旧记录，未核对完整性'}。不包含 CLI 未暴露的内部上下文。`,
    '',
    ...((manifest.completeness?.problems ?? []).slice(0, 100).map(p => `- ${p.name}: ${p.reason}`)),
    '',
    '| 阶段 | 文件 | 大小（未压缩） |',
    '| --- | --- | ---: |',
  ];
  for (const file of manifest.files.slice(0, 200))
    lines.push(
      `| ${PHASE_LABELS[file.phase] ?? file.phase} | \`${file.name}\` | ${formatBytes(file.bytes)} |`,
    );
  if (manifest.files.length > 200) lines.push('文件较多，此处仅列前 200 项；完整清单见归档 manifest.json。');
  lines.push(
    '',
    '原始未压缩记录保留在本次运行的 Actions Artifact 中（14 天），这里保存的是压缩副本。',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  return Object.fromEntries(
    Array.from({ length: argv.length / 2 }, (_, index) => [
      argv[index * 2].replace(/^--/, ''),
      argv[index * 2 + 1],
    ]),
  );
}

async function api(method, route, body) {
  const repository = process.env.GITHUB_REPOSITORY;
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
}

async function list(route, key) {
  const items = [];
  for (let page = 1; page <= 30; page++) {
    const response = await api(
      'GET',
      `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    const batch = key ? response[key] : response;
    if (!Array.isArray(batch)) throw new Error('Invalid list response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error('GitHub pagination limit reached');
}

async function select(args) {
  const repository = process.env.GITHUB_REPOSITORY;
  const repo = await api('GET', '');
  const run = await waitForTaskRun(api, { runId: Number(args.run), attempt: args.attempt,
    repository, defaultBranch: repo.default_branch });
  const jobs = await list(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
  const artifacts = await list(`/actions/runs/${run.id}/artifacts`, 'artifacts');
  const source = selectHistorySource(run, jobs, artifacts, repository);
  if (!source) return;
  const issue = await api('GET', `/issues/${source.issue}`);
  if (issue.pull_request) throw new Error('History must belong to an Issue');
  mkdirSync(path.dirname(path.resolve(args.source)), { recursive: true });
  writeFileSync(args.source, JSON.stringify(source));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `ready=true\nissue=${source.issue}\nrun=${source.runId}\nattempt=${source.attempt}\nstatus=${source.status ?? ''}\n` +
    source.artifacts.filter(a => a.state === 'available').map(a => `${a.role}=${a.id}\n`).join(''));
}

async function publish(args) {
  const source = args.source ? JSON.parse(readFileSync(args.source, 'utf8')) : undefined;
  let packed;
  try { packed = JSON.parse(readFileSync(path.resolve(args.manifest), 'utf8')); }
  catch (error) { if (!source) throw error; }
  const issue = Number(args.issue);
  const runId = Number(args.run);
  const attempt = Number(args.attempt);
  if (![issue, runId, attempt].every(n => Number.isSafeInteger(n) && n > 0) ||
      (source && (source.issue !== issue || source.runId !== runId || source.attempt !== attempt || source.repository !== process.env.GITHUB_REPOSITORY))) {
    throw new Error('History source identity mismatch');
  }
  const manifest = packed?.manifest ?? { files: [], completeness: { status: 'partial',
    problems: [{ name: 'archive', reason: 'missing_or_pack_failed' }] } };
  let body = renderHistory({ issue, runId, attempt, status: args.status ?? source?.status ?? '',
    bytes: packed?.bytes, manifest, assetUrl: args['asset-url'] ?? '',
    fallbackUrl: args['fallback-url'] ?? '' }) + metricsReceipt(manifest.metrics);
  const comments = await list(`/issues/${issue}/comments`);
  const marker = MARKER(runId, attempt);
  const existing = comments.find(c => c.user?.login === 'github-actions[bot]' && c.body?.includes(marker));
  // Keep the previously published link and facts on an unsuccessful replay.
  if (existing?.body?.includes('/releases/download/factory-history/') &&
      (!args['asset-url'] || (manifest.completeness?.status === 'partial' &&
        existing.body.includes('本轮可观察调用文件齐全')))) {
    body = existing.body.split('\n<!-- factory-history-replay -->')[0] +
      '\n<!-- factory-history-replay -->\n最近补发未得到更完整的记录；保留上次已发布归档。请查看本次历史发布工作流。';
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`);
  if (existing?.body === body) {
    console.log(`Agent history for run ${runId} is already reported.`);
  } else {
    const saved = await api(existing ? 'PATCH' : 'POST',
      existing ? `/issues/comments/${existing.id}` : `/issues/${issue}/comments`, { body });
    if (existing) Object.assign(existing, saved, { body });
    else comments.push({ ...saved, body, user: { login: 'github-actions[bot]' } });
    console.log(`Agent history reported to Issue #${issue} for run ${runId}.`);
  }
  // Legacy callers retain their single-comment contract. New source-bound runs
  // additionally maintain one deterministic index; the workflow is serialized.
  if (source) {
    const indexMarker = '<!-- factory-agent-history-index -->';
    const entries = comments.filter(c => c.user?.login === 'github-actions[bot]')
      .map(c => ({ comment: c, match: /^<!-- factory-agent-history:(\d+):(\d+) -->/.exec(c.body || '') }))
      .filter(e => e.match).sort((a, b) => Number(b.match[1]) - Number(a.match[1]) || Number(b.match[2]) - Number(a.match[2]));
    const commentUrl = c => c.html_url || `https://github.com/${process.env.GITHUB_REPOSITORY}/issues/${issue}#issuecomment-${c.id}`;
    const related = (kind, run, attempt, label) => {
      const c = comments.find(c => c.user?.login === 'github-actions[bot]' && c.body?.includes(`<!-- factory-${kind}:${run}:${attempt} -->`));
      return c ? ` · [${label}](${commentUrl(c)})` : '';
    };
    const indexBody = `${indexMarker}\n## 本任务交互历史索引\n\n` + entries.slice(0, 100).map(({ comment: c, match }) =>
      `- [Run ${match[1]} · attempt ${match[2]}](${commentUrl(c)})${related('task-usage', match[1], match[2], '报告')}${related('visual-report', match[1], match[2], '截图与录像')}`).join('\n') +
      '\n\n各轮归档、缺失说明见对应记录；仅索引已发布的报告和媒体评论，稍后发布的内容仍可在本 Issue 查看。' +
      (entries.length > 100 ? `\n仅列最近 100 轮，共 ${entries.length} 轮；更早记录仍在本 Issue。` : '') +
      renderAgentMetrics(readMetricsReceipts(comments, source.repository, issue));
    const index = comments.find(c => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(indexMarker));
    if (index?.body !== indexBody) await api(index ? 'PATCH' : 'POST',
      index ? `/issues/comments/${index.id}` : `/issues/${issue}/comments`, { body: indexBody });
  }
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (mode === 'pack') {
    const packed = packHistory({
      artifacts: path.resolve(args.artifacts),
      output: path.resolve(args.output),
      issue: Number(args.issue),
      runId: Number(args.run),
      attempt: Number(args.attempt),
      source: args.source ? JSON.parse(readFileSync(args.source, 'utf8')) : undefined,
      downloads: args.downloads ? JSON.parse(args.downloads) : {},
    });
    if (args.manifest) {
      mkdirSync(path.dirname(path.resolve(args.manifest)), { recursive: true });
      writeFileSync(
        path.resolve(args.manifest),
        `${JSON.stringify(packed, null, 2)}\n`,
      );
    }
    if (process.env.GITHUB_OUTPUT && packed)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `archive=${packed.archive}\nasset=${packed.asset}\nbytes=${packed.bytes}\n`,
      );
    console.log(
      packed
        ? `Packed ${packed.manifest.files.length} file(s) into ${packed.asset}.`
        : 'No agent history to publish for this run.',
    );
    return;
  }
  if (mode === 'publish' || mode === 'select') {
    (mode === 'select' ? select(args) : publish(args)).catch((error) => {
      console.error(`Agent history report failed: ${error.message}`);
      process.exitCode = 1;
    });
    return;
  }
  throw new Error('Usage: agent-history.mjs <pack|publish> ...');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`Agent history failed: ${error.message}`);
    process.exitCode = 1;
  }
}
