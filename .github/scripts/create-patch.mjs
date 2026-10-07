import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TaskInputError, assertSafeChangedPaths } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(args.workspace);
const patchPath = path.resolve(args.patch);
const summaryPath = path.resolve(args.summary);
const protectedPaths = [
  '.github',
  '.npmrc',
  '.gitmodules',
  'config.yml',
  'factory-source.json',
];
// Opt-in, for build tasks only (code-agent-task.yml): an application's root
// AGENTS.md and CLAUDE.md belong to @nocobase/app-template-default. A refresh
// replaces them and template-guidance.test.mjs requires them byte-identical, so
// a build's edit is reset here rather than merged and then broken. Other callers
// (framework-fix on nocobase/nocobase3, whose root AGENTS.md is its own
// repository rules) keep every edit. Only the root files: client/AGENTS.md and
// other nested guidance stay the application's.
//
// --guidance-source names the commit whose text they are reset to (default
// HEAD). A follow-up build on an existing work branch passes the target branch,
// so a branch that already diverged (an earlier build edited them) carries the
// template text again in its patch instead of keeping the divergence forever.
// They are not added to assertSafeChangedPaths, so patches and work branches
// made before this change still apply.
const TEMPLATE_GUIDANCE = ['AGENTS.md', 'CLAUDE.md'];
const protectGuidance = parseBoolean(args['protect-template-guidance']);
const guidanceSource = args['guidance-source'] || 'HEAD';

restoreProtectedPaths();
if (protectGuidance) restoreTemplateGuidance();
git(['add', '--intent-to-add', '--all']);
const names = splitNull(git(['diff', '--name-only', '-z', 'HEAD']));
if (names.length === 0) {
  if (!parseBoolean(args['allow-empty'])) {
    throw new TaskInputError('Code Agent 没有产生可提交的文件修改。');
  }

  writeEmptyPatch();
  console.log(
    'Created an empty patch after revalidating the existing work branch.',
  );
  process.exit(0);
}
assertSafeChangedPaths(names);

const patch = execFileSync(
  'git',
  ['diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--'],
  { cwd: workspace, maxBuffer: 100 * 1024 * 1024 },
);
const nameStatus = git(['diff', '--name-status', 'HEAD'])
  .trim()
  .split('\n')
  .filter(Boolean);
const counts = {
  added: 0,
  modified: 0,
  deleted: 0,
  renamed: 0,
  files: names.length,
};
for (const line of nameStatus) {
  const status = line.split('\t')[0];
  if (status.startsWith('A')) counts.added += 1;
  else if (status.startsWith('D')) counts.deleted += 1;
  else if (status.startsWith('R')) counts.renamed += 1;
  else counts.modified += 1;
}

mkdirSync(path.dirname(patchPath), { recursive: true });
writeFileSync(patchPath, patch, { mode: 0o600 });
writeFileSync(
  summaryPath,
  `${JSON.stringify({ counts, files: names }, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(`Created patch with ${names.length} changed file(s).`);

function restoreProtectedPaths() {
  const tracked = [
    ...new Set([
      ...splitNull(
        git([
          'ls-tree',
          '-r',
          '--name-only',
          '-z',
          'HEAD',
          '--',
          ...protectedPaths,
        ]),
      ),
      ...splitNull(git(['ls-files', '-z', '--', ...protectedPaths])),
    ]),
  ];

  if (tracked.length > 0) {
    execFileSync(
      'git',
      ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked],
      { cwd: workspace, stdio: 'pipe' },
    );
  }
  execFileSync('git', ['clean', '-fdx', '--', ...protectedPaths], {
    cwd: workspace,
    stdio: 'pipe',
  });
}

function restoreTemplateGuidance() {
  const source = git([
    'rev-parse',
    '--verify',
    `${guidanceSource}^{commit}`,
  ]).trim();
  for (const file of TEMPLATE_GUIDANCE) {
    const spec = `:(top,literal)${file}`;
    let present = true;
    try {
      git(['cat-file', '-e', `${source}:${file}`]);
    } catch {
      present = false;
    }
    if (present) {
      execFileSync(
        'git',
        ['restore', `--source=${source}`, '--staged', '--worktree', '--', spec],
        { cwd: workspace, stdio: 'pipe' },
      );
    } else {
      // Not part of the source: an agent-created copy is dropped as well.
      execFileSync(
        'git',
        ['rm', '-q', '-f', '--ignore-unmatch', '--cached', '--', spec],
        {
          cwd: workspace,
          stdio: 'pipe',
        },
      );
      rmSync(path.join(workspace, file), { force: true });
    }
  }
}

function writeEmptyPatch() {
  mkdirSync(path.dirname(patchPath), { recursive: true });
  writeFileSync(patchPath, Buffer.alloc(0), { mode: 0o600 });
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        counts: {
          added: 0,
          modified: 0,
          deleted: 0,
          renamed: 0,
          files: 0,
        },
        files: [],
        reusedExistingWorkBranch: true,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

function git(arguments_) {
  return execFileSync('git', arguments_, {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function splitNull(value) {
  return value.split('\0').filter(Boolean);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['workspace', 'patch', 'summary']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}
