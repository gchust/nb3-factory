import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  GitHubClient,
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
} from './comment-queue.mjs';

export async function coordinate(client, issueNumber, admissionId = Infinity) {
  const issue = await client.getIssue(issueNumber);
  if (
    issue.pull_request ||
    issue.user?.login !== client.repository.split('/')[0]
  )
    return;
  let task;
  try {
    task = parseIssueTask(issue);
  } catch (error) {
    if (error instanceof TaskInputError) return;
    throw error;
  }
  const { comments, receipts } = await receiptsFor(client, issueNumber);
  // Activate on a new owner comment; scheduled reconciliation must not replay
  // every historical discussion (and consume quota) when this feature ships.
  const firstId = Math.min(admissionId, ...receipts.map((item) => item.id));
  await admitComments(
    client,
    issue,
    comments.filter((comment) => comment.id >= firstId),
    receipts,
  );
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

  // Reading all runs for this workflow also handles lost completion events and
  // failed scheduler runs. An active receipt is never released merely by age.
  const runs = await listAll(
    client,
    '/actions/workflows/code-agent-task.yml/runs',
    {},
    'workflow_runs',
  );
  const ownRuns = runs.filter(
    (run) => Number(runTitle.exec(run.display_title)?.[1]) === issueNumber,
  );
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
  const pulls = await listAll(client, '/pulls', {
    state: 'all',
    base: task.targetBranch,
  });
  if (
    pulls.some(
      (pull) =>
        pull.head?.repo?.full_name === client.repository &&
        new RegExp(`^(agent|pi)/issue-${issueNumber}$`).test(pull.head.ref) &&
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
    pulls.some(
      (pull) =>
        pull.state === 'open' &&
        pull.head?.repo?.full_name === client.repository &&
        /^(agent|pi)\/issue-\d+$/.test(pull.head.ref) &&
        !new RegExp(`^(agent|pi)/issue-${issueNumber}$`).test(pull.head.ref),
    )
  )
    return;
  if (
    !ownRuns.length &&
    !pulls.some(
      (pull) =>
        pull.head?.repo?.full_name === client.repository &&
        new RegExp(`^(agent|pi)/issue-${issueNumber}$`).test(pull.head.ref),
    )
  )
    return;
  const next = receipts.find((item) => item.status === 'queued');
  if (!next) return;
  next.status = 'dispatched';
  next.dispatchedAt = Date.now();
  await saveReceipt(client, issueNumber, next);
  // A delayed retry uses the same comment ID; the task's append-only claim
  // prevents two initial executions even after an ambiguous dispatch failure.
  await dispatch(client, issueNumber, next.id);
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
      event.comment.user?.login !== client.repository.split('/')[0]
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
  const issues = await listAll(client, '/issues', { state: 'all' });
  const errors = [];
  for (const issue of issues) {
    if (
      !issue.pull_request &&
      issue.user?.login === client.repository.split('/')[0]
    )
      try {
        await coordinate(client, issue.number);
      } catch (error) {
        errors.push(`Issue #${issue.number}: ${error.message}`);
      }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
if (
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
