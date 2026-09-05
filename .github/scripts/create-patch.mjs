import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TaskInputError, assertSafeChangedPaths } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(args.workspace);
const patchPath = path.resolve(args.patch);
const summaryPath = path.resolve(args.summary);

git(['add', '--intent-to-add', '--all']);
const names = splitNull(git(['diff', '--name-only', '-z', 'HEAD']));
if (names.length === 0) {
  if (!parseBoolean(args['allow-empty'])) {
    throw new TaskInputError('Code Agent 没有产生可提交的文件修改。');
  }

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
