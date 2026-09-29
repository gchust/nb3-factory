import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('external tasks use explicit dispatch and retain a reconcilable request identity', () => {
  const workflow = readFileSync(new URL('../../workflows/code-agent-task.yml', import.meta.url), 'utf8');
  assert.match(workflow, /external_run_id:\n\s+description:[^\n]+\n\s+required: false\n\s+type: string/);
  assert.match(workflow, /format\(' request \{0\}', inputs.external_run_id\)/);
  assert.match(workflow, /github.event_name != 'issues' \|\|\s+\(!contains\(github.event.issue.labels.\*.name, 'factory:external'\) &&/);
  // A public Issue only starts a model run when its author has repository access.
  assert.match(workflow, /contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github.event.issue.author_association\)\)/);
  // Ordinary Issue and existing repository-dispatch triggers remain available.
  assert.match(workflow, /factory:external-closed-v1/);
  assert.match(workflow, /types: \[opened, reopened\]/);
  assert.match(workflow, /types: \[code-agent-task, code-agent-continue\]\n/);
});
