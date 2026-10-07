import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
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

const scripts = path.resolve(import.meta.dirname, '..');
const workflows = path.resolve(import.meta.dirname, '../../workflows');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// A repository whose main branch holds the template guidance, checked out at
// `checkout` (main, or a work branch that diverged from it).
function repository(t, { workBranchGuidance = null } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-guidance-patch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  mkdirSync(path.join(source, 'client'), { recursive: true });
  git(source, ['init', '--quiet', '--initial-branch=main']);
  git(source, ['config', 'user.name', 'Factory Test']);
  git(source, ['config', 'user.email', 'factory@example.com']);
  writeFileSync(path.join(source, 'AGENTS.md'), 'template agents\n');
  writeFileSync(path.join(source, 'CLAUDE.md'), '@AGENTS.md\n');
  writeFileSync(path.join(source, 'app.ts'), 'export {};\n');
  git(source, ['add', '.']);
  git(source, ['commit', '--quiet', '-m', 'template']);
  if (workBranchGuidance) {
    git(source, ['checkout', '--quiet', '-b', 'agent/issue-1']);
    writeFileSync(path.join(source, 'AGENTS.md'), workBranchGuidance);
    git(source, ['commit', '--quiet', '--allow-empty', '-am', 'earlier build']);
  }
  return {
    source,
    patch: path.join(root, 'bundle', 'agent.patch'),
    summary: path.join(root, 'bundle', 'summary.json'),
  };
}

function createPatch({ source, patch, summary }, extra = []) {
  execFileSync(process.execPath, [
    path.join(scripts, 'create-patch.mjs'),
    '--workspace',
    source,
    '--patch',
    patch,
    '--summary',
    summary,
    '--allow-empty',
    'true',
    ...extra,
  ]);
  return {
    files: JSON.parse(readFileSync(summary, 'utf8')).files.sort(),
    text: readFileSync(patch, 'utf8'),
  };
}

function editEverything(source) {
  writeFileSync(path.join(source, 'AGENTS.md'), 'agent rewrote the rules\n');
  writeFileSync(path.join(source, 'CLAUDE.md'), '@AGENTS.md\nmore\n');
  writeFileSync(path.join(source, 'client', 'AGENTS.md'), 'client notes\n');
  writeFileSync(path.join(source, 'app.ts'), 'export const a = 1;\n');
}

test('by default every root guidance edit is kept, as framework-fix needs', (t) => {
  // framework-fix runs create-patch on nocobase/nocobase3, whose root
  // AGENTS.md is that repository's own rules and may legitimately change.
  const repo = repository(t);
  editEverything(repo.source);
  const { files } = createPatch(repo);
  assert.deepEqual(files, [
    'AGENTS.md',
    'CLAUDE.md',
    'app.ts',
    'client/AGENTS.md',
  ]);
  assert.equal(
    readFileSync(path.join(repo.source, 'AGENTS.md'), 'utf8'),
    'agent rewrote the rules\n',
  );
});

test('a build patch resets the root guidance to its base and keeps nested guidance', (t) => {
  const repo = repository(t);
  editEverything(repo.source);
  writeFileSync(path.join(repo.source, 'AGENTS.override.md'), 'x\n');
  const { files, text } = createPatch(repo, [
    '--protect-template-guidance',
    'true',
  ]);
  assert.deepEqual(files, ['AGENTS.override.md', 'app.ts', 'client/AGENTS.md']);
  assert.equal(
    readFileSync(path.join(repo.source, 'AGENTS.md'), 'utf8'),
    'template agents\n',
  );
  assert.equal(
    readFileSync(path.join(repo.source, 'CLAUDE.md'), 'utf8'),
    '@AGENTS.md\n',
  );
  assert.doesNotMatch(text, /^diff --git a\/AGENTS\.md/m);
  assert.doesNotMatch(text, /^diff --git a\/CLAUDE\.md/m);
});

test('on a work branch that already diverged, the patch carries the target branch text again', (t) => {
  const repo = repository(t, { workBranchGuidance: 'earlier build notes\n' });
  editEverything(repo.source);
  const { files, text } = createPatch(repo, [
    '--protect-template-guidance',
    'true',
    '--guidance-source',
    'main',
  ]);
  // CLAUDE.md is reset to the same text the branch already has: no change.
  assert.deepEqual(files, ['AGENTS.md', 'app.ts', 'client/AGENTS.md']);
  assert.equal(
    readFileSync(path.join(repo.source, 'AGENTS.md'), 'utf8'),
    'template agents\n',
  );
  // The patch, applied on the work branch, turns its text back into the template's.
  assert.match(text, /^-earlier build notes$/m);
  assert.match(text, /^\+template agents$/m);
});

test('the fork point heals a diverged branch without pulling in a later template refresh', (t) => {
  const repo = repository(t, { workBranchGuidance: 'earlier build notes\n' });
  // The target branch moved on: a template refresh rewrote its guidance.
  git(repo.source, ['checkout', '--quiet', 'main']);
  writeFileSync(path.join(repo.source, 'AGENTS.md'), 'refreshed template\n');
  git(repo.source, ['commit', '--quiet', '-am', 'template refresh']);
  git(repo.source, ['checkout', '--quiet', 'agent/issue-1']);
  // What the task workflow passes on an existing work branch.
  const fork = git(repo.source, ['merge-base', 'HEAD', 'main']).trim();
  writeFileSync(path.join(repo.source, 'app.ts'), 'export const c = 3;\n');
  const { files, text } = createPatch(repo, [
    '--protect-template-guidance',
    'true',
    '--guidance-source',
    fork,
  ]);
  assert.deepEqual(files, ['AGENTS.md', 'app.ts']);
  assert.equal(
    readFileSync(path.join(repo.source, 'AGENTS.md'), 'utf8'),
    'template agents\n',
  );
  assert.doesNotMatch(text, /refreshed template/);
});

test('an unchanged work branch keeps an empty patch when the guidance already matches', (t) => {
  const repo = repository(t, { workBranchGuidance: 'template agents\n' });
  const { files } = createPatch(repo, [
    '--protect-template-guidance',
    'true',
    '--guidance-source',
    'main',
  ]);
  assert.deepEqual(files, []);
});

test('guidance missing from the source is not created by the build', (t) => {
  const repo = repository(t);
  git(repo.source, ['rm', '--quiet', 'CLAUDE.md']);
  git(repo.source, ['commit', '--quiet', '-m', 'no CLAUDE.md']);
  writeFileSync(path.join(repo.source, 'CLAUDE.md'), 'agent made this\n');
  writeFileSync(path.join(repo.source, 'app.ts'), 'export const b = 2;\n');
  const { files } = createPatch(repo, ['--protect-template-guidance', 'true']);
  assert.deepEqual(files, ['app.ts']);
  assert.equal(existsSync(path.join(repo.source, 'CLAUDE.md')), false);
});

test('patches that already change the root guidance still pass the publication check', async () => {
  // Work branches and in-flight checkpoints made before the reset must apply.
  const { assertSafeChangedPaths } = await import('../factory-lib.mjs');
  assert.doesNotThrow(() => assertSafeChangedPaths(['AGENTS.md', 'CLAUDE.md']));
});

test('only the build task opts in; framework-fix keeps its repository rules', () => {
  const task = readFileSync(
    path.join(workflows, 'code-agent-task.yml'),
    'utf8',
  );
  const step = task
    .split('- name: Create deterministic patch')[1]
    .split('\n      - name: ')[0];
  assert.match(step, /--protect-template-guidance true/);
  assert.match(step, /--guidance-source "\$guidance_source"/);
  // On a work branch: the fork point from the target, with a visible warning
  // when it cannot be found instead of a silent fallback.
  assert.match(
    step,
    /fork="\$\(git -C workspace merge-base HEAD "refs\/remotes\/origin\/\$\{target\}"/,
  );
  assert.match(step, /guidance_source="\$fork"/);
  assert.equal(step.match(/::warning::/g)?.length, 2);
  const fix = readFileSync(path.join(workflows, 'framework-fix.yml'), 'utf8');
  assert.doesNotMatch(fix, /protect-template-guidance/);
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
