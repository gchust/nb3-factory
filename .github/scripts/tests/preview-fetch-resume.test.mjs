import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const lib = path.resolve(import.meta.dirname, '../preview/preview-lib.sh');

// Sources the real host library and runs fetch_payload against a stub curl
// that serves the payload in pieces: each call appends the next piece to the
// file it was given, then fails with the given exit codes until the last.
function fetch(pieces, exits, { stale, served = pieces.join('') } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-preview-fetch-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const payload = path.join(root, 'payload.tar.gz');
  if (stale) writeFileSync(`${payload}.part`, stale);
  writeFileSync(path.join(root, 'pieces'), pieces.join('\n'));
  writeFileSync(path.join(root, 'exits'), exits.join('\n'));
  writeFileSync(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
out=''; resume=no
while (( $# )); do case "$1" in -o) out="$2"; shift 2;; -C) resume="$2"; shift 2;; *) shift;; esac; done
n=$(( $(wc -l < "$STUB_ROOT/calls" 2>/dev/null || echo 0) + 1 ))
size=0; [[ -f "$out" ]] && size=$(stat -c %s "$out")
echo "$resume $size" >> "$STUB_ROOT/calls"
printf '%s' "$(sed -n "\${n}p" "$STUB_ROOT/pieces")" >> "$out"
exit "$(sed -n "\${n}p" "$STUB_ROOT/exits")"
`,
  );
  writeFileSync(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(path.join(bin, 'curl'), 0o755);
  chmodSync(path.join(bin, 'sleep'), 0o755);
  const expected = createHash('sha256').update(served).digest('hex');
  const result = spawnSync(
    'bash',
    [
      '-c',
      `source "$1"; fetch_payload "$2" https://example.invalid/p "$3" ''`,
      'bash',
      lib,
      payload,
      expected,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        STUB_ROOT: root,
        PREVIEW_ROOT: root,
      },
    },
  );
  const calls = existsSync(path.join(root, 'calls'))
    ? readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n')
    : [];
  return {
    ...result,
    calls,
    content: existsSync(payload) ? readFileSync(payload, 'utf8') : null,
  };
}

test('a stalled payload fetch resumes the partial file on the next try', () => {
  const result = fetch(['first-half-', 'second-half'], [28, 0]);
  assert.equal(result.status, 0, result.stderr);
  // Both tries ask curl to resume; the second starts from the bytes the first kept.
  assert.deepEqual(result.calls, ['- 0', `- ${'first-half-'.length}`]);
  assert.equal(result.content, 'first-half-second-half');
});

test('a partial file left by an earlier deploy is discarded before the first try', () => {
  const result = fetch(['whole'], [0], { stale: 'old bytes' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ['- 0']);
  assert.equal(result.content, 'whole');
});

test('a server that refuses the range restarts the file, and the digest still decides', () => {
  const result = fetch(['junk', 'whole'], [33, 0], { served: 'whole' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ['- 0', '- 0']);
  assert.equal(result.content, 'whole');
});

test('four failed tries give up without moving anything into place', () => {
  const result = fetch(['a', 'b', 'c', 'd'], [28, 28, 28, 28]);
  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 4);
  assert.match(result.stderr, /could not fetch the payload \(curl exit 28\)/);
  assert.equal(result.content, null);
});
