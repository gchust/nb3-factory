import { acceptanceCriteria, identifyCheck } from './acceptance-criteria.mjs';
import { Buffer } from 'node:buffer';
import {
  closeSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const MAX_ATTACHMENT_BYTES = 9_500_000;
// A recording longer than the attachment budget is published as several parts, so the video
// budget is per part rather than per recording.
const LIMITS = { png: 40, webm: 8 };

// Artifact contents are data, never instructions or executable paths.
export function safeFile(root, relative, maxBytes = Infinity) {
  const base = realpathSync(root);
  const file = path.resolve(base, relative);
  const rel = path.relative(base, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
    throw new Error('Unsafe evidence path');
  let current = base;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink())
      throw new Error('Symlink evidence is not allowed');
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > maxBytes)
    throw new Error('Invalid evidence file size/type');
  return { file, size: stat.size };
}

export function readJson(root, relative) {
  return JSON.parse(
    readFileSync(safeFile(root, relative, 1_000_000).file, 'utf8'),
  );
}

// The recording health file is written next to showcase.json after a passing round. It is
// advisory: an older artifact has none, and its absence must not change anything.
export function loadMediaHealth(root, prefix) {
  try {
    const health = readJson(root, `${prefix}/media-health.json`);
    return health && typeof health === 'object' ? health : null;
  } catch {
    return null;
  }
}

// Whole-run recordings that exceeded the attachment budget were split into parts before the
// artifact was uploaded; this maps the recorded file to the parts that replace it.
export function loadMediaParts(root, prefix) {
  try {
    const parts = readJson(root, `${prefix}/media-parts.json`);
    return parts && typeof parts === 'object' ? parts : null;
  } catch {
    return null;
  }
}

export function text(value) {
  return String(value ?? '')
    .slice(0, 240)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]#!|])/g, '\\$1')
    .replace(/@/g, '@\u200b');
}

export function selectArtifact(run, jobs, artifacts, repository) {
  if (
    run.path !== '.github/workflows/code-agent-task.yml' ||
    run.head_repository?.full_name !== repository ||
    !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event)
  ) {
    throw new Error('Not a same-repository Code Agent task run');
  }
  if (
    run.status !== 'completed' ||
    !(
      jobs.some(
        (job) => job.name === 'publish-failed' && job.conclusion === 'success',
      ) ||
      // The jobs decide, not the run's conclusion: a question round's reply
      // failing after the delivery fails the run without undoing the delivery.
      ['verify-final', 'publish'].every((name) =>
        jobs.some((job) => job.name === name && job.conclusion === 'success'),
      )
    )
  ) {
    return null; // In particular, a successful five-hour handoff is not a delivery.
  }
  // The run's artifact list spans every attempt, and a re-run agent job uploads
  // a second factory-agent-N. Only the one this attempt's agent job uploaded
  // describes it; without that job's window nothing identifies it.
  const agent = jobs.find((job) => job.name === 'agent');
  const start = Date.parse(agent?.started_at);
  const end = Date.parse(agent?.completed_at);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const candidates = artifacts.filter(
    (a) =>
      /^factory-agent-[1-9]\d*$/.test(a.name) &&
      !a.expired &&
      Date.parse(a.created_at) >= start &&
      Date.parse(a.created_at) <= end,
  );
  if (candidates.length !== 1)
    throw new Error('Expected one unexpired task artifact');
  return candidates[0];
}

export function matchesTaskPR(pr, metadata, source) {
  const recordedHead = /<!-- agent-head-sha: ([a-f0-9]{40}) -->/.exec(
    pr.body ?? '',
  )?.[1];
  return (
    (!recordedHead || recordedHead === pr.head?.sha) &&
    pr.head?.repo?.full_name === source.repository &&
    pr.head.ref === metadata.workBranch &&
    pr.base?.ref === metadata.task.targetBranch &&
    pr.body?.includes(`<!-- agent-issue: ${metadata.issue.number} -->`) &&
    pr.body.includes(`- [GitHub Actions 运行记录](${source.runUrl})`)
  );
}

export function collectMedia(root, output, { failed = false } = {}) {
  let summary = {};
  try {
    summary = readJson(root, 'repair-summary.json');
  } catch (error) {
    if (!failed) throw error;
  }
  let attempt =
    summary.finalVerificationAttempt ?? summary.verificationAttempts;
  let prefix = `verify-${attempt}/browser-acceptance`;
  let report;
  if (failed) {
    const rounds = readdirSync(root)
      .filter((name) => /^verify-[1-9]\d*$/.test(name))
      .sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)));
    for (const round of rounds) {
      for (const kind of ['browser-acceptance', 'browser-focused']) {
        try {
          const candidate = readJson(root, `${round}/${kind}/report.json`);
          if (!Array.isArray(candidate.checks)) continue;
          report = candidate;
          prefix = `${round}/${kind}`;
          attempt = Number(round.slice(7));
          break;
        } catch {
          /* A failed task may have no browser report yet. */
        }
      }
      if (report) break;
    }
    if (!report) {
      mkdirSync(output, { recursive: true });
      return {
        attempt: null,
        media: [],
        warnings: [
          '搭建失败，尚无可用浏览器验收记录；请查看搭建报告和运行日志。',
        ],
      };
    }
  }
  if (
    (!failed && summary.handoff) ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1
  )
    throw new Error('No completed verification round');
  report ??= readJson(root, `${prefix}/report.json`);
  if (
    !failed &&
    (report.passed !== true ||
      report.authenticated !== true ||
      !Array.isArray(report.checks) ||
      !report.checks.length ||
      report.checks.some((c) => {
        if (c.status === 'passed') return false;
        if (c.status !== 'not_run' || !c.reason?.trim()) return true;
        try {
          const metadata = readJson(root, 'task-metadata.json');
          return !identifyCheck(c, acceptanceCriteria(metadata.task)).optional;
        } catch {
          return true;
        }
      }) ||
      !Array.isArray(report.failures) ||
      report.failures.length)
  )
    throw new Error('Final browser report has not passed');

  const warnings = failed
    ? ['搭建状态为 failed；这里只展示最近保存的验收证据，不表示完整验收通过。']
    : [];
  let showcase = {};
  try {
    showcase = readJson(root, `${prefix}/showcase.json`);
  } catch {
    warnings.push(
      '没有独立界面清单；下面仅列出已保存的验收截图，不代表覆盖全部界面。',
    );
  }
  showcase = showcase && typeof showcase === 'object' ? showcase : {};
  const health = loadMediaHealth(root, prefix);
  const healthByFile = new Map(
    (Array.isArray(health?.videos) ? health.videos : [])
      .filter((video) => typeof video?.file === 'string')
      .map((video) => [video.file, video]),
  );
  if (health?.checked === false)
    warnings.push(
      '本轮录像未做内容体检（运行环境缺少 ffmpeg），只校验了文件本身。',
    );
  const pages = Array.isArray(showcase.pages)
    ? showcase.pages.slice(0, 200)
    : [];
  const videos = Array.isArray(showcase.videos)
    ? showcase.videos.slice(0, 20)
    : [];
  const parts = loadMediaParts(root, prefix);
  const partsByFile = new Map(
    (Array.isArray(parts?.splits) ? parts.splits : [])
      .filter(
        (split) =>
          typeof split?.file === 'string' &&
          Array.isArray(split.parts) &&
          split.parts.length >= 2,
      )
      .map((split) => [split.file, split]),
  );
  for (const video of videos) {
    const split = partsByFile.get(video?.file);
    if (split)
      warnings.push(
        `${video.file} 超过评论附件上限，已拆分为 ${split.parts.length} 段发布；完整原始录像见媒体包。`,
      );
  }
  const candidates = [
    ...pages.map((p) => ({
      title: p?.title,
      name: p?.screenshot,
      kind: 'png',
    })),
    ...report.checks
      .slice(0, 200)
      .flatMap((c) =>
        (Array.isArray(c.screenshots) ? c.screenshots : [])
          .slice(0, 100)
          .map((name) => ({ title: c.criterion, name, kind: 'png' })),
      ),
    ...videos.flatMap((v) => {
      const split = partsByFile.get(v?.file);
      if (!split) return [{ title: v?.title, name: v?.file, kind: 'webm' }];
      const label = v?.title || v?.file;
      return split.parts.map((name, index) => ({
        title: `${label}（第 ${index + 1}/${split.parts.length} 段）`,
        name,
        kind: 'webm',
      }));
    }),
  ];
  const media = [];
  const seen = new Set();
  const counts = { png: 0, webm: 0 };
  let total = 0;
  mkdirSync(output, { recursive: true });
  for (const candidate of candidates.slice(0, 500)) {
    const { name, kind } = candidate;
    if (seen.has(name)) continue;
    seen.add(name);
    if (
      typeof name !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\.(png|webm)$/.test(name) ||
      !name.endsWith(`.${kind}`)
    ) {
      warnings.push('已跳过不安全的媒体文件名。');
      continue;
    }
    try {
      const { file, size } = safeFile(root, `${prefix}/evidence/${name}`);
      const signature = Buffer.alloc(8);
      const fd = openSync(file, 'r');
      try {
        readSync(fd, signature, 0, 8, 0);
      } finally {
        closeSync(fd);
      }
      const magic = Buffer.from(
        kind === 'png' ? '89504e470d0a1a0a' : '1a45dfa3',
        'hex',
      );
      if (size < 1_000 || !signature.subarray(0, magic.length).equals(magic))
        throw new Error('Invalid media signature');
      if (
        size > MAX_ATTACHMENT_BYTES ||
        counts[kind] >= LIMITS[kind] ||
        total + size > 100_000_000
      ) {
        warnings.push(
          `${name} 超过评论附件的大小或数量预算，请从原始 Artifact 查看。`,
        );
        continue;
      }
      copyFileSync(file, path.join(output, name));
      const verdict = kind === 'webm' ? healthByFile.get(name) : null;
      const unhealthy = verdict && verdict.ok === false;
      if (unhealthy)
        warnings.push(
          `${name} 可能没有可辨识的操作：${text(verdict.reason)}。原始录像已保留。`,
        );
      media.push({
        name,
        title: text(candidate.title || name),
        kind,
        note: unhealthy ? `录像体检：${text(verdict.reason)}` : '',
      });
      counts[kind]++;
      total += size;
    } catch {
      warnings.push(`${name} 缺失或不是安全有效的媒体文件，未发布。`);
    }
  }
  if (!counts.webm)
    warnings.push('本轮没有可内嵌的操作录像；录像缺失不改变业务验收结果。');
  if (Array.isArray(showcase.uncovered)) {
    warnings.push(
      ...showcase.uncovered.slice(0, 20).map((p) => `未覆盖界面：${text(p)}`),
    );
  }
  return { attempt, media, warnings: warnings.slice(0, 30) };
}

export function renderReport(plan, inline = false, reason = '') {
  const images = plan.media.filter((m) => m.kind === 'png');
  const videos = plan.media.filter((m) => m.kind === 'webm');
  const lines = [
    `<!-- factory-visual-report:${plan.runId}:${plan.runAttempt} -->`,
    `<!-- factory-visual-mode:${inline ? 'inline' : 'artifact'} -->`,
    '## 搭建效果与操作录像',
    '',
    `搭建状态：${plan.deliveryStatus === 'failed' ? '**failed**（未通过完整交付验收）' : 'success'}`,
    `对应实现提交：${plan.headSha ? `\`${plan.headSha}\`` : '旧运行未记录提交，以源 Artifact 为准'} · 保存的浏览器验收轮次：${plan.attempt ?? '尚未运行'}`,
    `[搭建运行](${plan.runUrl}) · [完整验收 Artifact](${plan.sourceArtifactUrl})`,
    '',
    '以下是一次性测试数据上的浏览器实拍，不是生成的效果图。',
    '',
    `### 界面截图（${images.length}）`,
    '',
  ];
  for (const image of images)
    lines.push(
      `**${image.title}**`,
      '',
      inline
        ? `![${image.title}](./${image.name})`
        : `\`${image.name}\`（见媒体包）`,
      '',
    );
  lines.push(`### 操作录像（${videos.length}）`, '');
  for (const video of videos) {
    lines.push(
      `**${video.title}**`,
      '',
      inline ? `./${video.name}` : `\`${video.name}\`（见媒体包）`,
      '',
    );
    if (video.note) lines.push(`> ${video.note}`, '');
  }
  if (plan.mediaArtifactUrl)
    lines.push(`[下载截图与录像媒体包](${plan.mediaArtifactUrl})`, '');
  if (reason || plan.warnings.length)
    lines.push(
      '### 媒体说明',
      '',
      ...[reason, ...plan.warnings].filter(Boolean).map((note) => `- ${note}`),
      '',
    );
  lines.push('媒体展示不替代验收；Artifact 受仓库访问权限和保留期限限制。');
  return lines.join('\n');
}

export function writeMediaPlan(output, plan) {
  writeFileSync(path.join(output, 'report.md'), renderReport(plan, true));
  writeFileSync(
    path.join(output, 'publication.json'),
    JSON.stringify(plan, null, 2),
  );
}
