import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const script = (name) =>
  readFileSync(
    path.resolve(import.meta.dirname, '..', 'preview', name),
    'utf8',
  );

test('teardown removes an instance only while holding the deploy lock', () => {
  // A deploy cut off on the CI side keeps running on the host; without the
  // lock it could recreate or roll back to the instance removed here.
  const destroy = script('preview-destroy.sh');
  const lock = destroy.indexOf('exec 9>"$PREVIEW_ROOT/deploy.lock"');
  const held = destroy.indexOf('flock -w 180 9 || die');
  assert.ok(
    lock > 0 && held > lock,
    'teardown takes the deploy lock, with a bounded wait',
  );
  for (const step of ['remove_container "$name"', 'rm -rf "$dir"'])
    assert.ok(destroy.indexOf(step) > held, `${step} runs under the lock`);
  // The same lock file as deploys, capacity checks and gc.
  for (const name of ['preview-deploy.sh', 'preview-capacity.sh'])
    assert.match(script(name), /exec 9>"\$PREVIEW_ROOT\/deploy\.lock"/, name);
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
