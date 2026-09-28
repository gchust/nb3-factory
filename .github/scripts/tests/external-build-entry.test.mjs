import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('external tasks use explicit dispatch and retain a reconcilable request identity', () => {
  const workflow = readFileSync(new URL('../../workflows/code-agent-task.yml', import.meta.url), 'utf8');
  assert.match(workflow, /external_run_id:\n\s+description:[^\n]+\n\s+required: false\n\s+type: string/);
  assert.match(workflow, /format\(' request \{0\}', inputs.external_run_id\)/);
  assert.match(workflow, /if: github.event_name != 'issues' \|\| !contains\(github.event.issue.labels.\*.name, 'factory:external'\)/);
  // Ordinary Issue and existing repository-dispatch triggers remain available.
  assert.match(workflow, /factory:external-closed-v1/);
  assert.match(workflow, /types: \[opened, reopened\]/);
  assert.match(workflow, /types: \[code-agent-task, code-agent-continue\]\n/);
});
