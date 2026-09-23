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
    /CODE_AGENT_ENGINE: \$\{\{ vars\.CODE_AGENT_ENGINE \}\}/,
  );
  assert.doesNotMatch(workflow, /pi-coding-agent|run-pi\.mjs|pi\.patch/);
});

test('each engine receives only its own secrets and configuration', () => {
  const linesOf = (name) =>
    workflow.split('\n').filter((line) => line.includes(`${name}:`));
  const apiKeys = linesOf('CODE_AGENT_API_KEY');
  const tokens = linesOf('CODEBUDDY_AUTH_TOKEN');
  const codebuddyKeys = linesOf('CODEBUDDY_API_KEY');
  assert.equal(apiKeys.length, 1); // shared by implementation, repair/QA and reply
  // Repair/QA, independent review, reply invocation and credential scrub share
  // one selected-engine map. The trusted publishers must not receive it.
  assert.equal((workflow.match(/env: \*agent-run-env/g) ?? []).length, 4);
  const scrub = workflow.split('- name: Collect comment reply diagnostics')[1]
    .split('- name: Save reply for trusted publisher')[0];
  assert.match(scrub, /if: always\(\)/);
  assert.match(scrub, /env: \*agent-run-env/);
  assert.match(scrub, /agent-invocation-record\.mjs stage-reply/);
  assert.doesNotMatch(workflow.split('  publish-reply:')[1], /agent-run-env|secrets\./);
  assert.equal((workflow.match(/env: \*agent-install-env/g) ?? []).length, 1);
  assert.equal(tokens.length, 1);
  assert.equal(codebuddyKeys.length, 1);
  for (const line of apiKeys) {
    assert.ok(
      line.includes(
        "(vars.CODE_AGENT_ENGINE == '' || vars.CODE_AGENT_ENGINE == 'pi') && (secrets.CODE_AGENT_API_KEY || secrets.PI_API_KEY) || ''",
      ),
      line,
    );
  }
  for (const line of tokens) {
    assert.ok(
      line.includes(
        "vars.CODE_AGENT_ENGINE == 'codebuddy' && secrets.CODEBUDDY_AUTH_TOKEN || ''",
      ),
      line,
    );
  }
  for (const line of codebuddyKeys) {
    assert.ok(
      line.includes(
        "vars.CODE_AGENT_ENGINE == 'codebuddy' && secrets.CODEBUDDY_API_KEY || ''",
      ),
      line,
    );
  }
  for (const expected of [
    "CODEBUDDY_MODEL: ${{ vars.CODE_AGENT_ENGINE == 'codebuddy' && vars.CODEBUDDY_MODEL || '' }}",
    "CODEBUDDY_THINKING: ${{ vars.CODEBUDDY_THINKING || 'max' }}",
    "CODEBUDDY_BASE_URL: ${{ vars.CODE_AGENT_ENGINE == 'codebuddy' && vars.CODEBUDDY_BASE_URL || '' }}",
    "CODE_AGENT_API_ENDPOINT: ${{ (vars.CODE_AGENT_ENGINE == '' || vars.CODE_AGENT_ENGINE == 'pi') && (secrets.CODE_AGENT_API_ENDPOINT || secrets.PI_API_ENDPOINT) || '' }}",
    'CODEBUDDY_VERSION: ${{ vars.CODEBUDDY_VERSION }}',
    'PI_VERSION: ${{ vars.PI_VERSION }}',
  ]) {
    assert.ok(workflow.includes(expected), expected);
  }
});

test('new engines have explicit credential mappings, never a Pi fallback', () => {
  for (const [engine, secret] of [
    ['claude-code', 'ANTHROPIC_API_KEY'], ['claude-code', 'CLAUDE_CODE_OAUTH_TOKEN'],
    ['codex', 'CODEX_API_KEY'], ['opencode', 'OPENCODE_API_KEY'],
  ]) {
    assert.ok(workflow.includes(`vars.CODE_AGENT_ENGINE == '${engine}' && secrets.${secret} || ''`));
  }
  assert.doesNotMatch(workflow, /CODE_AGENT_ENGINE != 'codebuddy'/);
  assert.doesNotMatch(workflow, /toJSON\(secrets\)|<<:/);
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
    .filter(
      (line) =>
        line.includes('CODE_AGENT_INVOCATION_TIMEOUT_SECONDS:') &&
        !line.includes("'900'"),
    );
  const thinkingLines = workflow
    .split('\n')
    .filter((line) => line.includes('CODE_AGENT_THINKING:'));
  assert.equal(timeoutLines.length, 1);
  assert.match(workflow, /CODE_AGENT_INVOCATION_TIMEOUT_SECONDS=900 node/);
  assert.equal(thinkingLines.length, 1);
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
  const allowEmpty = patch.split('ALLOW_EMPTY_PATCH:')[1].split('\n')[0];
  assert.match(allowEmpty, /steps\.implementation\.outcome == 'failure'/);
  assert.match(allowEmpty, /steps\.verify\.outcome == 'failure'/);
  // Status check functions only work in if, not step env expressions.
  assert.doesNotMatch(allowEmpty, /(?:always|cancelled|failure|success)\(\)/);
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

test('comment questions bypass implementation and publish replies through an isolated job', () => {
  assert.match(
    workflow,
    /if: needs.prepare.outputs.status == 'ready' && needs.prepare.outputs.comment_kind != 'reply'/,
  );
  const reply = workflow.split('  reply:')[1].split('  publish-reply:')[0];
  assert.doesNotMatch(reply, /GITHUB_TOKEN:|issues: write|contents: write/);
  assert.match(reply, /contents: read/);
  assert.match(reply, /persist-credentials: false/);
  assert.match(reply, /needs.agent.outputs.handoff != 'true'/);
  assert.match(
    workflow,
    /BUILD_COMMENT_ID: \$\{\{ needs.prepare.outputs.build_comment_id \}\}/,
  );
  assert.match(
    workflow,
    /base_ref != needs.prepare.outputs.work_branch \|\| needs.prepare.outputs.build_comment_id != ''/,
  );
});

test('runner-local timing paths are initialized in steps, not job-level env', () => {
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
  assert.doesNotMatch(workflow, /^ {6}FACTORY_.*\$\{\{ runner\./m);
  assert.match(
    workflow,
    /FACTORY_TIMINGS_FILE=\$RUNNER_TEMP\/agent-artifacts\/timings\.jsonl/,
  );
  assert.match(
    workflow,
    /FACTORY_TIMINGS_FILE=\$RUNNER_TEMP\/final-artifacts\/timings\.jsonl/,
  );
  assert.match(
    workflow,
    /FACTORY_DEPENDENCY_CACHE=\$RUNNER_TEMP\/agent-dependency-cache/,
  );
});
