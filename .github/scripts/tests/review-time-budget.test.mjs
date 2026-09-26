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

test('outer review timeout leaves time for the largest accepted invocation and checkpoint publication', () => {
  const maximumSeconds = Number(/requested > (\d+)/.exec(runner)?.[1]);
  const stepMinutes = Number(/timeout-minutes: (\d+)/.exec(step)?.[1]);
  assert.ok(Number.isSafeInteger(maximumSeconds) && maximumSeconds > 0);
  assert.ok(Number.isSafeInteger(stepMinutes) && stepMinutes > 0);
  assert.ok(
    stepMinutes * 60 >= maximumSeconds + 120,
    'Actions must not kill the reviewer before its own timeout can persist a validated checkpoint',
  );
});

test('budget alignment retains one bounded invocation, non-scored lightweight mode and business gates', () => {
  assert.match(runner, /FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS \|\| 900/);
  assert.match(runner, /invocationTimeoutSeconds: remaining/);
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
    /invocationTimeoutSeconds: remaining,\s*idleTimeoutSeconds/,
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
  }
});
