import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../workflows/replay-build-review.yml', import.meta.url), 'utf8');
const review = workflow.split('\n  review:\n')[1].split('\n  report:\n')[0];

test('source review replay restores original tarballs before the frozen, no-script install', () => {
  const patch = review.indexOf('git -C workspace apply --index ../input/agent/agent.patch');
  const restore = review.indexOf('source-snapshot.mjs restore workspace input/agent/task-metadata.json');
  const install = review.indexOf('pnpm install --frozen-lockfile --ignore-scripts');
  const assess = review.indexOf('replay-build-review.mjs run');
  assert.ok(patch >= 0 && restore > patch && install > restore && assess > install);
  assert.match(review.slice(restore, install), /\n      - name: Reconstruct/,
    'GITHUB_ENV from snapshot restore must reach the install in a new step');
  assert.match(review, /ref: \$\{\{ needs.prepare.outputs.base_sha \}\}/);
  assert.match(review, /ref: \$\{\{ needs.prepare.outputs.control_sha \}\}/);
  assert.doesNotMatch(review.slice(restore, install), /continue-on-error|\|\| true/);
});

test('source registry is stopped on success and failure without changing review publication gates', () => {
  assert.match(review, /- name: Stop the reviewer source registry\n        if: always\(\)\n        run: node control\/\.github\/scripts\/source-snapshot\.mjs stop/);
  assert.match(review, /id: export\n        if: always\(\)/);
  assert.match(workflow, /needs.prepare.outputs.ready == 'true' && needs.review.outputs.artifact_id != ''/);
  assert.doesNotMatch(review, /pnpm (?:build|migrate|seed|update)|--no-frozen-lockfile|cache: pnpm/);
});
