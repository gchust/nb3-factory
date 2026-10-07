import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { isNotFoundError, selectDistArtifact } from '../preview-host.mjs';

const repository = 'gchust/nb3-factory';
const run = (overrides = {}) => ({
  path: '.github/workflows/code-agent-task.yml',
  head_repository: { full_name: repository },
  event: 'issues',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 2,
  ...overrides,
});
const window = (start, end) => ({ started_at: start, completed_at: end });
const delivered = (
  verify = window('2026-10-06T11:00:00Z', '2026-10-06T11:30:00Z'),
) => [
  { name: 'agent', conclusion: 'success' },
  { name: 'verify-final', conclusion: 'success', ...verify },
  { name: 'publish', conclusion: 'success' },
];
const dist = (id, created_at, extra = {}) => ({
  name: 'factory-dist-7',
  expired: false,
  id,
  created_at,
  ...extra,
});

test('a delivered build keeps its preview when a later reply job fails the run', () => {
  const artifact = dist(5, '2026-10-06T11:20:00Z');
  assert.equal(
    selectDistArtifact(
      run({ conclusion: 'failure' }),
      [...delivered(), { name: 'reply', conclusion: 'failure' }],
      [artifact],
      repository,
    ),
    artifact,
  );
});

test("only the selected attempt's packaging job upload is chosen", () => {
  // Attempt 1's verify-final uploaded one; attempt 2's re-run uploaded another.
  const earlier = dist(4, '2026-10-06T10:20:00Z');
  const current = dist(5, '2026-10-06T11:20:00Z');
  assert.equal(
    selectDistArtifact(run(), delivered(), [earlier, current], repository),
    current,
  );
  // Failed work packaged by preview-build-failed is selected the same way.
  const failedJobs = [
    { name: 'publish-failed', conclusion: 'success' },
    {
      name: 'preview-build-failed',
      conclusion: 'success',
      ...window('2026-10-06T11:00:00Z', '2026-10-06T11:30:00Z'),
    },
  ];
  assert.equal(
    selectDistArtifact(
      run({ conclusion: 'failure' }),
      failedJobs,
      [earlier, current],
      repository,
    ),
    current,
  );
  // An expired upload from this attempt is not a candidate.
  assert.throws(() =>
    selectDistArtifact(
      run(),
      delivered(),
      [earlier, { ...current, expired: true }],
      repository,
    ),
  );
});

test('without a producing job window nothing ties an upload to the attempt', () => {
  const artifact = dist(5, '2026-10-06T11:20:00Z');
  assert.throws(
    () =>
      selectDistArtifact(
        run(),
        delivered({ started_at: null, completed_at: null }),
        [artifact],
        repository,
      ),
    /Expected one unexpired deployable build artifact/,
  );
});

test('a 404 from the repository API client is recognised', () => {
  assert.equal(
    isNotFoundError(
      new Error(
        'GitHub API GET /pulls/5 failed (404): {"message":"Not Found"}',
      ),
    ),
    true,
  );
  // The bare wrapper's old text still counts.
  assert.equal(isNotFoundError(new Error('GitHub GET failed (404)')), true);
  assert.equal(
    isNotFoundError(new Error('GitHub API GET /pulls/5 failed (502): bad')),
    false,
  );
  assert.equal(isNotFoundError(undefined), false);
});

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '../../workflows/deploy-preview.yml'),
  'utf8',
);
const job = (name) =>
  workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];

test('deploy-preview waits for the source run outside the preview lock', () => {
  const wait = job('wait-for-source');
  assert.doesNotMatch(wait, /concurrency:/);
  assert.match(wait, /wait-for-task-run\.mjs/);
  assert.match(wait, /attempt: \$\{\{ steps\.wait\.outputs\.attempt \}\}/);
  const deploy = job('deploy-preview');
  assert.match(deploy, /needs: \[dispatch-gate, wait-for-source\]/);
  assert.match(deploy, /needs\.wait-for-source\.result == 'success'/);
  assert.match(deploy, /group: factory-preview-deploy/);
  assert.match(
    deploy,
    /SOURCE_ATTEMPT: \$\{\{ needs\.wait-for-source\.outputs\.attempt \|\| /,
  );
  // Same trigger condition on both jobs.
  const conclusions =
    /contains\(fromJSON\('\[[^\]]+\]'\), github\.event\.workflow_run\.conclusion\)/;
  assert.equal(conclusions.exec(wait)?.[0], conclusions.exec(deploy)?.[0]);
  // The job limit covers its bounded steps with room for the rest.
  const limit = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(deploy)[1]);
  const steps = [...deploy.matchAll(/^ {8}timeout-minutes: (\d+)$/gm)].map(
    ([, minutes]) => Number(minutes),
  );
  assert.ok(
    limit >= steps.reduce((a, b) => a + b, 0) + 15,
    `${limit} vs ${steps}`,
  );
});

test('the deployable build is downloaded by the ID select chose', () => {
  const download = job('deploy-preview')
    .split('- name: Download the deployable build')[1]
    .split('\n      - ')[0];
  assert.match(
    download,
    /artifact-ids: \$\{\{ steps\.source\.outputs\.artifact_id \}\}/,
  );
  assert.doesNotMatch(download, /\n\s+name: /);
  const script = readFileSync(
    path.resolve(import.meta.dirname, '../deploy-preview.mjs'),
    'utf8',
  );
  assert.match(script, /output\('artifact_id', String\(artifact\.id\)\)/);
  assert.match(script, /const api = repositoryApi\(\);/);
  assert.doesNotMatch(script, /await fetch\(/);
});
