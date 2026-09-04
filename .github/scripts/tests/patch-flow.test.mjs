import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');

test('patch flow preserves new and modified files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-patch-'));
  const source = path.join(root, 'source');
  const publisher = path.join(root, 'publisher');
  const patch = path.join(root, 'bundle', 'pi.patch');
  const summary = path.join(root, 'bundle', 'summary.json');

  try {
    mkdirSync(source);
    git(source, ['init', '--initial-branch=main']);
    git(source, ['config', 'user.name', 'Factory Test']);
    git(source, ['config', 'user.email', 'factory@example.com']);
    writeFileSync(path.join(source, 'existing.txt'), 'before\n');
    git(source, ['add', '.']);
    git(source, ['commit', '-m', 'initial']);

    execFileSync('git', ['clone', '--quiet', source, publisher]);
    writeFileSync(path.join(source, 'existing.txt'), 'after\n');
    writeFileSync(path.join(source, 'new.txt'), 'new\n');

    execFileSync(
      process.execPath,
      [
        path.join(scripts, 'create-patch.mjs'),
        '--workspace',
        source,
        '--patch',
        patch,
        '--summary',
        summary,
      ],
      { stdio: 'pipe' },
    );
    execFileSync(
      process.execPath,
      [
        path.join(scripts, 'apply-patch.mjs'),
        '--workspace',
        publisher,
        '--patch',
        patch,
        '--branch',
        'pi/issue-1',
      ],
      { stdio: 'pipe' },
    );

    assert.equal(
      readFileSync(path.join(publisher, 'existing.txt'), 'utf8'),
      'after\n',
    );
    assert.equal(
      readFileSync(path.join(publisher, 'new.txt'), 'utf8'),
      'new\n',
    );
    assert.deepEqual(JSON.parse(readFileSync(summary, 'utf8')).counts, {
      added: 1,
      modified: 1,
      deleted: 0,
      renamed: 0,
      files: 2,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}
