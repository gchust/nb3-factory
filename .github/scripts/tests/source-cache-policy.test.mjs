import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../workflows/code-agent-task.yml', import.meta.url), 'utf8');
const cacheInput = "${{ hashFiles('workspace/factory-source.json') == '' && 'pnpm' || '' }}";

const jobOf = (name, next) => workflow.split(`  ${name}:\n`)[1].split(`  ${next}:\n`)[0];
const checkoutOf = (name, job) =>
  job.indexOf(
    // The agent job checks the workspace out itself; the later jobs do it
    // through the apply-task-patch composite action.
    name === 'agent' ? 'path: workspace' : 'uses: ./factory-actions/.github/actions/apply-task-patch',
  );

test('agent: local source packages never enter setup-node shared cache', () => {
  const job = jobOf('agent', 'verify-final');
  const setup = job.indexOf('uses: actions/setup-node@');
  const checkout = checkoutOf('agent', job);
  assert.ok(checkout >= 0 && setup > checkout, 'Source descriptor is checked out first');
  const block = job.slice(setup, job.indexOf('\n      - name:', setup));
  assert.ok(block.includes(`cache: ${cacheInput}`));
  assert.match(block, /node-version: 24.x/);
  assert.match(block, /cache-dependency-path: workspace\/pnpm-lock.yaml/);
  assert.doesNotMatch(block, /continue-on-error/);
  assert.match(job, /source-snapshot\.mjs restore workspace/);
  assert.match(job, /pnpm install --frozen-lockfile/);
});

// Only the agent job saves the pnpm store. The later jobs install a patched
// lockfile, and setup-node's own cache saved a second ~240 MB store whenever
// the task changed dependencies; they restore the agent job's store instead.
for (const [name, next] of [['verify-final', 'publish'], ['preview-build-failed', 'report-failure']]) {
  test(`${name}: restores the agent job's pnpm store and never saves one`, () => {
    const job = jobOf(name, next);
    const setup = job.indexOf('uses: actions/setup-node@');
    const checkout = checkoutOf(name, job);
    assert.ok(checkout >= 0 && setup > checkout, 'Source descriptor is checked out first');
    const block = job.slice(setup, job.indexOf('\n      - name:', setup));
    assert.match(block, /node-version: 24.x/);
    assert.match(block, /package-manager-cache: false/);
    assert.doesNotMatch(block, /\n\s+cache:/);
    assert.doesNotMatch(job, /actions\/cache@|actions\/cache\/save@/);
    const locate = job.split('- name: Locate the pnpm store\n')[1].split('\n      - ')[0];
    // A source descriptor keeps its isolated local store, as in the agent job.
    assert.match(locate, /if: hashFiles\('workspace\/factory-source\.json'\) == ''/);
    assert.match(locate, /working-directory: workspace/);
    assert.match(locate, /pnpm store path --silent/);
    const restore = job.split("- name: Restore the agent job's pnpm store\n")[1].split('\n      - ')[0];
    assert.match(restore, /uses: actions\/cache\/restore@[0-9a-f]{40}/);
    assert.match(restore, /path: \$\{\{ steps\.pnpm_store\.outputs\.path \}\}/);
    // setup-node's own key format: node-cache-<RUNNER_OS>-<os.arch()>-pnpm-<hash>.
    assert.match(restore, /key: node-cache-Linux-x64-pnpm-\$\{\{ hashFiles\('workspace\/pnpm-lock\.yaml'\) \}\}/);
    assert.match(restore, /restore-keys: \|\n\s+node-cache-Linux-x64-pnpm-\n/);
    assert.ok(job.indexOf("Restore the agent job's pnpm store") < job.indexOf('pnpm install --frozen-lockfile'));
    assert.match(job, /source-snapshot\.mjs restore workspace/);
  });
}

test('cache expression keeps ordinary installs cached and isolates any source descriptor', () => {
  // Evaluate the exact checked-in boolean expression with an injected hashFiles.
  // Only this literal expression is supported by this regression, not arbitrary YAML code.
  const matches = [...workflow.matchAll(/^\s+cache: (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(matches, [cacheInput]);
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
