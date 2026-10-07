// Round 11 of the Actions review, infrastructure: the source baseline check
// skips inputs an earlier run of the same pull request verified, the agent
// CLI check runs weekly and owns its npm cache, the preview connection is one
// composite action, and the hourly preview GC spares a dependency cache that a
// deploy has just counted on.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { depsProbeCommand } from '../preview-host.mjs';
import {
  WORKFLOW,
  inputFingerprint,
  pathMatcher,
  pullRequestPaths,
} from '../source-baseline-inputs.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const root = path.resolve(scripts, '..', '..');
const read = (file) => readFileSync(file, 'utf8');
const workflow = (name) => read(path.resolve(scripts, '..', 'workflows', name));
const jobOf = (source, name) =>
  source.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const stepOf = (source, name) =>
  source.split(`- name: ${name}\n`)[1].split(/\n\s+- (?=name:|uses:)/)[0];
const temp = (t, prefix) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('the source baseline fingerprint reads exactly the pull_request path filters', () => {
  const source = workflow('source-baseline.yml');
  const paths = pullRequestPaths(source);
  // An independent reading of the same block: every quoted list item between
  // `paths:` and the next trigger.
  const block = source
    .split('\n    paths:\n')[1]
    .split('\n  workflow_dispatch:')[0];
  assert.deepEqual(
    paths,
    [...block.matchAll(/^\s+- '([^']+)'$/gm)].map(([, value]) => value),
  );
  assert.ok(paths.includes(WORKFLOW));
  assert.ok(paths.includes('.github/scripts/source-*.mjs'));
  const matches = pathMatcher(paths);
  // The fingerprint script and the default source SHA are inputs themselves.
  assert.ok(matches('.github/scripts/source-baseline-inputs.mjs'));
  assert.ok(matches('.github/scripts/source-baseline-ref.mjs'));
  assert.ok(matches('package.json'));
  // `*` stays inside one segment, as in GitHub's filters.
  assert.equal(matches('.github/scripts/source-x/y.mjs'), false);
  assert.equal(matches('client/package.json'), false);
  assert.equal(matches('.github/scripts/deploy-preview.mjs'), false);
  // A pattern this reader does not understand is refused, not hashed loosely.
  for (const pattern of [
    '.github/**',
    '.github/scripts/[ab].mjs',
    '!README.MD',
  ])
    assert.throws(() => pathMatcher([pattern]), /unsupported path filter/);
});

test('the fingerprint changes with an input file and only with an input file', (t) => {
  const repo = temp(t, 'nb3-review11-inputs-');
  const git = (...args) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(repo, '.github/scripts'), { recursive: true });
  writeFileSync(path.join(repo, WORKFLOW), workflow('source-baseline.yml'));
  writeFileSync(
    path.join(repo, '.github/scripts/source-config-check.mjs'),
    'one\n',
  );
  writeFileSync(path.join(repo, '.github/scripts/deploy-preview.mjs'), 'one\n');
  writeFileSync(path.join(repo, 'package.json'), '{}\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  const base = inputFingerprint(repo);
  assert.match(base, /^[0-9a-f]{64}$/);
  // The checkout's committed state, not the working tree.
  writeFileSync(path.join(repo, 'package.json'), '{"x":1}\n');
  assert.equal(inputFingerprint(repo), base);
  git('checkout', '-q', 'package.json');

  writeFileSync(path.join(repo, '.github/scripts/deploy-preview.mjs'), 'two\n');
  git('commit', '-qam', 'not an input');
  assert.equal(inputFingerprint(repo), base);

  writeFileSync(
    path.join(repo, '.github/scripts/source-config-check.mjs'),
    'two\n',
  );
  git('commit', '-qam', 'an input');
  const changed = inputFingerprint(repo);
  assert.notEqual(changed, base);

  writeFileSync(path.join(repo, '.github/scripts/source-new.mjs'), 'new\n');
  git('add', '-A');
  git('commit', '-qm', 'a new input');
  assert.notEqual(inputFingerprint(repo), changed);

  // The CLI the workflow runs prints the same value.
  assert.equal(
    execFileSync(
      'node',
      [path.join(scripts, 'source-baseline-inputs.mjs'), repo],
      {
        encoding: 'utf8',
      },
    ).trim(),
    inputFingerprint(repo),
  );
});

test('a pull request run skips only inputs the same pull request already verified', () => {
  const source = workflow('source-baseline.yml');
  const supersede = jobOf(source, 'supersede');
  assert.match(
    supersede,
    /\n {6}inputs: \$\{\{ steps\.inputs\.outputs\.fingerprint \}\}\n/,
  );
  assert.match(
    supersede,
    /\n {6}verified: \$\{\{ steps\.verified\.outputs\.verified \}\}\n/,
  );
  // It checks out the merge commit this run verifies, without credentials.
  assert.match(
    supersede,
    /ref: \$\{\{ github\.sha \}\}\n {10}path: control\n {10}persist-credentials: false/,
  );
  assert.match(
    supersede,
    /permissions:\n {6}contents: read\n {6}pull-requests: read\n/,
  );

  // Every lookup step fails open; the skip itself is the only one that may not.
  for (const step of [
    'Fingerprint the files this check verifies',
    'Look for an earlier run of this pull request that verified them',
  ])
    assert.match(stepOf(supersede, step), /continue-on-error: true/, step);
  assert.match(
    stepOf(supersede, 'Fingerprint the files this check verifies'),
    /node control\/\.github\/scripts\/source-baseline-inputs\.mjs control\)/,
  );
  const lookup = stepOf(
    supersede,
    'Look for an earlier run of this pull request that verified them',
  );
  assert.match(
    lookup,
    /if: steps\.inputs\.outputs\.fingerprint != '' && github\.run_attempt == '1'/,
  );
  assert.match(lookup, /uses: actions\/cache\/restore@[0-9a-f]{40} /);
  assert.doesNotMatch(
    lookup,
    /restore-keys/,
    'only an exact fingerprint counts',
  );
  assert.match(
    stepOf(supersede, 'Skip inputs an earlier run already verified'),
    /if: steps\.lookup\.outputs\.cache-hit == 'true'/,
  );

  // The key names the pull request; record writes the very key supersede reads.
  const key = (body) => /\n\s+key: (.+)\n/.exec(`${body}\n`)?.[1];
  const record = jobOf(source, 'record');
  assert.equal(
    key(lookup).replace('steps.inputs.outputs.fingerprint', 'FINGERPRINT'),
    key(record).replace('needs.supersede.outputs.inputs', 'FINGERPRINT'),
  );
  assert.match(
    key(lookup),
    /^source-baseline-verified-v1-pr\$\{\{ github\.event\.pull_request\.number \}\}-/,
  );

  // Only after both jobs passed, from a pull request, with no token scope.
  assert.match(record, /needs: \[supersede, source-baseline, portable\]\n/);
  assert.match(
    record,
    /if: github\.event_name == 'pull_request' && needs\.supersede\.outputs\.inputs != ''\n/,
  );
  assert.doesNotMatch(record, /always\(\)|!cancelled\(\)|failure\(\)/);
  assert.match(record, /permissions: \{\}\n/);
  assert.match(record, /uses: actions\/cache\/save@[0-9a-f]{40} /);

  const baseline = jobOf(source, 'source-baseline');
  assert.match(
    baseline,
    /needs\.supersede\.outputs\.superseded != 'true' && needs\.supersede\.outputs\.verified != 'true'\) \|\|/,
  );
  // A dispatch, which can publish, never consults the lookup.
  assert.match(baseline, /\(github\.event_name != 'pull_request' &&/);
});

test('the agent CLI check runs weekly, resolves fresh and owns its npm cache', () => {
  const source = workflow('agent-adapters.yml');
  assert.match(source, /\n {2}schedule:\n {4}- cron: '\d+ \d+ \* \* \d'\n/);
  const restore = stepOf(source, 'Restore the Agent CLI npm cache');
  const save = stepOf(source, 'Save the Agent CLI npm cache');
  assert.match(restore, /if: github\.event_name == 'pull_request'\n/);
  assert.match(save, /if: github\.event_name != 'pull_request'\n/);
  assert.match(save, /continue-on-error: true/);
  const key = (body) => /\n\s+key: (.+)\n/.exec(`${body}\n`)[1];
  assert.equal(key(restore), key(save));
  assert.match(key(save), /-\$\{\{ steps\.week\.outputs\.week \}\}$/);
  const prefix = /\n\s+restore-keys: (.+)\n/.exec(`${restore}\n`)[1];
  assert.equal(`${prefix}\${{ steps.week.outputs.week }}`, key(restore));
  assert.match(
    stepOf(source, "Name this week's cache entry"),
    /date -u \+%G-%V/,
  );
});

test('the preview connection is one composite action from the trusted checkout', () => {
  const action = read(
    path.join(root, '.github/actions/preview-connect/action.yml'),
  );
  assert.match(action, /runs:\n {2}using: composite\n/);
  // No step limits inside a composite, and no secrets read directly.
  assert.doesNotMatch(action, /^\s*timeout-minutes:/m);
  assert.doesNotMatch(action, /\$\{\{[^}]*secrets\./);
  assert.match(action, /uses: tailscale\/github-action@[0-9a-f]{40} /);
  assert.match(
    action,
    /oauth-client-id: \$\{\{ inputs\.tailscale-oauth-client-id \}\}/,
  );
  assert.match(
    action,
    /oauth-secret: \$\{\{ inputs\.tailscale-oauth-secret \}\}/,
  );
  assert.match(action, /PREVIEW_SSH_KEY: \$\{\{ inputs\.ssh-key \}\}/);
  for (const name of ['deploy-preview.yml', 'preview-teardown.yml']) {
    const source = workflow(name);
    // Same trusted default-branch checkout the action's script comes from.
    assert.match(
      source,
      /ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n {10}path: control\n/,
    );
    const connect = source.indexOf(
      'uses: ./control/.github/actions/preview-connect',
    );
    const send = source.indexOf('- name: Send the host scripts');
    assert.ok(connect > 0 && send > connect, name);
  }
  // The teardown keeps its bounded, non-fatal script transfer as a workflow step.
  const send = stepOf(
    workflow('preview-teardown.yml'),
    'Send the host scripts',
  );
  assert.match(send, /timeout-minutes: 3\n/);
  assert.match(send, /continue-on-error: true\n/);
});

test('a dependency cache probe that hits refreshes the cache, a miss changes nothing', (t) => {
  const host = temp(t, 'nb3-review11-probe-');
  const key = 'a'.repeat(64);
  const cache = path.join(host, 'deps', key);
  const probe = depsProbeCommand(key, host);
  assert.match(probe, /echo present \|\| echo absent$/);
  const run = () =>
    execFileSync('bash', ['-c', probe], { encoding: 'utf8' }).trim();

  assert.equal(run(), 'absent');
  assert.equal(existsSync(cache), false, 'a miss creates nothing');

  mkdirSync(path.join(cache, 'node_modules'), { recursive: true });
  const old = new Date(Date.now() - 6 * 3600 * 1000);
  utimesSync(cache, old, old);
  assert.equal(run(), 'present');
  assert.ok(
    Date.now() - statSync(cache).mtimeMs < 60_000,
    'a hit touches the cache',
  );
});

function gc(t, { instances = {}, caches = {} }) {
  const host = temp(t, 'nb3-review11-gc-');
  for (const [pr, depsKey] of Object.entries(instances)) {
    const dir = path.join(host, 'instances', `pr-${pr}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'preview.env'), `depsKey=${depsKey}\n`);
  }
  for (const [key, hoursAgo] of Object.entries(caches)) {
    const dir = path.join(host, 'deps', key);
    mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    const when = new Date(Date.now() - hoursAgo * 3600 * 1000);
    utimesSync(dir, when, when);
  }
  for (const dir of ['deps', 'tmp', 'logs', 'backups'])
    mkdirSync(path.join(host, dir), { recursive: true });
  const bin = path.join(host, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'docker'), '#!/bin/bash\nexit 0\n', {
    mode: 0o755,
  });
  writeFileSync(path.join(bin, 'flock'), '#!/bin/bash\n:\n', { mode: 0o755 });
  const result = spawnSync(
    'bash',
    [path.join(scripts, 'preview', 'preview-gc.sh'), '--prune-deps'],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PREVIEW_ROOT: host,
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return { result, kept: (key) => existsSync(path.join(host, 'deps', key)) };
}

test('the GC spares an unreferenced dependency cache a deploy probed in the last two hours', (t) => {
  const [referenced, probed, stale] = ['1', '2', '3'].map((digit) =>
    digit.repeat(64),
  );
  const { result, kept } = gc(t, {
    instances: { 41: referenced },
    caches: { [referenced]: 30, [probed]: 0.5, [stale]: 3 },
  });
  assert.ok(kept(referenced), 'a referenced cache stays');
  assert.ok(kept(probed), 'a cache probed half an hour ago stays');
  assert.equal(
    kept(stale),
    false,
    'an unreferenced cache untouched for three hours goes',
  );
  assert.match(
    result.stderr,
    new RegExp(
      `keeping dependency cache ${probed}: probed or written in the last two hours`,
    ),
  );
  assert.match(
    result.stderr,
    new RegExp(`pruning unreferenced dependency cache ${stale}`),
  );
});
