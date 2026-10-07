// Round 10 of the Actions review: the preview host's backups, waits and
// ordering, its payload assets and container options; template refresh
// publishing, step limits, caches and the factory test split.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  depsKeyFromEntries,
  readArchiveEntries,
  readDepsEntries,
} from '../preview-host.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const preview = path.join(scripts, 'preview');
const read = (file) => readFileSync(file, 'utf8');
const workflow = (name) => read(path.resolve(scripts, '..', 'workflows', name));
const jobOf = (text, name) =>
  text.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const stepOf = (text, name) =>
  text.split(`- name: ${name}\n`)[1].split(/\n\s+- (?=name:|uses:)/)[0];
const temp = (t, prefix) => {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

// Sources the host library (and the transaction helpers) with PREVIEW_ROOT in
// a temporary directory and Docker stubbed by files under containers/.
function host(t, body) {
  const root = temp(t, 'nb3-review10-host-');
  const script = `
set -euo pipefail
. "$1"; . "$2"
PREVIEW_ROOT="$3"; PREVIEW_TMP_DIR="$3/tmp"
log() { :; }
container_exists() { test -f "$PREVIEW_ROOT/containers/$1"; }
remove_container() { rm -f "$PREVIEW_ROOT/containers/$1"; }
docker() {
  case "$1" in
    rename) mv "$PREVIEW_ROOT/containers/$2" "$PREVIEW_ROOT/containers/$3" ;;
    stop|start) test -f "$PREVIEW_ROOT/containers/$2" ;;
    *) exit 99 ;;
  esac
}
mkdir -p "$PREVIEW_ROOT/backups" "$PREVIEW_ROOT/containers" "$PREVIEW_ROOT/tmp"
${body}
`;
  const result = spawnSync(
    'bash',
    [
      '-c',
      script,
      'bash',
      path.join(preview, 'preview-lib.sh'),
      path.join(preview, 'preview-transaction.sh'),
      root,
    ],
    { encoding: 'utf8' },
  );
  const backups = existsSync(path.join(root, 'backups'))
    ? readdirSync(path.join(root, 'backups')).sort()
    : [];
  return { ...result, root, backups };
}

const deployTo = (pr) => `
pr=${pr}; name=preview-pr-${pr}; dir="$PREVIEW_ROOT/instances/pr-${pr}"
mkdir -p "$dir/data"; printf old > "$dir/data/database.sqlite"
touch "$PREVIEW_ROOT/containers/$name"
preview_begin
mkdir -p "$dir/data"; printf new > "$dir/data/database.sqlite"
touch "$PREVIEW_ROOT/containers/$name"
`;

test('a successful deploy deletes its snapshot and every earlier failure of that pull request', (t) => {
  const result = host(
    t,
    `mkdir -p "$PREVIEW_ROOT/backups/failed-pr-7.aaaaaa" "$PREVIEW_ROOT/backups/failed-pr-70.bbbbbb" "$PREVIEW_ROOT/backups/pr-70.cccccc"
${deployTo(7)}
preview_commit
test "$(cat "$dir/data/database.sqlite")" = new
test "$transaction_started" = false`,
  );
  assert.equal(result.status, 0, result.stderr);
  // Only other pull requests' entries are left: the one this deploy took is
  // gone, and so are this pull request's failures.
  assert.deepEqual(result.backups, ['failed-pr-70.bbbbbb', 'pr-70.cccccc']);
});

test('a previous container that will not go away does not fail a healthy deploy or skip its cleanup', (t) => {
  const result = host(
    t,
    `mkdir -p "$PREVIEW_ROOT/backups/failed-pr-7.aaaaaa"
${deployTo(7)}
remove_container() { [[ "$1" != *-previous ]] || return 1; rm -f "$PREVIEW_ROOT/containers/$1"; }
log() { echo "$*" >&2; }
preview_commit
echo committed`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /committed/);
  assert.match(
    result.stderr,
    /could not remove the previous container preview-pr-7-previous/,
  );
  assert.deepEqual(result.backups, []);
});

test('the readiness probe is timed by the clock, each probe capped at what is left', (t) => {
  const root = temp(t, 'nb3-review10-ready-');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  // An application that accepts and answers slowly: every probe takes the
  // whole time curl was given, and fails.
  writeFileSync(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
while (( $# )); do [[ "$1" == --max-time ]] && { echo "$2" >> "${root}/calls"; /bin/sleep "$2"; }; shift; done
printf 000
`,
    { mode: 0o755 },
  );
  writeFileSync(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', {
    mode: 0o755,
  });
  const started = Date.now();
  const result = spawnSync(
    'bash',
    [
      '-c',
      '. "$1"; wait_for_preview nb3-7.example 3 && echo ready || echo timeout',
      'bash',
      path.join(preview, 'preview-lib.sh'),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'timeout');
  // Counting a second per try, three tries of 5 s would have taken 15 s.
  assert.ok(Date.now() - started < 10_000, `${Date.now() - started} ms`);
  const limits = read(path.join(root, 'calls')).trim().split('\n').map(Number);
  assert.ok(
    limits.every((limit) => limit >= 1 && limit <= 3),
    limits.join(','),
  );
});

test('a failed deploy keeps only its own tree for diagnosis and restores the previous preview', (t) => {
  const result = host(
    t,
    `mkdir -p "$PREVIEW_ROOT/backups/failed-pr-7.older1"
${deployTo(7)}
preview_rollback
test "$(cat "$dir/data/database.sqlite")" = old
test -f "$PREVIEW_ROOT/containers/$name"
ls "$PREVIEW_ROOT/backups"/failed-pr-7.*/instance/data/database.sqlite >/dev/null
test "$(cat "$PREVIEW_ROOT"/backups/failed-pr-7.*/instance/data/database.sqlite)" = new`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.backups.length, 1, result.backups.join(','));
  assert.match(result.backups[0], /^failed-pr-7\./);
  assert.notEqual(result.backups[0], 'failed-pr-7.older1');
});

test('a deploy that started before a newer one of the same pull request is superseded', (t) => {
  const result = host(
    t,
    `mark_started 7 100
superseded_since 7 100 && exit 3
mark_started 7 200
superseded_since 7 100 || exit 4
superseded_since 7 200 && exit 5
# An older start never replaces a newer one.
mark_started 7 150
test "$(cat "$PREVIEW_ROOT/started/pr-7")" = 200
# Per pull request.
superseded_since 8 0 && exit 6
# Marks age out like teardown marks.
prune_marks started 86400
test ! -e "$PREVIEW_ROOT/started/pr-7"
true`,
  );
  assert.equal(result.status, 0, result.stderr);
});

test('teardown removes every payload one pull request staged and nothing of another', (t) => {
  const result = host(
    t,
    `cd "$PREVIEW_TMP_DIR"
touch payload-pr-7.tar.gz payload-pr-7.tar.gz.part payload-pr-7-11-1.tar.gz payload-pr-7-12-2.tar.gz.part payload-pr-70-11-1.tar.gz payload-pr-17.tar.gz
remove_payloads 7
ls`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'payload-pr-17.tar.gz',
    'payload-pr-70-11-1.tar.gz',
  ]);
  assert.match(
    read(path.join(preview, 'preview-destroy.sh')),
    /\nremove_payloads "\$pr"\n/,
  );
});

test('fetching a payload gives up once its budget is spent', (t) => {
  const root = temp(t, 'nb3-review10-fetch-');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash\necho "$*" >> "${root}/calls"\nexit 28\n`,
    { mode: 0o755 },
  );
  // The pause between tries is longer than the whole budget.
  writeFileSync(
    path.join(bin, 'sleep'),
    '#!/usr/bin/env bash\n/bin/sleep 1.2\n',
    {
      mode: 0o755,
    },
  );
  const result = spawnSync(
    'bash',
    [
      '-c',
      '. "$1"; fetch_payload "$2/p.tar.gz" https://example.invalid/p 00 ""',
      'bash',
      path.join(preview, 'preview-lib.sh'),
      root,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PREVIEW_ROOT: root,
        PREVIEW_FETCH_BUDGET: '1',
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /could not fetch the payload within 1s \(curl exit 28\)/,
  );
  const calls = read(path.join(root, 'calls')).trim().split('\n');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /--max-time 1 /);
});

test('every wait of a deploy is bounded, and together they fit the workflow step', () => {
  const deploy = read(path.join(preview, 'preview-deploy.sh'));
  const lib = read(path.join(preview, 'preview-lib.sh'));
  const value = (text, name) =>
    Number(new RegExp(`${name}="\\$\\{${name}:-(\\d+)\\}"`).exec(text)?.[1]);
  const budget =
    value(lib, 'PREVIEW_FETCH_BUDGET') +
    value(deploy, 'PREVIEW_LOCK_WAIT') +
    value(deploy, 'PREVIEW_MIGRATE_TIMEOUT') +
    value(deploy, 'PREVIEW_START_TIMEOUT') +
    90;
  assert.match(deploy, /wait_for_preview "\$host" 90/);
  assert.match(deploy, new RegExp(`total = ${budget} s`));
  const step = Number(
    /timeout-minutes: (\d+)/.exec(
      stepOf(workflow('deploy-preview.yml'), 'Deploy the preview'),
    )[1],
  );
  // Unpacking, linking and a rollback on local disk take up to three minutes
  // on top.
  assert.ok(budget + 180 < step * 60, `${budget}s vs ${step} min`);
  // A deploy queued behind another waits out the longest hold instead of
  // failing: migrate, start and ready, plus those three minutes.
  const hold =
    value(deploy, 'PREVIEW_MIGRATE_TIMEOUT') +
    value(deploy, 'PREVIEW_START_TIMEOUT') +
    90 +
    180;
  const lock = value(deploy, 'PREVIEW_LOCK_WAIT');
  assert.ok(lock >= hold, `${lock}s vs ${hold}s`);
  assert.match(
    deploy,
    /flock -w "\$PREVIEW_LOCK_WAIT" 9 \|\|\n\s+die "[^"]*Re-run Deploy Task Preview/,
  );
  assert.doesNotMatch(deploy, /flock 9/);
  const capacity = read(path.join(preview, 'preview-capacity.sh'));
  const capacityWait = Number(
    /flock -w (\d+) 9 \|\|\n\s+die "[^"]*re-run Deploy Task Preview/.exec(
      capacity,
    )?.[1],
  );
  assert.ok(capacityWait >= hold, `${capacityWait}s vs ${hold}s`);
  const room = Number(
    /timeout-minutes: (\d+)/.exec(
      stepOf(workflow('deploy-preview.yml'), 'Make room on the preview host'),
    )[1],
  );
  // The listing's wait, then one eviction's 3-minute wait, inside the step.
  assert.ok(capacityWait + 180 < room * 60, `${capacityWait}s vs ${room} min`);
  assert.match(
    deploy,
    /timeout --kill-after=15 "\$PREVIEW_MIGRATE_TIMEOUT" docker run --rm \\\n\s+--name "\$migrate_container"/,
  );
  assert.match(
    deploy,
    /timeout --kill-after=15 "\$PREVIEW_START_TIMEOUT" docker run --detach/,
  );
  // A migration its timeout cut off leaves a container that cleanup removes.
  const cleanup = deploy.split('cleanup() {')[1].split('\n}')[0];
  assert.match(cleanup, /remove_container "\$migrate_container"/);
  assert.match(cleanup, /discard_payload/);
});

test('a deploy records its start before fetching and refuses after a newer one, under the lock', () => {
  const deploy = read(path.join(preview, 'preview-deploy.sh'));
  const marked = deploy.indexOf('mark_started "$pr" "$started_ns"');
  const fetch = deploy.indexOf('fetch_payload "$payload"');
  const held = deploy.indexOf('flock -w "$PREVIEW_LOCK_WAIT" 9');
  const superseded = deploy.indexOf(
    'if superseded_since "$pr" "$started_ns"; then',
  );
  const current = deploy.indexOf(
    'instance_serves "$dir" "$name" "$sha" "$deps_key"',
  );
  assert.ok(marked > 0 && marked < fetch);
  assert.ok(superseded > held && superseded < current);
  assert.match(
    read(path.join(preview, 'preview-gc.sh')),
    /\nprune_marks started 86400\n/,
  );
});

test('deploy containers cannot gain privileges, and the dead reuse paths are gone', () => {
  const deploy = read(path.join(preview, 'preview-deploy.sh'));
  assert.equal(deploy.match(/--security-opt no-new-privileges/g)?.length, 2);
  // The instance directory is always new after preview_begin, so these never ran.
  assert.doesNotMatch(
    deploy,
    /recorded_key|keeping the existing tree|Generated once and kept/,
  );
  assert.doesNotMatch(deploy, /if \[\[ ! -f "\$dir\/config\.yml" \]\]/);
  // Not switched to a non-root user or stripped of capabilities: see the
  // comment above run_app_once.
  assert.doesNotMatch(deploy, /--cap-drop|--user /);
});

// The build archive the task workflow ships is written by the `tar` package;
// GNU tar's formats cover the same header kinds (long names, PAX records,
// hard links), so this checks the parser without the package.
function buildTree(root) {
  const app = path.join(root, 'app');
  const deps = path.join(app, 'dist/node_modules');
  const long = `${'a'.repeat(60)}/${'b'.repeat(70)}/${'c'.repeat(80)}`;
  const longer = `${long}/${'d'.repeat(90)}/${'e'.repeat(90)}`;
  for (const dir of ['pkg/lib', 'empty', long, longer])
    mkdirSync(path.join(deps, dir), { recursive: true });
  mkdirSync(path.join(app, 'dist/server'), { recursive: true });
  writeFileSync(path.join(app, 'dist/server/standalone.js'), 'x');
  writeFileSync(path.join(app, 'dist/package.json'), '{}');
  writeFileSync(path.join(app, 'config.example.yml'), 'a: 1');
  writeFileSync(path.join(deps, 'pkg/index.js'), 'hello');
  writeFileSync(path.join(deps, 'pkg/lib/LICENSE'), 'license text');
  linkSync(path.join(deps, 'pkg/lib/LICENSE'), path.join(deps, 'pkg/LICENSE'));
  linkSync(
    path.join(deps, 'pkg/lib/LICENSE'),
    path.join(deps, longer, 'LICENSE'),
  );
  writeFileSync(path.join(deps, long, 'file.txt'), 'z'.repeat(1234));
  writeFileSync(path.join(deps, longer, 'big.bin'), Buffer.alloc(70000, 7));
  symlinkSync('../pkg', path.join(deps, 'pkg/lib/self'));
  return { app, deps };
}

// The options the publish step unpacks the slim payload with.
const slimOptions = () =>
  stepOf(
    workflow('deploy-preview.yml'),
    'Publish the payload for the host to fetch',
  ).match(/--anchored|--exclude=\S+/g);

for (const [format, lead] of [
  ['gnu', ''],
  ['pax', ''],
  // Member names can start with ./ too, depending on how the archive was made.
  ['gnu', './'],
]) {
  test(`the dependency key read from a ${format} archive${lead ? ` of ${lead} names` : ''} is the key of the unpacked tree`, async (t) => {
    const root = temp(t, 'nb3-review10-archive-');
    const { app, deps } = buildTree(root);
    const archive = path.join(root, 'dist.tar.gz');
    execFileSync('tar', [
      '--format',
      format,
      '-czf',
      archive,
      '-C',
      app,
      `${lead}config.example.yml`,
      `${lead}dist`,
    ]);
    if (lead)
      assert.match(
        execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }),
        /^\.\/dist\/node_modules\//m,
      );
    const scan = await readArchiveEntries(archive);
    assert.equal(scan.hasDeps, true);
    assert.equal(scan.linksIntoDeps, false);
    assert.deepEqual([...scan.files].sort(), [
      'config.example.yml',
      'dist/package.json',
      'dist/server/standalone.js',
    ]);
    const expected = depsKeyFromEntries(readDepsEntries(deps));
    assert.equal(depsKeyFromEntries(scan.deps), expected);
    // And of the tree the host gets after unpacking it.
    const out = path.join(root, 'out');
    mkdirSync(out);
    execFileSync('tar', ['-xzf', archive, '-C', out]);
    assert.equal(
      depsKeyFromEntries(readDepsEntries(path.join(out, 'dist/node_modules'))),
      expected,
    );
    // The slim payload unpacks everything but the dependency tree.
    const slim = path.join(root, 'slim');
    mkdirSync(slim);
    execFileSync('tar', ['-xzf', archive, '-C', slim, ...slimOptions()]);
    assert.deepEqual(readdirSync(path.join(slim, 'dist')).sort(), [
      'package.json',
      'server',
    ]);
  });
}

test('an archive whose application hard-links into the dependency tree is sent whole', async (t) => {
  const root = temp(t, 'nb3-review10-crosslink-');
  const { app, deps } = buildTree(root);
  linkSync(
    path.join(deps, 'pkg/index.js'),
    path.join(app, 'dist/server/shared.js'),
  );
  // The first name of an inode is stored as the file, every later one as a
  // link to it, so the dependency tree goes first here.
  const archive = path.join(root, 'dist.tar.gz');
  const pack = (...members) =>
    execFileSync('tar', ['-czf', archive, '-C', app, ...members]);
  pack(
    'config.example.yml',
    'dist/node_modules',
    'dist/server',
    'dist/package.json',
  );
  assert.equal((await readArchiveEntries(archive)).linksIntoDeps, true);
  // The other way round, the link inside the tree points out of it, which
  // unpacking without the tree does not need.
  pack(
    'config.example.yml',
    'dist/server',
    'dist/package.json',
    'dist/node_modules',
  );
  const scan = await readArchiveEntries(archive);
  assert.equal(scan.linksIntoDeps, false);
  assert.equal(
    depsKeyFromEntries(scan.deps),
    depsKeyFromEntries(readDepsEntries(deps)),
  );
  // prepare turns that into the slim output the publish step reads.
  assert.match(
    read(path.join(scripts, 'deploy-preview.mjs')),
    /output\('slim', String\(!archive\.linksIntoDeps\)\)/,
  );
  assert.match(
    stepOf(
      workflow('deploy-preview.yml'),
      'Publish the payload for the host to fetch',
    ),
    /if \[\[ "\$present" == present && "\$SLIM" == true \]\]; then/,
  );
});

test('the deploy reads the build before unpacking it, and unpacks only the slim payload', () => {
  const deploy = workflow('deploy-preview.yml');
  assert.doesNotMatch(deploy, /Unpack the deployable build/);
  const prepare = stepOf(
    deploy,
    'Resolve the pull request and the dependency identity',
  );
  assert.match(
    prepare,
    /--archive "\$RUNNER_TEMP\/dist-artifact\/dist\.tar\.gz"/,
  );
  const publish = stepOf(deploy, 'Publish the payload for the host to fetch');
  assert.deepEqual(slimOptions(), [
    '--anchored',
    '--exclude=dist/node_modules',
    '--exclude=./dist/node_modules',
  ]);
  assert.match(publish, /deploy-preview\.mjs slim/);
  // The pull request is resolved before the archive is read.
  const script = read(path.join(scripts, 'deploy-preview.mjs'));
  const block = script.split("mode === 'prepare'")[1];
  assert.ok(
    block.indexOf("pr.state !== 'open'") <
      block.indexOf('readArchiveEntries(args.archive)'),
  );
});

test("a successful deploy deletes the pull request's other payload assets, and the capacity step is bounded", () => {
  const deploy = workflow('deploy-preview.yml');
  const cleanup = stepOf(
    deploy,
    "Delete this pull request's superseded payloads",
  );
  assert.match(
    cleanup,
    /if: \$\{\{ !cancelled\(\) && steps\.deploy\.outcome == 'success' \}\}/,
  );
  assert.match(cleanup, /continue-on-error: true/);
  assert.match(
    cleanup,
    /delete-preview-payloads\.sh "\$PR" --keep "\$PAYLOAD_ASSET"/,
  );
  assert.match(
    stepOf(deploy, 'Make room on the preview host'),
    /timeout-minutes: 28\n/,
  );
});

test('teardown sends the current host scripts before removing a preview', () => {
  const teardown = jobOf(workflow('preview-teardown.yml'), 'teardown-preview');
  const send = teardown.indexOf('- name: Send the host scripts');
  const connect = teardown.indexOf('- name: Connect to the preview host');
  assert.ok(connect > 0 && send > connect);
  assert.ok(send < teardown.indexOf('- name: Remove the preview'));
  const step = stepOf(teardown, 'Send the host scripts');
  assert.match(step, /continue-on-error: true/);
  assert.match(
    step,
    /preview-send-scripts\.sh control\/\.github\/scripts\/preview/,
  );
  assert.match(teardown, /github\.event\.action == 'closed'/);
  assert.match(
    stepOf(workflow('deploy-preview.yml'), 'Send the host scripts'),
    /preview-send-scripts\.sh control\/\.github\/scripts\/preview/,
  );
});

test('a reopened build pull request redeploys the run its body names', (t) => {
  const text = workflow('preview-teardown.yml');
  const job = jobOf(text, 'restore-preview');
  assert.match(job, /github\.event\.action == 'reopened'/);
  assert.match(
    job,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
  assert.match(
    job,
    /startsWith\(github\.event\.pull_request\.head\.ref, 'agent\/issue-'\)/,
  );
  assert.match(job, /actions: write/);
  assert.doesNotMatch(job, /secrets\.|concurrency:/);
  const script = job.split('run: |\n')[1].replace(/^ {10}/gm, '');
  const root = temp(t, 'nb3-review10-reopen-');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\necho "$*" >> "${root}/gh.log"\n`,
    {
      mode: 0o755,
    },
  );
  const run = (body) => {
    rmSync(path.join(root, 'gh.log'), { force: true });
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'o/r',
        PR: '12',
        PR_BODY: body,
        DEFAULT_BRANCH: 'develop',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return existsSync(path.join(root, 'gh.log'))
      ? read(path.join(root, 'gh.log')).trim()
      : '';
  };
  assert.equal(
    run(
      'Build\n- [GitHub Actions 运行记录](https://github.com/o/r/actions/runs/123456)\n<!-- agent-issue: 5 -->',
    ),
    'workflow run deploy-preview.yml --repo o/r --ref develop --field run_id=123456',
  );
  // Another repository's run, or none, dispatches nothing.
  assert.equal(
    run('- [GitHub Actions 运行记录](https://github.com/x/y/actions/runs/9)'),
    '',
  );
  assert.equal(run('no run here; $(touch /tmp/x)'), '');
});

test('the preview workflows share one SSH connection per job and keep strict host keys', (t) => {
  const root = temp(t, 'nb3-review10-ssh-');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  for (const [name, body] of [
    ['tailscale', 'exit 0'],
    ['ssh-keyscan', 'echo host-key'],
    ['ssh', 'exit 0'],
    ['sleep', 'exit 0'],
  ])
    writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, {
      mode: 0o755,
    });
  const result = spawnSync('bash', [path.join(scripts, 'preview-connect.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: root,
      PATH: `${bin}:${process.env.PATH}`,
      PREVIEW_HOST: '100.64.0.1',
      PREVIEW_USER: 'root',
      PREVIEW_SSH_KEY: 'test-key',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const config = read(path.join(root, '.ssh/config'));
  assert.match(config, /^Host 100\.64\.0\.1$/m);
  for (const line of [
    'StrictHostKeyChecking yes',
    'ControlMaster auto',
    'ControlPath ~/.ssh/cm-%C',
    'ControlPersist 20m',
    'ServerAliveInterval 15',
    'IdentitiesOnly yes',
  ])
    assert.match(config, new RegExp(`^  ${line}$`, 'm'), line);
});

test('template refresh publishes nothing when only the generation time and control commit moved', (t) => {
  const root = temp(t, 'nb3-review10-refresh-');
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const write = (dir, file, value) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), value);
  };
  const init = (dir, branch) => {
    git(dir, 'init', `--initial-branch=${branch}`);
    git(dir, 'config', 'user.name', 'Factory Test');
    git(dir, 'config', 'user.email', 'test@example.invalid');
  };
  const metadata = (extra) =>
    `${JSON.stringify({ template: 't', templateVersion: '1.0.0', controlSha: 'a'.repeat(40), generatedAt: '2026-10-01T00:00:00.000Z', ...extra }, null, 2)}\n`;
  const remote = path.join(root, 'remote.git');
  const control = path.join(root, 'control');
  mkdirSync(remote);
  git(remote, 'init', '--bare');
  write(control, '.github/workflows/x.yml', 'control\n');
  write(control, '.npmrc', 'registry\n');
  write(control, 'app.txt', 'baseline\n');
  write(control, 'factory-template.json', metadata());
  init(control, 'develop');
  git(control, 'add', '.');
  git(control, 'commit', '-m', 'base');
  const base = git(control, 'rev-parse', 'HEAD');
  git(control, 'remote', 'add', 'origin', remote);
  git(control, 'push', 'origin', 'develop');
  const publish = (changes) => {
    const candidate = path.join(
      root,
      `candidate-${Math.random().toString(16).slice(2)}`,
    );
    cpSync(control, candidate, {
      recursive: true,
      filter: (p) => path.basename(p) !== '.git',
    });
    for (const [file, value] of Object.entries(changes))
      write(candidate, file, value);
    init(candidate, 'template');
    git(candidate, 'add', '.');
    git(candidate, 'commit', '-m', 'regenerated');
    const bundle = `${candidate}.bundle`;
    git(candidate, 'bundle', 'create', bundle, 'refs/heads/template');
    return spawnSync(
      'bash',
      [
        path.join(scripts, 'publish-template.sh'),
        control,
        bundle,
        base,
        'factory-backup/develop-1-1',
      ],
      { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } },
    );
  };
  const same = publish({
    'factory-template.json': metadata({
      controlSha: 'b'.repeat(40),
      generatedAt: '2026-10-07T00:00:00.000Z',
    }),
  });
  assert.equal(same.status, 0, same.stderr);
  assert.match(same.stdout, /nothing to publish/);
  assert.equal(git(remote, 'rev-parse', 'develop'), base);
  assert.equal(git(remote, 'for-each-ref', 'refs/heads/factory-backup'), '');
  // Anything else in the metadata, such as a new template version, publishes.
  // (Each publish job starts from a fresh checkout.)
  git(control, 'update-ref', '-d', 'refs/remotes/template-refresh/template');
  const newer = publish({
    'factory-template.json': metadata({ templateVersion: '1.0.1' }),
  });
  assert.equal(newer.status, 0, newer.stderr);
  assert.notEqual(git(remote, 'rev-parse', 'develop'), base);
  assert.equal(git(remote, 'rev-parse', 'factory-backup/develop-1-1'), base);
});

test('publish jobs fetch only the commit they build on', () => {
  for (const [name, job] of [
    ['refresh-template.yml', 'publish'],
    ['source-baseline.yml', 'publish'],
  ])
    assert.doesNotMatch(jobOf(workflow(name), job), /fetch-depth/, name);
});

test('source-baseline bounds its browser login and portable verification steps', () => {
  const text = workflow('source-baseline.yml');
  assert.match(
    stepOf(
      text,
      'Verify first configuration, idempotence and real browser login',
    ),
    /timeout-minutes: 15\n/,
  );
  assert.match(
    stepOf(text, 'Verify the restored source as a normal factory application'),
    /timeout-minutes: 20\n/,
  );
});

test("replays restore the task's pnpm store and never save one", () => {
  // verify-final restores the task's store through this action.
  const task = read(
    path.resolve(
      scripts,
      '..',
      'actions',
      'restore-task-toolchain',
      'action.yml',
    ),
  );
  const replay = jobOf(workflow('replay-build-review.yml'), 'review');
  const key =
    /key: (node-cache-Linux-x64-pnpm-\$\{\{ hashFiles\('workspace\/pnpm-lock\.yaml'\) \}\})/;
  assert.equal(key.exec(replay)?.[1], key.exec(task)?.[1]);
  assert.match(replay, /actions\/cache\/restore@/);
  assert.doesNotMatch(replay, /actions\/cache\/save@/);
  assert.match(
    replay,
    /if: hashFiles\('workspace\/factory-source\.json'\) == ''/,
  );
  assert.ok(
    replay.indexOf("Restore the task's pnpm store") <
      replay.indexOf('Reconstruct sealed candidate without rebuilding'),
  );
});

test('CI installs of the browser tool and agent CLIs reuse an npm cache', () => {
  const task = workflow('code-agent-task.yml');
  const tests = workflow('factory-tests.yml');
  const browserKey =
    /key: (agent-browser-npm-v2-\$\{\{ runner\.os \}\}-[^\n]+)/;
  const path_ = /path: (\$\{\{ runner\.temp \}\}\/agent-browser-npm)/;
  assert.equal(browserKey.exec(tests)?.[1], browserKey.exec(task)?.[1]);
  assert.equal(path_.exec(tests)?.[1], path_.exec(task)?.[1]);
  assert.match(
    tests,
    /npm_config_cache: \$\{\{ runner\.temp \}\}\/agent-browser-npm/,
  );
  assert.match(
    tests,
    /if: github\.event_name != 'pull_request' && steps\.browser_cache\.outputs\.cache-hit != 'true'/,
  );
  const adapters = workflow('agent-adapters.yml');
  assert.match(
    adapters,
    /key: agent-cli-npm-v1-\$\{\{ runner\.os \}\}-\$\{\{ matrix\.engine \}\}-/,
  );
  assert.match(
    adapters,
    /npm_config_cache: \$\{\{ runner\.temp \}\}\/agent-cli-npm/,
  );
  // Scheduled and dispatched runs resolve fresh and save the week's entry;
  // pull requests only restore (see actions-review-11-infra.test.mjs).
  assert.match(
    adapters,
    /- name: Save the Agent CLI npm cache\n {8}if: github\.event_name != 'pull_request'\n/,
  );
});

test('the factory suite runs concurrently, except the suites that share the process table', (t) => {
  const runner = path.join(scripts, 'run-factory-tests.sh');
  const root = temp(t, 'nb3-review10-suite-');
  const tests = path.join(root, 'tests');
  mkdirSync(tests);
  const serialFiles = [
    'browser-acceptance.test.mjs',
    'browser-preflight.test.mjs',
    'idle-watchdog.test.mjs',
    'stale-app-port.test.mjs',
  ];
  for (const file of ['a.test.mjs', 'b.test.mjs', ...serialFiles])
    writeFileSync(path.join(tests, file), '');
  writeFileSync(path.join(tests, 'helper.mjs'), '');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'node'),
    `#!/usr/bin/env bash\necho "\${GITHUB_RUN_ID:-unset} \${FACTORY_TESTS_CONCURRENT:-serial} $*" >> "${root}/node.log"\n[[ "$*" != *a.test.mjs* ]]\n`,
    { mode: 0o755 },
  );
  const result = spawnSync('bash', [runner, tests], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_RUN_ID: '99',
      FACTORY_TESTS_CONCURRENT: '1',
    },
  });
  // A failing concurrent group still lets the serial group run, and fails.
  assert.equal(result.status, 1);
  const [concurrent, serial] = read(path.join(root, 'node.log'))
    .trim()
    .split('\n');
  assert.equal(
    concurrent,
    `unset 1 --test ${tests}/a.test.mjs ${tests}/b.test.mjs`,
  );
  assert.equal(
    serial,
    `unset serial --test --test-concurrency=1 ${serialFiles.map((file) => `${tests}/${file}`).join(' ')}`,
  );
  // Every real suite that runs stop-stale-app.sh is in the serial group.
  const real = path.join(scripts, 'tests');
  const listed = /SERIAL=\(([^)]*)\)/.exec(read(runner))[1].split(/\s+/);
  for (const file of readdirSync(real).filter((name) =>
    name.endsWith('.test.mjs'),
  ))
    if (
      file !== path.basename(import.meta.filename) &&
      /stop-stale-app\.sh/.test(read(path.join(real, file)))
    )
      assert.ok(listed.includes(file), file);
});

test('stop-stale-app.sh refuses to stop anything from the concurrent test group', (t) => {
  // The static check above sees only suites that name the script. A suite that
  // runs a copy of verify.sh or browser-acceptance.sh far enough reaches it
  // without naming it; under the concurrent group it fails instead.
  const root = temp(t, 'nb3-review10-stale-');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  for (const name of ['pgrep', 'ss', 'lsof', 'kill', 'ps'])
    writeFileSync(
      path.join(bin, name),
      `#!/usr/bin/env bash\necho ${name} >> "${root}/calls"\n`,
      { mode: 0o755 },
    );
  const run = (concurrent) =>
    spawnSync('bash', [path.join(scripts, 'stop-stale-app.sh'), '1'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FACTORY_TESTS_CONCURRENT: concurrent,
      },
    });
  const refused = run('1');
  assert.equal(refused.status, 3);
  assert.match(
    refused.stderr,
    /add the suite to SERIAL in run-factory-tests\.sh/,
  );
  assert.equal(existsSync(path.join(root, 'calls')), false);
  // Outside the group (builds, verification, the serial group) it runs.
  run('');
  assert.ok(existsSync(path.join(root, 'calls')));
});

test('workflow scripts in the infrastructure scope take expressions through env', () => {
  for (const name of [
    'deploy-preview.yml',
    'preview-teardown.yml',
    'refresh-template.yml',
    'replay-build-review.yml',
    'source-baseline.yml',
    'factory-tests.yml',
    'agent-adapters.yml',
  ]) {
    const lines = workflow(name).split('\n');
    let indent = -1;
    lines.forEach((line, index) => {
      const run = /^( *)(?:- )?run: *(.*)$/.exec(line);
      if (run) {
        indent = /^[|>]/.test(run[2]) ? run[1].length : -1;
        assert.doesNotMatch(run[2], /\$\{\{/, `${name}:${index + 1}`);
        return;
      }
      if (indent < 0) return;
      const current = line.search(/\S/);
      if (current >= 0 && current <= indent) indent = -1;
      else assert.doesNotMatch(line, /\$\{\{/, `${name}:${index + 1}`);
    });
  }
});
