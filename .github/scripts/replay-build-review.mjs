// Review a sealed historical application without rebuilding it or changing its PR.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from './factory-lib.mjs';
import { digest, readReviewJson, resolveReviewIdentity, reviewArtifactHash, validateBuildReview } from './build-review.mjs';
import { runBuildReview } from './run-build-review.mjs';
import { collectUsage } from './task-usage.mjs';

const positive = n => Number.isSafeInteger(n) && n > 0;
const sha = s => /^[a-f0-9]{40}$/.test(s ?? '');
const write = (root, file, data) => { mkdirSync(root, { recursive: true }); writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n'); };
const out = (name, value) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);

export function parseReplayRequest(event, inputs) {
  if (event.comment) {
    if (event.comment.user?.login !== event.repository?.owner?.login || event.issue?.pull_request ||
        !event.issue?.labels?.some(label => (typeof label === 'string' ? label : label.name) === 'factory:manual')) return null;
    const match = /^\/factory-build-review ([1-9]\d*) ([1-9]\d*) ([1-9]\d*)\s*$/.exec(event.comment.body ?? '');
    if (!match) return null;
    inputs = { issue: match[1], run: match[2], attempt: match[3] };
  }
  const result = { issue: Number(inputs.issue), runId: Number(inputs.run), attempt: Number(inputs.attempt) };
  assert.ok(Object.values(result).every(positive), 'Explicit Issue, task run and publication attempt required');
  return result;
}
async function all(client, route, key) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const response = await client.request('GET', route, { query: { per_page: 100, page } });
    assert.ok(Array.isArray(response[key])); rows.push(...response[key]);
    if (response[key].length < 100) return rows;
  }
  throw new Error('Pagination limit reached');
}
export async function selectReplay(client, request) {
  const run = await client.request('GET', `/actions/runs/${request.runId}/attempts/${request.attempt}`);
  assert.equal(run.status, 'completed'); assert.equal(run.path, '.github/workflows/code-agent-task.yml');
  assert.equal(run.head_repository?.full_name, client.repository);
  assert.equal(run.id, request.runId); assert.equal(run.run_attempt, request.attempt);
  assert.equal(Number(/^Factory issue #([1-9]\d*)\b/.exec(run.display_title ?? '')?.[1]), request.issue);
  const artifacts = await all(client, `/actions/runs/${request.runId}/artifacts`, 'artifacts');
  const matches = artifacts.filter(a => a.name === `factory-agent-${request.issue}` && !a.expired &&
    a.workflow_run?.id === run.id && a.workflow_run?.head_sha === run.head_sha && Date.parse(a.created_at) <= Date.parse(run.updated_at));
  assert.equal(matches.length, 1, 'An unambiguous retained source artifact is required');
  return { version: 1, repository: client.repository, ...request, controlSha: run.head_sha, artifact: matches[0] };
}
export function bindReplay(selected, metadata, original, patch, jobs) {
  assert.equal(metadata.repository, selected.repository); assert.equal(metadata.issue?.number, selected.issue);
  assert.equal(Number(metadata.run?.id), selected.runId);
  const attempt = Number(metadata.run?.attempt);
  assert.ok(positive(attempt) && attempt <= selected.attempt, 'Producer cannot be from a future attempt');
  assert.ok(sha(metadata.controlSha) && sha(metadata.applicationBase?.sha));
  assert.equal(metadata.controlSha, selected.controlSha);
  const created = Date.parse(selected.artifact.created_at);
  assert.ok(jobs.some(job => job.name === 'agent' && job.conclusion === 'success' &&
    created >= Date.parse(job.started_at) && created <= Date.parse(job.completed_at)), 'Artifact was not produced by the claimed source job');
  const source = { repository: selected.repository, issue: selected.issue, runId: selected.runId, attempt,
    publicationAttempt: selected.attempt, controlSha: metadata.controlSha, baseSha: metadata.applicationBase.sha,
    patchHash: digest(patch), artifactId: selected.artifact.id, artifactDigest: selected.artifact.digest ?? null };
  if (original?.basis?.patchHash) assert.equal(original.basis.patchHash, source.patchHash);
  return source;
}

// Supplement download is independently bound to an actual same-repo review job.
// It may be called by that workflow's downstream reusable publication job while
// the overall workflow is still running, so check the completed review job.
export async function selectSupplement(get, repository, runId, artifactId) {
  assert.ok(positive(runId) && positive(artifactId));
  const run = await get(`/actions/runs/${runId}`);
  assert.equal(run.path, '.github/workflows/replay-build-review.yml');
  assert.equal(run.head_repository?.full_name, repository);
  const artifact = await get(`/actions/artifacts/${artifactId}`);
  assert.equal(artifact.workflow_run?.id, runId); assert.ok(!artifact.expired);
  assert.equal(artifact.name, `factory-build-review-${runId}-${run.run_attempt}`);
  const jobs = await get(`/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`);
  const created = Date.parse(artifact.created_at);
  assert.ok(jobs.jobs.some(j => j.name === 'review' && j.status === 'completed' &&
    created >= Date.parse(j.started_at) && created <= Date.parse(j.completed_at)), 'Supplement not bound to a finished review job');
  // When the review produced this result, from the Actions API: orders reassessments
  // (a re-exported older review never replaces a newer one) without trusting the review.
  return { runId, attempt: run.run_attempt, artifactId, controlSha: run.head_sha, reviewedAt: new Date(created).toISOString() };
}
export async function adoptSupplement(root, supplement, publication) {
  const binding = readReviewJson(supplement, 'binding.json');
  const report = readReviewJson(supplement, 'build-review.json');
  const source = publication.reviewSource;
  assert.ok(source, 'Supplement must first be selected through the Actions API');
  assert.equal(Number(report.reviewer?.runId), source.runId);
  assert.equal(Number(report.reviewer?.attempt), source.attempt);
  assert.equal(report.reviewer?.controlSha, source.controlSha);
  assert.equal(binding.repository, publication.repository); assert.equal(binding.issue, publication.issue);
  assert.equal(binding.runId, publication.runId); assert.equal(binding.publicationAttempt, publication.attempt);
  assert.equal(binding.artifactId, publication.artifactId);
  assert.equal(binding.patchHash, digest(readFileSync(path.join(root, 'agent.patch'))));
  assert.equal(report.basis.artifactHash, reviewArtifactHash(root));
  validateBuildReview(report, resolveReviewIdentity(root, report, publication));
  const usage = await collectUsage(supplement);
  report.supplementalUsage = { ...usage.phases.review, records: usage.records, incomplete: usage.incomplete,
    runId: source.runId, attempt: source.attempt, reviewedAt: source.reviewedAt ?? null };
  // Retain the original failed/timed-out assessment separately, never forge its attempt.
  write(root, 'build-review.supplement.json', report);
}

async function main() {
  const [mode, ...argv] = process.argv.slice(2);
  assert.equal(argv.length % 2, 0);
  const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2].replace(/^--/, ''), argv[i * 2 + 1]]));
  if (mode === 'run') {
    const source = readReviewJson(args.input, 'binding.json');
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: args.workspace, encoding: 'utf8' }).trim(), source.baseSha);
    const artifacts = path.join(args.input, 'agent');
    // A rejected replay must not copy the previous review's invocation as this run.
    for (const name of ['agent-review.jsonl', 'agent-review.jsonl.result.json', 'agent-review.jsonl.prompt.md', 'agent-review.jsonl.invocation.json', 'build-review-input.json', 'build-review-files.json'])
      rmSync(path.join(artifacts, name), { force: true });
    const result = await runBuildReview(args.workspace, artifacts, process.env, { source });
    mkdirSync(args.output, { recursive: true });
    for (const name of ['build-review.json', 'build-review-input.json', 'build-review-files.json', 'agent-review.jsonl', 'agent-review.jsonl.result.json', 'agent-review.jsonl.prompt.md', 'agent-review.jsonl.invocation.json'])
      if (existsSync(path.join(artifacts, name))) copyFileSync(path.join(artifacts, name), path.join(args.output, name));
    write(args.output, 'binding.json', source);
    console.log(`Review ${result.state}: ${result.evaluation?.modules.length ?? 0} modules. ${result.reason}`);
    if (!['completed', 'partial'].includes(result.state)) process.exitCode = 1;
    return;
  }
  const client = new GitHubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
  if (mode === 'select') {
    out('ready', 'false');
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const request = parseReplayRequest(event, args);
    if (!request) return;
    const selected = await selectReplay(client, request);
    write(args.output, 'selected.json', selected);
    out('source_run', selected.runId); out('artifact', selected.artifact.id); out('ready', 'true');
  } else if (mode === 'bind') {
    const selected = readReviewJson(args.input, 'selected.json');
    const metadata = readReviewJson(path.join(args.input, 'agent'), 'task-metadata.json');
    const jobs = await all(client, `/actions/runs/${selected.runId}/attempts/${metadata.run.attempt}/jobs`, 'jobs');
    const root = path.join(args.input, 'agent');
    const original = existsSync(path.join(root, 'build-review.json')) ? readReviewJson(root, 'build-review.json') : null;
    const source = bindReplay(selected, metadata, original, readFileSync(path.join(root, 'agent.patch')), jobs);
    write(args.input, 'binding.json', source);
    out('base_sha', source.baseSha); out('issue', source.issue); out('run_id', source.runId); out('attempt', source.publicationAttempt);
  } else throw new Error('Expected select / bind / run');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
