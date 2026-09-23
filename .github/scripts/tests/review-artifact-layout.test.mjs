import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('each exact-ID review input is extracted flat within its own role directory', () => {
  const workflow = readFileSync(new URL('../../workflows/independent-review.yml', import.meta.url), 'utf8');
  const downloads = workflow.split('      - uses: actions/download-artifact@v4').slice(1);
  const byId = downloads.filter(block => block.split('      - ')[0].includes('artifact-ids:'));
  assert.equal(byId.length, 3);
  for (const role of ['task', 'agent', 'final']) {
    const step = byId.find(block => block.includes('artifact-ids: ${{ steps.select.outputs.' + role + ' }}'))?.split('      - ')[0];
    assert.ok(step, role);
    assert.match(step, /merge-multiple: true/);
    assert.ok(step.includes(`path: input/${role}\n`));
    assert.ok(step.includes('run-id: ${{ steps.select.outputs.source_run }}'));
  }
});

test('failed input binding preserves the selected evidence without invoking a reviewer', () => {
  const workflow = readFileSync(new URL('../../workflows/independent-review.yml', import.meta.url), 'utf8');
  assert.match(workflow, /if: always\(\) && steps.select.outputs.ready == 'true'[\s\S]*?name: factory-review-input/);
  assert.match(workflow, /ready: \$\{\{ steps.bind.outcome == 'success' \}\}/);
  assert.match(workflow, /review:[\s\S]*?if: needs.prepare.outputs.ready == 'true'/);
});
