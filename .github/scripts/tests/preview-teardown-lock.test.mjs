import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dir = path.resolve(import.meta.dirname, '..', 'preview');
const script = (name) => readFileSync(path.join(dir, name), 'utf8');

// Runs a snippet with preview-lib.sh sourced and PREVIEW_ROOT in a temp dir.
function lib(t, snippet) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-preview-closed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return (body = snippet) =>
    spawnSync(
      'bash',
      ['-c', `. "$1"; ${body}`, 'bash', path.join(dir, 'preview-lib.sh')],
      {
        encoding: 'utf8',
        env: { ...process.env, PREVIEW_ROOT: root },
      },
    );
}

test('a teardown mark stops only deploys that started before it', (t) => {
  const run = lib(t);
  // No mark: nothing was torn down.
  assert.notEqual(run('closed_since 7 "$(date +%s%N)"').status, 0);
  // A deploy started, then the PR was torn down: refused.
  const before = run(
    'start="$(date +%s%N)"; sleep 0.01; mark_closed 7; closed_since 7 "$start"',
  );
  assert.equal(before.status, 0, before.stderr);
  // The PR was reopened and a new deploy started after the teardown: allowed.
  const after = run('sleep 0.01; closed_since 7 "$(date +%s%N)"');
  assert.notEqual(after.status, 0);
  // Marks are per pull request.
  assert.notEqual(run('closed_since 8 0').status, 0);
  assert.equal(run('closed_since 7 0').status, 0);
});

test('gc drops teardown marks older than its age limit and keeps recent ones', (t) => {
  const run = lib(t);
  const day = 86400n * 1000000000n;
  const now = BigInt(Date.now()) * 1000000n;
  const result = run(
    [
      'mkdir -p "$PREVIEW_ROOT/closed"',
      `echo ${now - 2n * day} >"$PREVIEW_ROOT/closed/pr-1"`,
      `echo ${now - day / 2n} >"$PREVIEW_ROOT/closed/pr-2"`,
      'echo garbage >"$PREVIEW_ROOT/closed/pr-3"',
      'prune_closed_marks 86400',
      'ls "$PREVIEW_ROOT/closed"',
    ].join('; '),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['pr-2']);
  // preview-gc.sh runs it under the deploy lock, in every mode.
  const gc = script('preview-gc.sh');
  const held = gc.indexOf('flock 9');
  const prune = gc.indexOf('prune_closed_marks 86400');
  assert.ok(held > 0 && prune > held);
  assert.ok(prune < gc.indexOf('if [[ "$reap_orphans" == true ]]'));
});

test('teardown marks the pull request closed and removes it, all under the deploy lock', () => {
  // A deploy cut off on the CI side keeps running on the host; the lock keeps
  // it from running concurrently, and the mark stops it once it gets the lock.
  const destroy = script('preview-destroy.sh');
  const lock = destroy.indexOf('exec 9>"$PREVIEW_ROOT/deploy.lock"');
  const held = destroy.indexOf('flock -w 180 9 || die');
  const mark = destroy.indexOf('mark_closed "$pr"');
  assert.ok(
    lock > 0 && held > lock,
    'teardown takes the deploy lock, with a bounded wait',
  );
  assert.ok(mark > held, 'the mark is written under the lock');
  // Before the "no preview" early exit: a deploy still fetching has no instance yet.
  assert.ok(mark < destroy.indexOf('has no preview; nothing to do'));
  for (const step of ['remove_container "$name"', 'rm -rf "$dir"'])
    assert.ok(destroy.indexOf(step) > held, `${step} runs under the lock`);
  for (const name of [
    'preview-deploy.sh',
    'preview-capacity.sh',
    'preview-gc.sh',
  ])
    assert.match(script(name), /exec 9>"\$PREVIEW_ROOT\/deploy\.lock"/, name);
});

test('a deploy checks the mark against its own start, right after taking the lock', () => {
  const deploy = script('preview-deploy.sh');
  const started = deploy.indexOf('started_ns="$(date +%s%N)"');
  const fetch = deploy.indexOf('fetch_payload "$payload"');
  const held = deploy.indexOf('flock 9');
  const check = deploy.indexOf('if closed_since "$pr" "$started_ns"; then');
  const current = deploy.indexOf(
    'instance_serves "$dir" "$name" "$sha" "$deps_key"',
  );
  assert.ok(
    started > 0 && started < fetch,
    'the start is taken before the unlocked fetch',
  );
  assert.ok(
    check > held && check < current,
    'checked before anything reads or writes the instance',
  );
  // A successful deploy after a reopen clears the mark.
  const committed = deploy.indexOf('\npreview_commit\n');
  assert.ok(
    deploy.indexOf('rm -f "$(closed_mark "$pr")"', committed) > committed,
  );
});

test('a deploy removes its staged payload once it is no longer needed', () => {
  const deploy = script('preview-deploy.sh');
  const committed = deploy.indexOf('\npreview_commit\n');
  assert.ok(committed > 0);
  assert.ok(
    deploy.indexOf('rm -f "$payload"', committed) > committed,
    'removed after the instance is committed',
  );
  // The early exit for an instance that already serves this build too.
  const current = deploy.indexOf('leaving the running preview as it is');
  const exit = deploy.indexOf('exit 0', current);
  const removed = deploy.indexOf('rm -f "$payload"', current);
  assert.ok(current > 0 && removed > current && removed < exit);
});
