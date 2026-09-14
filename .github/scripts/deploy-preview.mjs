import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { waitForTaskRun } from './wait-for-task-run.mjs';
import { matchesTaskPR, readJson } from './visual-report.mjs';
import {
  PREVIEW_COMMENT_PREFIX,
  PREVIEW_THEME,
  depsKeyFromEntries,
  depsProbeCommand,
  planFrom,
  readDepsEntries,
  renderPreviewComment,
  requireDepsKey,
  requireDomain,
  selectDistArtifact,
  slimEntries,
} from './preview-host.mjs';

const [mode, ...argv] = process.argv.slice(2);
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
if (!Number.isSafeInteger(runId) || runId < 1)
  throw new Error('Invalid source run ID');
const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
const output = (name, value) =>
  process.env.GITHUB_OUTPUT &&
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);

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
  const result = [];
  for (let page = 1; page <= 30; page++) {
    const response = await api(
      'GET',
      `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    const items = key ? response[key] : response;
    if (!Array.isArray(items)) throw new Error('Invalid GitHub list response');
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error('GitHub pagination limit reached');
}

if (mode === 'select') {
  output('ready', 'false');
  const repo = await api('GET', '');
  const run = await waitForTaskRun(api, {
    runId,
    attempt: args.attempt,
    repository,
    defaultBranch: repo.default_branch,
  });
  const latest = await api('GET', `/actions/runs/${runId}`);
  if (latest.run_attempt !== run.run_attempt) {
    console.log('Source attempt was superseded; skipping stale preview.');
    process.exit(0);
  }
  const jobs = await list(
    `/actions/runs/${runId}/attempts/${run.run_attempt}/jobs`,
    'jobs',
  );
  const artifacts = await list(`/actions/runs/${runId}/artifacts`, 'artifacts');
  const artifact = selectDistArtifact(run, jobs, artifacts, repository);
  if (artifact) {
    output('artifact', artifact.name);
    writeFileSync(
      args.source,
      JSON.stringify({
        repository,
        runId,
        runUrl,
        runAttempt: run.run_attempt,
        artifact,
      }),
    );
    output('ready', 'true');
  } else console.log('No successful business delivery; skipping the preview.');
} else if (mode === 'prepare') {
  output('ready', 'false');
  const source = JSON.parse(readFileSync(args.source, 'utf8'));
  if (source.repository !== repository || source.runId !== runId)
    throw new Error('Source mismatch');
  const metadata = readJson(args.artifacts, 'task-metadata.json');
  const issue = metadata.issue?.number;
  if (
    metadata.repository !== repository ||
    !Number.isSafeInteger(issue) ||
    issue < 1 ||
    source.artifact.name !== `factory-dist-${issue}` ||
    ![`agent/issue-${issue}`, `pi/issue-${issue}`].includes(
      metadata.workBranch,
    ) ||
    !/^apps\/[a-z0-9][a-z0-9./_-]*$/.test(metadata.task?.targetBranch ?? '')
  )
    throw new Error('Task metadata mismatch');

  // The dependency identity comes from the tree the build actually produced,
  // not from anything the caller passes and not from the declared versions
  // alone: the build also decides what to install and what to prune, and a
  // recipe change leaves the versions untouched while changing the tree.
  const nodeModules = path.join(args.build, 'dist/node_modules');
  if (!existsSync(nodeModules))
    throw new Error('The deployable build carries no dependency tree');
  const key = requireDepsKey(depsKeyFromEntries(readDepsEntries(nodeModules)));
  const domain = requireDomain(args.domain || PREVIEW_THEME);

  const pulls = await list(
    `/pulls?state=all&head=${encodeURIComponent(`${repository.split('/')[0]}:${metadata.workBranch}`)}`,
  );
  const pr = pulls.find((p) => matchesTaskPR(p, metadata, source));
  if (!pr) {
    console.log(
      'No matching PR for this run, or the PR was updated; skipping stale preview.',
    );
    process.exit(0);
  }

  const plan = { ...planFrom({ metadata, pr, source, domain }), depsKey: key };
  writeFileSync(path.join(args.output, 'deploy.json'), JSON.stringify(plan));

  // Derived from the build itself, so a directory the build starts emitting
  // cannot be silently left behind.
  const entries = slimEntries(
    readdirSync(args.build),
    readdirSync(path.join(args.build, 'dist')),
  );
  writeFileSync(path.join(args.output, 'slim-entries.txt'), entries.join('\n'));

  output('pr', plan.prNumber);
  output('sha', plan.headSha);
  output('url', plan.url);
  output('host', plan.host);
  output('deps_key', key);
  output('probe', depsProbeCommand(key));
  output('ready', 'true');
} else if (mode === 'publish') {
  const plan = readJson(args.output, 'deploy.json');
  if (
    plan.repository !== repository ||
    plan.runId !== runId ||
    !Number.isSafeInteger(plan.prNumber)
  )
    throw new Error('Deployment plan mismatch');

  const status = args.status === 'success' ? 'success' : 'failed';
  const deployRunUrl = process.env.GITHUB_RUN_ID
    ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : plan.runUrl;

  const pr = await api('GET', `/pulls/${plan.prNumber}`);
  if (
    !pr.body?.includes(`- [GitHub Actions 运行记录](${runUrl})`) ||
    (plan.headSha && pr.head?.sha !== plan.headSha)
  ) {
    console.log('PR changed since collection; refusing a stale preview link.');
    process.exit(0);
  }

  const note =
    status === 'success'
      ? ''
      : `本次预览部署失败，没有可用地址。请查看[部署日志](${deployRunUrl})；这不影响已经通过的搭建验收。`;
  const body = renderPreviewComment(plan, note);
  const marker = `${PREVIEW_COMMENT_PREFIX}${runId}:${plan.runAttempt} -->`;
  const existing = (await list(`/issues/${plan.prNumber}/comments`)).find(
    (c) => c.body?.includes(marker) && c.user?.login === 'github-actions[bot]',
  );
  await api(
    existing ? 'PATCH' : 'POST',
    existing
      ? `/issues/comments/${existing.id}`
      : `/issues/${plan.prNumber}/comments`,
    { body },
  );
  if (status === 'success')
    console.log(`Preview published for PR #${plan.prNumber}: ${plan.url}`);
  else
    console.warn('::warning::Preview deployment failed; reported on the PR.');
} else
  throw new Error(
    'Usage: deploy-preview.mjs <select|prepare|publish> --run-id N ...',
  );
