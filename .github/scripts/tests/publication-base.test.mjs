import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  choosePublicationBase,
  classifyDrift,
  describePublication,
  isAppendOnlyIgnoreDiff,
} from '../publication-base.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const BRANCH = 'agent/issue-7';

function git(cwd, arguments_) {
  return execFileSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    if (content == null) {
      rmSync(target);
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function commit(cwd, files, message) {
  write(cwd, files);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '--quiet', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

// origin holds develop at the verified base; `drift` lands on develop while
// the task runs; the publisher checks out base_sha alone, as the workflow
// does, and applies the verified patch before choosing where to publish it.
function fixture(
  t,
  { drift, patch = { 'client/app.ts': 'export const a = 2;\n' } },
) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-publication-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const author = path.join(root, 'author');
  const publisher = path.join(root, 'publisher');
  const patchFile = path.join(root, 'agent.patch');
  git(root, ['init', '--quiet', '--bare', '--initial-branch=develop', origin]);
  git(root, ['clone', '--quiet', origin, author]);
  git(author, ['config', 'user.name', 'Factory Test']);
  git(author, ['config', 'user.email', 'factory@example.com']);
  commit(
    author,
    {
      '.github/workflows/task.yml': 'name: before\n',
      'client/app.ts': 'export const a = 1;\n',
      'client/other.ts': 'export const b = 1;\n',
      'docs/guide.md': '# Guide\n',
      '.gitignore': 'node_modules/\n',
    },
    'initial',
  );
  // The base commit itself changes a workflow, like 2a5f770 did.
  const base = commit(
    author,
    { '.github/workflows/task.yml': 'name: base\n' },
    'base',
  );
  git(author, ['push', '--quiet', 'origin', 'HEAD:develop']);

  write(author, patch);
  git(author, ['add', '-A']);
  writeFileSync(
    patchFile,
    git(author, ['diff', '--cached', '--binary', '--full-index']) + '\n',
  );
  git(author, ['reset', '--quiet', '--hard', base]);
  const head = drift ? commit(author, drift, 'drift') : base;
  git(author, ['push', '--quiet', 'origin', 'HEAD:develop']);

  mkdirSync(publisher);
  git(publisher, ['init', '--quiet']);
  git(publisher, ['remote', 'add', 'origin', `file://${origin}`]);
  git(publisher, ['fetch', '--quiet', '--depth=1', 'origin', base]);
  git(publisher, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  git(publisher, ['config', 'user.name', 'Factory Test']);
  git(publisher, ['config', 'user.email', 'factory@example.com']);
  execFileSync(
    process.execPath,
    [
      path.join(scripts, 'apply-patch.mjs'),
      '--workspace',
      publisher,
      '--patch',
      patchFile,
      '--branch',
      BRANCH,
    ],
    { stdio: 'pipe' },
  );

  return {
    base,
    head,
    origin,
    publisher,
    choose: (options = {}) =>
      choosePublicationBase({
        workspace: publisher,
        patch: patchFile,
        branch: BRANCH,
        baseRef: 'develop',
        baseSha: base,
        ...options,
      }),
    read: (file) => readFileSync(path.join(publisher, file), 'utf8'),
    push() {
      git(publisher, ['commit', '--quiet', '-m', 'feat: task']);
      // Only the task commit is new to the remote, never the base commit.
      assert.equal(
        git(publisher, [
          'rev-list',
          '--count',
          'HEAD',
          '--not',
          'refs/remotes/origin/develop',
        ]),
        '1',
      );
      git(publisher, [
        'push',
        '--quiet',
        `--force-with-lease=refs/heads/${BRANCH}:`,
        'origin',
        `HEAD:refs/heads/${BRANCH}`,
      ]);
      return git(publisher, ['rev-parse', 'HEAD^']);
    },
  };
}

test('factory-only drift restacks the verified patch onto the branch head', (t) => {
  const f = fixture(t, {
    drift: {
      '.github/workflows/task.yml': 'name: after\n',
      '.github/scripts/new.mjs': 'export {};\n',
      'docs/guide.md': '# Guide v2\n',
      '.gitignore': 'node_modules/\n__pycache__/\n',
    },
  });
  const record = f.choose();
  assert.equal(record.restacked, true);
  assert.equal(record.reason, 'factory-drift');
  assert.equal(record.drift, 4);
  assert.deepEqual(record.verifiedBase, { ref: 'develop', sha: f.base });
  assert.deepEqual(record.publishedBase, { ref: 'develop', sha: f.head });
  assert.equal(git(f.publisher, ['symbolic-ref', '--short', 'HEAD']), BRANCH);
  // Workflow files match the repository; application files match the patch.
  assert.equal(f.read('.github/workflows/task.yml'), 'name: after\n');
  assert.equal(f.read('client/app.ts'), 'export const a = 2;\n');
  assert.deepEqual(
    git(f.publisher, ['diff', '--cached', '--name-only']).split('\n'),
    ['client/app.ts'],
  );
  assert.equal(f.push(), f.head);
  assert.match(describePublication(record), /改基到 `develop @ /);
});

test('application drift keeps the verified base and fetches its ancestry', (t) => {
  const f = fixture(t, {
    drift: {
      '.github/workflows/task.yml': 'name: after\n',
      'client/other.ts': 'export const b = 2;\n',
    },
  });
  const record = f.choose();
  assert.equal(record.restacked, false);
  assert.equal(record.reason, 'application-drift');
  assert.deepEqual(record.paths, ['client/other.ts']);
  assert.deepEqual(record.publishedBase, { ref: 'develop', sha: f.base });
  assert.equal(git(f.publisher, ['rev-parse', 'HEAD']), f.base);
  assert.equal(f.read('client/app.ts'), 'export const a = 2;\n');
  // The push can now see that the remote branch already contains the base.
  git(f.publisher, [
    'merge-base',
    '--is-ancestor',
    f.base,
    'refs/remotes/origin/develop',
  ]);
  assert.equal(f.push(), f.base);
  assert.match(describePublication(record), /未自动改基/);
});

test('drift on a file the patch touches keeps the verified base', (t) => {
  const f = fixture(t, {
    drift: { 'docs/guide.md': '# Guide v2\n' },
    patch: {
      'client/app.ts': 'export const a = 2;\n',
      'docs/guide.md': '# Guide from the task\n',
    },
  });
  const record = f.choose();
  assert.equal(record.restacked, false);
  assert.equal(record.reason, 'patch-overlap');
  assert.deepEqual(record.paths, ['docs/guide.md']);
  assert.equal(git(f.publisher, ['rev-parse', 'HEAD']), f.base);
  assert.equal(f.read('docs/guide.md'), '# Guide from the task\n');
});

test('a restack that does not reproduce the verified tree falls back to the base', (t) => {
  const f = fixture(t, {
    drift: { '.github/workflows/task.yml': 'name: after\n' },
  });
  // A staged change the patch file cannot reproduce stands in for any
  // difference between the verified index and the restacked one.
  write(f.publisher, { 'client/other.ts': 'export const b = 3;\n' });
  git(f.publisher, ['add', 'client/other.ts']);
  const record = f.choose();
  assert.equal(record.restacked, false);
  assert.equal(record.reason, 'tree-mismatch');
  assert.equal(git(f.publisher, ['rev-parse', 'HEAD']), f.base);
  assert.equal(git(f.publisher, ['symbolic-ref', '--short', 'HEAD']), BRANCH);
  assert.equal(f.read('client/app.ts'), 'export const a = 2;\n');
  assert.equal(f.read('.github/workflows/task.yml'), 'name: base\n');
  git(f.publisher, [
    'merge-base',
    '--is-ancestor',
    f.base,
    'refs/remotes/origin/develop',
  ]);
});

test('an unchanged branch head keeps the base', (t) => {
  const f = fixture(t, {});
  const record = f.choose();
  assert.equal(record.reason, 'current');
  assert.equal(record.restacked, false);
  assert.equal(git(f.publisher, ['rev-parse', 'HEAD']), f.base);
});

test('an existing work branch is never moved or fetched', (t) => {
  const f = fixture(t, {
    drift: { '.github/workflows/task.yml': 'name: after\n' },
  });
  // base_ref is the work branch itself for comment builds and later rounds.
  const record = f.choose({ baseRef: BRANCH, remote: 'missing-remote' });
  assert.equal(record.reason, 'existing-work-branch');
  assert.deepEqual(record.publishedBase, { ref: BRANCH, sha: f.base });
  assert.equal(git(f.publisher, ['rev-parse', 'HEAD']), f.base);
  assert.equal(git(f.publisher, ['for-each-ref', 'refs/remotes']), '');
  assert.match(describePublication(record), /已在此基线上验证/);
});

test('drift classification only trusts factory-owned paths', () => {
  const appended =
    '--- a/.gitignore\n+++ b/.gitignore\n@@ -3,0 +4 @@\n+__pycache__/\n';
  assert.equal(isAppendOnlyIgnoreDiff(appended), true);
  assert.equal(isAppendOnlyIgnoreDiff('@@ -1 +0,0 @@\n-dist/\n'), false);
  assert.equal(isAppendOnlyIgnoreDiff('@@ -1,0 +2 @@\n+!/storage/\n'), false);

  const patchPaths = ['client/app.ts'];
  assert.deepEqual(
    classifyDrift({
      drift: ['.github/workflows/a.yml', 'docs/a.md', '.gitignore'],
      patchPaths,
      ignoreDiff: appended,
    }),
    { restack: true, reason: 'factory-drift' },
  );
  for (const file of [
    '.github/scripts/factory-eslint.mjs',
    '.npmrc',
    'README.MD',
    'package.json',
    'pnpm-lock.yaml',
    'eslint.config.js',
    'factory-template.json',
    'server/app.ts',
  ]) {
    assert.equal(
      classifyDrift({ drift: ['.github/workflows/a.yml', file], patchPaths })
        .reason,
      'application-drift',
      file,
    );
  }
  assert.equal(
    classifyDrift({ drift: ['.gitignore'], patchPaths, ignoreDiff: '-dist/\n' })
      .reason,
    'application-drift',
  );
  assert.equal(
    classifyDrift({ drift: ['client/app.ts'], patchPaths }).reason,
    'patch-overlap',
  );
});
