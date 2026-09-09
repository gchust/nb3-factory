import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'workflows',
    'code-agent-task.yml',
  ),
  'utf8',
);

test('an existing Code Agent work branch goes straight to verification and repair', () => {
  assert.match(
    workflow,
    /needs\.prepare\.outputs\.base_ref != needs\.prepare\.outputs\.work_branch/,
  );
});

test('workflow uses the generic runner and new settings with legacy fallback', () => {
  assert.match(workflow, /node control\/\.github\/scripts\/install-agent\.mjs/);
  assert.match(
    workflow,
    /CODE_AGENT_API_KEY: \$\{\{ secrets\.CODE_AGENT_API_KEY \|\| secrets\.PI_API_KEY \}\}/,
  );
  assert.match(
    workflow,
    /CODE_AGENT_ENGINE: \$\{\{ vars\.CODE_AGENT_ENGINE \}\}/,
  );
  assert.doesNotMatch(workflow, /pi-coding-agent|run-pi\.mjs|pi\.patch/);
});

test('different Issues run concurrently while one Issue stays serialized', () => {
  assert.doesNotMatch(workflow, /group: code-agent-global/);
  assert.match(
    workflow,
    /group: code-agent-task-\$\{\{ github\.event\.issue\.number \|\| github\.event\.client_payload\.issue_number \|\| inputs\.issue_number \|\| github\.run_id \}\}/,
  );
  assert.match(workflow, /queue: max/);
});

test('PR completion uses only trusted control-plane code for both branch generations', () => {
  const completion = readFileSync(
    path.resolve(
      import.meta.dirname,
      '..',
      '..',
      'workflows',
      'code-agent-pr-completed.yml',
    ),
    'utf8',
  );
  assert.match(completion, /pull_request_target:\n\s+types: \[closed\]/);
  assert.match(completion, /github\.event\.repository\.default_branch/);
  assert.match(completion, /'agent\/issue-'/);
  assert.match(completion, /'pi\/issue-'/);
  assert.doesNotMatch(completion, /pnpm|npm|pull_request\.head\.sha|secrets\./);
});

test('implementation and repair default to unlimited invocations and max thinking', () => {
  const timeoutLines = workflow
    .split('\n')
    .filter((line) => line.includes('CODE_AGENT_INVOCATION_TIMEOUT_SECONDS:'));
  const thinkingLines = workflow
    .split('\n')
    .filter((line) => line.includes('CODE_AGENT_THINKING:'));
  assert.equal(timeoutLines.length, 2);
  assert.equal(thinkingLines.length, 2);
  for (const line of timeoutLines)
    assert.match(line, /vars\.PI_INVOCATION_TIMEOUT_SECONDS \|\| '0'/);
  for (const line of thinkingLines)
    assert.match(line, /vars\.PI_THINKING \|\| 'max'/);
  assert.match(workflow, /timeout-minutes: 360/);
});

test('runner budget checkpoints and continues instead of failing at six hours', () => {
  assert.match(workflow, /code-agent-continue/);
  assert.match(workflow, /FACTORY_RUN_DEADLINE_EPOCH_SECONDS=.*18000/);
  assert.match(
    workflow,
    /factory-handoff-\$\{\{ needs\.prepare\.outputs\.issue_number \}\}/,
  );
  assert.match(
    workflow,
    /run-id: \$\{\{ github\.event\.client_payload\.previous_run_id \}\}/,
  );
  assert.match(workflow, /steps\.implementation\.outputs\.handoff == 'true'/);
  assert.match(workflow, /steps\.verify\.outputs\.handoff == 'true'/);
  assert.match(workflow, /needs\.agent\.outputs\.handoff != 'true'/);
  assert.match(workflow, /handoff\.mjs dispatch/);
});

test('continuation skips initial implementation and restores the previous patch', () => {
  assert.match(workflow, /github\.event\.action == 'code-agent-continue'/);
  assert.match(workflow, /--patch handoff\/agent\.patch/);
  assert.match(
    workflow,
    /!\(github\.event_name == 'repository_dispatch' && github\.event\.action == 'code-agent-continue'\)/,
  );
});

test('a failed agent preserves a checkpoint but cannot publish or automatically continue', () => {
  const patch = workflow
    .split('- name: Create deterministic patch')[1]
    .split('- name: Prepare runner handoff metadata')[0];
  assert.match(
    patch,
    /failure\(\) && \(steps\.implementation\.outcome == 'failure' \|\| steps\.verify\.outcome == 'failure'\)/,
  );
  assert.match(patch, /id: patch/);
  assert.match(patch, /ALLOW_EMPTY_PATCH: \$\{\{ failure\(\)/);
  const checkpoint = workflow
    .split('- name: Upload handoff checkpoint')[1]
    .split('- name: Dispatch continuation run')[0];
  assert.match(checkpoint, /always\(\) && steps\.patch\.outcome == 'success'/);
  assert.match(
    checkpoint,
    /steps\.handoff\.outcome == 'success' \|\| failure\(\)/,
  );
  const dispatch = workflow
    .split('- name: Dispatch continuation run')[1]
    .split('- name: Record agent outcome')[0];
  assert.match(dispatch, /if: steps\.handoff\.outcome == 'success'/);
  assert.match(
    workflow,
    /if: needs\.agent\.result == 'success' && needs\.agent\.outputs\.handoff != 'true'/,
  );
  assert.match(workflow, /if: needs\.verify-final\.result == 'success'/);
});
