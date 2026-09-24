import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../workflows/code-agent-task.yml', import.meta.url), 'utf8');
const cacheInput = "${{ hashFiles('workspace/factory-source.json') == '' && 'pnpm' || '' }}";

for (const [name, next] of [['agent', 'verify-final'], ['verify-final', 'publish']]) {
  test(`${name}: local source packages never enter setup-node shared cache`, () => {
    const job = workflow.split(`  ${name}:\n`)[1].split(`  ${next}:\n`)[0];
    const setup = job.indexOf('uses: actions/setup-node@v4');
    assert.ok(setup > job.indexOf('path: workspace'), 'Source descriptor is checked out first');
    const block = job.slice(setup, job.indexOf('\n      - name:', setup));
    assert.ok(block.includes(`cache: ${cacheInput}`));
    assert.match(block, /node-version: 24.x/);
    assert.match(block, /cache-dependency-path: workspace\/pnpm-lock.yaml/);
    assert.doesNotMatch(block, /continue-on-error/);
    assert.match(job, /source-snapshot\.mjs restore workspace/);
    assert.match(job, /pnpm install --frozen-lockfile/);
  });
}

test('cache expression keeps ordinary installs cached and isolates any source descriptor', () => {
  // Evaluate the exact checked-in boolean expression with an injected hashFiles.
  // Only this literal expression is supported by this regression, not arbitrary YAML code.
  const matches = [...workflow.matchAll(/^\s+cache: (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(matches, [cacheInput, cacheInput]);
  const evaluate = new Function('hashFiles', `return (${cacheInput.slice(3, -2)});`);
  for (const hash of ['', 'a'.repeat(64)]) {
    assert.equal(evaluate(file => { assert.equal(file, 'workspace/factory-source.json'); return hash; }), hash ? '' : 'pnpm');
  }
});

test('post-cache regression does not hide failed builds or weaken the final gate', () => {
  assert.match(workflow, /needs\.agent\.result == 'success' && needs\.agent\.outputs\.handoff != 'true'/);
  assert.match(workflow, /needs\.verify-final\.result == 'success'/);
  assert.doesNotMatch(workflow, /ACTIONS_ALLOW_UNSECURE|ACTIONS_CACHE_URL:/);
});
