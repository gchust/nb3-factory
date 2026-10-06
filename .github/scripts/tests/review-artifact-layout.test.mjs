import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../workflows/independent-review.yml', import.meta.url), 'utf8');
const job = name => workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];

test('every job downloads each exact-ID review input flat within its own role directory', () => {
  // prepare resolves the IDs; review and publish download the same originals
  // from the source run rather than a copy prepare re-uploaded, so the ~744 MB
  // of evidence crosses the artifact store once per reader instead of twice.
  const sources = { prepare: 'steps.select.outputs', review: 'needs.prepare.outputs', publish: 'needs.prepare.outputs' };
  for (const [name, source] of Object.entries(sources)) {
    const downloads = job(name).split('      - uses: actions/download-artifact@').slice(1);
    const byId = downloads.filter(block => block.split('      - ')[0].includes('artifact-ids:'));
    assert.equal(byId.length, 3, name);
    for (const role of ['task', 'agent', 'final']) {
      const step = byId.find(block => block.includes(`artifact-ids: \${{ ${source}.${role} }}`))?.split('      - ')[0];
      assert.ok(step, `${name}: ${role}`);
      assert.match(step, /merge-multiple: true/);
      assert.ok(step.includes(`path: input/${role}\n`));
      assert.ok(step.includes(`run-id: \${{ ${source}.source_run }}`));
      assert.ok(step.includes('github-token: ${{ github.token }}'));
    }
  }
  for (const role of ['source_run', 'task', 'agent', 'final'])
    assert.match(job('prepare'), new RegExp(`^      ${role}: \\$\\{\\{ steps\\.select\\.outputs\\.${role} \\}\\}$`, 'm'));
  // Reading another run's artifacts needs actions: read in the reading job.
  for (const name of ['review', 'publish']) assert.match(job(name), /permissions:\n(?: {6}.*\n)*? {6}actions: read\n/, name);
});

test('prepare hands on only the files it generated, beside the evidence the readers download', () => {
  const upload = job('prepare').split('- uses: actions/upload-artifact@')[1];
  assert.match(upload, /name: factory-review-input-/);
  assert.match(upload, /path: \|\n\s+input\/source\.json\n\s+input\/binding\.json\n/);
  assert.doesNotMatch(upload, /path: input\n/);
  for (const name of ['review', 'publish'])
    assert.match(job(name), /name: factory-review-input-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\n\s+path: input\n/, name);
});

test('failed input binding preserves the selection without invoking a reviewer', () => {
  assert.match(workflow, /if: always\(\) && steps.select.outputs.ready == 'true'[\s\S]*?name: factory-review-input/);
  assert.match(workflow, /ready: \$\{\{ steps.bind.outcome == 'success' \}\}/);
  assert.match(workflow, /review:[\s\S]*?if: needs.prepare.outputs.ready == 'true'/);
  // Published after a failed review, so the Issue says so; not after a cancel.
  assert.match(job('publish'), /if: \$\{\{ !cancelled\(\) && needs\.prepare\.outputs\.ready == 'true' \}\}/);
});
