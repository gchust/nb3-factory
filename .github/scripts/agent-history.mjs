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
const MAX_DEPTH = 3;
const ARCHIVE_TIMEOUT_MS = 300_000;

// Every accepted artifact file, with the phase it belongs to. Anything not listed is left
// behind: the archive is a record of what the agents did, not a copy of the artifact.
const FILE_RULES = [
  { phase: 'implementation', pattern: /^agent-implement\.jsonl$/u },
  { phase: 'repair', pattern: /^agent-repair-[1-9]\d*\.jsonl$/u },
  {
    phase: 'qa',
    pattern:
      /^verify-[1-9]\d*\/browser-acceptance\/agent-browser-(?:acceptance|report-repair-[1-9]\d*)\.jsonl$/u,
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
  { phase: 'summary', pattern: /^task-metadata\.json$/u },
  { phase: 'summary', pattern: /^agent\.patch$/u },
];

const PHASE_LABELS = {
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
export function scrubSecrets(text) {
  return String(text)
    .replaceAll(/Factory-QA-[A-Za-z0-9-]+/gu, '[REDACTED]')
    .replaceAll(
      /((?:[A-Z0-9_]+)?(?:PASSWORD|TOKEN|SECRET|API_KEY|APIKEY))\s*[=:]\s*["']?[^\s"',}]{4,}/giu,
      '$1=[REDACTED]',
    );
}

function phaseOf(relative) {
  return FILE_RULES.find((rule) => rule.pattern.test(relative))?.phase ?? null;
}

export function selectHistoryFiles(root) {
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
      if (bytes > MAX_FILE_BYTES) continue;
      files.push({ name, phase, bytes });
    }
  }
  visit();
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

// Rewrites the selected files into a staging directory with the secrets scrubbed, then packs
// that directory. Returns null when there is nothing worth publishing.
export function packHistory({ artifacts, output, issue, runId, attempt }) {
  const selected = selectHistoryFiles(artifacts);
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
      continue;
    }
    const scrubbed = scrubSecrets(contents);
    writeFileSync(target, scrubbed);
    files.push({
      name: file.name,
      phase: file.phase,
      bytes: Buffer.byteLength(scrubbed),
    });
  }
  if (!files.length) return null;
  const manifest = {
    issue,
    runId,
    attempt,
    packedAt: new Date().toISOString(),
    redaction: 'Secrets known to the factory were replaced with [REDACTED].',
    files,
  };
  writeFileSync(
    path.join(staging, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const archive = path.join(
    output,
    `agent-history-issue-${issue}-run-${runId}-attempt-${attempt}.tar.gz`,
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
    `完整记录（凭据已替换为 \`[REDACTED]\`）：${link}`,
    '',
    '| 阶段 | 文件 | 大小（未压缩） |',
    '| --- | --- | ---: |',
  ];
  for (const file of manifest.files)
    lines.push(
      `| ${PHASE_LABELS[file.phase] ?? file.phase} | \`${file.name}\` | ${formatBytes(file.bytes)} |`,
    );
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

async function list(route) {
  const items = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await api(
      'GET',
      `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) throw new Error('Invalid list response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error('GitHub pagination limit reached');
}

async function publish(args) {
  const packed = JSON.parse(readFileSync(path.resolve(args.manifest), 'utf8'));
  if (!packed) {
    console.log('No agent history to publish for this run.');
    return;
  }
  const issue = Number(args.issue);
  const runId = Number(args.run);
  const attempt = Number(args.attempt);
  const body = renderHistory({
    issue,
    runId,
    attempt,
    status: args.status ?? '',
    bytes: packed.bytes,
    manifest: packed.manifest,
    assetUrl: args['asset-url'] ?? '',
    fallbackUrl: args['fallback-url'] ?? '',
  });
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`);
  const marker = MARKER(runId, attempt);
  const existing = (await list(`/issues/${issue}/comments`)).find(
    (comment) =>
      comment.user?.login === 'github-actions[bot]' &&
      comment.body?.includes(marker),
  );
  if (existing?.body === body) {
    console.log(`Agent history for run ${runId} is already reported.`);
    return;
  }
  await api(
    existing ? 'PATCH' : 'POST',
    existing ? `/issues/comments/${existing.id}` : `/issues/${issue}/comments`,
    { body },
  );
  console.log(`Agent history reported to Issue #${issue} for run ${runId}.`);
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
    });
    if (args.manifest)
      writeFileSync(
        path.resolve(args.manifest),
        `${JSON.stringify(packed, null, 2)}\n`,
      );
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
  if (mode === 'publish') {
    publish(args).catch((error) => {
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
