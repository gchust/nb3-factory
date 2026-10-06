import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'),
  'utf8',
);
const step = workflow
  .split('- name: Commit and push task branch\n')[1]
  .split('\n      - name: ')[0];

test('the task branch push retries a transient error and nothing else', () => {
  assert.match(step, /for attempt in 1 2 3; do/);
  // A rejection is final: retrying cannot change the answer.
  const final = /grep -qE '([^']+)' "\$RUNNER_TEMP\/push\.log"/.exec(step)?.[1];
  assert.ok(final, 'the rejection check is missing');
  for (const text of [
    'refusing to allow a GitHub App to create or update workflow `x` without `workflows` permission',
    ' ! [rejected]        HEAD -> agent/issue-1 (stale info)',
    ' ! [remote rejected] HEAD -> agent/issue-1 (protected branch)',
    'Updates were rejected because the tip of your current branch is behind (non-fast-forward)',
  ])
    assert.match(text, new RegExp(final), text);
  for (const text of [
    'fatal: unable to access: Could not resolve host: github.com',
    'error: RPC failed; HTTP 502 curl 22 The requested URL returned error: 502',
  ])
    assert.doesNotMatch(text, new RegExp(final), text);
  assert.match(step, /sleep \$\(\(attempt \* 10\)\)/);
});

test('a retry first checks whether a lost response already pushed the commit', () => {
  // The explicit lease would refuse a second push of a commit that landed.
  assert.match(step, /--force-with-lease="\$lease"/);
  assert.match(
    step,
    /\(\( attempt > 1 \)\) && \[\[ "\$\(git ls-remote origin "refs\/heads\/\$\{WORK_BRANCH\}" \| cut -f1\)" == "\$\(git rev-parse HEAD\)" \]\]/,
  );
  // The workflow-permission explanation survives the loop.
  assert.match(
    step,
    /if \[\[ "\$pushed" != true \]\]; then\n\s+if grep -q 'without `workflows` permission'/,
  );
});
