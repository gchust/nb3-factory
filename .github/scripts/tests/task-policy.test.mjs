import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  effectiveBudget,
  normalizeFailure,
  observedFailures,
  recordFailures,
  TASK_LIMITS,
} from '../task-policy.mjs';
import { budgetExhausted, handoffRefusal } from '../pipeline-state.mjs';

const metadata = {
  task: { acceptanceCriteria: 'B02. Save customer\nB04. Save draft' },
};
const failure = (evidence, status = 'failed') => ({
  id: 'B02',
  status,
  evidence: [evidence],
});

test('ordinary tasks have immutable ceilings and evaluation plans can only tighten them', () => {
  assert.deepEqual(effectiveBudget({}), TASK_LIMITS);
  assert.deepEqual(
    effectiveBudget({
      budget: {
        maxRepairAttempts: 10,
        maxActiveSeconds: 86400,
        maxContinuations: 10,
      },
    }),
    TASK_LIMITS,
  );
  assert.equal(
    effectiveBudget({ budget: { maxRepairAttempts: 1 } }).maxRepairAttempts,
    1,
  );
  assert.match(
    budgetExhausted({ repairAttempts: 5, activeSeconds: 0 }, 'repair'),
    /修复次数/,
  );
  assert.match(
    budgetExhausted({ repairAttempts: 0, activeSeconds: 36_000 }, 'verify'),
    /剩余主动执行时间/,
  );
  assert.equal(
    handoffRefusal({ priorExecutions: 0, activeSeconds: 100 }),
    null,
  );
  assert.match(
    handoffRefusal({ priorExecutions: 1, activeSeconds: 100 }),
    /仅允许一次/,
  );
});

test('identity ignores volatile coordinates but preserves distinct error codes and symptoms', () => {
  assert.equal(
    normalizeFailure(
      '2026-09-27T01:00:00Z Error TS1234 in /tmp/run-one/a.ts:12:4 after 23ms',
    ),
    normalizeFailure(
      '2026-09-28T01:00:00Z Error TS1234 in /tmp/run-two/a.ts:14:8 after 55ms',
    ),
  );
  assert.notEqual(normalizeFailure('HTTP 403'), normalizeFailure('HTTP 500'));
  assert.notEqual(
    normalizeFailure('Error TS2339'),
    normalizeFailure('Error TS2322'),
  );
});

test('distinct symptoms within one criterion and blocked checks are not counted as the same failure', () => {
  const state = {
    failureKind: 'browser',
    verificationAttempts: 1,
    repairAttempts: 0,
  };
  const first = observedFailures(
    'browser',
    {
      checks: [
        failure('Remark disappears'),
        failure('provider absent', 'blocked'),
      ],
    },
    '',
    metadata,
  );
  assert.equal(first.length, 1);
  assert.equal(recordFailures(state, first, { log: 'verify-1.log' }), null);
  recordFailures(state, first, { log: 'verify-1.log' });
  assert.equal(
    state.failureHistory[0].occurrences.length,
    1,
    'duplicate capture of one round is idempotent',
  );
  state.verificationAttempts = 2;
  recordFailures(
    state,
    observedFailures(
      'browser',
      { checks: [failure('Customer is duplicated')] },
      '',
      metadata,
    ),
    {},
  );
  assert.equal(state.failureHistory.length, 2);
  state.verificationAttempts = 3;
  recordFailures(state, first, {});
  state.verificationAttempts = 4;
  assert.equal(recordFailures(state, first, {}).occurrences.length, 3);
  assert.doesNotMatch(
    JSON.stringify(state),
    /Remark disappears/,
    'raw observations stay in original evidence',
  );
});

test('build diagnostics count stable compiler failures and ignore generic command wrappers', () => {
  const failures = observedFailures(
    'build',
    null,
    'Error TS2339: Missing property\nCommand failed\nELIFECYCLE error',
    metadata,
    'typecheck',
  );
  assert.equal(failures.length, 1);
  assert.equal(failures[0].criterion, 'typecheck');
});

test('the standalone handoff protocol refuses a second continuation before writing or network access', () => {
  for (const command of ['prepare', 'dispatch']) {
    const result = spawnSync(
      process.execPath,
      [
        new URL('../handoff.mjs', import.meta.url).pathname,
        command,
        '--issue',
        '1',
        command === 'prepare' ? '--run-id' : '--previous-run-id',
        '123',
        '--continuation',
        '2',
        '--output',
        '/must-not-be-written.json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /only one five-hour Handoff/);
  }
});
