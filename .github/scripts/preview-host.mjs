import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Kept identical to the base path `verify.sh` uses. A preview serving a
// different base path would not be the thing that was verified.
export const PREVIEW_BASE_PATH = '/main';
export const PREVIEW_THEME = 'nfvd.net';

export const PREVIEW_COMMENT_PREFIX = '<!-- factory-preview:';

const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const DEPS_KEY_PATTERN = /^[a-f0-9]{64}$/;

export function isDepsKey(value) {
  return typeof value === 'string' && DEPS_KEY_PATTERN.test(value);
}

export function requireDepsKey(value) {
  if (!isDepsKey(value)) throw new Error('Invalid dependency key');
  return value;
}

export function requireDomain(value) {
  if (typeof value !== 'string' || !DOMAIN_PATTERN.test(value))
    throw new Error('Invalid preview domain');
  return value;
}

/**
 * Identity of a dependency set, as the set of files it actually contains.
 *
 * This is derived from the tree rather than from `dist/package.json`. Declared
 * versions alone are not enough: two builds can declare the same dependencies
 * and still produce different trees, because the build also decides what to
 * install and what to prune. A build-recipe change — the one that stopped
 * shipping TypeScript migration sources is a live example — leaves the versions
 * untouched while removing files, and keying on versions would hand the next
 * deploy the previous tree. That failure is silent and only shows up as the
 * application behaving like an older build.
 *
 * Paths and sizes rather than contents: the tree is ~30k files and 740 MB, and
 * hashing contents on every deploy costs far more than it can save. Sizes are
 * deterministic for a given install and change whenever pruning does, which is
 * the variation that matters here. Modification times are deliberately not
 * used — they differ between builds of an identical tree and would defeat the
 * cache entirely.
 *
 * Directories are recorded too, and not only for completeness. An empty
 * directory is not nothing to this application: it resolves a plugin's
 * migrations by taking the first candidate path that *exists*, so a
 * `database/migrations` left behind with no files in it reports zero migrations
 * rather than falling through to the compiled directory beside it. Two builds
 * that differ only in which directories exist produce different trees, and this
 * has to say so.
 */
export function depsKeyFromEntries(entries) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort()) {
    hash.update(entry);
    hash.update('\n');
  }
  return hash.digest('hex');
}

/** Reads a materialized `node_modules` into the entries `depsKeyFromEntries` hashes. */
export function readDepsEntries(nodeModulesDir) {
  const entries = [];

  const walk = (directory, prefix) => {
    let children;
    try {
      children = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) {
        entries.push(`${relativePath}\u0000dir`);
        walk(childPath, relativePath);
        continue;
      }
      if (child.isSymbolicLink()) {
        // Recorded rather than followed: following could revisit a package or
        // loop, and a link is part of what the tree is.
        entries.push(`${relativePath}\u0000link`);
        continue;
      }
      if (!child.isFile()) continue;
      try {
        entries.push(`${relativePath}\u0000${statSync(childPath).size}`);
      } catch {
        // A file that vanished mid-walk cannot be part of the identity.
      }
    }
  };

  walk(nodeModulesDir, '');
  return entries;
}

export function containerName(pr) {
  return `preview-pr-${pr}`;
}

export function routerName(pr) {
  return `pr${pr}`;
}

export function previewHost(pr, domain) {
  return `nb3-${pr}.${requireDomain(domain)}`;
}

export function previewUrl(pr, domain) {
  return `https://${previewHost(pr, domain)}${PREVIEW_BASE_PATH}/`;
}

export function depsDir(key, root = '/srv/nb3-preview') {
  return `${root}/deps/${requireDepsKey(key)}`;
}

/**
 * Remote probe deciding whether CI must ship the dependency tree.
 *
 * The dependency tree is roughly 740 MB of a 744 MB `dist/`, and it changes
 * only when the tree itself changes. Asking the host what it already holds is
 * what keeps an ordinary redeploy down to a few megabytes, and it works over
 * the SSH channel the deploy already uses, so the push model is preserved.
 *
 * Only the exact answer counts as a hit; the caller compares it literally, so
 * anything else — a partial line, an empty result from a failed connection —
 * is read as a miss and the full payload is sent.
 */
export function depsProbeCommand(key, root = '/srv/nb3-preview') {
  const dir = depsDir(key, root);
  return `test -d ${dir}/node_modules && echo present || echo absent`;
}

/**
 * What the slim payload carries: everything the build produced except the
 * dependency tree.
 *
 * Derived from the build's own contents rather than a hand-written list. A
 * fixed list is a list that falls behind what the build emits, and this one
 * already did: it omitted `dist/cli`, which produced a preview that came up far
 * enough to attempt a migration and then failed to find the migrator.
 */
export function slimEntries(rootEntries, distEntries) {
  const entries = rootEntries.filter((name) => name !== 'dist');
  for (const name of distEntries) {
    if (name === 'node_modules') continue;
    entries.push(`dist/${name}`);
  }
  return entries.sort();
}

/**
 * Selects the deployable build for a delivered task.
 *
 * Same run gate as the visual report: both `verify-final` and `publish` must
 * have succeeded, so a five-hour handoff — which has neither — is not a
 * delivery. The artifact differs: the deployable build is produced by
 * `verify-final`, not by the agent.
 */
export function selectDistArtifact(run, jobs, artifacts, repository) {
  if (
    run.path !== '.github/workflows/code-agent-task.yml' ||
    run.head_repository?.full_name !== repository ||
    !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event)
  ) {
    throw new Error('Not a same-repository Code Agent task run');
  }
  if (
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !['verify-final', 'publish'].every((name) =>
      jobs.some((job) => job.name === name && job.conclusion === 'success'),
    )
  ) {
    return null;
  }
  const candidates = artifacts.filter(
    (a) => /^factory-dist-[1-9]\d*$/.test(a.name) && !a.expired,
  );
  if (candidates.length !== 1)
    throw new Error('Expected one unexpired deployable build artifact');
  return candidates[0];
}

/**
 * The dependency key is derived from the artifact rather than passed in by the
 * workflow, so the key a deploy uses and the key CI compares against the host
 * are guaranteed to describe the same build.
 *
 * The recorded commit is the pull request's head, not the workflow run's head
 * SHA. `matchesTaskPR` has already established that the `agent-head-sha` marker
 * agrees with it, so this is the commit that was verified — and it keeps the
 * untrusted `workflow_run.head_sha` out of the deploy entirely.
 */
export function planFrom({ metadata, pr, source, domain }) {
  const issue = metadata.issue?.number;
  if (source.artifact.name !== `factory-dist-${issue}`)
    throw new Error('Deployable build does not belong to this task');
  return {
    repository: source.repository,
    runId: source.runId,
    runUrl: source.runUrl,
    runAttempt: source.runAttempt,
    prNumber: pr.number,
    issue,
    headSha: pr.head.sha,
    sourceArtifactUrl: `${source.runUrl}/artifacts/${source.artifact.id}`,
    host: previewHost(pr.number, domain),
    url: previewUrl(pr.number, domain),
    container: containerName(pr.number),
    router: routerName(pr.number),
  };
}

export function renderPreviewComment(plan, note = '') {
  const lines = [
    `${PREVIEW_COMMENT_PREFIX}${plan.runId}:${plan.runAttempt} -->`,
    '## 预览环境',
    '',
    ...(note
      ? ['**预览部署或公网访问检查失败，暂无已确认可用的地址。**']
      : [`**预览地址：${plan.url}**`]),
    '',
    ...(note
      ? []
      : [
          '这是本次搭建验收通过后的真实运行实例，可以登录、可以操作，数据来自一次性种子。',
        ]),
    '对应 PR 关闭后会自动回收。',
    '',
    `- 部署提交：\`${plan.headSha}\``,
    ...(note ? [] : ['- 登录账号：`nocobase` / `admin123`']),
    `- [搭建运行](${plan.runUrl})`,
  ];
  if (plan.depsKey) lines.push(`- 依赖集：\`${plan.depsKey.slice(0, 12)}\``);
  lines.push(
    '',
    '> 预览是公开地址，拿到链接的人都能打开登录页。请只使用一次性测试数据，不要放入真实业务数据或密钥。',
  );
  if (note) lines.push('', `> ${note}`);
  return lines.join('\n');
}
