import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../workflows/code-agent-task.yml', import.meta.url),
  'utf8',
);
const between = (start, end) => workflow.split(start)[1].split(end)[0];

test('a job timeout still seals the patch and checkpoint of work that started', () => {
  // GitHub reports timeout-minutes as a cancellation: success() and failure()
  // are both false, so only a cancelled() clause keeps hours of work.
  const patch = between(
    '- name: Create deterministic patch',
    '- name: Review build quality and framework feedback',
  );
  assert.match(
    patch,
    /cancelled\(\) && \(steps\.implementation\.outcome != 'skipped' \|\| steps\.verify\.outcome != 'skipped' \|\| steps\.failure_smoke\.outcome != 'skipped'\)/,
  );
  const allowEmpty = patch.split('ALLOW_EMPTY_PATCH:')[1].split('\n')[0];
  assert.match(allowEmpty, /steps\.implementation\.outcome == 'cancelled'/);
  assert.match(allowEmpty, /steps\.verify\.outcome == 'cancelled'/);
  const checkpoint = between(
    '- name: Confirm the handoff checkpoint',
    '- name: Dispatch continuation run',
  );
  assert.match(
    checkpoint,
    /steps\.handoff\.outcome == 'success' \|\| failure\(\) \|\| cancelled\(\)/,
  );
});

test('the failure notice can tell a runner timeout from a manual cancel', () => {
  const outcome = between('- name: Record agent outcome', '\n      - name: ');
  assert.match(outcome, /JOB_TIMEOUT_SECONDS: '21600'/);
  assert.match(outcome, /FACTORY_JOB_STARTED_EPOCH_SECONDS/);
  assert.match(outcome, /echo "timed_out=\$timed_out" >> "\$GITHUB_OUTPUT"/);
  const agentJob = between('\n  agent:\n', '\n  verify-final:\n');
  assert.match(agentJob, /\n    timeout-minutes: 360\n/);
  assert.match(
    agentJob,
    /timed_out: \$\{\{ steps\.outcome\.outputs\.timed_out \}\}/,
  );
  const reportFailure = between(
    '\n  report-failure:\n',
    '\n  dispatch-reports:\n',
  );
  assert.match(
    reportFailure,
    /FACTORY_RUN_TIMED_OUT: \$\{\{ needs\.agent\.outputs\.timed_out \}\}/,
  );
});

test('jobs reading the task artifact require a successful prepare, not just status=ready', () => {
  // prepare writes status=ready before uploading factory-task-N; outputs stay
  // visible when a later step fails, so the status alone proves nothing.
  for (const job of ['reply', 'dispatch-reports', 'dispatch-reply-history']) {
    const condition = between(`\n  ${job}:\n`, '\n    runs-on:');
    assert.match(condition, /needs\.prepare\.result == 'success'/, job);
    assert.match(condition, /needs\.prepare\.outputs\.status == 'ready'/, job);
  }
});

test('the Agent Browser npm cache is saved before any model call', () => {
  const agentJob = between('\n  agent:\n', '\n  verify-final:\n');
  const steps = agentJob.split('\n      - name: ').slice(1);
  const index = (name) =>
    steps.findIndex((step) => step.startsWith(name + '\n'));
  const restore = index('Restore the Agent Browser npm cache');
  const install = index('Install pinned Agent Browser');
  const save = index('Save the Agent Browser npm cache');
  const model = index('Run Code Agent implementation');
  assert.ok(
    restore >= 0 && install > restore && save > install && model > save,
  );
  assert.match(steps[install], /npm install --global --prefer-offline/);
  assert.match(
    steps[save],
    /steps\.browser_cache\.outputs\.cache-hit != 'true'/,
  );
  assert.match(steps[save], /continue-on-error: true/);
  assert.doesNotMatch(agentJob, /\n {8}cache: pnpm\n/);
});
