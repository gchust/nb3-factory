import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';

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

const TAR_BLOCK = 512;
const padded = (size) => Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
const cString = (buffer) => {
  const end = buffer.indexOf(0);
  return buffer.toString('utf8', 0, end < 0 ? buffer.length : end);
};
const tarNumber = (field) => {
  // Base-256 (GNU) for values an octal field cannot hold.
  if (field[0] & 0x80) {
    let value = field[0] & 0x7f;
    for (const byte of field.subarray(1)) value = value * 256 + byte;
    return value;
  }
  const text = cString(field).trim();
  return text ? Number.parseInt(text, 8) : 0;
};
const memberPath = (name) => name.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
const paxRecords = (data) => {
  const records = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) break;
    const length = Number(data.toString('utf8', offset, space));
    if (!Number.isSafeInteger(length) || length <= 0) break;
    const record = data.toString('utf8', space + 1, offset + length - 1);
    const equals = record.indexOf('=');
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return records;
};

/**
 * Reads a packed build (`dist.tar.gz`) without unpacking it: the entries
 * `readDepsEntries` would produce for its `dist/node_modules` once extracted,
 * and the paths of the regular files outside that tree.
 *
 * Unpacking turned ~84 MB into ~744 MB and ~30k files on the runner only to
 * walk them for this key, and before the workflow knew whether the host had
 * room. Reading the archive streams it once instead. The entries are the ones
 * the extracted tree yields, so the key matches what the walk gave and what the
 * host's caches are named after: a hard link (the `tar` package records every
 * further name of one inode that way) is a file with its target's size, a
 * directory the archive only implies is still a directory, and a later member
 * replaces an earlier one with the same name, as extraction does.
 *
 * Handles what `tar` and GNU tar write: ustar names split into a prefix, GNU
 * long names and links, and PAX `path`, `linkpath` and `size` records.
 *
 * `linksIntoDeps` says a file outside the tree is recorded as a hard link to
 * one inside it: unpacking the build without its dependency tree, which is how
 * the slim payload is made, would fail on that member, so the full build is
 * sent instead.
 */
export async function readArchiveEntries(
  archive,
  prefix = 'dist/node_modules/',
) {
  const sizes = new Map();
  const deps = new Map();
  const files = new Set();
  let hasDeps = false;
  let linksIntoDeps = false;
  let pending = null;
  let skip = 0;
  let longName;
  let longLink;
  let pax = {};
  let rest = Buffer.alloc(0);

  const add = (type, name, linkName, size) => {
    const full = memberPath(name);
    if (type === 'file') sizes.set(full, size);
    if (`${full}/` === prefix) {
      hasDeps = true;
      return;
    }
    if (!full.startsWith(prefix)) {
      if (type === 'file' || type === 'hardlink') files.add(full);
      // Unpacking without the dependency tree could not create this link.
      if (type === 'hardlink' && memberPath(linkName ?? '').startsWith(prefix))
        linksIntoDeps = true;
      return;
    }
    hasDeps = true;
    const relative = full.slice(prefix.length);
    if (type === 'dir') deps.set(relative, `${relative}\u0000dir`);
    else if (type === 'symlink') deps.set(relative, `${relative}\u0000link`);
    else {
      const bytes =
        type === 'file' ? size : sizes.get(memberPath(linkName ?? ''));
      if (bytes === undefined)
        throw new Error(`Hard link ${full} points at an unknown member`);
      deps.set(relative, `${relative}\u0000${bytes}`);
    }
  };

  const header = (block) => {
    const type = String.fromCharCode(block[156] || 0x30);
    const recorded = tarNumber(block.subarray(124, 136));
    if (['L', 'K', 'x', 'g'].includes(type)) {
      pending = { type, size: recorded, chunks: [], got: 0 };
      skip = padded(recorded);
      return;
    }
    const size = pax.size === undefined ? recorded : Number(pax.size);
    let name = cString(block.subarray(0, 100));
    const ustar = block.toString('latin1', 257, 263) === 'ustar\u0000';
    const prefixField = ustar ? cString(block.subarray(345, 500)) : '';
    if (prefixField) name = `${prefixField}/${name}`;
    name = pax.path ?? longName ?? name;
    const linkName =
      pax.linkpath ?? longLink ?? cString(block.subarray(157, 257));
    pax = {};
    longName = undefined;
    longLink = undefined;
    const kinds = {
      0: 'file',
      '\u0000': 'file',
      7: 'file',
      1: 'hardlink',
      2: 'symlink',
      5: 'dir',
    };
    const kind = kinds[type];
    if (kind) add(kind, name, linkName, kind === 'file' ? size : 0);
    // Only regular files carry data; everything else has none to skip.
    skip = kind === 'file' || !kind ? padded(size) : 0;
  };

  const finish = () => {
    const data = Buffer.concat(pending.chunks);
    if (pending.type === 'L') longName = cString(data);
    else if (pending.type === 'K') longLink = cString(data);
    else if (pending.type === 'x') pax = paxRecords(data);
    pending = null;
  };

  for await (const chunk of createReadStream(archive).pipe(createGunzip())) {
    const buffer = rest.length ? Buffer.concat([rest, chunk]) : chunk;
    let offset = 0;
    for (;;) {
      if (skip) {
        const take = Math.min(skip, buffer.length - offset);
        if (pending && pending.got < pending.size) {
          const want = Math.min(take, pending.size - pending.got);
          pending.chunks.push(
            Buffer.from(buffer.subarray(offset, offset + want)),
          );
          pending.got += want;
        }
        skip -= take;
        offset += take;
        if (skip) break;
        if (pending) finish();
        continue;
      }
      if (buffer.length - offset < TAR_BLOCK) break;
      const block = buffer.subarray(offset, offset + TAR_BLOCK);
      offset += TAR_BLOCK;
      if (block.every((byte) => byte === 0)) continue;
      header(block);
      if (pending && skip === 0) finish();
    }
    // Copied: the stream may reuse the chunk the remainder points into.
    rest = Buffer.from(buffer.subarray(offset));
  }

  // Extraction creates every parent directory, recorded or not.
  for (const relative of [...deps.keys()]) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.' && !deps.has(parent)) {
      deps.set(parent, `${parent}\u0000dir`);
      parent = path.posix.dirname(parent);
    }
  }
  return { deps: [...deps.values()], files, hasDeps, linksIntoDeps };
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
 *
 * A hit also touches the cache directory. The probe runs without the deploy
 * lock, and the deploy takes it only after the upload and the host's fetch
 * (up to ten minutes and more later), so an hourly `preview-gc.sh` in between
 * could prune a cache that no instance references yet — the last user was torn
 * down, or evicted by this very deploy — and the slim payload would then fail
 * the deploy. The GC leaves a cache touched within two hours alone. The touch
 * comes first, so a GC deciding at that moment already sees it, and `-c`
 * creates nothing for a missing cache; the GC renames a cache away in one step
 * before deleting it, so the check that follows never sees a half-deleted
 * tree. A failed touch answers absent, which only costs a full payload.
 */
export function depsProbeCommand(key, root = '/srv/nb3-preview') {
  const dir = depsDir(key, root);
  return `touch -c ${dir} && test -d ${dir}/node_modules && echo present || echo absent`;
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

// The jobs that upload factory-dist-N: verify-final, for a delivery and also
// for failed work when its build finished before a later check failed, and
// preview-build-failed for other published failed work.
const DIST_PRODUCERS = ['verify-final', 'preview-build-failed'];

/**
 * Whether an error from the repository API client is a 404. GitHubClient
 * reports `GitHub API GET /pulls/5 failed (404): …`; the text after the status
 * is the response body, so the status is matched where it appears.
 */
export function isNotFoundError(error) {
  return /failed \(404\)/.test(String(error?.message ?? ''));
}

/**
 * Selects the deployable build for a delivered task.
 *
 * Same job gate as the visual report: both `verify-final` and `publish` must
 * have succeeded, so a five-hour handoff — which has neither — is not a
 * delivery. The run's own conclusion is not consulted: a question round's reply
 * failing after the delivery makes the run fail without making the build less
 * delivered. The artifact differs: the deployable build is produced by
 * `verify-final` (which also packages failed work whose build finished) or by
 * `preview-build-failed`, not by the agent.
 *
 * Artifacts are listed for every attempt of the run; only one uploaded inside a
 * producing job of the selected attempt belongs to it. Without such an upload
 * (no job window, or nothing inside it) a delivery fails loudly with "Expected
 * one unexpired deployable build artifact"; only the failed-PR path, whose
 * packaging may legitimately have failed, returns null.
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
      ['verify-final', 'publish'].every((name) =>
        jobs.some((job) => job.name === name && job.conclusion === 'success'),
      )
    )
  ) {
    return null;
  }
  const windows = jobs
    .filter((job) => DIST_PRODUCERS.includes(job.name))
    .map((job) => [Date.parse(job.started_at), Date.parse(job.completed_at)])
    .filter(([start, end]) => !Number.isNaN(start) && !Number.isNaN(end));
  const inAttempt = (artifact) => {
    const created = Date.parse(artifact.created_at);
    return windows.some(([start, end]) => created >= start && created <= end);
  };
  const candidates = artifacts.filter(
    (a) => /^factory-dist-[1-9]\d*$/.test(a.name) && !a.expired && inAttempt(a),
  );
  if (
    candidates.length === 0 &&
    jobs.some(
      (job) => job.name === 'publish-failed' && job.conclusion === 'success',
    )
  )
    return null; // Failed packaging has no archive.
  // A passed verification whose package could not be staged or uploaded (that
  // no longer fails the delivery): select reports the missing package instead
  // of failing. The upload is continue-on-error, so GitHub reports it as
  // success even when it failed; the report step has no continue-on-error and
  // runs only when the package is missing.
  if (
    candidates.length === 0 &&
    jobs.some(
      (job) =>
        job.name === 'verify-final' &&
        job.steps?.some(
          (step) =>
            step.name === 'Report a missing deployable build' &&
            step.conclusion === 'success',
        ),
    )
  )
    return null;
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
 *   1. previews whose pull request is closed, merged or gone, oldest
 *      deployment first: at most CLOSED_EVICTIONS_PER_DEPLOY of them, or as
 *      many as the deploy needs when that is more. Teardown should already
 *      have removed them, and nothing else ever will; the rest go at the next
 *      deploy that needs room.
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

  // Every slot needed comes from a closed PR first. In all, at most
  // CLOSED_EVICTIONS_PER_DEPLOY closed previews go per deploy unless more slots
  // are needed, oldest first:
  // each removal can wait minutes for the deploy lock, and the capacity step
  // is budgeted for that many. The rest still go before any open PR's preview,
  // at the next deploy that needs room.
  const slots = count - listing.limit + 1;
  const reclaimed = closed
    .sort(oldestFirst)
    .slice(0, Math.max(slots, CLOSED_EVICTIONS_PER_DEPLOY));
  const needed = slots - reclaimed.length;
  if (needed <= 0) return result(true, reclaimed);
  if (optional.length < needed) return result(false, reclaimed);
  return result(true, [...reclaimed, ...optional.slice(0, needed)]);
}

/**
 * The most closed PRs' previews one deploy removes, unless it needs more slots
 * than this. The capacity step's timeout in deploy-preview.yml covers this many
 * removals.
 */
export const CLOSED_EVICTIONS_PER_DEPLOY = 3;

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
