import { isSharedTaskBase } from './source-baseline-ref.mjs';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  GitHubClient,
  isTrustedAuthor,
  isTrustedIssue,
  parseIssueTask,
  TaskInputError,
} from './factory-lib.mjs';
import {
  admitComments,
  claimedRuns,
  listAll,
  receiptsFor,
  runTitle,
  saveReceipt,
  UNTRUSTED_ISSUE,
} from './comment-queue.mjs';

import { isManualIssue, isPresetIssue } from './issue-presets.mjs';
import { resolveTargetBranch } from './task-base.mjs';

export async function coordinate(client, issueNumber, admissionId = Infinity) {
  const issue = await client.getIssue(issueNumber);
  if (issue.pull_request || isPresetIssue(issue) || isManualIssue(issue)) return;
  let task;
  try {
    task = parseIssueTask(issue);
  } catch (error) {
    if (error instanceof TaskInputError) return;
    throw error;
  }
  const { comments, receipts } = await receiptsFor(client, issueNumber);
  // The Issue body becomes every round's requirements, so a maintainer's
  // comment on an Issue from someone without repository access starts
  // nothing: no comment is admitted, a queued one is closed, and a dispatched
  // one is never sent again. Maintainers can still run it with workflow_dispatch.
  // The factory's own Issues (daily presets, evaluation samples) are trusted.
  const trusted = isTrustedIssue(issue);
  if (trusted) {
    // Activate on a new human comment; scheduled reconciliation must not replay
    // every historical discussion (and consume quota) when this feature ships.
    const firstId = Math.min(admissionId, ...receipts.map((item) => item.id));
    await admitComments(
      client,
      issue,
      comments.filter((comment) => comment.id >= firstId),
      receipts,
    );
  } else {
    for (const receipt of receipts.filter((item) => item.status === 'queued')) {
      receipt.status = 'done';
      receipt.conclusion = `rejected: ${UNTRUSTED_ISSUE}`;
      await saveReceipt(client, issueNumber, receipt);
    }
  }
  if (issue.state !== 'open') {
    for (const receipt of receipts.filter(
      (item) => item.status === 'queued' && item.kind !== 'reply',
    )) {
      receipt.status = 'done';
      receipt.conclusion =
        'rejected: Issue closed; only questions are accepted';
      await saveReceipt(client, issueNumber, receipt);
    }
  }
  if (!receipts.some((item) => item.status !== 'done')) return;

  // Reading the runs of this workflow also handles lost completion events and
  // failed scheduler runs. An active receipt is never released merely by age.
  const runs = await listRecentRuns(client, issueNumber);
  const ownRuns = runs.filter((run) => isOwnRun(run, issueNumber));
  for (const run of runs.filter(
    (item) => !runTitle.test(item.display_title) && item.status !== 'completed',
  )) {
    const artifacts = await listAll(
      client,
      `/actions/runs/${run.id}/artifacts`,
      {},
      'artifacts',
    );
    const task = artifacts.find((item) => /^factory-task-\d+$/.test(item.name));
    if (!task || task.name === `factory-task-${issueNumber}`) return;
  }
  if (!ownRuns.length) {
    for (const run of runs.filter(
      (item) =>
        !runTitle.test(item.display_title) && item.status === 'completed',
    )) {
      const artifacts = await listAll(
        client,
        `/actions/runs/${run.id}/artifacts`,
        {},
        'artifacts',
      );
      if (
        artifacts.some((item) => item.name === `factory-task-${issueNumber}`)
      ) {
        ownRuns.push({
          ...run,
          display_title: `Factory issue #${issueNumber} build 0`,
        });
        break;
      }
    }
  }
  const active = receipts.find((item) => item.status === 'dispatched');
  if (active) {
    const claims = claimedRuns(comments, active.id);
    const matches = ownRuns.filter(
      (run) =>
        Number(runTitle.exec(run.display_title)?.[2]) === active.id &&
        (!claims.length ||
          claims.includes(run.id) ||
          Number(/ from (\d+)$/.exec(run.display_title)?.[1]) ===
            Math.max(...claims)),
    );
    if (!matches.length) {
      if (!trusted) {
        active.status = 'done';
        active.conclusion = `rejected: ${UNTRUSTED_ISSUE}`;
        await saveReceipt(client, issueNumber, active);
        return;
      }
      if (Date.now() - (active.dispatchedAt || Date.now()) > 300000) {
        active.dispatchedAt = Date.now();
        await saveReceipt(client, issueNumber, active);
        await dispatch(client, issueNumber, active.id);
      }
      return;
    }
    if (matches.some((run) => run.status !== 'completed')) return;
    const last = matches.sort((a, b) => b.id - a.id)[0];
    const jobs = await listAll(
      client,
      `/actions/runs/${last.id}/attempts/${last.run_attempt}/jobs`,
      {},
      'jobs',
    );
    // A successful handoff dispatch still belongs to the current instruction;
    // its successor may not be visible in the Actions API yet.
    if (
      jobs.some((job) =>
        job.steps?.some(
          (step) =>
            step.name === 'Dispatch continuation run' &&
            step.conclusion === 'success',
        ),
      )
    )
      return;
    if (
      jobs.some(
        (job) => job.name === 'agent' && job.conclusion === 'skipped',
      ) &&
      active.kind !== 'reply'
    ) {
      // A competing task acquired the target PR between admission and prepare.
      // It did not claim or implement this instruction. Keep it queued.
      if (
        !claims.length &&
        issue.labels?.some((label) => /^(agent|pi):waiting$/.test(label.name))
      ) {
        active.status = 'queued';
        await saveReceipt(client, issueNumber, active);
        return;
      }
    }
    active.status = 'done';
    active.runId = last.id;
    // A dispatched /build comment can become a question before prepare reads it.
    // Use the jobs that actually ran, rather than the admission-time type.
    const answeredQuestion =
      jobs.some(
        (job) => job.name === 'agent' && job.conclusion === 'skipped',
      ) &&
      jobs.some((job) => job.name === 'reply' && job.conclusion === 'success');
    if (answeredQuestion) active.kind = 'reply';
    active.conclusion =
      !claims.length &&
      active.kind !== 'reply' &&
      jobs.some((job) => job.name === 'agent' && job.conclusion === 'skipped')
        ? 'not-executed'
        : last.conclusion;
    await saveReceipt(client, issueNumber, active);
  }
  if (ownRuns.some((run) => run.status !== 'completed')) return;
  // Initial instructions can also hand off. Do not overtake a dispatched but
  // not yet visible continuation of build 0.
  const latest = ownRuns.sort((a, b) => b.id - a.id)[0];
  if (latest && Number(runTitle.exec(latest.display_title)?.[2]) === 0) {
    const jobs = await listAll(
      client,
      `/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs`,
      {},
      'jobs',
    );
    if (
      jobs.some((job) =>
        job.steps?.some(
          (step) =>
            step.name === 'Dispatch continuation run' &&
            step.conclusion === 'success',
        ),
      )
    )
      return;
  }
  // A merged/closed PR terminates this Issue's single-PR iteration, even if
  // the Issue-close callback has not yet arrived.
  // Only this Issue's own PRs, filtered by the API rather than by listing every
  // PR of the repository on each reconcile.
  const owner = client.repository.split('/')[0];
  const pulls = await listAll(client, '/pulls', {
    state: 'all',
    head: `${owner}:agent/issue-${issueNumber}`,
  });
  const { default_branch: defaultBranch } = await client.getRepository();
  task.targetBranch = await resolveTargetBranch(
    client, issueNumber, task.targetBranch, pulls, defaultBranch,
  );
  if (
    pulls.some(
      (pull) =>
        pull.head?.repo?.full_name === client.repository &&
        pull.head.ref === `agent/issue-${issueNumber}` &&
        pull.state === 'closed',
    )
  ) {
    for (const receipt of receipts.filter(
      (item) => item.status === 'queued' && item.kind !== 'reply',
    )) {
      receipt.status = 'done';
      receipt.conclusion = 'rejected: PR closed; only questions are accepted';
      await saveReceipt(client, issueNumber, receipt);
    }
  }
  if (
    !isSharedTaskBase(task.targetBranch, defaultBranch) &&
    (
      await listAll(client, '/pulls', {
        state: 'open',
        base: task.targetBranch,
      })
    ).some(
      (pull) =>
        pull.base?.ref === task.targetBranch &&
        pull.state === 'open' &&
        pull.head?.repo?.full_name === client.repository &&
        /^agent\/issue-\d+$/.test(pull.head.ref) &&
        pull.head.ref !== `agent/issue-${issueNumber}`,
    )
  )
    return;
  if (
    !ownRuns.length &&
    !pulls.some(
      (pull) =>
        pull.head?.repo?.full_name === client.repository &&
        pull.head.ref === `agent/issue-${issueNumber}`,
    )
  )
    return;
  const next = receipts.find((item) => item.status === 'queued');
  if (!next || !trusted) return;
  next.status = 'dispatched';
  next.dispatchedAt = Date.now();
  await saveReceipt(client, issueNumber, next);
  // A delayed retry uses the same comment ID; the task's append-only claim
  // prevents two initial executions even after an ambiguous dispatch failure.
  await dispatch(client, issueNumber, next.id);
}
// A task may run for up to about ten hours across one handoff; three days
// leaves room for a sweep outage without scanning the whole history.
export const SWEEP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
// A run is created when its round is dispatched and finishes up to about a day
// later: ten hours of work, one five-hour handoff and queue waits. Runs older
// than that on top of the sweep window can only matter as proof that the Issue
// was built at all.
export const RUN_WINDOW_MS = SWEEP_WINDOW_MS + 24 * 60 * 60 * 1000;
const isOwnRun = (run, issueNumber) =>
  Number(runTitle.exec(run.display_title)?.[1]) === issueNumber;
// The Actions API lists runs newest first, so one page normally holds every
// run the queue can still act on: unfinished runs, the dispatched round's run
// and the Issue's latest run. Older pages are read only until the first run of
// this Issue appears, because an Issue without any run and without a PR has not
// been built yet and must not start a comment round; an Issue that never ran
// is still read to the end rather than mistaken for one that did.
export async function listRecentRuns(client, issueNumber, now = Date.now()) {
  const since = now - RUN_WINDOW_MS;
  const runs = [];
  for (let page = 1; ; page++) {
    const { workflow_runs: items } = await client.request(
      'GET',
      '/actions/workflows/code-agent-task.yml/runs',
      { query: { per_page: 100, page } },
    );
    runs.push(...items);
    if (items.length < 100) return runs;
    if (
      Date.parse(items[items.length - 1].created_at) < since &&
      runs.some((run) => isOwnRun(run, issueNumber))
    )
      return runs;
  }
}
export async function sweepIssues(client, now = Date.now()) {
  const since = new Date(now - SWEEP_WINDOW_MS).toISOString();
  const [open, recent] = await Promise.all([
    listAll(client, '/issues', { state: 'open' }),
    listAll(client, '/issues', { state: 'closed', since }),
  ]);
  const byNumber = new Map();
  for (const issue of [...open, ...recent]) byNumber.set(issue.number, issue);
  return [...byNumber.values()];
}
async function dispatch(client, issueNumber, id) {
  await client.request('POST', '/dispatches', {
    body: {
      event_type: 'code-agent-task',
      client_payload: { issue_number: issueNumber, build_comment_id: id },
    },
  });
}

export async function main(event, client) {
  if (event.comment) {
    if (
      !['created', 'edited'].includes(event.action) ||
      event.issue?.pull_request ||
      !event.comment.user?.login ||
      event.comment.user?.type === 'Bot' ||
      !isTrustedAuthor(event.comment)
    )
      return;
    if (!event.comment.body?.trim() && event.action !== 'edited') return;
    await coordinate(client, event.issue.number, event.comment.id);
    return;
  }
  if (event.inputs?.issue_number) {
    await coordinate(client, Number(event.inputs.issue_number));
    return;
  }
  const finishedIssue = Number(
    runTitle.exec(event.workflow_run?.display_title)?.[1],
  );
  if (finishedIssue) {
    await coordinate(client, finishedIssue);
    return;
  }
  // Sweep also catches legacy run titles and recovers missed completion events.
  // Only open Issues and Issues touched recently can hold an unfinished
  // receipt: saving a receipt, a claim or a reply updates the Issue. Listing
  // every Issue ever opened made each sweep cost two API calls per Issue.
  const issues = await sweepIssues(client);
  const errors = [];
  for (const issue of issues) {
    if (!issue.pull_request)
      try {
        await coordinate(client, issue.number);
      } catch (error) {
        errors.push(`Issue #${issue.number}: ${error.message}`);
      }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
// A finished comment round requests a reconcile from its own last job, while
// its run is still in progress; the queue only releases a receipt once the run
// has completed. This wait runs outside the queue's lock. A run that is not a
// task run, or one that stays in progress past the deadline, is left to the
// reconcile itself, which treats an unfinished run as still active.
export async function waitForSourceRun(
  client,
  runId,
  {
    timeoutMs = 20 * 60_000,
    intervalMs = 15_000,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  if (!/^[1-9]\d*$/.test(String(runId))) throw new Error('Invalid source run id.');
  const deadline = now() + timeoutMs;
  for (;;) {
    const run = await client.request('GET', `/actions/runs/${runId}`);
    if (run.path !== '.github/workflows/code-agent-task.yml')
      return 'not-a-task-run';
    if (run.status === 'completed') return 'completed';
    if (now() + intervalMs > deadline) return 'timed-out';
    await sleep(intervalMs);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href &&
  process.argv[2] === '--wait-run'
) {
  const result = await waitForSourceRun(
    new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
      apiUrl: process.env.GITHUB_API_URL,
    }),
    process.argv[3],
  );
  console.log(`Source run ${process.argv[3]}: ${result}`);
} else if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main(
    JSON.parse(
      readFileSync(process.argv[2] ?? process.env.GITHUB_EVENT_PATH, 'utf8'),
    ),
    new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
      apiUrl: process.env.GITHUB_API_URL,
    }),
  );
}
