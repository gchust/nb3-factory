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
    /- name: Run Code Agent implementation\n\s+if: needs\.prepare\.outputs\.base_ref != needs\.prepare\.outputs\.work_branch/,
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
