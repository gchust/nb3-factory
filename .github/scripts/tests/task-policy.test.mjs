import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  effectiveBudget,
  normalizeFailure,
  observedFailures,
  recordFailures,
  TASK_LIMITS,
} from '../task-policy.mjs';
import {
  budgetExhausted,
  handoffRefusal,
  initialize,
  restoreState,
  saveState,
  stopPipeline,
} from '../pipeline-state.mjs';

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

test('different Vite errors never share the generic build heading as their fingerprint', () => {
  const state = {
    failureKind: 'build',
    verificationAttempts: 0,
    repairAttempts: 0,
  };
  for (const [index, name] of ['orders', 'invoices', 'customers'].entries()) {
    state.verificationAttempts = index + 1;
    state.repairAttempts = index;
    const log = [
      'error during build:',
      'Could not resolve "./' + name + '.js" from "entry.js"',
      'file: /tmp/run-' + index + '/entry.js',
      '    at getRollupError (file:///tool.js:10:20)',
    ].join('\n');
    const failures = observedFailures('build', null, log, metadata, 'build');
    assert.equal(failures.length, 1);
    assert.ok(failures[0].symptom.includes(name + '.js'));
    assert.equal(recordFailures(state, failures, {}), null);
  }
  assert.equal(state.failureHistory.length, 3);
  assert.deepEqual(
    observedFailures(
      'build',
      null,
      'error during build:\nELIFECYCLE Command failed',
      metadata,
    ),
    [],
  );
});

test('module paths retain file identity while runner directories and coordinates vary', () => {
  const a = normalizeFailure(
    "Error: Cannot find module '/tmp/run-a/orders.js'",
  );
  assert.equal(
    a,
    normalizeFailure(
      "Error: Cannot find module '/private/tmp/run-b/orders.js'",
    ),
  );
  assert.notEqual(
    a,
    normalizeFailure("Error: Cannot find module '/tmp/run-a/invoices.js'"),
  );
  assert.equal(
    normalizeFailure(
      'Error at /home/runner/work/repo/repo/server/orders.ts:1:2',
    ),
    normalizeFailure(
      'Error at /home/runner/work/other/other/server/orders.ts:5:8',
    ),
  );
  assert.notEqual(
    normalizeFailure(
      'Error at /home/runner/work/repo/repo/server/orders.ts:1:2',
    ),
    normalizeFailure(
      'Error at /home/runner/work/repo/repo/server/invoices.ts:1:2',
    ),
  );
});

function withRun(values, callback) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('direct GitHub retries cannot initialize fresh counters or replay an older checkpoint', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task-rerun-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const stateFile = path.join(source, 'pipeline-state.json');
  withRun({ GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1' }, () => {
    const state = initialize(stateFile, metadata);
    state.repairAttempts = 5;
    stopPipeline(stateFile, state, 'repair ceiling reached');
  });
  withRun({ GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '2' }, () => {
    assert.throws(
      () => initialize(path.join(root, 'new', 'pipeline-state.json'), metadata),
      /GitHub Re-run/,
    );
    assert.throws(() => initialize(stateFile, metadata), /GitHub Re-run/);
    assert.throws(
      () => restoreState(source, path.join(root, 'restored'), metadata),
      /GitHub Re-run/,
    );
  });
  assert.equal(existsSync(path.join(root, 'new')), false);
  assert.equal(existsSync(path.join(root, 'restored')), false);
});

test('same-run restoration is idempotent and a new recovery Run retains elapsed usage', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task-same-run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const file = path.join(source, 'pipeline-state.json');
  withRun(
    {
      GITHUB_RUN_ID: '100',
      GITHUB_RUN_ATTEMPT: '1',
      FACTORY_TASK_CONTINUATION: '0',
      FACTORY_JOB_STARTED_EPOCH_SECONDS: String(
        Math.floor(Date.now() / 1000) - 1000,
      ),
    },
    () => {
      const state = initialize(file, metadata);
      state.patchHash = createHash('sha256').update('patch').digest('hex');
      state.repairAttempts = 2;
      writeFileSync(path.join(source, 'agent.patch'), 'patch');
      saveState(file, state);
      const same = restoreState(source, path.join(root, 'same'), metadata);
      assert.equal(same.activeSecondsBase, state.activeSecondsBase);
      assert.equal(same.priorExecutions, state.priorExecutions);
      withRun(
        {
          GITHUB_RUN_ID: '101',
          FACTORY_JOB_STARTED_EPOCH_SECONDS: String(
            Math.floor(Date.now() / 1000),
          ),
        },
        () => {
          const next = restoreState(source, path.join(root, 'next'), metadata);
          assert.equal(next.activeSecondsBase, state.activeSeconds);
          assert.equal(next.priorExecutions, state.priorExecutions + 1);
          assert.equal(next.repairAttempts, 2);
        },
      );
    },
  );
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
