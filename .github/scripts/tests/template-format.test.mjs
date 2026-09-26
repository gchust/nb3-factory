import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '../../workflows/refresh-template.yml'),
  'utf8',
);
// Execute the actual workflow step, not a second copy of its shell logic.
const formatStep = workflow.match(
  /^ {6}- name: Format the generated application and plugin registrations\n {8}run: \|\n((?: {10}.*\n|\n)+)/m,
)?.[1];
assert.ok(formatStep, 'Missing refresh formatting step');
const command = formatStep.replace(/^ {10}/gm, '');
const requiredTargets = [
  'package.json',
  'README.MD',
  'eslint.config.js',
  'factory-template.json',
  'client/plugins.ts',
  'server/plugins.ts',
  'cli/plugins.ts',
  'server/config/index.ts',
  'server/config/mail.ts',
  'tests/logic',
  'vitest.config.ts',
];

function fixture(t, { config = false, missing, exitCode = 0 } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'template format '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'template-generation/nb3-factory');
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const target of requiredTargets) {
    if (target === missing) continue;
    const file = path.join(app, target);
    if (target === 'tests/logic') mkdirSync(file, { recursive: true });
    else {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, '{}\n');
    }
  }
  writeFileSync(path.join(app, 'config.example.yml'), 'auth: {}\n');
  if (config) writeFileSync(path.join(app, 'config.yml'), 'auth: {}\n');
  const externalConfig = path.join(root, 'template-verification.yml');
  writeFileSync(externalConfig, 'external: verification-only\n');
  const log = path.join(root, 'formatter-arguments.json');
  // A strict CLI double: missing explicit paths fail, as Prettier does. It also
  // rejects extra flags/commands, so config:init or global error suppression
  // cannot make these workflow tests green. This does not test Prettier internals.
  const pnpm = path.join(bin, 'pnpm');
  writeFileSync(
    pnpm,
    `#!${process.execPath}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const args = process.argv.slice(2);
assert.deepEqual(args.slice(0, 3), ['exec', 'prettier', '--write']);
const targets = args.slice(3);
assert.ok(targets.length > 0 && targets.every(name => !name.startsWith('-')));
fs.writeFileSync(process.env.FORMAT_LOG, JSON.stringify({ cwd: process.cwd(), targets }));
for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.error('No files matching the pattern were found: "' + target + '".');
    process.exit(2);
  }
}
process.exit(Number(process.env.FORMAT_EXIT_CODE));
`,
  );
  chmodSync(pnpm, 0o755);
  return {
    app,
    externalConfig,
    arguments: () => JSON.parse(readFileSync(log, 'utf8')),
    run: () =>
      spawnSync('bash', ['-e', '-c', command], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          RUNNER_TEMP: root,
          FORMAT_LOG: log,
          FORMAT_EXIT_CODE: String(exitCode),
        },
      }),
  };
}

test('refresh formats a new template without config.yml or creating runtime secrets', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.arguments(), { cwd: f.app, targets: requiredTargets });
  assert.equal(existsSync(path.join(f.app, 'config.yml')), false);
  assert.equal(
    readFileSync(f.externalConfig, 'utf8'),
    'external: verification-only\n',
  );
  assert.equal(
    readFileSync(path.join(f.app, 'config.example.yml'), 'utf8'),
    'auth: {}\n',
  );
});

test('refresh still formats a an existing config.yml without creating one', (t) => {
  const f = fixture(t, { config: true });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.arguments().cwd, f.app);
  assert.deepEqual(
    f.arguments().targets.toSorted(),
    [...requiredTargets, 'config.yml'].toSorted(),
  );
});

for (const missing of requiredTargets) {
  test(`refresh formatting still fails when required ${missing} is absent`, (t) => {
    const f = fixture(t, { missing });
    const result = f.run();
    assert.equal(result.status, 2, result.stderr);
    assert.ok(result.stderr.includes(`"${missing}"`), result.stderr);
  });
}

test('refresh propagates formatter errors instead of continuing to verification', (t) => {
  const f = fixture(t, { exitCode: 7 });
  const result = f.run();
  assert.equal(result.status, 7, result.stderr);
});
