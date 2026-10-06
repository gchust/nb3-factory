import { execFileSync } from 'node:child_process';
import { appendFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSafeChangedPaths } from './factory-lib.mjs';

// A task is verified on its pinned base_sha, but the default branch keeps
// moving while it runs. GitHub refuses a token without the `workflows`
// permission when a pushed branch would carry workflow files that differ from
// what the repository already has, so publishing a new branch on an old base
// fails as soon as a factory change to .github/ lands in between. When only
// factory-owned files moved, and none of them is a file the patch touches,
// the verified patch is moved onto the current branch head: the application
// files stay byte-identical to what was verified, and the factory files match
// the repository. Anything else keeps the verified base.

// eslint.config.js imports this file, so it changes how the application is
// linted even though it lives under .github/.
const APPLICATION_READS = new Set(['.github/scripts/factory-eslint.mjs']);

export function isFactoryOwnedDrift(file) {
  if (APPLICATION_READS.has(file)) return false;
  return file.startsWith('.github/') || file.startsWith('docs/');
}

// The overlay appends factory entries to .gitignore. An appended ignore rule
// can only hide untracked files from the checks, never change a tracked one;
// a removed or negated rule could expose files verification never saw.
export function isAppendOnlyIgnoreDiff(diff) {
  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) return false;
    if (line.startsWith('+') && line.slice(1).trimStart().startsWith('!'))
      return false;
  }
  return true;
}

export function classifyDrift({ drift, patchPaths, ignoreDiff = '' }) {
  if (drift.length === 0) return { restack: false, reason: 'current' };
  const touched = new Set(patchPaths);
  const overlap = drift.filter((file) => touched.has(file));
  if (overlap.length > 0)
    return { restack: false, reason: 'patch-overlap', paths: overlap };
  const application = drift.filter(
    (file) =>
      !isFactoryOwnedDrift(file) &&
      !(file === '.gitignore' && isAppendOnlyIgnoreDiff(ignoreDiff)),
  );
  if (application.length > 0)
    return { restack: false, reason: 'application-drift', paths: application };
  return { restack: true, reason: 'factory-drift' };
}

export function choosePublicationBase(options) {
  const { workspace, patch, branch, baseRef, baseSha } = options;
  const remote = options.remote ?? 'origin';
  const git = (arguments_, extra = {}) =>
    execFileSync('git', arguments_, {
      cwd: workspace,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
      // Patch paths are file names, never globs.
      env: { ...process.env, GIT_LITERAL_PATHSPECS: '1' },
      ...extra,
    });
  const list = (arguments_) => git(arguments_).split('\0').filter(Boolean);
  const record = {
    version: 1,
    verifiedBase: { ref: baseRef, sha: baseSha },
    publishedBase: { ref: baseRef, sha: baseSha },
    restacked: false,
  };
  const keep = (reason, extra = {}) => ({ ...record, reason, ...extra });

  // An existing work branch is updated with a fast-forward child of its own
  // head, which the remote already has; moving it would rewrite a published
  // branch and its PR, so it keeps its base.
  if (baseRef === branch) return keep('existing-work-branch');
  if (statSync(patch).size === 0) return keep('empty-patch');

  const tracking = `refs/remotes/${remote}/${baseRef}`;
  try {
    git([
      'fetch',
      '--quiet',
      '--no-tags',
      '--depth=1',
      remote,
      `+refs/heads/${baseRef}:${tracking}`,
    ]);
  } catch (error) {
    return keep('target-unavailable', { detail: firstLine(error) });
  }
  const head = git(['rev-parse', tracking]).trim();
  if (head === baseSha) return keep('current');

  const drift = list([
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    baseSha,
    head,
  ]);
  const patchPaths = list([
    'diff',
    '--cached',
    '--name-only',
    '--no-renames',
    '-z',
  ]);
  const ignoreDiff = drift.includes('.gitignore')
    ? git(['diff', '-U0', baseSha, head, '--', '.gitignore'])
    : '';
  const decision = classifyDrift({ drift, patchPaths, ignoreDiff });
  const driftRecord = { head, drift: drift.length };
  if (!decision.restack) {
    ensureBaseAncestry({ git, baseSha, tracking, remote, baseRef });
    return keep(decision.reason, {
      ...driftRecord,
      paths: decision.paths?.slice(0, 20),
    });
  }

  // Index entries carry mode and blob id, so equal entries mean the restacked
  // application files are byte-identical to the verified ones.
  const verified = git(['ls-files', '--stage', '-z', '--', ...patchPaths]);
  const restore = () => {
    git(['reset', '--quiet', '--hard']);
    git(['switch', '--quiet', '--force-create', branch, baseSha]);
    git(['apply', '--index', '--3way', patch]);
  };
  git(['reset', '--quiet', '--hard']);
  git(['switch', '--quiet', '--force-create', branch, head]);
  try {
    git(['apply', '--index', '--3way', patch]);
  } catch (error) {
    restore();
    ensureBaseAncestry({ git, baseSha, tracking, remote, baseRef });
    return keep('apply-failed', { ...driftRecord, detail: firstLine(error) });
  }
  const staged = list([
    'diff',
    '--cached',
    '--name-only',
    '--no-renames',
    '-z',
  ]);
  if (
    git(['ls-files', '--stage', '-z', '--', ...patchPaths]) !== verified ||
    staged.length !== patchPaths.length ||
    staged.some((file) => !patchPaths.includes(file))
  ) {
    restore();
    ensureBaseAncestry({ git, baseSha, tracking, remote, baseRef });
    return keep('tree-mismatch', driftRecord);
  }
  assertSafeChangedPaths(staged);
  return {
    ...record,
    publishedBase: { ref: baseRef, sha: head },
    restacked: true,
    reason: decision.reason,
    ...driftRecord,
  };
}

// The task checkout holds base_sha alone. Without history git cannot see that
// the remote branch already contains it, so a push of a new branch would send
// the base commit and its whole tree again, and GitHub would examine that old
// commit's workflow changes as if this push made them. Fetching the branch
// back to base_sha lets the push send only the task commit.
function ensureBaseAncestry({ git, baseSha, tracking, remote, baseRef }) {
  const refspec = `+refs/heads/${baseRef}:${tracking}`;
  const reached = () => {
    try {
      git(['merge-base', '--is-ancestor', baseSha, tracking]);
      return true;
    } catch {
      return false;
    }
  };
  for (const depth of ['--depth=50', '--depth=500', '--unshallow']) {
    if (reached()) return;
    try {
      git(['fetch', '--quiet', '--no-tags', depth, remote, refspec]);
    } catch (error) {
      console.log(
        `::warning::Could not fetch ${baseRef} history (${depth}): ${firstLine(error)}`,
      );
      return;
    }
  }
  if (!reached())
    console.log(
      `::warning::${baseSha} is not an ancestor of ${baseRef}; the push sends the base commit as well.`,
    );
}

function firstLine(error) {
  return String(error.stderr || error.message || error)
    .trim()
    .split('\n')[0];
}

export function describePublication(record) {
  const short = (sha) => sha.slice(0, 12);
  const verified = `\`${record.verifiedBase.ref} @ ${short(record.verifiedBase.sha)}\``;
  if (record.restacked)
    return `应用补丁已在 ${verified} 上验证；发布时改基到 \`${record.publishedBase.ref} @ ${short(record.publishedBase.sha)}\`。两者之间只有工厂自有文件变化（${record.drift} 个），均不在本次修改范围内；补丁触及的应用文件与已验证内容逐字节一致。`;
  switch (record.reason) {
    case 'patch-overlap':
    case 'application-drift':
    case 'apply-failed':
    case 'tree-mismatch':
      return `应用补丁基于并验证于 ${verified}；\`${record.verifiedBase.ref}\` 此后有 ${record.drift} 个文件变化（${record.reason}），未自动改基，合并前请检查与最新分支的差异。`;
    default:
      return `代码起点：${verified}（已在此基线上验证）。`;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of [
    'workspace',
    'patch',
    'branch',
    'base-ref',
    'base-sha',
    'record',
  ]) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const record = choosePublicationBase({
    workspace: path.resolve(args.workspace),
    patch: path.resolve(args.patch),
    branch: args.branch,
    baseRef: args['base-ref'],
    baseSha: args['base-sha'],
  });
  writeFileSync(args.record, `${JSON.stringify(record, null, 2)}\n`);
  const message = describePublication(record);
  console.log(
    `Publication base (${record.reason}): ${record.publishedBase.sha}`,
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### 发布基线\n\n${message}\n`,
    );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `published_base_sha=${record.publishedBase.sha}\nrestacked=${record.restacked}\n`,
    );
}
