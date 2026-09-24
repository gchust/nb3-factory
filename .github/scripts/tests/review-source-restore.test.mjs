import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(path.join(scripts, '../workflows/replay-build-review.yml'), 'utf8');
test('source reassessment restores exact packages after patching and before frozen dependency installation', () => {
  const apply = workflow.indexOf('git -C workspace apply --index ../input/agent/agent.patch');
  const restore = workflow.indexOf('node control/.github/scripts/source-snapshot.mjs restore workspace input/agent/task-metadata.json');
  const install = workflow.indexOf('pnpm install --frozen-lockfile --ignore-scripts');
  const reviewer = workflow.indexOf('      - name: Install selected pinned reviewer');
  assert.ok(apply >= 0 && restore > apply && install > restore && reviewer > install);
  assert.match(workflow, /pnpm skills:sync/);
  assert.doesNotMatch(workflow, /pnpm (?:build|db:apply)|--no-frozen-lockfile/);
});

test('registry cleanup is an always-path and does not bypass evidence export', () => {
  const cleanup = workflow.split('      - name: Stop reassessment source registry\n')[1]?.split('\n      - ')[0] ?? '';
  assert.match(cleanup, /if: always\(\)/);
  assert.match(cleanup, /source-snapshot\.mjs stop/);
  assert.match(workflow, /id: export\n        if: always\(\)/);
});

test('the reused restorer leaves ordinary published-template reassessment unchanged', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'replay-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'); mkdirSync(workspace);
  const metadata = path.join(root, 'metadata.json');
  writeFileSync(metadata, JSON.stringify({ task: { targetBranch: 'develop' } }));
  const result = spawnSync(process.execPath, [path.join(scripts, 'source-snapshot.mjs'), 'restore', workspace, metadata],
    { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: root } });
  assert.equal(result.status, 0, result.stderr);
});

test('a missing source descriptor stops before installation instead of falling back to published latest', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'replay-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'); mkdirSync(workspace);
  const metadata = path.join(root, 'metadata.json');
  writeFileSync(metadata, JSON.stringify({ task: { targetBranch: 'factory-baseline/source-test' } }));
  const result = spawnSync(process.execPath, [path.join(scripts, 'source-snapshot.mjs'), 'restore', workspace, metadata],
    { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: root } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Source baseline descriptor is missing/);
});
