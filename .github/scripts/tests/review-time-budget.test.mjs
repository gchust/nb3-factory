import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../workflows/code-agent-task.yml', import.meta.url),
  'utf8',
);
const runner = readFileSync(
  new URL('../run-build-review.mjs', import.meta.url),
  'utf8',
);
const step = workflow
  .split('      - name: Review build quality and framework feedback\n')[1]
  .split('\n      - name:')[0];

test('outer review timeout leaves time for the largest accepted review and checkpoint publication', () => {
  const maximumSeconds = Number(
    /REVIEW_TIMEOUT_SECONDS = (\d+)/.exec(runner)?.[1],
  );
  assert.equal(maximumSeconds, 3600);
  assert.match(runner, /requested > REVIEW_TIMEOUT_SECONDS/);
  const stepMinutes = Number(/timeout-minutes: (\d+)/.exec(step)?.[1]);
  assert.ok(Number.isSafeInteger(maximumSeconds) && maximumSeconds > 0);
  assert.ok(Number.isSafeInteger(stepMinutes) && stepMinutes > 0);
  assert.ok(
    stepMinutes * 60 >= maximumSeconds + 120,
    'Actions must not kill the reviewer before its own timeout can persist a validated checkpoint',
  );
});

test('budget alignment retains one bounded review budget, non-scored lightweight mode and business gates', () => {
  assert.match(
    runner,
    /FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS \|\| REVIEW_TIMEOUT_SECONDS/,
  );
  // Reruns share one call site and whatever is left of the same budget.
  assert.match(runner, /const endsAt = Date\.now\(\) \+ remaining \* 1_000/);
  assert.match(runner, /invocationTimeoutSeconds: budget/);
  assert.match(
    runner,
    /Math\.min\(requested, deadline - Math\.ceil\(Date\.now\(\) \/ 1000\) - 30\)/,
  );
  assert.equal((runner.match(/await runAgentInvocation\(/g) ?? []).length, 1);
  assert.match(runner, /mode === 'off'/);
  assert.match(step, /continue-on-error: true/);
  assert.match(workflow, /needs\.verify-final\.result == 'success'/);
});

test('initial and replay reviews share a configurable idle budget bounded by the invocation', () => {
  assert.match(runner, /FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS \|\| 600/);
  assert.match(runner, /Math\.min\(requestedIdle, remaining\)/);
  assert.match(
    runner,
    /invocationTimeoutSeconds: budget,\s*idleTimeoutSeconds: Math\.min\(idleTimeoutSeconds, budget\)/,
  );
  const replay = readFileSync(
    new URL('../../workflows/replay-build-review.yml', import.meta.url),
    'utf8',
  );
  for (const source of [workflow, replay]) {
    assert.match(
      source,
      /FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS:.*vars\.FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS \|\| '600'/,
    );
    assert.match(
      source,
      /FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS:.*vars\.FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS \|\| '3600'/,
    );
  }
  // The replay job also reconstructs the application and installs the reviewer.
  const replayMinutes = Number(
    /  review:\n(?:.*\n)*?    timeout-minutes: (\d+)/.exec(replay)?.[1],
  );
  assert.ok(
    replayMinutes * 60 >= 3600 + 20 * 60,
    'replay must not be killed before its review budget',
  );
});
