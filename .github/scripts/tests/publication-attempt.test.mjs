import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { publicationAttempt, publishedBy } from '../publication-attempt.mjs';

const published = [{ name: 'publish', conclusion: 'success' }];
const failedPublished = [{ name: 'publish-failed', conclusion: 'success' }];
const rejected = [
  { name: 'agent', conclusion: 'failure' },
  { name: 'publish', conclusion: 'skipped' },
];
const runWith = (attempts) => (attempt) => Promise.resolve(attempts[attempt]);

test('publication means a successful publish or publish-failed job', () => {
  assert.equal(publishedBy(published), true);
  assert.equal(publishedBy(failedPublished), true);
  assert.equal(publishedBy(rejected), false);
});

test('a rejected later attempt does not supersede the attempt that published', async () => {
  const listJobs = runWith({ 1: failedPublished, 2: rejected });
  // Named explicitly, as a replay or the task's own dispatch does.
  assert.deepEqual(await publicationAttempt(listJobs, 1, 2), {
    attempt: 1,
    jobs: failedPublished,
  });
  // Without an attempt the latest is selected; it published nothing, so the
  // earlier publication is used.
  assert.deepEqual(await publicationAttempt(listJobs, 2, 2), {
    attempt: 1,
    jobs: failedPublished,
  });
});

test('a later attempt that published supersedes an earlier one', async () => {
  const listJobs = runWith({ 1: failedPublished, 2: published });
  assert.deepEqual(await publicationAttempt(listJobs, 1, 2), { superseded: 2 });
  assert.deepEqual(await publicationAttempt(listJobs, 2, 2), {
    attempt: 2,
    jobs: published,
  });
});

test('when no attempt published, the selected attempt is kept and selects nothing', async () => {
  const listJobs = runWith({ 1: rejected, 2: rejected });
  assert.deepEqual(await publicationAttempt(listJobs, 2, 2), {
    attempt: 2,
    jobs: rejected,
  });
});

test('preview and media selection both go through the shared rule', () => {
  for (const name of ['deploy-preview.mjs', 'publish-visual-report.mjs']) {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '..', name),
      'utf8',
    );
    assert.match(source, /publicationAttempt\(/, name);
    assert.doesNotMatch(
      source,
      /latest\.run_attempt !== run\.run_attempt/,
      name,
    );
  }
});
