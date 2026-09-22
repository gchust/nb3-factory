import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const Gc = path.resolve(import.meta.dirname, '..', 'preview', 'preview-gc.sh');

// Backups are the largest thing a preview leaves behind: every deploy moves the
// previous instance aside — database, uploads, application — so a pull request
// that was live for a few days leaves several hundred megabytes of them, and
// nothing else reclaims them. On 2026-09-22 the preview host's backups held
// 1.5 GB, all but one entry belonging to a preview that no longer existed.
//
// The script runs against a fake host root with `docker` and `flock` stubbed
// out, so this exercises the decisions — what is kept, what is removed — rather
// than the deletion itself.
function gc({ instances = [], backups = [], flag = '--prune-backups' }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-gc-'));
  for (const pr of instances)
    mkdirSync(path.join(root, 'instances', `pr-${pr}`), { recursive: true });
  for (const name of backups)
    mkdirSync(path.join(root, 'backups', name), { recursive: true });
  for (const dir of ['deps', 'tmp', 'logs'])
    mkdirSync(path.join(root, dir), { recursive: true });
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  // A host with no orphaned containers reports an empty list; docker only has to
  // not fail the script.
  writeFileSync(path.join(bin, 'docker'), '#!/bin/bash\nexit 0\n', {
    mode: 0o755,
  });
  // flock is a Linux utility; the check is about retention, not locking.
  writeFileSync(path.join(bin, 'flock'), '#!/bin/bash\n:\n', { mode: 0o755 });
  const result = spawnSync('bash', [Gc, flag], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PREVIEW_ROOT: root },
    encoding: 'utf8',
  });
  const list = () =>
    existsSync(path.join(root, 'backups'))
      ? readdirSync(path.join(root, 'backups')).sort()
      : [];
  return { root, result, list };
}

test('a backup whose preview is gone is removed', () => {
  const { root, result, list } = gc({
    instances: ['149'],
    backups: ['pr-149.1Ih17f', 'pr-115.t40u1C', 'pr-134.6g8ssZ'],
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(list(), ['pr-149.1Ih17f']);
    assert.match(
      result.stderr,
      /removing backup pr-115\.t40u1C: PR #115 has no preview/,
    );
    assert.match(
      result.stderr,
      /keeping pr-149\.1Ih17f: PR #149 still has a preview/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a backup from a failed deploy is reclaimed by the same rule', () => {
  // `failed-pr-<n>` is written when a deploy failed after the snapshot was taken
  // and nothing was restored; it belongs to the pull request just the same.
  const { root, result, list } = gc({
    instances: ['43'],
    backups: ['failed-pr-42.abc123', 'failed-pr-43.abc123', 'pr-43.abc123'],
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(list(), ['failed-pr-43.abc123', 'pr-43.abc123']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an entry that is not a preview snapshot is left alone', () => {
  // Other state lives in this tree, and a cleanup that guesses at unfamiliar
  // names is how it deletes something someone needed.
  const { root, result, list } = gc({
    instances: [],
    backups: ['cloudflare-20260919', 'pr-166-x', 'notes.txt'],
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(list(), ['cloudflare-20260919', 'notes.txt', 'pr-166-x']);
    assert.match(
      result.stderr,
      /keeping cloudflare-20260919: not a preview snapshot/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the backup sweep only runs when it is asked for', () => {
  const { root, result, list } = gc({
    instances: [],
    backups: ['pr-115.t40u1C'],
    flag: '--prune-deps',
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      list(),
      ['pr-115.t40u1C'],
      'a targeted sweep must not touch backups',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the host reclaims on a timer, not only when someone remembers', () => {
  // Nothing per-pull-request touches the backups, so without this the directory
  // only grows.
  const unit = readFileSync(
    path.resolve(import.meta.dirname, '..', 'preview', 'nb3-preview-gc.service'),
    'utf8',
  );
  const timer = readFileSync(
    path.resolve(import.meta.dirname, '..', 'preview', 'nb3-preview-gc.timer'),
    'utf8',
  );
  assert.match(
    unit,
    /ExecStart=\/srv\/nb3-preview\/scripts\/preview-gc\.sh --all/,
  );
  assert.match(unit, /ReadWritePaths=\/srv\/nb3-preview/);
  assert.match(timer, /Unit=nb3-preview-gc\.service/);
  assert.match(timer, /OnUnitInactiveSec=1h/);
  assert.match(timer, /WantedBy=timers\.target/);
});
