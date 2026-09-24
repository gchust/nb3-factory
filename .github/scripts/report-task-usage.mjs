import { selectSupplement, adoptSupplement } from './replay-build-review.mjs';
import { executionFacts } from './evaluation-report.mjs';
import { makeDeliveryReport } from './delivery-report.mjs';
import { readStageTimings, renderTaskReport } from './task-report.mjs';
import { waitForTaskRun } from './wait-for-task-run.mjs';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  aggregate,
  collectUsage,
  emptyUsage,
  marker,
  positive,
  recordsFromComments,
  renderUsage,
  selectSource,
  validateRecord,
} from './task-usage.mjs';

const [mode, ...argv] = process.argv.slice(2);
if (argv.length % 2) throw new Error('Expected --name value arguments');
const args = Object.fromEntries(
  Array.from({ length: argv.length / 2 }, (_, i) => [
    argv[i * 2].replace(/^--/, ''),
    argv[i * 2 + 1],
  ]),
);
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''))
  throw new Error('Invalid repository');
const runId = Number(args['run-id']);
if (!positive(runId)) throw new Error('Invalid run ID');
const output = (key, value) =>
  process.env.GITHUB_OUTPUT &&
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

async function api(method, route, body) {
  const response = await fetch(
    `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}${route}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: globalThis.AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(`GitHub ${method} failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
async function list(route, key) {
  const items = [];
  for (let page = 1; ; page++) {
    const response = await api(
      'GET',
      `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    const batch = key ? response[key] : response;
    if (!Array.isArray(batch)) throw new Error('Invalid list response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}
async function checkIssue(issue) {
  const data = await api('GET', `/issues/${issue}`);
  if (data.pull_request) throw new Error('Task number must refer to an Issue');
  return data;
}

if (mode === 'select') {
  output('ready', 'false');
  const attempt = args.attempt ? Number(args.attempt) : null;
  if (attempt !== null && !positive(attempt))
    throw new Error('Invalid run attempt');
  const repo = await api('GET', '');
  const run = await waitForTaskRun(api, {
    runId,
    attempt,
    repository,
    defaultBranch: repo.default_branch,
  });
  const jobs = await list(
    `/actions/runs/${runId}/attempts/${run.run_attempt}/jobs`,
    'jobs',
  );
  const artifacts = await list(`/actions/runs/${runId}/artifacts`, 'artifacts');
  const source = selectSource(run, jobs, artifacts, repository);
  if (source) {
    await checkIssue(source.issue);
    if (args['review-run-id'] || args['review-artifact-id']) {
      source.reviewSource = await selectSupplement(route => api('GET', route), repository,
        Number(args['review-run-id']), Number(args['review-artifact-id']));
      output('review_artifact', source.reviewSource.artifactId);
    }
    writeFileSync(args.source, JSON.stringify(source));
    output('artifact_id', source.artifactId || '');
    output('artifact', source.artifact || '');
    output('task_artifact_id', source.taskArtifactId || '');
    output('ready', 'true');
  } else console.log('No accepted task artifacts; skipping usage report.');
} else if (mode === 'publish') {
  const source = JSON.parse(readFileSync(args.source, 'utf8'));
  if (
    source.repository !== repository ||
    source.runId !== runId ||
    !positive(source.issue)
  )
    throw new Error('Source mismatch');
  if (source.reviewSource) await adoptSupplement(args.artifacts, args.review, source);
  const issue = await checkIssue(source.issue);
  let usage = emptyUsage();
  if (source.invoked) {
    if (source.artifact) usage = await collectUsage(args.artifacts);
    else usage.incomplete++;
  }
  const record = validateRecord({ ...source, usage }, repository, source.issue);
  // Trusted run identity lets later exports link handoffs without expired artifacts.
  // Prefer the prepare-job artifact; the Agent artifact copy never supplies a batch-sample key.
  for (const root of [args.task, args.artifacts].filter(Boolean)) {
    try {
      const metadata = JSON.parse(readFileSync(path.join(root, 'task-metadata.json'), 'utf8'));
      if (metadata.repository !== repository || metadata.issue?.number !== record.issue ||
          (metadata.run && Number(metadata.run.id) !== record.runId)) throw new Error('metadata does not match this run');
      const facts = executionFacts(metadata, args.artifacts, record);
      if (root !== args.task && facts?.kind === 'batch-sample') throw new Error('batch-sample identity requires the prepare record');
      record.evaluation = facts;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`::warning::Evaluation identity unavailable: ${error.message}`);
    }
  }
  const comments = await list(`/issues/${source.issue}/comments`);
  const existing = comments.find(
    (c) =>
      c.user?.login === 'github-actions[bot]' &&
      c.body?.includes(marker(record)),
  );
  const prior = recordsFromComments(comments, repository, source.issue);
  const old = prior.find(
    (r) => r.runId === record.runId && r.attempt === record.attempt,
  );
  // Replaying after artifact expiry must not discard a previously measured run.
  if (
    old &&
    old.agentJobId === record.agentJobId &&
    old.usage.records > record.usage.records
  )
    record.usage = old.usage;
  const records = [
    ...prior.filter(
      (r) => r.runId !== record.runId || r.attempt !== record.attempt,
    ),
    record,
  ];
  const reportUrl = process.env.GITHUB_RUN_ID
    ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}#artifacts`
    : '';
  const body =
    renderUsage(record, records) +
    (reportUrl
      ? `\n\n[查看本次 HTML / JSON 报告](${reportUrl})（在 Artifacts 下载后打开 report.html）。`
      : '');
  mkdirSync(path.dirname(path.resolve(args.summary)), { recursive: true });
  const report = {
    record,
    cumulative: aggregate(records),
    records,
    timings: readStageTimings(path.join(args.artifacts, 'timings.jsonl')),
  };
  let html;
  try {
    const result = await makeDeliveryReport(report, args.artifacts, issue,
      (branch) => list(`/pulls?state=all&head=${encodeURIComponent(`${repository.split('/')[0]}:${branch}`)}`));
    report.delivery = result.facts;
    report.pr = result.pr;
    report.reportId = result.reportId;
    html = result.html;
    output('html_ready', 'true');
  } catch (error) {
    // Presentation must never erase numeric usage or restart a business build.
    console.warn(`::warning::Full report unavailable: ${error.message}`);
    report.presentationError = '完整报告生成失败，已保留基础统计报告。';
    html = renderTaskReport(report);
  }
  writeFileSync(args.summary, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(path.dirname(args.summary), 'report.html'), html);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      body.split('<!-- factory-task-usage-data')[0],
    );
  if (existing?.body !== body)
    await api(
      existing ? 'PATCH' : 'POST',
      existing
        ? `/issues/comments/${existing.id}`
        : `/issues/${record.issue}/comments`,
      { body },
    );
  console.log(
    `Usage and duration reported to Issue #${record.issue} for run ${runId}, attempt ${record.attempt}.`,
  );
} else
  throw new Error(
    'Usage: report-task-usage.mjs <select|publish> --run-id N --source FILE ...',
  );
