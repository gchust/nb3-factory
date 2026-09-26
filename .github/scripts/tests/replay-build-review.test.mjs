import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adoptSupplement, bindReplay, parseReplayRequest, selectReplay, selectSupplement } from '../replay-build-review.mjs';
import { digest, reviewArtifactHash } from '../build-review.mjs';

const sha = 'a'.repeat(40);
const artifact = { id: 42, name: 'factory-agent-224', digest: 'sha256:' + 'b'.repeat(64), created_at: '2026-09-23T10:04:00Z', workflow_run: { id: 100, head_sha: sha } };
const selected = { repository: 'owner/factory', issue: 224, runId: 100, attempt: 2, controlSha: sha, artifact };
const metadata = { repository: 'owner/factory', issue: { number: 224 }, run: { id: 100, attempt: 1 }, controlSha: sha, applicationBase: { sha }, task: { reviewCriteria: 'R01. Review code' } };
const jobs = [{ name: 'agent', conclusion: 'success', started_at: '2026-09-23T10:00:00Z', completed_at: '2026-09-23T10:05:00Z' }];
const patch = 'retained patch';
const origin = () => bindReplay(selected, metadata, null, Buffer.from(patch), jobs);

test('review-only command is exact, owner-authorized and excluded from business issues', () => {
  const event = { repository: { owner: { login: 'owner' } }, issue: { labels: [{ name: 'factory:manual' }] }, comment: { user: { login: 'owner' }, body: '/factory-build-review 224 100 2' } };
  assert.deepEqual(parseReplayRequest(event, {}), { issue: 224, runId: 100, attempt: 2 });
  assert.equal(parseReplayRequest({ ...event, issue: { labels: [] } }, {}), null);
  assert.equal(parseReplayRequest({ ...event, comment: { ...event.comment, body: '/factory-build-review 224 100 2\nextra' } }, {}), null);
  assert.equal(parseReplayRequest({ ...event, comment: { ...event.comment, user: { login: 'other' } } }, {}), null);
});

test('publication attempt differs from artifact producer; source identity is not rewritten', () => {
  const source = origin();
  assert.equal(source.attempt, 1); assert.equal(source.publicationAttempt, 2); assert.equal(source.artifactId, 42);
  for (const changed of [{ run: { id: 101, attempt: 1 } }, { run: { id: 100, attempt: 3 } }, { controlSha: 'c'.repeat(40) }])
    assert.throws(() => bindReplay(selected, { ...metadata, ...changed }, null, patch, jobs));
  assert.throws(() => bindReplay(selected, metadata, null, patch, []), /claimed source job/);
  assert.throws(() => bindReplay(selected, metadata, { basis: { patchHash: 'x' } }, patch, jobs));
});

test('source selection uses immutable artifact ID and exact completed task attempt', async () => {
  const run = { id: 100, run_attempt: 2, status: 'completed', path: '.github/workflows/code-agent-task.yml', head_repository: { full_name: 'owner/factory' }, head_sha: sha, display_title: 'Factory issue #224 build 0 from 0', updated_at: '2026-09-23T11:00:00Z' };
  let artifacts = [artifact];
  const client = { repository: 'owner/factory', request: async (method, route) => route.endsWith('/artifacts') ? { artifacts } : run };
  assert.equal((await selectReplay(client, { issue: 224, runId: 100, attempt: 2 })).artifact.id, 42);
  artifacts = [artifact, { ...artifact, id: 43 }];
  await assert.rejects(selectReplay(client, { issue: 224, runId: 100, attempt: 2 }), /unambiguous/);
});

test('supplement must originate in a completed review job, not merely a matching filename', async () => {
  const responses = {
    '/actions/runs/200': { path: '.github/workflows/replay-build-review.yml', head_repository: { full_name: 'owner/factory' }, head_sha: sha, run_attempt: 1 },
    '/actions/artifacts/84': { name: 'factory-build-review-200-1', workflow_run: { id: 200 }, created_at: artifact.created_at },
    '/actions/runs/200/attempts/1/jobs?per_page=100': { jobs: [{ ...jobs[0], name: 'review', status: 'completed' }] },
  };
  const get = async route => responses[route];
  const selected = await selectSupplement(get, 'owner/factory', 200, 84);
  assert.equal(selected.artifactId, 84);
  assert.equal(selected.reviewedAt, new Date(artifact.created_at).toISOString(), 'review order comes from the Actions API, not the review');
  responses['/actions/runs/200'].path = '.github/workflows/other.yml';
  await assert.rejects(selectSupplement(get, 'owner/factory', 200, 84));
});

test('supplement adoption binds producer, immutable source artifact, patch, QA and reviewer run', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'review-replay-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'root'), supplement = path.join(dir, 'supplement'); mkdirSync(root); mkdirSync(supplement);
  const put = (folder, file, data) => writeFileSync(path.join(folder, file), typeof data === 'string' ? data : JSON.stringify(data));
  put(root, 'task-metadata.json', metadata); put(root, 'agent.patch', patch);
  const binding = origin(); put(supplement, 'binding.json', binding);
  const report = { version: 1, state: 'failed', reason: 'Retained honest failure', evaluation: null,
    basis: { ...binding, reviewCriteriaHash: digest(metadata.task.reviewCriteria), artifactHash: reviewArtifactHash(root) },
    reviewer: { runId: '200', attempt: 1, controlSha: sha } };
  put(supplement, 'build-review.json', report);
  const publication = { repository: 'owner/factory', issue: 224, runId: 100, attempt: 2, artifactId: 42,
    reviewSource: { runId: 200, attempt: 1, artifactId: 84, controlSha: sha, reviewedAt: '2026-09-23T10:04:00.000Z' } };
  put(supplement, 'agent-review.jsonl.invocation.json', { invoked: true, phase: 'review', configuration: { fingerprint: 'a'.repeat(64), values: { CONFIG_SCHEMA_VERSION: '2', CODE_AGENT_ENGINE: 'codex' } } });
  await adoptSupplement(root, supplement, publication);
  const adopted = JSON.parse(readFileSync(path.join(root, 'build-review.supplement.json')));
  assert.equal(adopted.basis.attempt, 1);
  assert.deepEqual(adopted.supplementalConfiguration, { complete: true, fingerprints: ['a'.repeat(64)] });
  assert.equal(adopted.supplementalUsage.reviewedAt, '2026-09-23T10:04:00.000Z');
  await assert.rejects(adoptSupplement(root, supplement, { ...publication, artifactId: 99 }));
  put(root, 'agent.patch', 'wrong patch'); await assert.rejects(adoptSupplement(root, supplement, publication));
});

test('review-only workflow reconstructs a sealed candidate and delegates publication, with no build/repair commands', () => {
  const workflow = readFileSync(new URL('../../workflows/replay-build-review.yml', import.meta.url), 'utf8');
  assert.match(workflow, /git -C workspace apply --index/);
  assert.match(workflow, /--frozen-lockfile --ignore-scripts/);
  assert.doesNotMatch(workflow, /pnpm (?:build|migrate|seed)|verify-and-repair|publish-pr\.mjs/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/report-task-usage.yml/);
  assert.match(workflow, /merge-multiple: true/);
});
