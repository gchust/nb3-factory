import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { budgetDeadline, continuationRefusal } from '../evaluation-budget.mjs';
import { budgetExhausted, initialize, readState, restoreState, saveState } from '../pipeline-state.mjs';
import { temporary } from './evaluation-fixtures.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const budget = { maxRepairAttempts: 1, maxActiveSeconds: 3600, maxContinuations: 1 };
const metadata = (withBudget = true) => ({ issue: { number: 7 }, task: { targetBranch: 'develop', taskType: 't', requirements: 'r', acceptanceCriteria: '1. Works', sampleData: '是' },
  ...(withBudget ? { evaluation: { version: 1, runKey: 'o/r/batches/b/F00/1', kind: 'batch-sample', budget } } : {}) });
function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('the budget is copied once into the checkpoint; handoff and recovery restore it and keep counting active time', t => {
  const root = temporary(t);
  const file = path.join(root, 'a', 'pipeline-state.json');
  withEnv({ FACTORY_JOB_STARTED_EPOCH_SECONDS: String(Math.floor(Date.now() / 1000) - 1000) }, () => {
    const state = initialize(file, metadata());
    assert.deepEqual(state.budget, budget);
    state.patchHash = createHash('sha256').update('').digest('hex');
    saveState(file, state);
  });
  assert.ok(readState(file).activeSeconds >= 1000);
  writeFileSync(path.join(root, 'a', 'agent.patch'), '');
  // A continuation cannot change the budget: a different one is refused, not adopted.
  assert.throws(() => restoreState(path.join(root, 'a'), path.join(root, 'x'),
    { ...metadata(), evaluation: { ...metadata().evaluation, budget: { ...budget, maxActiveSeconds: 86_400 } } }), /trusted evaluation sample budget/);
  const restored = withEnv({ FACTORY_JOB_STARTED_EPOCH_SECONDS: String(Math.floor(Date.now() / 1000) - 500) },
    () => restoreState(path.join(root, 'a'), path.join(root, 'b'), metadata()));
  assert.equal(restored.budget.maxActiveSeconds, 3600);
  assert.ok(readState(path.join(root, 'b', 'pipeline-state.json')).activeSeconds >= 1500);
  assert.equal(initialize(path.join(root, 'plain', 'pipeline-state.json'), metadata(false)).budget, undefined, 'ordinary tasks have no budget');
  // The checkpoint shares the Agent's runner: a removed budget is refused, and GitHub's job records are a floor.
  const tampered = readState(file); delete tampered.budget; writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => restoreState(path.join(root, 'a'), path.join(root, 'c'), metadata()), /trusted evaluation sample budget/);
  const reset = { ...readState(path.join(root, 'b', 'pipeline-state.json')), activeSeconds: 0, priorExecutions: 0 };
  writeFileSync(path.join(root, 'b', 'agent.patch'), '');
  writeFileSync(path.join(root, 'b', 'pipeline-state.json'), JSON.stringify(reset));
  const trustedMetadata = { ...metadata(), evaluation: { ...metadata().evaluation, budgetUsed: { activeSeconds: 2400, executions: 2 } } };
  const floored = restoreState(path.join(root, 'b'), path.join(root, 'd'), trustedMetadata);
  assert.equal(floored.activeSecondsBase, 2400);
  assert.equal(floored.priorExecutions, 2);
  assert.match(continuationRefusal(floored, 1), /续跑次数/, 'a recovery cannot reset the continuation count');
  // A re-run attempt starts a fresh checkpoint but inherits the measured usage.
  const rerun = initialize(path.join(root, 'rerun', 'pipeline-state.json'), trustedMetadata);
  assert.equal(rerun.activeSeconds, 2400);
});

test('repair count and remaining active time stop new phases before they start', () => {
  const state = { budget, repairAttempts: 0, fullQaSeconds: 1200, activeSeconds: 0, activeSecondsBase: 0 };
  assert.equal(budgetExhausted(state, 'repair'), null);
  assert.match(budgetExhausted({ ...state, repairAttempts: 1 }, 'repair'), /修复次数/);
  const now = 10_000;
  withEnv({ FACTORY_JOB_STARTED_EPOCH_SECONDS: String(now - 2000) }, () => {
    // 3600 − 2000 − 300 reserve = 1300 s left: enough to verify, not enough for a 1320 s full QA.
    assert.equal(budgetExhausted(state, 'verify', now), null);
    assert.match(budgetExhausted(state, 'qa-full', now), /剩余主动执行时间/);
    assert.equal(budgetDeadline(state, now + 18_000, now), now + 1300, 'long calls end before the budget, leaving archive time');
    assert.equal(budgetDeadline(state, now + 600, now), now + 600, 'never extends the runner deadline');
    assert.equal(continuationRefusal(state, 1, now), null);
    assert.match(continuationRefusal(state, 2, now), /续跑次数/);
  });
  withEnv({ FACTORY_JOB_STARTED_EPOCH_SECONDS: String(now - 3500) }, () => assert.match(continuationRefusal(state, 1, now), /已用尽/));
  assert.equal(budgetExhausted({ repairAttempts: 99 }, 'repair'), null, 'no budget, no change');
});

test('the handoff guard marks budget-exhausted and refuses the continuation; the repair loop exits 76 without a handoff', t => {
  const root = temporary(t);
  const file = path.join(root, 'pipeline-state.json');
  initialize(file, metadata());
  const refused = spawnSync(process.execPath, [path.join(scripts, 'evaluation-budget.mjs'), 'handoff', file, '2'], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.equal(readState(file).outcome, 'budget-exhausted');
  // Real repair loop with stub checks: QA always fails, the plan allows one factory repair.
  const control = path.join(root, 'control'), stub = path.join(control, '.github', 'scripts');
  mkdirSync(stub, { recursive: true }); mkdirSync(path.join(control, '.github', 'prompts'), { recursive: true });
  const workspace = path.join(root, 'workspace'); mkdirSync(workspace);
  writeFileSync(path.join(control, '.github', 'prompts', 'repair.md'), 'repair\n');
  const exe = (name, body) => { writeFileSync(path.join(stub, name), body); chmodSync(path.join(stub, name), 0o755); };
  exe('verify.sh', '#!/usr/bin/env bash\n[[ "${FACTORY_SKIP_BROWSER:-}" == "1" ]]\n');
  exe('browser-acceptance.sh', '#!/usr/bin/env bash\nexit 10\n');
  writeFileSync(path.join(stub, 'create-runtime-config.mjs'), 'process.exit(0);\n');
  writeFileSync(path.join(stub, 'qa-retest.mjs'), 'process.exit(0);\n');
  writeFileSync(path.join(stub, 'build-repair-prompt.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[process.argv.indexOf('--output') + 1], 'x');\n");
  writeFileSync(path.join(stub, 'run-agent.mjs'), "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.REPAIR_LOG, 'repair\\n');\n");
  const task = path.join(root, 'task.json'); writeFileSync(task, JSON.stringify(metadata()));
  writeFileSync(path.join(root, 'prompt.md'), 'implement\n');
  const artifacts = path.join(root, 'artifacts');
  const log = path.join(root, 'repairs.log');
  const run = spawnSync(path.join(scripts, 'verify-and-repair.sh'), [control, workspace, path.join(root, 'prompt.md'), task, artifacts, path.join(root, 'state')],
    { env: { ...process.env, REPAIR_LOG: log }, encoding: 'utf8' });
  assert.equal(run.status, 76, run.stderr);
  assert.equal(readFileSync(log, 'utf8'), 'repair\n', 'exactly the budgeted number of factory repairs');
  const summary = JSON.parse(readFileSync(path.join(artifacts, 'repair-summary.json'), 'utf8'));
  assert.equal(summary.budgetExhausted, true);
  assert.equal(readState(path.join(artifacts, 'pipeline-state.json')).outcome, 'budget-exhausted');
});

test('the task workflow applies the sample budget and the frozen sample control plane only through trusted scripts', () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'), 'utf8');
  const pin = workflow.split('- name: Resolve a frozen evaluation sample control plane')[1].split('- name:')[0];
  assert.match(pin, /bootstrap\/\.github\/scripts\/evaluation-sample\.mjs pin/);
  assert.match(pin, /github\.event\.action != 'code-agent-continue' && inputs\.recovery_run_id == ''/);
  assert.doesNotMatch(pin, /client_payload\.control_sha|inputs\.control/);
  assert.match(workflow, /--current-sha "\$\{SAMPLE_CONTROL_SHA:-\$\(git -C bootstrap rev-parse HEAD\)\}"/);
  assert.match(workflow, /\/\.github\/scripts\/evaluation-sample\.mjs\n/);
  assert.match(workflow, /FACTORY_JOB_STARTED_EPOCH_SECONDS=\$\(date \+%s\)/);
  assert.match(workflow, /evaluation-budget\.mjs deadline/);
  const handoff = workflow.split('- name: Prepare runner handoff metadata')[1].split('- name:')[0];
  assert.ok(handoff.indexOf('evaluation-budget.mjs handoff') < handoff.indexOf('handoff.mjs prepare'));
  for (const guard of workflow.match(/evaluation-budget\.mjs (?:deadline|handoff)/g)) assert.ok(guard);
  assert.equal((workflow.match(/\[\[ -f control\/\.github\/scripts\/evaluation-budget\.mjs \]\]/g) ?? []).length, 2, 'older pinned control planes are unaffected');
});
