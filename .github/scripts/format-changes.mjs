import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import path from 'node:path';

// Fixed verification still runs afterwards. Formatting is never an LLM task.
const workspace = path.resolve(process.argv[2] || '.');
function git(args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(result.stderr || 'Cannot enumerate changed files');
  return result.stdout.split('\0').filter(Boolean);
}
const changed = [
  ...new Set([
    ...git(['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard', '-z']),
  ]),
].filter(
  (file) =>
    !file.startsWith('.github/') &&
    !file.split('/').includes('node_modules') &&
    !['config.yml', '.npmrc', '.gitmodules'].includes(file) &&
    lstatSync(path.join(workspace, file), { throwIfNoEntry: false })?.isFile(),
);
// Batches keep argv bounded for large generated applications; names remain
// literal (no shell and no globs interpreted from file names).
for (let i = 0; i < changed.length; i += 100) {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'prettier',
      '--write',
      '--ignore-unknown',
      '--',
      ...changed.slice(i, i + 100).map((file) => `./${file}`),
    ],
    { cwd: workspace, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
