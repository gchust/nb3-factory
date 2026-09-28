#!/usr/bin/env node
// Build verification runs `pnpm format:check '!.github/**'` over the whole
// application, so one badly formatted file at its root fails the first round
// of every build task. Run the same check in factory CI, before a change lands,
// without installing the application: only the Prettier and shared config
// versions its lockfile pins, in a temporary directory.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const FORMAT_ARGS = ['.', '--check', '!.github/**'];
const CONFIG_PACKAGE = '@nocobase/dev-config';

// The version pnpm resolved for a direct dependency of the root importer.
export function lockedVersion(lockfile, name) {
  const importer = /^importers:\n\n {2}\.:\n([\s\S]*?)(?=^ {2}\S|^\S)/m.exec(
    lockfile,
  )?.[1];
  const key = name.startsWith('@') ? `'${name}'` : name;
  const entry = importer?.match(
    new RegExp(
      `^ {6}${key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}:\\n {8}specifier: .*\\n {8}version: ([^\\s(]+)`,
      'm',
    ),
  );
  if (!entry) throw new Error(`pnpm-lock.yaml does not pin ${name}`);
  return entry[1];
}

export function checkApplicationFormat(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json')));
  if (manifest.prettier !== `${CONFIG_PACKAGE}/prettier`)
    throw new Error(
      `Expected package.json to use ${CONFIG_PACKAGE}/prettier; update this check with the application.`,
    );
  if (manifest.scripts?.['format:check'] !== 'prettier . --check')
    throw new Error(
      'Expected format:check to be "prettier . --check"; update this check with the application.',
    );
  const lockfile = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  const packages = ['prettier', CONFIG_PACKAGE].map(
    (name) => `${name}@${lockedVersion(lockfile, name)}`,
  );
  const tools = mkdtempSync(path.join(os.tmpdir(), 'factory-format-'));
  try {
    writeFileSync(path.join(tools, 'package.json'), '{"private":true}\n');
    // The application's registry settings resolve @nocobase packages.
    if (existsSync(path.join(root, '.npmrc')))
      copyFileSync(path.join(root, '.npmrc'), path.join(tools, '.npmrc'));
    execFileSync(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        '--ignore-scripts',
        '--legacy-peer-deps',
        ...packages,
      ],
      { cwd: tools, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    // Same shared config package.json names, resolved from the tool directory.
    writeFileSync(
      path.join(tools, 'prettier.config.mjs'),
      `export { default } from '${CONFIG_PACKAGE}/prettier';\n`,
    );
    console.log(`Checking application formatting with ${packages.join(', ')}`);
    execFileSync(
      path.join(tools, 'node_modules/.bin/prettier'),
      [...FORMAT_ARGS, '--config', path.join(tools, 'prettier.config.mjs')],
      { cwd: root, stdio: 'inherit' },
    );
  } finally {
    rmSync(tools, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(process.argv[2] ?? '.');
  try {
    checkApplicationFormat(root);
  } catch (error) {
    // Prettier already listed the files; do not bury them under a stack trace.
    console.error(
      error.status
        ? 'Application formatting differs from what build verification accepts. Run Prettier on the files above.'
        : error.message,
    );
    process.exit(1);
  }
}
