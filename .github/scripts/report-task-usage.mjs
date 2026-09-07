import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { aggregate, collectUsage, emptyUsage, marker, positive, recordsFromComments, renderUsage, selectSource, validateRecord } from './task-usage.mjs';

const [mode, ...argv] = process.argv.slice(2);
if (argv.length % 2) throw new Error('Expected --name value arguments');
const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2].replace(/^--/, ''), argv[i * 2 + 1]]));
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
const runId = Number(args['run-id']);
if (!positive(runId)) throw new Error('Invalid run ID');
const output = (key, value) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

async function api(method, route, body) {
  const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
async function list(route, key) {
  const items = [];
  for (let page = 1; ; page++) {
    const response = await api('GET', `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const batch = key ? response[key] : response;
    if (!Array.isArray(batch)) throw new Error('Invalid list response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}
async function checkIssue(issue) {
  const data = await api('GET', `/issues/${issue}`);
  if (data.pull_request || data.user?.login !== repository.split('/')[0]) throw new Error('Not an owner-authored task Issue');
}

if (mode === 'select') {
  output('ready', 'false');
  const attempt = args.attempt ? Number(args.attempt) : null;
  if (attempt !== null && !positive(attempt)) throw new Error('Invalid run attempt');
  const run = await api('GET', `/actions/runs/${runId}${attempt === null ? '' : `/attempts/${attempt}`}`);
  const repo = await api('GET', '');
  if (run.id !== runId || (attempt !== null && run.run_attempt !== attempt) || run.head_branch !== repo.default_branch) throw new Error('Not the requested default-branch run');
  const jobs = await list(`/actions/runs/${runId}/attempts/${run.run_attempt}/jobs`, 'jobs');
  const artifacts = await list(`/actions/runs/${runId}/artifacts`, 'artifacts');
  const source = selectSource(run, jobs, artifacts, repository);
  if (source) {
    await checkIssue(source.issue);
    writeFileSync(args.source, JSON.stringify(source));
    output('artifact', source.artifact || '');
    output('ready', 'true');
  } else console.log('No accepted task artifacts; skipping usage report.');
} else if (mode === 'publish') {
  const source = JSON.parse(readFileSync(args.source, 'utf8'));
  if (source.repository !== repository || source.runId !== runId || !positive(source.issue)) throw new Error('Source mismatch');
  await checkIssue(source.issue);
  let usage = emptyUsage();
  if (source.invoked) {
    if (source.artifact) usage = await collectUsage(args.artifacts);
    else usage.incomplete++;
  }
  const record = validateRecord({ ...source, usage }, repository, source.issue);
  const comments = await list(`/issues/${source.issue}/comments`);
  const existing = comments.find(c => c.user?.login === 'github-actions[bot]' && c.body?.includes(marker(record)));
  const prior = recordsFromComments(comments, repository, source.issue);
  const old = prior.find(r => r.runId === record.runId && r.attempt === record.attempt);
  // Replaying after artifact expiry must not discard a previously measured run.
  if (old && old.agentJobId === record.agentJobId && old.usage.records > record.usage.records) record.usage = old.usage;
  const records = [...prior.filter(r => r.runId !== record.runId || r.attempt !== record.attempt), record];
  const body = renderUsage(record, records);
  mkdirSync(path.dirname(path.resolve(args.summary)), { recursive: true });
  writeFileSync(args.summary, `${JSON.stringify({ record, cumulative: aggregate(records) }, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body.split('<!-- factory-task-usage-data')[0]);
  if (existing?.body !== body) await api(existing ? 'PATCH' : 'POST', existing ? `/issues/comments/${existing.id}` : `/issues/${record.issue}/comments`, { body });
  console.log(`Usage and duration reported to Issue #${record.issue} for run ${runId}, attempt ${record.attempt}.`);
} else throw new Error('Usage: report-task-usage.mjs <select|publish> --run-id N --source FILE ...');
