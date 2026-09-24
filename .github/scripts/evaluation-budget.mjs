// Enforces a batch sample's trusted budget across the whole Handoff chain. The
// budget lives in pipeline-state.json, so a continuation, recovery or new
// attempt cannot reset it. Ordinary tasks have no budget and are unaffected.
//   deadline <state>                  → lowers FACTORY_RUN_DEADLINE_EPOCH_SECONDS (GITHUB_ENV line)
//   handoff  <state> <continuation>   → exit 1 and mark budget-exhausted instead of continuing
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeSeconds, ARCHIVE_RESERVE_SECONDS, readState, saveState } from './pipeline-state.mjs';

// Long calls must end early enough to seal the patch and archive the facts.
export function budgetDeadline(state, runnerDeadline, now = Math.floor(Date.now() / 1000)) {
  if (!state.budget) return null;
  const remaining = state.budget.maxActiveSeconds - activeSeconds(state, now) - ARCHIVE_RESERVE_SECONDS;
  const lowered = now + Math.max(0, remaining);
  const runner = Number(runnerDeadline);
  return Number.isSafeInteger(runner) && runner > 0 ? Math.min(runner, lowered) : lowered;
}

export function continuationRefusal(state, continuation, now = Math.floor(Date.now() / 1000)) {
  if (!state.budget) return null;
  if (continuation > state.budget.maxContinuations) return `自动续跑次数将超过上限 ${state.budget.maxContinuations}`;
  // A continuation needs at least one useful phase plus archiving time.
  if (state.budget.maxActiveSeconds - activeSeconds(state, now) < ARCHIVE_RESERVE_SECONDS + 300) return `主动执行时间预算 ${state.budget.maxActiveSeconds} 秒已用尽`;
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file, value] = process.argv.slice(2);
  const state = readState(file);
  if (command === 'deadline') {
    const deadline = budgetDeadline(state, process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS);
    if (deadline !== null) {
      console.log(`FACTORY_RUN_DEADLINE_EPOCH_SECONDS=${deadline}`);
      console.error(`Evaluation sample budget: ${state.budget.maxActiveSeconds}s active, ${activeSeconds(state)}s used before this step.`);
    }
  } else if (command === 'handoff') {
    const refusal = continuationRefusal(state, Number(value));
    if (refusal) {
      state.outcome = 'budget-exhausted';
      saveState(file, state);
      console.error(`Evaluation budget exhausted: ${refusal}. Facts and the sealed patch are kept; no automatic continuation.`);
      process.exit(1);
    }
  } else throw new Error('Usage: evaluation-budget.mjs <deadline|handoff> <pipeline-state.json> [continuation]');
}
