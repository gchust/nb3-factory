// Round-12 review of the task workflow: the downloads of final verification
// and of both comment-reply jobs retry once instead of failing a finished
// build or dropping a reply on one transient artifact error.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const workflow = readFileSync(
  path.join(root, '.github/workflows/code-agent-task.yml'),
  'utf8',
);
const jobOf = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `missing job ${name}`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
const retried =
  /uses: \.\/factory-actions\/\.github\/actions\/download-with-retry\n/g;
const checkout =
  /- name: Check out the workflow's composite actions\n\s+uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+ref: \$\{\{ github\.sha \}\}\n\s+path: factory-actions\n\s+sparse-checkout-cone-mode: false\n\s+sparse-checkout: \|\n\s+\/\.github\/actions\/\n\s+persist-credentials: false\n/;

test('final verification and comment replies retry their downloads', () => {
  for (const [name, count] of [
    ['verify-final', 1],
    ['reply', 1],
    ['publish-reply', 2],
  ]) {
    const job = jobOf(name);
    assert.match(job, checkout, name);
    assert.equal([...job.matchAll(retried)].length, count, name);
    // The composite actions are checked out before the first retried download.
    assert.ok(
      job.search(checkout) < job.search(retried),
      `${name} uses the action before checking it out`,
    );
    // No plain download of these artifacts is left in the job.
    assert.doesNotMatch(
      job,
      /download-artifact@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+name: factory-(task|comment-reply)-/,
      name,
    );
  }
  assert.match(
    jobOf('verify-final'),
    /- name: Download trusted final verification task\n\s+uses: \.\/factory-actions\/\.github\/actions\/download-with-retry\n\s+with:\n\s+name: factory-task-\$\{\{ needs\.prepare\.outputs\.issue_number \}\}\n\s+path: final-task\n/,
  );
  // publish-reply still checks out only the scripts it runs from control/,
  // before the composite actions: the root checkout cleans the workspace and
  // would delete a factory-actions/ checked out ahead of it.
  const publishReply = jobOf('publish-reply');
  const scripts = /sparse-checkout: \.github\/scripts\n/;
  assert.match(publishReply, scripts);
  assert.ok(
    publishReply.search(scripts) < publishReply.search(checkout),
    'publish-reply checks out its scripts before the composite actions',
  );
  assert.match(jobOf('publish-reply'), /timeout-minutes: 7\n/);
});
