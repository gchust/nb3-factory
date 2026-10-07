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
  readdirSync,
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

// A real YAML parser to compare with: Ruby's Psych, which the runner image and
// most workstations ship, else Python's PyYAML. YAML 1.1 reads the `on` key as
// true, hence both spellings. Null when neither is available.
function yamlPaths(text) {
  const ruby = spawnSync(
    'ruby',
    [
      '-ryaml',
      '-rjson',
      '-e',
      'd = YAML.safe_load(STDIN.read); t = d["on"] || d[true]; puts JSON.generate(t["pull_request"]["paths"])',
    ],
    { input: text, encoding: 'utf8' },
  );
  if (ruby.status === 0) return JSON.parse(ruby.stdout);
  const python = spawnSync(
    'python3',
    [
      '-c',
      'import json,sys,yaml; d=yaml.safe_load(sys.stdin); t=d.get("on", d.get(True)); print(json.dumps(t["pull_request"]["paths"]))',
    ],
    { input: text, encoding: 'utf8' },
  );
  if (python.status === 0) return JSON.parse(python.stdout);
  return null;
}

const triggerWith = (items) =>
  [
    'name: x',
    'on:',
    '  pull_request:',
    '    branches: [develop]',
    '    paths:',
    ...items,
    '  workflow_dispatch:',
    'jobs: {}',
    '',
  ].join('\n');

test('the source baseline fingerprint reads exactly the pull_request path filters', (t) => {
  const source = workflow('source-baseline.yml');
  const paths = pullRequestPaths(source);
  const parsed = yamlPaths(source);
  if (parsed) assert.deepEqual(paths, parsed);
  else
    t.diagnostic(
      'no YAML parser (ruby, or python3 with PyYAML); compared nothing',
    );
  assert.ok(paths.includes(WORKFLOW));
  assert.ok(paths.includes('.github/scripts/source-*.mjs'));
  assert.ok(paths.includes('docs/**'));
  const matches = pathMatcher(paths);
  // The fingerprint script and the default source SHA are inputs themselves.
  assert.ok(matches('.github/scripts/source-baseline-inputs.mjs'));
  assert.ok(matches('.github/scripts/source-baseline-ref.mjs'));
  assert.ok(matches('package.json'));
  // docs/ reaches the portable application through the overlay.
  assert.ok(matches('docs/daily-findings.md'));
  assert.ok(matches('docs/nested/page.md'));
  assert.equal(matches('docsx/page.md'), false);
  // `/**/` matches zero or more directories, as GitHub's `**/` does.
  const nested = pathMatcher(['a/**/b.md', '**/c.md']);
  for (const file of ['a/b.md', 'a/x/b.md', 'a/x/y/b.md', 'c.md', 'x/y/c.md'])
    assert.ok(nested(file), file);
  for (const file of ['ab.md', 'a/b.mdx', 'x/a/b.md', 'xc.md'])
    assert.equal(nested(file), false, file);
  // `*` stays inside one segment, as in GitHub's filters.
  assert.equal(matches('.github/scripts/source-x/y.mjs'), false);
  assert.equal(matches('client/package.json'), false);
  assert.equal(matches('.github/scripts/deploy-preview.mjs'), false);
  // A pattern this reader does not understand is refused, not hashed loosely.
  for (const pattern of [
    '.github/***',
    '.github/scripts/[ab].mjs',
    '!README.MD',
    '.github/scripts/?.mjs',
  ])
    assert.throws(() => pathMatcher([pattern]), /unsupported path filter/);
});

test('every YAML form of a path entry is read, and anything else fails', () => {
  const text = triggerWith([
    "      - 'single.mjs'",
    '      - "double.mjs"',
    '      - bare.mjs',
    "      - 'commented.mjs' # trailing comment",
    '      - bare-commented/** # trailing comment',
    '      # a comment line',
    '',
    '    # a shallower comment line',
  ]);
  const expected = [
    'single.mjs',
    'double.mjs',
    'bare.mjs',
    'commented.mjs',
    'bare-commented/**',
  ];
  assert.deepEqual(pullRequestPaths(text), expected);
  const parsed = yamlPaths(text);
  if (parsed) assert.deepEqual(parsed, expected);
  // An entry the reader cannot read fails instead of dropping a file.
  for (const line of [
    '      - "escaped\\"quote.mjs"',
    '      - [flow, list]',
    '      - {a: b}',
    "      - 'unterminated.mjs",
    '      not-an-item.mjs',
    "      -'nospace.mjs'",
    "      - ''",
  ])
    assert.throws(
      () => pullRequestPaths(triggerWith(["      - 'ok.mjs'", line])),
      /pull_request path entry/,
      line,
    );
  assert.throws(() => pullRequestPaths(triggerWith([])), /paths are empty/);
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
  mkdirSync(path.join(repo, 'docs/nested'), { recursive: true });
  writeFileSync(path.join(repo, WORKFLOW), workflow('source-baseline.yml'));
  writeFileSync(
    path.join(repo, '.github/scripts/source-config-check.mjs'),
    'one\n',
  );
  writeFileSync(path.join(repo, '.github/scripts/deploy-preview.mjs'), 'one\n');
  writeFileSync(path.join(repo, 'docs/nested/page.md'), 'one\n');
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

  writeFileSync(path.join(repo, 'docs/nested/page.md'), 'two\n');
  git('commit', '-qam', 'a document');
  const documented = inputFingerprint(repo);
  assert.notEqual(documented, changed);

  writeFileSync(path.join(repo, '.github/scripts/source-new.mjs'), 'new\n');
  git('add', '-A');
  git('commit', '-qm', 'a new input');
  assert.notEqual(inputFingerprint(repo), documented);

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
  // The script comes from the default branch; the merge commit is only data.
  assert.match(
    supersede,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n {10}path: trusted\n {10}persist-credentials: false\n {10}sparse-checkout: \.github\/scripts\n/,
  );
  assert.match(
    supersede,
    /ref: \$\{\{ github\.sha \}\}\n {10}path: control\n {10}persist-credentials: false/,
  );
  assert.match(
    stepOf(supersede, 'Fingerprint the files this check verifies'),
    /node trusted\/\.github\/scripts\/source-baseline-inputs\.mjs control\)/,
  );
  assert.doesNotMatch(supersede, /node control\//);
  assert.match(
    supersede,
    /permissions:\n(?: {6}#.*\n)* {6}actions: read\n {6}contents: read\n {6}pull-requests: read\n/,
  );

  // Every step of the lookup fails open.
  for (const step of [
    'Fingerprint the files this check verifies',
    'Look for an earlier run of this pull request that verified them',
    'Skip inputs an earlier run already verified',
  ])
    assert.match(stepOf(supersede, step), /continue-on-error: true/, step);
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

  // Only after both jobs passed, from a pull request, with no token scope, and
  // unable to turn a verified run red.
  assert.match(record, /needs: \[supersede, source-baseline, portable\]\n/);
  assert.match(
    record,
    /if: github\.event_name == 'pull_request' && needs\.supersede\.outputs\.inputs != ''\n {4}continue-on-error: true\n/,
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

// Runs the skip step's own script with a gh stub that answers from fixtures.
function skipStep(t, { record = '41', run, jobs, failRun = false }) {
  const step = stepOf(
    jobOf(workflow('source-baseline.yml'), 'supersede'),
    'Skip inputs an earlier run already verified',
  );
  const script = step
    .split('\n        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  const dir = temp(t, 'nb3-review11-skip-');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(path.join(dir, 'source-baseline-verified'));
  if (record !== null)
    writeFileSync(
      path.join(dir, 'source-baseline-verified', 'run-id'),
      `${record}\n`,
    );
  writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run));
  writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify({ jobs }));
  writeFileSync(
    path.join(bin, 'gh'),
    [
      '#!/bin/bash',
      '[[ "$1" == api ]] || exit 2',
      `echo "$2" >> "${dir}/calls"`,
      'case "$2" in',
      `  */jobs\\?*) file="${dir}/jobs.json" ;;`,
      failRun ? '  *) exit 1 ;;' : `  *) file="${dir}/run.json" ;;`,
      'esac',
      'if [[ "$3" == --jq ]]; then jq -r "$4" "$file"; else cat "$file"; fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const output = path.join(dir, 'output');
  writeFileSync(output, '');
  // The runner's default shell for run blocks.
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_TOKEN: 'token',
      PR_NUMBER: '7',
      GITHUB_RUN_ID: '99',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_SERVER_URL: 'https://github.com',
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: output,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return {
    verified: /^verified=true$/m.test(read(output)),
    stdout: result.stdout,
    calls: existsSync(path.join(dir, 'calls'))
      ? read(path.join(dir, 'calls'))
      : '',
  };
}

test('a recorded run counts only when the API confirms it passed for this pull request', (t) => {
  const run = {
    path: '.github/workflows/source-baseline.yml',
    event: 'pull_request',
    pull_requests: [{ number: 7 }],
  };
  const jobs = [
    { name: 'supersede', conclusion: 'success' },
    { name: 'source-baseline', conclusion: 'success' },
    { name: 'portable', conclusion: 'success' },
    { name: 'record', conclusion: 'success' },
  ];
  const good = skipStep(t, { run, jobs });
  assert.equal(good.verified, true);
  assert.match(good.stdout, /actions\/runs\/41 of pull request #7 verified/);
  assert.match(good.calls, /^repos\/owner\/repo\/actions\/runs\/41$/m);
  assert.match(
    good.calls,
    /^repos\/owner\/repo\/actions\/runs\/41\/jobs\?filter=latest/m,
  );

  const refused = {
    'another pull request': {
      run: { ...run, pull_requests: [{ number: 8 }] },
    },
    'a fork, whose runs list no pull request': {
      run: { ...run, pull_requests: [] },
    },
    'another workflow': {
      run: { ...run, path: '.github/workflows/factory-tests.yml' },
    },
    'a dispatch': { run: { ...run, event: 'workflow_dispatch' } },
    'a failed portable job': {
      jobs: jobs.map((job) =>
        job.name === 'portable' ? { ...job, conclusion: 'failure' } : job,
      ),
    },
    'a skipped source build': {
      jobs: jobs.filter(
        (job) => job.name !== 'source-baseline' && job.name !== 'portable',
      ),
    },
    'an unreadable run': { failRun: true },
    'no run id': { record: 'not-a-run' },
    'no record file': { record: null },
    'this very run': { record: '99' },
  };
  for (const [name, change] of Object.entries(refused)) {
    const result = skipStep(t, { run, jobs, ...change });
    assert.equal(result.verified, false, name);
    assert.match(result.stdout, /verifying in full/, name);
  }
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
  assert.match(probe, /^touch -c /, 'the touch comes before the check');
  assert.match(probe, /echo present \|\| echo absent$/);
  const run = () =>
    execFileSync('bash', ['-c', probe], { encoding: 'utf8' }).trim();

  mkdirSync(path.join(host, 'deps'));
  assert.equal(run(), 'absent');
  assert.equal(existsSync(cache), false, 'a miss creates nothing');

  // A cache the GC is deleting has already been renamed away.
  mkdirSync(path.join(host, 'deps', `.pruning-${key}.1`, 'node_modules'), {
    recursive: true,
  });
  assert.equal(run(), 'absent');
  assert.equal(existsSync(cache), false);

  mkdirSync(path.join(cache, 'node_modules'), { recursive: true });
  const old = new Date(Date.now() - 6 * 3600 * 1000);
  utimesSync(cache, old, old);
  assert.equal(run(), 'present');
  assert.ok(
    Date.now() - statSync(cache).mtimeMs < 60_000,
    'a hit touches the cache',
  );
});

function gc(t, { instances = {}, caches = {}, leftovers = [] }) {
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
  for (const name of leftovers)
    mkdirSync(path.join(host, 'deps', name, 'node_modules'), {
      recursive: true,
    });
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
  return {
    result,
    kept: (key) => existsSync(path.join(host, 'deps', key)),
    deps: () => readdirSync(path.join(host, 'deps')).sort(),
  };
}

test('the GC spares an unreferenced dependency cache a deploy probed in the last two hours', (t) => {
  const [referenced, probed, stale] = ['1', '2', '3'].map((digit) =>
    digit.repeat(64),
  );
  const { result, kept, deps } = gc(t, {
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
  // Renamed away and then deleted: nothing of it is left under any name.
  assert.deepEqual(deps(), [probed, referenced].sort());
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

test('the GC renames a cache away before deleting it, and finishes an interrupted delete', (t) => {
  const script = read(path.join(scripts, 'preview', 'preview-gc.sh'));
  const prune = script.split('log "pruning unreferenced dependency cache')[1];
  assert.ok(
    prune.indexOf('mv -T "$entry" "$doomed"') <
      prune.indexOf('rm -rf "$doomed"'),
  );
  assert.doesNotMatch(prune.split('done')[0], /rm -rf "\$entry"/);
  const leftover = `.pruning-${'4'.repeat(64)}.123`;
  const { result, deps } = gc(t, { leftovers: [leftover] });
  assert.deepEqual(deps(), []);
  assert.match(
    result.stderr,
    new RegExp(`removing interrupted prune ${leftover}`),
  );
});
