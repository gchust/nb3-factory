import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
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

// `fetch_payload` lives in the library so it can be exercised here without the
// rest of preview-deploy.sh, which needs Docker and flock.
function fetch(payload, url, digest, proxy = '') {
  return spawnSync(
    'bash',
    [
      '-c',
      '. "$1"; fetch_payload "$2" "$3" "$4" "$5"',
      'bash',
      lib,
      payload,
      url,
      digest,
      proxy,
    ],
    { encoding: 'utf8' },
  );
}

const digestOf = (text) => createHash('sha256').update(text).digest('hex');

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-preview-payload-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.tar.gz');
  writeFileSync(source, 'payload bytes');
  return {
    root,
    source,
    url: `file://${source}`,
    payload: path.join(root, 'payload-pr-1.tar.gz'),
    digest: digestOf('payload bytes'),
  };
}

test('a payload is fetched and verified', (t) => {
  const f = fixture(t);
  const result = fetch(f.payload, f.url, f.digest);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.payload, 'utf8'), 'payload bytes');
  // The partial name is only ever a staging name: nothing reads it as a payload.
  assert.equal(existsSync(`${f.payload}.part`), false);
});

test('a payload that fails its digest is never left in place', (t) => {
  const f = fixture(t);
  const result = fetch(f.payload, f.url, digestOf('something else'));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /payload digest mismatch/);
  assert.equal(existsSync(f.payload), false);
  assert.equal(existsSync(`${f.payload}.part`), false);
});

test('a fetch that cannot complete leaves no payload behind', (t) => {
  const f = fixture(t);
  const result = fetch(f.payload, `file://${f.root}/missing.tar.gz`, f.digest);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not fetch the payload/);
  assert.equal(existsSync(f.payload), false);
  assert.equal(existsSync(`${f.payload}.part`), false);
});

test('fetching without a digest is refused rather than deployed unverified', (t) => {
  const f = fixture(t);
  const result = fetch(f.payload, f.url, '');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing to deploy unverified bytes/);
  assert.equal(existsSync(f.payload), false);
});

test('an already verified payload is used as it stands', (t) => {
  const f = fixture(t);
  writeFileSync(f.payload, 'payload bytes');
  // A URL that would fail, so reaching it would prove the digest was ignored.
  const result = fetch(f.payload, `file://${f.root}/missing.tar.gz`, f.digest);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /already present and verified/);
  assert.equal(readFileSync(f.payload, 'utf8'), 'payload bytes');
});

test('a payload that no longer matches the digest is fetched again', (t) => {
  const f = fixture(t);
  writeFileSync(f.payload, 'stale bytes from an earlier attempt');
  const result = fetch(f.payload, f.url, f.digest);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /does not match the digest; refetching/);
  assert.equal(readFileSync(f.payload, 'utf8'), 'payload bytes');
});

test('a missing payload and no URL is an error, not an empty deploy', (t) => {
  const f = fixture(t);
  const result = fetch(f.payload, '', '');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /payload not found/);
});
