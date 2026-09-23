import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { restoreSourceDist } from '../restore-source-dist.mjs';

function fixture(t, overrides = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'native-source-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app');
  mkdirSync(path.join(app, 'dist'), { recursive: true });
  mkdirSync(path.join(app, 'storage/exports'), { recursive: true });
  writeFileSync(path.join(app, 'config.yml'), 'original configuration');
  writeFileSync(path.join(app, 'storage/db.sqlite'), 'original data');
  const target = {platform: process.platform, arch: process.arch, nodeMajor: Number(process.versions.node.split('.')[0]), ...overrides};
  writeFileSync(path.join(app, 'dist/package.json'), JSON.stringify({nocobase: {buildTarget: target}}));
  writeFileSync(path.join(app, 'dist/native.node'), 'verified native bytes');
  execFileSync('tar', ['-czf', path.join(app, 'storage/exports/dist.tar.gz'), '-C', app, 'dist']);
  writeFileSync(path.join(app, 'dist/native.node'), 'foreign retarget bytes');
  writeFileSync(path.join(app, 'dist/foreign-only.node'), 'foreign');
  return {root, app, target};
}

test('restores the already verified native artifact without modifying config or storage', t => {
  const {root, app, target} = fixture(t);
  assert.deepEqual(restoreSourceDist(app, root), target);
  assert.equal(readFileSync(path.join(app, 'dist/native.node'), 'utf8'), 'verified native bytes');
  assert.equal(existsSync(path.join(app, 'dist/foreign-only.node')), false);
  assert.equal(readFileSync(path.join(app, 'config.yml'), 'utf8'), 'original configuration');
  assert.equal(readFileSync(path.join(app, 'storage/db.sqlite'), 'utf8'), 'original data');
  assert.deepEqual(readdirSync(root), ['app']);
});
for (const override of [{arch:'foreign'}, {platform:'foreign'}, {nodeMajor:0}]) {
  test(`rejects archive target ${JSON.stringify(override)} before replacing dist`, t => {
    const {root, app} = fixture(t, override);
    assert.throws(() => restoreSourceDist(app, root), /Archive must target/);
    assert.equal(readFileSync(path.join(app, 'dist/native.node'), 'utf8'), 'foreign retarget bytes');
    assert.deepEqual(readdirSync(root), ['app']);
  });
}
test('missing archive and non-temporary app are refused, not silently rebuilt', t => {
  const {root, app} = fixture(t);
  assert.throws(() => restoreSourceDist(app, app), /Only a runner temporary/);
  rmSync(path.join(app, 'storage/exports/dist.tar.gz'));
  assert.throws(() => restoreSourceDist(app, root));
  assert.equal(existsSync(path.join(app, 'dist/foreign-only.node')), true);
});
