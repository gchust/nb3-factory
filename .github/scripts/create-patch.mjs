import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TaskInputError, assertSafeChangedPaths } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(args.workspace);
const patchPath = path.resolve(args.patch);
const summaryPath = path.resolve(args.summary);

// Business agents are never allowed to publish factory control-plane changes.
// Formatting commands may touch these files accidentally, so restore them before
// calculating the application patch instead of failing after verification passed.
restoreProtectedPaths();

git(['add', '--intent-to-add', '--all']);
const names = splitNull(git(['diff', '--name-only', '-z', 'HEAD']));

if (names.length === 0) {
  if (!parseBoolean(args['allow-empty'])) {
    throw new TaskInputError('Code Agent 没有产生可提交的文件修改。');
  }
  writeEmptyPatch();
  process.exit(0);
}

assertSafeChangedPaths(names);
const patch = execFileSync(
  'git',
  ['diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--'],
  { cwd: workspace, maxBuffer: 100 * 1024 * 1024 },
);

mkdirSync(path.dirname(patchPath), { recursive: true });
writeFileSync(patchPath, patch, { mode: 0o600 });
writeFileSync(
  summaryPath,
  `${JSON.stringify({ files: names, counts: countFiles(names) }, null, 2)}\n`,
  { mode: 0o600 },
);

function restoreProtectedPaths() {
  const paths = ['.github', '.npmrc', '.gitmodules', 'config.yml'];
  for (const file of paths) {
    execFileSync('git', ['restore', '--source=HEAD', '--', file], {
      cwd: workspace,
      stdio: 'ignore',
    });
  }
}

function writeEmptyPatch() {
  mkdirSync(path.dirname(patchPath), { recursive: true });
  writeFileSync(patchPath, Buffer.alloc(0), { mode: 0o600 });
  writeFileSync(summaryPath, `${JSON.stringify({ files: [] }, null, 2)}\n`, {
    mode: 0o600,
  });
}

function countFiles(files) {
  return {
    files: files.length,
    protected: files.filter((file) => file.startsWith('.github/')).length,
  };
}

function git(args_) {
  return execFileSync('git', args_, {
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
  for (let i = 0; i < argv.length; i += 2) {
    parsed[argv[i]?.replace(/^--/, '')] = argv[i + 1];
  }
  for (const name of ['workspace', 'patch', 'summary']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}
