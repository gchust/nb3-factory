// Archive an existing review replay; never invoke a model or rebuild an application.
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from './factory-lib.mjs';
import { packHistory, selectHistoryFiles } from './agent-history.mjs';

const positive = n => Number.isSafeInteger(n) && n > 0;
const write = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2)); };
const out = (key, value) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
export function historyRequest(event, env) {
  if (event.comment) {
    if (event.comment.user?.login !== event.repository?.owner?.login || event.issue?.pull_request ||
        !event.issue?.labels?.some(l => (typeof l === 'string' ? l : l.name) === 'factory:manual')) return null;
    const match = /^\/factory-review-history ([1-9]\d*) ([1-9]\d*)\s*$/u.exec(event.comment.body ?? '');
    if (!match) return null;
    return { runId: Number(match[1]), attempt: Number(match[2]) };
  }
  return { runId: Number(env.SOURCE_RUN_ID || event.workflow_run?.id),
    attempt: Number(env.SOURCE_ATTEMPT || event.workflow_run?.run_attempt) };
}
export function selectReplayHistory(run, jobs, artifacts, repository, request) {
  assert.ok(positive(request.runId) && positive(request.attempt));
  assert.equal(run.id, request.runId); assert.equal(run.run_attempt, request.attempt);
  assert.equal(run.path, '.github/workflows/replay-build-review.yml');
  assert.equal(run.status, 'completed'); assert.equal(run.head_repository?.full_name, repository);
  assert.ok(['workflow_dispatch', 'issue_comment'].includes(run.event));
  const job = jobs.find(j => j.name === 'review' && j.started_at && j.conclusion !== 'skipped');
  if (!job) return null;
  const matches = artifacts.filter(a => a.name === `factory-build-review-${run.id}-${run.run_attempt}` &&
    Date.parse(a.created_at) >= Date.parse(job.started_at) && Date.parse(a.created_at) <= Date.parse(job.completed_at));
  assert.equal(matches.length, 1, 'One retained review artifact is required; expired data cannot be recreated');
  assert.ok(!matches[0].expired && positive(matches[0].id) && positive(job.id), 'Review artifact is unavailable');
  return { version: 1, repository, runId: run.id, attempt: run.run_attempt, status: 'review',
    artifacts: [{ role: 'agent', jobId: job.id, id: matches[0].id, name: matches[0].name,
      invocationExpected: job.steps?.some(s => s.name === 'Assess modules and persist evidence checkpoints' && s.started_at && s.conclusion !== 'skipped') ?? false,
      state: 'available' }] };
}
export function bindReplayHistory(selected, binding, originalRun) {
  assert.equal(binding.repository, selected.repository);
  assert.ok(positive(binding.issue) && positive(Number(binding.runId)));
  assert.match(binding.baseSha ?? '', /^[a-f0-9]{40}$/u);
  assert.match(binding.patchHash ?? '', /^[a-f0-9]{64}$/u);
  assert.equal(originalRun.id, Number(binding.runId));
  assert.equal(originalRun.path, '.github/workflows/code-agent-task.yml');
  assert.equal(originalRun.head_repository?.full_name, selected.repository);
  assert.equal(Number(/^Factory issue #([1-9]\d*)\b/u.exec(originalRun.display_title ?? '')?.[1]), binding.issue);
  return { ...selected, issue: binding.issue, original: { runId: Number(binding.runId),
    attempt: binding.attempt, publicationAttempt: binding.publicationAttempt, baseSha: binding.baseSha, patchHash: binding.patchHash } };
}
async function all(client, route, key) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const data = await client.request('GET', `${route}?per_page=100&page=${page}`);
    assert.ok(Array.isArray(data[key])); rows.push(...data[key]);
    if (data[key].length < 100) return rows;
  }
  throw new Error('History pagination limit');
}
async function main() {
  const [mode, rootArg] = process.argv.slice(2), root = path.resolve(rootArg);
  const repository = process.env.GITHUB_REPOSITORY;
  const client = new GitHubClient({ repository, token: process.env.GITHUB_TOKEN });
  if (mode === 'select') {
    const request = historyRequest(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH)), process.env);
    if (!request) return;
    assert.ok(positive(request.runId) && positive(request.attempt));
    const run = await client.request('GET', `/actions/runs/${request.runId}/attempts/${request.attempt}`);
    const source = selectReplayHistory(run,
      await all(client, `/actions/runs/${request.runId}/attempts/${request.attempt}/jobs`, 'jobs'),
      await all(client, `/actions/runs/${request.runId}/artifacts`, 'artifacts'), repository, request);
    if (!source) return;
    write(path.join(root, 'selected.json'), source);
    out('ready', 'true'); out('run', source.runId); out('attempt', source.attempt); out('artifact', source.artifacts[0].id);
  } else if (mode === 'pack') {
    const selected = JSON.parse(readFileSync(path.join(root, 'selected.json')));
    const input = path.join(root, 'download');
    const binding = JSON.parse(readFileSync(path.join(input, 'binding.json')));
    const source = bindReplayHistory(selected, binding, await client.request('GET', `/actions/runs/${binding.runId}`));
    const issue = await client.request('GET', `/issues/${source.issue}`);
    assert.ok(!issue.pull_request);
    write(path.join(root, 'source.json'), source); out('issue', source.issue);
    const evidence = path.join(root, 'evidence'), agent = path.join(evidence, 'agent');
    mkdirSync(agent, { recursive: true });
    // Retain only review files: stale implementation/QA output is not this replay.
    for (const file of selectHistoryFiles(input).filter(f => f.phase === 'review'))
      copyFileSync(path.join(input, file.name), path.join(agent, file.name));
    write(path.join(agent, 'review-binding.json'), source.original);
    const packed = packHistory({ artifacts: evidence, output: path.join(root, 'archive'), source,
      issue: source.issue, runId: source.runId, attempt: source.attempt });
    write(path.join(root, 'packed.json'), packed);
    if (packed) out('asset', packed.asset);
  } else throw new Error('Expected select/pack <directory>');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
