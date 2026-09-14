import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (name) =>
  readFileSync(
    path.resolve(import.meta.dirname, '..', '..', 'workflows', name),
    'utf8',
  );

const deploy = read('deploy-preview.yml');
const teardown = read('preview-teardown.yml');
const task = read('code-agent-task.yml');

test('the preview deploy follows a completed task run and can be replayed', () => {
  assert.match(
    deploy,
    /workflow_run:\n\s+workflows: \[Code Agent NocoBase Task\]\n\s+types: \[completed\]/,
  );
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /--status/);
});

test('the preview deploy never builds or runs application code on the runner', () => {
  // The artifact is produced by verify-final and is data here. A deploy job
  // that built or executed it would be running unverified code in CI.
  assert.doesNotMatch(deploy, /pnpm|npm install|npm ci|node \.\/dist/);
});

test('the preview deploy trusts neither the run head nor the pull request head', () => {
  // The deployed commit is the pull request head that matchesTaskPR has already
  // tied to the agent-head-sha marker; taking either of these instead would let
  // a mutated ref decide what gets deployed.
  assert.doesNotMatch(deploy, /workflow_run\.head_sha/);
  assert.doesNotMatch(deploy, /pull_request\.head\.sha/);
  assert.match(deploy, /--sha '\$SHA'/);
});

test('the preview deploy checks out only the default branch', () => {
  assert.match(
    deploy,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.match(deploy, /persist-credentials: false/);
  assert.doesNotMatch(deploy, /ref: \$\{\{ github\.event\.workflow_run\.head/);
});

test('a failed preview does not fail the pipeline and is reported, not hidden', () => {
  const publish = deploy.slice(
    deploy.indexOf('Report the preview on the pull request'),
  );
  assert.match(publish, /continue-on-error: true/);
  assert.match(publish, /--status "[^"]*success[^"]*failed[^"]*"/);
});

test('the preview deploy stays inert without credentials', () => {
  assert.match(deploy, /PREVIEW_ENABLED:/);
  assert.match(deploy, /secrets\.FACTORY_PREVIEW_SSH_KEY != ''/);
  assert.match(deploy, /PREVIEW SKIPPED/);
});

test('preview teardown runs on pull_request_target, not pull_request', () => {
  // Only pull_request_target has secrets for a fork-originated pull request.
  assert.match(teardown, /pull_request_target:\n\s+types: \[closed\]/);
  assert.doesNotMatch(teardown, /^\s{2}pull_request:/m);
  assert.match(
    teardown,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
});

test('preview teardown runs no application code', () => {
  assert.doesNotMatch(teardown, /pnpm|npm install|npm ci/);
  assert.doesNotMatch(teardown, /persist-credentials: true/);
});

test('preview workflows keep every run step a block scalar', () => {
  // An inline `run:` scalar containing ": " is parsed as a nested mapping, and
  // the workflow is rejected before it ever runs — which is a mistake that
  // reads as correct in review. Every command here is written as a block.
  for (const [name, workflow] of [
    ['deploy-preview.yml', deploy],
    ['preview-teardown.yml', teardown],
  ]) {
    assert.doesNotMatch(
      workflow,
      /^[ \t]+run: (?![|])/m,
      `${name} has an inline run step; use a block scalar`,
    );
  }
});

test('the deployable build is produced by independent verification', () => {
  const verified = task.indexOf('Independently verify the applied patch');
  const packed = task.indexOf('Pack the deployable build for the preview host');
  const uploaded = task.indexOf(
    'factory-dist-${{ needs.prepare.outputs.issue_number }}',
  );
  assert.ok(verified > 0, 'verification step not found');
  assert.ok(packed > verified, 'the build must be packed after verification');
  assert.ok(uploaded > packed, 'the build must be uploaded after it is packed');
  // Stated explicitly: without a target the build records the runner itself and
  // ships native modules for whatever architecture the runner happens to be.
  assert.match(task, /pnpm build --tar --target linux-x64/);
});
