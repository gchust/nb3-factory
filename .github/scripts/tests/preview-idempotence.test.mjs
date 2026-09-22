import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const lib = path.resolve(
  import.meta.dirname,
  '..',
  'preview',
  'preview-lib.sh',
);

// One build is requested twice — the task workflow dispatches the preview and
// GitHub also raises `workflow_run` for the same completed run — and the second
// request must not replace the instance the first one published. What decides
// that is the state a deploy leaves in the instance directory, so it is tested
// against that state rather than by running the whole script, which needs
// Docker, flock, and a live preview.
const DEPLOYED = 'pr=12\nsha=abc123\ndepsKey=deadbeef\n';

function instanceServes({ recorded = DEPLOYED, sha, depsKey, running = 'true' }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-current-'));
  try {
    const dir = path.join(root, 'instances/pr-12');
    mkdirSync(dir, { recursive: true });
    if (recorded) writeFileSync(path.join(dir, 'preview.env'), recorded);
    const script = `
set -euo pipefail
. "$1"
docker() {
  [[ "$1" == inspect ]] || return 99
  printf '%s\\n' "${running}"
}
if instance_serves "$2" preview-pr-12 "$3" "$4"; then echo yes; else echo no; fi
`;
    const result = spawnSync(
      'bash',
      ['-c', script, 'bash', lib, dir, sha, depsKey],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('an instance already serving this build is recognized as current', () => {
  assert.equal(
    instanceServes({ sha: 'abc123', depsKey: 'deadbeef' }),
    'yes',
  );
});

test('a different commit or dependency set is a new build, not a duplicate', () => {
  assert.equal(
    instanceServes({ sha: 'ffff00', depsKey: 'deadbeef' }),
    'no',
  );
  assert.equal(
    instanceServes({ sha: 'abc123', depsKey: 'cafe00' }),
    'no',
  );
});

test('a crashed container is redeployed rather than left alone', () => {
  // The recorded pair describes the last successful deploy, so it stays true
  // after the container dies; only a running container is a served preview.
  assert.equal(
    instanceServes({ sha: 'abc123', depsKey: 'deadbeef', running: 'false' }),
    'no',
  );
  assert.equal(instanceServes({ sha: 'abc123', depsKey: 'deadbeef', running: '' }), 'no');
});

test('an instance without recorded state, or without a commit, is not current', () => {
  assert.equal(
    instanceServes({ sha: 'abc123', depsKey: 'deadbeef', recorded: '' }),
    'no',
  );
  assert.equal(instanceServes({ sha: '', depsKey: 'deadbeef' }), 'no');
  assert.equal(instanceServes({ sha: 'abc123', depsKey: '' }), 'no');
});

test('the duplicate is recognized while holding the deploy lock', () => {
  // Read without the lock, an instance state caught mid-write would answer for
  // a deploy that has not finished; read with it, the answer describes a deploy
  // that either finished or never touched this instance.
  const script = readFileSync(
    path.resolve(import.meta.dirname, '..', 'preview', 'preview-deploy.sh'),
    'utf8',
  );
  const lock = script.indexOf('flock 9');
  const check = script.indexOf(
    'instance_serves "$dir" "$name" "$sha" "$deps_key"',
  );
  assert.ok(lock > 0, 'the deploy lock is gone');
  assert.ok(check > lock, 'the instance state is read before the lock is held');
  // And replacing a running preview has to be asked for, never inferred.
  assert.match(script, /--redeploy\) redeploy=true; shift ;;/);
  assert.match(script, /if \[\[ "\$redeploy" == true \]\]; then/);
});
