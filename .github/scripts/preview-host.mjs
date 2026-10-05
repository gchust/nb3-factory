import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Kept identical to the base path `verify.sh` uses. A preview serving a
// different base path would not be the thing that was verified.
export const PREVIEW_BASE_PATH = '/main';
export const PREVIEW_THEME = 'nfvd.net';

export const PREVIEW_COMMENT_PREFIX = '<!-- factory-preview:';

/**
 * Marks a comment that published a verified address rather than a failure.
 *
 * The same build can be deployed twice — the task workflow requests the preview
 * explicitly and GitHub also raises `workflow_run` for the same completed run —
 * and only one of the two attempts has to succeed for the preview to be up. The
 * report reads this mark so a failing second attempt states its own failure
 * without withdrawing the address the first one confirmed.
 */
export const PREVIEW_VERIFIED_MARKER = '<!-- factory-preview-verified -->';

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
    !(
      jobs.some(
        (job) => job.name === 'publish-failed' && job.conclusion === 'success',
      ) ||
      (run.conclusion === 'success' &&
        ['verify-final', 'publish'].every((name) =>
          jobs.some((job) => job.name === name && job.conclusion === 'success'),
        ))
    )
  ) {
    return null;
  }
  const candidates = artifacts.filter(
    (a) => /^factory-dist-[1-9]\d*$/.test(a.name) && !a.expired,
  );
  if (
    candidates.length === 0 &&
    jobs.some(
      (job) => job.name === 'publish-failed' && job.conclusion === 'success',
    )
  )
    return null; // Failed packaging has no archive.
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
    deliveryStatus: source.deliveryStatus || 'success',
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

const BUILD_STATUSES = new Set(['success', 'failed', 'unknown']);

/**
 * Reads what `preview-capacity.sh` printed about the host.
 *
 * Strict on purpose: the answer decides which previews are destroyed, so a line
 * that does not have the expected shape — a banner from the login shell, a
 * truncated connection — fails the step instead of being read as "no instances".
 */
export function parseCapacityListing(text) {
  let limit;
  let self;
  const instances = [];
  for (const line of String(text).split('\n')) {
    const fields = line.trim().split(/\s+/).filter(Boolean);
    if (fields.length === 0) continue;
    const [kind, ...rest] = fields;
    if (kind === 'limit' && rest.length === 1 && /^[1-9]\d*$/.test(rest[0]))
      limit = Number(rest[0]);
    else if (
      kind === 'self' &&
      rest.length === 1 &&
      ['present', 'absent'].includes(rest[0])
    )
      self = rest[0] === 'present';
    else if (
      kind === 'instance' &&
      rest.length === 3 &&
      /^[1-9]\d*$/.test(rest[0]) &&
      /^(-|[0-9T:Z-]+)$/.test(rest[1]) &&
      BUILD_STATUSES.has(rest[2])
    )
      instances.push({
        pr: Number(rest[0]),
        deployedAt: rest[1] === '-' ? '' : rest[1],
        buildStatus: rest[2],
      });
    else throw new Error(`Unexpected preview capacity line: ${line}`);
  }
  if (limit === undefined || self === undefined)
    throw new Error('Incomplete preview capacity listing');
  return { limit, self, instances };
}

/** Whether a deploy for this pull request needs a slot the host does not have. */
export function needsRoom(listing) {
  return !listing.self && listing.instances.length >= listing.limit;
}

/** The delivery status `publish-pr.mjs` records in a build pull request's body. */
export function buildStatusFromBody(body) {
  return (
    /<!-- factory-build-status: (success|failed) -->/.exec(body ?? '')?.[1] ??
    'unknown'
  );
}

/**
 * Decides which previews to destroy so this pull request's deploy fits.
 *
 * `pulls` maps a preview's pull request number to `{ state, body }`, or to
 * `null` when GitHub has no such pull request. Only a full host evicts
 * anything, in this order:
 *
 *   1. every preview whose pull request is closed, merged or gone. Teardown
 *      should already have removed it, and nothing else ever will.
 *   2. previews of failed builds, oldest deployment first. A failed build's
 *      preview is optional (see `.github/AGENTS.md`), so it gives way to a new
 *      deploy rather than the new deploy being refused.
 *   3. previews whose build status nobody recorded — deployed before the host
 *      recorded it, for a pull request whose body carries no status either —
 *      oldest deployment first.
 *
 * The build status the host recorded wins over the pull request body, because
 * it describes the build the preview actually serves. A preview of a
 * successful build for an open pull request is never evicted. Failed and
 * unknown previews are evicted only when that makes room; when it cannot, the
 * deploy is skipped and they stay up.
 */
export function planCapacity({ listing, pr, pulls = new Map() }) {
  const count = listing.instances.length;
  const result = (room, evict) => ({
    room,
    evict,
    count,
    limit: listing.limit,
  });
  if (!needsRoom(listing)) return result(true, []);

  const others = listing.instances.filter((instance) => instance.pr !== pr);
  const closed = others
    .filter((instance) => {
      const pull = pulls.get(instance.pr);
      return pull === null || (pull !== undefined && pull.state !== 'open');
    })
    .map((instance) => ({ ...instance, reason: 'closed' }));
  const open = others.filter(
    (instance) => pulls.get(instance.pr)?.state === 'open',
  );
  const statusOf = (instance) =>
    instance.buildStatus !== 'unknown'
      ? instance.buildStatus
      : buildStatusFromBody(pulls.get(instance.pr)?.body);
  // An instance without a recorded deployment time sorts as the oldest.
  const oldestFirst = (a, b) =>
    a.deployedAt.localeCompare(b.deployedAt) || a.pr - b.pr;
  const optional = ['failed', 'unknown'].flatMap((reason) =>
    open
      .filter((instance) => statusOf(instance) === reason)
      .sort(oldestFirst)
      .map((instance) => ({ ...instance, reason })),
  );

  const needed = count - listing.limit + 1 - closed.length;
  if (needed <= 0) return result(true, closed);
  if (optional.length < needed) return result(false, closed);
  return result(true, [...closed, ...optional.slice(0, needed)]);
}

/** The pull request notice for a deploy skipped because the host is full. */
export function capacitySkipNote(capacity, runUrl) {
  return [
    `预览机名额已满（${capacity.count}/${capacity.limit}），且没有可以回收的预览：已关闭 PR 的预览和失败构建的预览都已让出名额，其余都是开放 PR 的成功构建，不会被挤掉。`,
    `释放名额：关闭或合并不再需要的 PR（Reclaim Task Preview 会自动回收），或在预览机上运行 \`preview-destroy.sh <PR 号>\`；然后在 Actions → Deploy Task Preview → Run workflow 填入[本次搭建运行](${runUrl})的 run ID 补发。这不改变搭建报告和 PR 中记录的验收状态。`,
  ].join('\n> ');
}

export const PREVIEW_EVICTED_MARKER = '<!-- factory-preview-evicted -->';

/** The notice left on an open pull request whose preview was evicted. */
export function renderEvictionComment({ reason, forPr }) {
  const why =
    reason === 'failed' ? '这是失败构建的预览' : '这个预览没有记录搭建状态';
  return [
    PREVIEW_EVICTED_MARKER,
    '## 预览环境已回收',
    '',
    `预览机名额已满，为部署 #${forPr} 的预览回收了本 PR 的预览：${why}，按部署时间最早优先让出名额。开放 PR 的成功构建预览不会被这样回收。`,
    '',
    '需要时可在 Actions → Deploy Task Preview → Run workflow 填入本 PR 的搭建运行 ID 重新部署；名额仍满时会跳过并在 PR 上说明。',
  ].join('\n');
}

export function renderPreviewComment(
  plan,
  note = '',
  headline = '**预览部署或公网访问检查失败，暂无已确认可用的地址。**',
) {
  const lines = [
    `${PREVIEW_COMMENT_PREFIX}${plan.runId}:${plan.runAttempt} -->`,
    ...(note ? [] : [PREVIEW_VERIFIED_MARKER]),
    '## 预览环境',
    '',
    ...(note ? [headline] : [`**预览地址：${plan.url}**`]),
    '',
    ...(note
      ? []
      : [
          plan.deliveryStatus === 'failed'
            ? '**搭建状态：failed**。这是失败实现的预览，部署可用不代表业务验收通过；请结合搭建报告排查。'
            : '这是本次搭建验收通过后的真实运行实例，可以登录、可以操作，数据来自一次性种子。',
        ]),
    '对应 PR 关闭后会自动回收。每次部署使用新的示例数据，前次试用数据与上传文件保留在服务器备份中，不自动迁入新版本。',
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
