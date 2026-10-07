import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Exercise the actual workflow expressions, including a PR with no dry_run
// input. Missing manual inputs must never turn a PR into a publishing run.
test('PR template verification is read-only, tests the merge commit, and cannot publish', async () => {
  const { runInNewContext } = await import('node:vm');
  const workflow = readFileSync(path.resolve(import.meta.dirname, '../../workflows/refresh-template.yml'), 'utf8');
  const [generator, publisher] = workflow.split('\n  publish:');
  const generateIf = generator
    .match(/  generate:\n(?:    #.*\n)*    if: >-\n((?:      .+\n)+)/)[1]
    .replace(/\s+/g, ' ')
    .trim();
  const publishIf = publisher.match(/    if: \$\{\{ (.+) \}\}/)[1];
  const checkoutRef = generator.match(/          ref: \$\{\{ (.+) \}\}/)[1];
  const evaluate = (expression, event, actor, sameRepository, dryRun = false, headRef = 'feature') =>
    runInNewContext(expression, {
      // GitHub's case-insensitive startsWith.
      startsWith: (value, prefix) => String(value).toLowerCase().startsWith(String(prefix).toLowerCase()),
      github: {
        actor, repository_owner: 'owner', repository: 'owner/factory',
        event_name: event, sha: 'tested-merge-sha', head_ref: event === 'pull_request' ? headRef : '',
        event: { number: 123, pull_request: { head: { repo: { full_name: sameRepository ? 'owner/factory' : 'fork/factory' } } } },
      },
      inputs: event === 'workflow_dispatch' ? { dry_run: dryRun } : {},
    });
  for (const [event, actor, sameRepo, dryRun, generate, publish] of [
    ['pull_request', 'owner', true, false, true, false],
    // A PR check runs for any author and fork (a skipped check passes).
    ['pull_request', 'other', true, false, true, false],
    ['pull_request', 'other', false, false, true, false],
    ['workflow_dispatch', 'owner', true, false, true, true],
    ['workflow_dispatch', 'owner', true, true, true, false],
    ['workflow_dispatch', 'other', true, false, false, false],
    ['push', 'owner', true, false, false, false],
  ]) {
    const actualGenerate = evaluate(generateIf, event, actor, sameRepo, dryRun);
    assert.equal(actualGenerate, generate);
    assert.equal(actualGenerate && evaluate(publishIf, event, actor, sameRepo, dryRun), publish);
  }
  // A build task PR changes the application only and never lands on develop.
  assert.equal(evaluate(generateIf, 'pull_request', 'owner', true, false, 'agent/issue-42'), false);
  assert.equal(evaluate(checkoutRef, 'pull_request', 'owner', true), 'tested-merge-sha');
  assert.equal(evaluate(checkoutRef, 'workflow_dispatch', 'owner', true), 'develop');
  assert.match(generator, /pull_request:\n    branches: \[develop\]/);
  assert.match(generator, /Require develop as the selected workflow branch\n        if: github.event_name == 'workflow_dispatch'/);
  assert.match(generator, /contents: read/);
  assert.doesNotMatch(generator, /contents: write|secrets\.|pull_request_target/);
  assert.match(generator, /persist-credentials: false/);
  assert.match(generator, /control\/\.github\/scripts\/verify.sh/);
});
