import { isValidTargetBranch } from './factory-lib.mjs';
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
  PREVIEW_VERIFIED_MARKER,
  capacitySkipNote,
  depsKeyFromEntries,
  depsProbeCommand,
  needsRoom,
  parseCapacityListing,
  planCapacity,
  planFrom,
  readDepsEntries,
  renderEvictionComment,
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
        deliveryStatus: jobs.some(
          (job) =>
            job.name === 'publish-failed' && job.conclusion === 'success',
        )
          ? 'failed'
          : 'success',
        artifact,
      }),
    );
    output('ready', 'true');
  } else
    console.log(
      'No deployable archive for a published build; packaging may have failed. See the task run logs.',
    );
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
    !isValidTargetBranch(metadata.task?.targetBranch)
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
  // Teardown only runs when a PR closes. A preview deployed after that (a
  // queued deploy, or a replay of an old run) would never be reclaimed.
  if (pr.state !== 'open') {
    console.log(
      `PR #${pr.number} is ${pr.state}; not deploying a preview nothing would reclaim.`,
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
  output(
    'build_status',
    plan.deliveryStatus === 'failed' ? 'failed' : 'success',
  );
  output('ready', 'true');
} else if (mode === 'capacity') {
  // Runs before the payload is packaged and uploaded: a deploy the host would
  // refuse for the instance limit must not cost a public release asset first.
  // `room` is written only once the answer is known: a step that fails before
  // then must read as a failed deploy, never as a skip.
  const plan = readJson(args.output, 'deploy.json');
  if (
    plan.repository !== repository ||
    plan.runId !== runId ||
    !Number.isSafeInteger(plan.prNumber)
  )
    throw new Error('Deployment plan mismatch');
  const listing = parseCapacityListing(readFileSync(args.listing, 'utf8'));

  // Only a full host needs to know which pull requests are still open, and
  // only GitHub can say: the host never learns that a pull request closed.
  const pulls = new Map();
  if (needsRoom(listing))
    for (const { pr } of listing.instances) {
      if (pr === plan.prNumber) continue;
      try {
        pulls.set(pr, await api('GET', `/pulls/${pr}`));
      } catch (error) {
        if (!/\(404\)$/.test(error.message)) throw error;
        pulls.set(pr, null);
      }
    }
  const capacity = planCapacity({ listing, pr: plan.prNumber, pulls });
  writeFileSync(
    path.join(args.output, 'capacity.json'),
    JSON.stringify(capacity),
  );
  writeFileSync(
    path.join(args.output, 'evict.txt'),
    capacity.evict.map(({ pr, reason }) => `${pr} ${reason}\n`).join(''),
  );
  for (const { pr, reason, deployedAt } of capacity.evict)
    console.log(
      `Evicting the preview for PR #${pr} (${reason}, deployed ${deployedAt || 'at an unknown time'}).`,
    );
  if (capacity.room)
    console.log(
      `Preview host has room for PR #${plan.prNumber} (${capacity.count}/${capacity.limit} before eviction).`,
    );
  else
    console.log(
      `::notice::PREVIEW SKIPPED: the preview host is full (${capacity.count}/${capacity.limit}) and every remaining preview is a successful build of an open PR.`,
    );
  output('room', String(capacity.room));
} else if (mode === 'evicted') {
  // Tells an open pull request that its preview gave way, so a dead address in
  // an earlier comment is not mistaken for a broken deploy. A closed pull
  // request needs no notice.
  const plan = readJson(args.output, 'deploy.json');
  if (plan.repository !== repository || plan.runId !== runId)
    throw new Error('Deployment plan mismatch');
  const victim = Number(args.pr);
  if (!Number.isSafeInteger(victim) || victim < 1)
    throw new Error('Invalid evicted PR number');
  if (args.reason === 'closed') process.exit(0);
  await api('POST', `/issues/${victim}/comments`, {
    body: renderEvictionComment({
      reason: args.reason,
      forPr: plan.prNumber,
    }),
  });
} else if (mode === 'publish') {
  const plan = readJson(args.output, 'deploy.json');
  if (
    plan.repository !== repository ||
    plan.runId !== runId ||
    !Number.isSafeInteger(plan.prNumber)
  )
    throw new Error('Deployment plan mismatch');

  const status = ['success', 'skipped'].includes(args.status)
    ? args.status
    : 'failed';
  const deployRunUrl = process.env.GITHUB_RUN_ID
    ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : plan.runUrl;

  const pr = await api('GET', `/pulls/${plan.prNumber}`);
  if (pr.state !== 'open') {
    console.log(
      `PR #${plan.prNumber} closed during deployment; teardown owns it now.`,
    );
    process.exit(0);
  }
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
      : status === 'skipped'
        ? capacitySkipNote(readJson(args.output, 'capacity.json'), runUrl)
        : `本次预览部署或公网访问检查失败，尚未确认地址可用。请查看[部署日志](${deployRunUrl})；这不改变搭建报告和 PR 中记录的验收状态。`;
  const marker = `${PREVIEW_COMMENT_PREFIX}${runId}:${plan.runAttempt} -->`;
  const existing = (await list(`/issues/${plan.prNumber}/comments`)).find(
    (c) => c.body?.includes(marker) && c.user?.login === 'github-actions[bot]',
  );

  // One build, two deploys: the task workflow dispatches this workflow and
  // GitHub also raises `workflow_run` for the same completed run. Only one of
  // them has to succeed for the preview to answer, so a failing attempt does not
  // withdraw an address another attempt already verified — that is how a live
  // preview came to be reported as "暂无已确认可用的地址" (PR #159, 2026-09-21).
  // The failure is still stated; it just does not overwrite the address.
  //
  // A skip is not such a failure: it happens only when this pull request has no
  // preview at all, so an address published earlier no longer answers.
  const afterVerified = Boolean(
    status === 'failed' && existing?.body?.includes(PREVIEW_VERIFIED_MARKER),
  );
  const body = afterVerified
    ? `${renderPreviewComment(plan)}\n\n> 本次触发没有通过部署或公网检查，因此没有替换已经在跑的预览；上文的地址来自本次构建已经确认过的部署，仍以它为准。请查看[部署日志](${deployRunUrl})。`
    : status === 'skipped'
      ? renderPreviewComment(
          plan,
          note,
          '**预览已跳过：预览机名额已满，本次没有部署。**',
        )
      : renderPreviewComment(plan, note);
  await api(
    existing ? 'PATCH' : 'POST',
    existing
      ? `/issues/comments/${existing.id}`
      : `/issues/${plan.prNumber}/comments`,
    { body },
  );
  if (status === 'success')
    console.log(`Preview published for PR #${plan.prNumber}: ${plan.url}`);
  else if (afterVerified)
    console.warn(
      '::warning::This attempt failed after the address was verified; the published preview is unchanged.',
    );
  else if (status === 'skipped')
    console.log(
      `::notice::Preview skipped for capacity; reported on PR #${plan.prNumber}.`,
    );
  else
    console.warn('::warning::Preview deployment failed; reported on the PR.');
} else
  throw new Error(
    'Usage: deploy-preview.mjs <select|prepare|capacity|evicted|publish> --run-id N ...',
  );
