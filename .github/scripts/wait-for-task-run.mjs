import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { repositoryApi } from './factory-lib.mjs';

// The task dispatches its reports from dispatch-reports, a job that may take up
// to ten minutes (dispatch-task-reports.sh retries each request), so a report
// requested first can wait that long for the run to complete. Eleven minutes
// covers it; a report that times out is lost, since the gate counts it as
// dispatched.
export const TASK_RUN_WAIT_MS = 660_000;

// Dispatch happens in the last job of the source run, just before GitHub marks
// it completed. Never mistake that short race for a failed/missing delivery.
export async function waitForTaskRun(
  api,
  {
    runId,
    attempt,
    repository,
    defaultBranch,
    timeoutMs = TASK_RUN_WAIT_MS,
    pollMs = 5_000,
    now = Date.now,
    pause = sleep,
  },
) {
  let pinnedAttempt =
    attempt === undefined || attempt === null || attempt === ''
      ? null
      : Number(attempt);
  if (
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    (pinnedAttempt !== null &&
      (!Number.isSafeInteger(pinnedAttempt) || pinnedAttempt < 1))
  ) {
    throw new Error('Invalid source run ID or attempt');
  }
  const deadline = now() + timeoutMs;
  while (true) {
    const run = await api(
      'GET',
      `/actions/runs/${runId}${pinnedAttempt === null ? '' : `/attempts/${pinnedAttempt}`}`,
    );
    if (
      run.id !== runId ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1 ||
      (pinnedAttempt !== null && run.run_attempt !== pinnedAttempt) ||
      run.path !== '.github/workflows/code-agent-task.yml' ||
      run.head_repository?.full_name !== repository ||
      run.head_branch !== defaultBranch ||
      !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(
        run.event,
      )
    ) {
      throw new Error(
        'Not the requested same-repository default-branch task attempt',
      );
    }
    // Freeze even an implicit "latest" on the first response. A new rerun must
    // not change which attempt this report describes while it is waiting.
    pinnedAttempt = run.run_attempt;
    if (run.status === 'completed') return run;
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(
        `Timed out waiting for task run ${runId}, attempt ${pinnedAttempt}; replay this report after the task completes.`,
      );
    }
    console.log(
      `Waiting for task run ${runId}, attempt ${pinnedAttempt} (${run.status}).`,
    );
    await pause(Math.min(pollMs, remaining));
  }
}

// `node wait-for-task-run.mjs --run-id N [--attempt N]` waits in a job of its
// own that holds no concurrency group, so a report job that serializes on a
// shared group never holds it while the source run is still finishing. That
// job then reads a completed run at once.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const argv = process.argv.slice(2);
  const args = Object.fromEntries(
    Array.from({ length: Math.floor(argv.length / 2) }, (_, i) => [
      argv[i * 2].replace(/^--/, ''),
      argv[i * 2 + 1],
    ]),
  );
  const api = repositoryApi();
  const repo = await api('GET', '');
  const run = await waitForTaskRun(api, {
    runId: Number(args['run-id']),
    attempt: args.attempt,
    repository: process.env.GITHUB_REPOSITORY,
    defaultBranch: repo.default_branch,
  });
  console.log(
    `Task run ${run.id}, attempt ${run.run_attempt} is completed (${run.conclusion}).`,
  );
  // The attempt this wait settled on: with no attempt given it is the latest,
  // and a re-run started after this job must not change which one the locked
  // report job reads (and then waits for while holding its group).
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `attempt=${run.run_attempt}\n`);
}
