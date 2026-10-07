// A recovery replaces the commit its failed run published on the work branch
// (expected_work_sha). This runs the publication's own "Commit and push task
// branch" script against a real bare remote.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'),
  'utf8',
);
const pushScript = workflow
  .split('- name: Commit and push task branch\n')[1]
  .split('\n      - ')[0]
  .split('run: |\n')[1]
  .replace(/^ {10}/gm, '');
const branch = 'agent/issue-7';

// remote: the work branch at P, the failed run's commit on top of base B.
// workspace: a clone at B with the recovery's staged change (or none).
function fixture(t, { staged }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-recovery-push-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (cwd, ...args) =>
    execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const remote = path.join(root, 'remote.git');
  git(root, 'init', '--bare', '-b', 'develop', remote);
  const seed = path.join(root, 'seed');
  git(root, 'init', '-b', branch, seed);
  git(seed, 'config', 'user.name', 'Test');
  git(seed, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(path.join(seed, 'app.txt'), 'base\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'base');
  const B = git(seed, 'rev-parse', 'HEAD');
  writeFileSync(path.join(seed, 'app.txt'), 'failed change\n');
  git(seed, 'commit', '-am', 'failed run');
  const P = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', `HEAD:refs/heads/${branch}`);
  const workspace = path.join(root, 'workspace');
  git(root, 'clone', '--quiet', remote, workspace);
  git(workspace, 'checkout', '--quiet', B);
  if (staged) {
    writeFileSync(path.join(workspace, 'app.txt'), staged);
    git(workspace, 'add', 'app.txt');
  }
  const runnerTemp = path.join(root, 'runner');
  mkdirSync(runnerTemp);
  const push = (expected) =>
    spawnSync('bash', ['-eo', 'pipefail', '-c', pushScript], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_REF: branch,
        BASE_SHA: B,
        ISSUE_NUMBER: '7',
        WORK_BRANCH: branch,
        EXPECTED_WORK_SHA: expected,
        RUNNER_TEMP: runnerTemp,
        GITHUB_RUN_ID: '901',
        GITHUB_RUN_ATTEMPT: '1',
        FACTORY_DELIVERY_STATUS: 'success',
      },
    });
  const remoteHead = () => git(remote, 'rev-parse', `refs/heads/${branch}`);
  const record = () =>
    JSON.parse(
      readFileSync(
        path.join(runnerTemp, 'publication-record', 'publication.json'),
        'utf8',
      ),
    );
  return { B, P, push, remoteHead, record, git, workspace };
}

test("an empty final diff replaces the failed run's published commit with the base", (t) => {
  const f = fixture(t, { staged: null });
  assert.equal(f.remoteHead(), f.P);
  const run = f.push(f.P);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /replacing the failed run's published commit/);
  // The PR no longer shows the failed, unverified content.
  assert.equal(f.remoteHead(), f.B);
  assert.equal(f.record().commit, f.B);
  // Once the branch is at the base, a second run reuses it.
  const again = f.push(f.P);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /reusing the existing work branch commit/);
  assert.equal(f.remoteHead(), f.B);
});

test('a recovery change replaces the published commit under a lease on it', (t) => {
  const f = fixture(t, { staged: 'repaired change\n' });
  const run = f.push(f.P);
  assert.equal(run.status, 0, run.stderr);
  const head = f.remoteHead();
  assert.notEqual(head, f.P);
  assert.equal(f.git(f.workspace, 'rev-parse', `${head}^`), f.B);
  assert.equal(f.record().commit, head);
});

test('newer work on the branch is never overwritten', (t) => {
  const f = fixture(t, { staged: 'repaired change\n' });
  // The lease names a commit the branch is no longer at.
  const run = f.push(f.B);
  assert.notEqual(run.status, 0);
  assert.equal(f.remoteHead(), f.P);
});
