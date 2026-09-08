import { setTimeout as sleep } from 'node:timers/promises';

// Dispatch happens in the last job of the source run, just before GitHub marks
// it completed. Never mistake that short race for a failed/missing delivery.
export async function waitForTaskRun(api, {
  runId, attempt, repository, defaultBranch,
  timeoutMs = 300_000, pollMs = 5_000, now = Date.now, pause = sleep,
}) {
  let pinnedAttempt = attempt === undefined || attempt === null || attempt === '' ? null : Number(attempt);
  if (!Number.isSafeInteger(runId) || runId < 1 ||
      (pinnedAttempt !== null && (!Number.isSafeInteger(pinnedAttempt) || pinnedAttempt < 1))) {
    throw new Error('Invalid source run ID or attempt');
  }
  const deadline = now() + timeoutMs;
  while (true) {
    const run = await api('GET', `/actions/runs/${runId}${pinnedAttempt === null ? '' : `/attempts/${pinnedAttempt}`}`);
    if (run.id !== runId || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
        (pinnedAttempt !== null && run.run_attempt !== pinnedAttempt) ||
        run.path !== '.github/workflows/code-agent-task.yml' ||
        run.head_repository?.full_name !== repository || run.head_branch !== defaultBranch ||
        !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event)) {
      throw new Error('Not the requested same-repository default-branch task attempt');
    }
    // Freeze even an implicit "latest" on the first response. A new rerun must
    // not change which attempt this report describes while it is waiting.
    pinnedAttempt = run.run_attempt;
    if (run.status === 'completed') return run;
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(`Timed out waiting for task run ${runId}, attempt ${pinnedAttempt}; replay this report after the task completes.`);
    }
    console.log(`Waiting for task run ${runId}, attempt ${pinnedAttempt} (${run.status}).`);
    await pause(Math.min(pollMs, remaining));
  }
}
