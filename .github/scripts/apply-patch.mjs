import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { TaskInputError, assertSafeChangedPaths } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(args.workspace);
const patch = path.resolve(args.patch);

git(['switch', '--force-create', args.branch]);
git(['apply', '--index', '--3way', patch]);

const names = git(['diff', '--cached', '--name-only', '-z'])
  .split('\0')
  .filter(Boolean);
if (names.length === 0) throw new TaskInputError('Patch 应用后没有暂存修改。');
assertSafeChangedPaths(names);
console.log(
  `Applied patch to ${args.branch}: ${names.length} changed file(s).`,
);

function git(arguments_) {
  return execFileSync('git', arguments_, {
    cwd: workspace,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['workspace', 'patch', 'branch']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}
