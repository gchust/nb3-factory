import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateSmokeRequest, reason } from '../failure-smoke.mjs';

function request() {
  return {
    event: { inputs: { issue_number: '42', failure_smoke: 'true' } },
    issue: {
      number: 42,
      state: 'open',
      body: '<!-- factory-failure-smoke:v1 -->',
      labels: ['factory:external', 'factory:failure-smoke'],
    },
    context: {
      eventName: 'workflow_dispatch',
      attempt: '1',
      existingBranch: null,
    },
  };
}
test('smoke accepts only an explicit fresh dedicated issue and rejects accidental invocation', () => {
  const run = ({ event, issue, context }) =>
    validateSmokeRequest(event, issue, context);
  run(request());
  for (const mutate of [
    (r) => {
      r.event.inputs.failure_smoke = 'false';
    },
    (r) => {
      r.event.inputs.recovery_run_id = '123';
    },
    (r) => {
      r.event.inputs.external_run_id = 'external';
    },
    (r) => {
      r.context.eventName = 'issues';
    },
    (r) => {
      r.context.attempt = '2';
    },
    (r) => {
      r.context.existingBranch = {};
    },
    (r) => {
      r.issue.state = 'closed';
    },
    (r) => {
      r.issue.pull_request = {};
    },
    (r) => {
      r.issue.number = 43;
    },
    (r) => {
      r.issue.labels = ['factory:external'];
    },
    (r) => {
      r.issue.labels = ['factory:failure-smoke'];
    },
    (r) => {
      r.issue.body = 'ordinary business task';
    },
  ]) {
    const r = request();
    mutate(r);
    assert.throws(() => run(r));
  }
});

test('injection really stages safe application changes then exits failed without inventing QA', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'failed-smoke-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const workspace = path.join(root, 'workspace');
  execFileSync('git', ['clone', '--quiet', '--shared', repo, workspace]);
  const initial = {
    version: 1,
    verificationAttempts: 0,
    repairAttempts: 0,
    activeSeconds: 7,
    failureHistory: [],
    phase: 'implementation',
    outcome: 'running',
  };
  writeFileSync(
    path.join(root, 'pipeline-state.json'),
    JSON.stringify(initial),
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../failure-smoke.mjs', import.meta.url)),
      'inject',
      workspace,
      root,
      'agent/issue-42',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes(reason));
  const names = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: workspace,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  assert.equal(names.length, 6);
  assert.ok(names.every((name) => /^(client|tests)\//.test(name)));
  const state = JSON.parse(
    readFileSync(path.join(root, 'pipeline-state.json'), 'utf8'),
  );
  assert.equal(state.outcome, 'failed');
  assert.equal(state.stopReason.code, 'controlled-failure-smoke');
  assert.equal(state.activeSeconds, 7);
  assert.equal(state.verificationAttempts, 0);
  assert.equal(state.repairAttempts, 0);
  const diagnostic = JSON.parse(
    readFileSync(path.join(root, 'task-diagnostic.json'), 'utf8'),
  );
  assert.equal(diagnostic.modelInvoked, false);
  assert.equal(diagnostic.businessQA, 'not_run');
  assert.equal(diagnostic.fixtureSource.issue, 400);
});

test('smoke skips every model invocation while using the existing failed publication path', () => {
  const workflow = readFileSync(
    new URL('../../workflows/code-agent-task.yml', import.meta.url),
    'utf8',
  );
  const agent = workflow.split('  agent:\n')[1].split('  verify-final:\n')[0];
  for (const name of [
    'Run Code Agent implementation',
    'Verify and repair within task limits',
    'Review build quality and framework feedback',
  ]) {
    const step = agent.split('- name: ' + name)[1].split('\n      - name:')[0];
    assert.match(step, /inputs\.failure_smoke != true/);
  }
  assert.match(agent, /steps\.failure_smoke\.outcome == 'failure'/);
  const injected = agent
    .split('- name: Inject disclosed failure before business QA')[1]
    .split('\n      - name:')[0];
  assert.doesNotMatch(injected, /secrets\.|agent-run-env|continue-on-error/);
  assert.match(workflow, /failure_smoke:[\s\S]*?default: false/);
  assert.match(
    workflow,
    /Validate explicit failure smoke request[\s\S]*?failure-smoke.mjs validate/,
  );
});
