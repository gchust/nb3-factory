import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const task = readFileSync(
  path.join(root, '.github/workflows/code-agent-task.yml'),
  'utf8',
);
const jobOf = (name) => {
  const start = task.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `missing job ${name}`);
  const rest = task.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
const steps = (job) => job.split('\n      - name: ').slice(1);

test('composite actions come from the workflow commit, and every one used exists', () => {
  // The control plane is pinned to the task's control_sha, which an in-flight
  // task recorded before a composite action was added; the workflow's own
  // commit always has the actions its steps reference.
  const used = [
    ...task.matchAll(
      /uses: \.\/factory-actions\/(\.github\/actions\/[\w-]+)\n/g,
    ),
  ].map(([, action]) => action);
  assert.ok(used.length > 0);
  for (const action of new Set(used)) {
    assert.ok(existsSync(path.join(root, action, 'action.yml')), action);
  }
  for (const name of [
    'prepare',
    'agent',
    'verify-final',
    'publish',
    'publish-failed',
    'preview-build-failed',
  ]) {
    const job = jobOf(name);
    if (name === 'publish-failed') {
      assert.match(job, /steps: \*publication-steps/);
      continue;
    }
    const list = steps(job);
    const checkout = list.findIndex((step) =>
      step.startsWith("Check out the workflow's composite actions\n"),
    );
    const use = list.findIndex((step) =>
      /\n {8}uses: \.\/factory-actions\//.test(step),
    );
    assert.ok(checkout >= 0 && use > checkout, name);
    assert.match(list[checkout], /ref: \$\{\{ github\.sha \}\}/, name);
    assert.match(list[checkout], /path: factory-actions\n/, name);
    assert.match(
      list[checkout],
      /sparse-checkout: \|\n\s+\/\.github\/actions\/\n/,
      name,
    );
    assert.match(list[checkout], /persist-credentials: false/, name);
  }
});

test('only the publication job keeps the checkout token for its push', () => {
  const persisting = (job) =>
    /uses: \.\/factory-actions\/\.github\/actions\/apply-task-patch\n(?: {8,}.*\n)*? {10}persist-credentials: 'true'\n/.test(
      job,
    );
  assert.equal(persisting(jobOf('publish')), true);
  assert.equal(persisting(jobOf('verify-final')), false);
  assert.equal(persisting(jobOf('preview-build-failed')), false);
  const action = readFileSync(
    path.join(root, '.github/actions/apply-task-patch/action.yml'),
    'utf8',
  );
  assert.match(
    action,
    /persist-credentials:\n(?: {4}.*\n)*? {4}default: 'false'\n/,
  );
  assert.match(
    action,
    /persist-credentials: \$\{\{ inputs\.persist-credentials \}\}/,
  );
  // The apply script is the pinned control plane's, not the workflow commit's.
  assert.match(action, /node control\/\.github\/scripts\/apply-patch\.mjs/);
  assert.doesNotMatch(action, /\$\{\{ inputs\.[\w-]+ \}\}"?\s*\\$/m);
  assert.match(action, /WORK_BRANCH: \$\{\{ inputs\.work-branch \}\}/);
});
