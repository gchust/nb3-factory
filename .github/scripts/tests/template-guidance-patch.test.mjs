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

const scripts = path.resolve(import.meta.dirname, '..');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

test('a build patch drops edits to the template-owned root guidance but keeps nested guidance', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-guidance-patch-'));
  const source = path.join(root, 'source');
  const patch = path.join(root, 'bundle', 'agent.patch');
  const summary = path.join(root, 'bundle', 'summary.json');
  try {
    mkdirSync(path.join(source, 'client'), { recursive: true });
    git(source, ['init', '--quiet', '--initial-branch=main']);
    git(source, ['config', 'user.name', 'Factory Test']);
    git(source, ['config', 'user.email', 'factory@example.com']);
    writeFileSync(path.join(source, 'AGENTS.md'), 'template agents\n');
    writeFileSync(path.join(source, 'CLAUDE.md'), '@AGENTS.md\n');
    writeFileSync(path.join(source, 'app.ts'), 'export {};\n');
    git(source, ['add', '.']);
    git(source, ['commit', '--quiet', '-m', 'initial']);

    writeFileSync(path.join(source, 'AGENTS.md'), 'template agents\nnotes\n');
    writeFileSync(path.join(source, 'CLAUDE.md'), '@AGENTS.md\nmore\n');
    writeFileSync(path.join(source, 'client', 'AGENTS.md'), 'client notes\n');
    writeFileSync(path.join(source, 'app.ts'), 'export const a = 1;\n');

    execFileSync(process.execPath, [
      path.join(scripts, 'create-patch.mjs'),
      '--workspace',
      source,
      '--patch',
      patch,
      '--summary',
      summary,
    ]);

    assert.equal(
      readFileSync(path.join(source, 'AGENTS.md'), 'utf8'),
      'template agents\n',
    );
    assert.equal(
      readFileSync(path.join(source, 'CLAUDE.md'), 'utf8'),
      '@AGENTS.md\n',
    );
    const { files } = JSON.parse(readFileSync(summary, 'utf8'));
    assert.deepEqual(files.sort(), ['app.ts', 'client/AGENTS.md']);
    const text = readFileSync(patch, 'utf8');
    assert.match(text, /client\/AGENTS\.md/);
    assert.doesNotMatch(text, /^diff --git a\/AGENTS\.md/m);
    assert.doesNotMatch(text, /^diff --git a\/CLAUDE\.md/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('patches that already change the root guidance still pass the publication check', async () => {
  // Work branches and in-flight checkpoints made before the restore must apply.
  const { assertSafeChangedPaths } = await import('../factory-lib.mjs');
  assert.doesNotThrow(() => assertSafeChangedPaths(['AGENTS.md', 'CLAUDE.md']));
});

test('build prompts send application notes to nested guidance files', () => {
  for (const name of ['implement.md', 'repair.md']) {
    const text = readFileSync(
      path.resolve(import.meta.dirname, '../../prompts', name),
      'utf8',
    );
    assert.match(text, /client\/AGENTS\.md/, name);
    assert.match(text, /CLAUDE\.md/, name);
  }
});
