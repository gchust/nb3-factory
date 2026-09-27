// Applies task-wide limits and stricter evaluation-plan budgets to every task.
// Active usage survives Handoff/recovery; ordinary tasks get the factory ceiling.
//   deadline <state>                  → lowers FACTORY_RUN_DEADLINE_EPOCH_SECONDS (GITHUB_ENV line)
//   handoff  <state> <continuation>   → exit 1 and mark budget-exhausted instead of continuing
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveBudget } from './task-policy.mjs';
import {
  activeSeconds,
  ARCHIVE_RESERVE_SECONDS,
  handoffRefusal,
  readState,
  stopPipeline,
} from './pipeline-state.mjs';

// Long calls must end early enough to seal the patch and archive the facts.
export function budgetDeadline(
  state,
  runnerDeadline,
  now = Math.floor(Date.now() / 1000),
) {
  const remaining =
    effectiveBudget(state).maxActiveSeconds -
    activeSeconds(state, now) -
    ARCHIVE_RESERVE_SECONDS;
  const lowered = now + Math.max(0, remaining);
  const runner = Number(runnerDeadline);
  return Number.isSafeInteger(runner) && runner > 0
    ? Math.min(runner, lowered)
    : lowered;
}

// The same rule as prepare's gate, applied to the checkpoint: the continuation would
// follow every execution so far (the dispatch field alone could be reset by a recovery).
export function continuationRefusal(
  state,
  continuation,
  now = Math.floor(Date.now() / 1000),
) {
  return handoffRefusal(state, Number(continuation) || 1, now);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, file, value] = process.argv.slice(2);
  const state = readState(file);
  if (command === 'deadline') {
    const deadline = budgetDeadline(
      state,
      process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS,
    );
    if (deadline !== null) {
      console.log(`FACTORY_RUN_DEADLINE_EPOCH_SECONDS=${deadline}`);
      console.error(
        `Evaluation sample budget: ${effectiveBudget(state).maxActiveSeconds}s active, ${activeSeconds(state)}s used before this step.`,
      );
    }
  } else if (command === 'handoff') {
    const refusal = continuationRefusal(state, Number(value));
    if (refusal) {
      stopPipeline(file, state, refusal, 'handoff-limit');
      console.error(
        `Evaluation budget exhausted: ${refusal}. Facts and the sealed patch are kept; no automatic continuation.`,
      );
      process.exit(1);
    }
  } else
    throw new Error(
      'Usage: evaluation-budget.mjs <deadline|handoff> <pipeline-state.json> [continuation]',
    );
}
