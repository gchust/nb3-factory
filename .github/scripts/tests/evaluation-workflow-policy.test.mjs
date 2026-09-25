import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflows = path.resolve(import.meta.dirname, '../../workflows');
const read = name => readFileSync(path.join(workflows, name), 'utf8');
// Split a workflow into its top-level jobs by their two-space-indented keys.
function jobs(text) {
  const result = {};
  let name = null;
  for (const line of text.split('\njobs:\n')[1].split('\n')) {
    const match = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (match) { name = match[1]; result[name] = ''; } else if (name) result[name] += `${line}\n`;
  }
  return result;
}

test('evaluation export is a data-only, non-blocking step after the existing usage report', () => {
  const workflow = read('report-task-usage.yml');
  const { report, evaluation, pages } = jobs(workflow);
  const exportStep = report.split('- name: Export versioned evaluation report')[1].split('- name:')[0];
  assert.match(exportStep, /continue-on-error: true/);
  // Every step added after the original report upload is isolated, so Pages still runs.
  for (const step of report.split('- name: Save HTML and numeric usage report')[1].split(/\n {6}- /).slice(1))
    assert.match(step, /continue-on-error: true/, step.split('\n')[0]);
  assert.match(exportStep, /vars\.FACTORY_EVALUATION_EXPORT != 'false'/);
  assert.match(exportStep, /evaluation-archive\.mjs export/);
  assert.doesNotMatch(report, /secrets\.|contents: write/);
  assert.match(evaluation, /contents: write/);
  assert.doesNotMatch(evaluation, /secrets\.|EVALUATION_TOKEN|pnpm install|agent-browser|run-agent/);
  assert.match(evaluation, /retention-days: 90/);
  // Pages and evaluation registration are independent: neither waits on the other.
  assert.match(evaluation, /^ {4}needs: report$/m);
  assert.doesNotMatch(pages, /evaluation/);
  for (const block of Object.values(jobs(workflow))) {
    for (const checkout of block.split('actions/checkout@v4').slice(1)) assert.match(checkout.slice(0, 300), /persist-credentials: false/);
  }
});

test('optional delivery keeps the receiver token in one read-only step and never builds or reviews', () => {
  // No workflow waits on delivery: registration only dispatches it, so a slow
  // receiver never holds the reporter's or coordinator's concurrency group.
  for (const name of ['report-task-usage.yml', 'evaluation-batches.yml']) {
    const text = read(name);
    assert.doesNotMatch(text, /uses: \.\/\.github\/workflows\/deliver-evaluation\.yml/, name);
    const { evaluation } = jobs(text);
    const request = evaluation.split('- name: Request delivery without waiting')[1];
    assert.match(request, /if: steps\.commit\.outputs\.queued == 'true'/, name);
    assert.match(request, /continue-on-error: true/, name);
    assert.match(request, /gh workflow run deliver-evaluation\.yml .*--field mode=scan/, name);
    assert.match(evaluation, /actions: write/, name);
  }
  assert.match(jobs(read('replay-build-review.yml')).report, /actions: write/, 'the reused reporter may request delivery');
  const workflow = read('deliver-evaluation.yml');
  assert.doesNotMatch(workflow, /workflow_call:/);
  const all = jobs(workflow);
  assert.equal((workflow.match(/secrets\.EVALUATION_TOKEN/g) ?? []).length, 1);
  assert.match(all.send, /secrets\.EVALUATION_TOKEN/);
  assert.match(all.send, /permissions:\n {6}contents: read\n {4}steps:/);
  for (const name of ['plan', 'record', 'backfill']) assert.doesNotMatch(all[name], /EVALUATION_TOKEN|secrets\./, name);
  assert.match(all.record, /contents: write/);
  assert.doesNotMatch(workflow, /pnpm install|agent-browser|run-agent|run-build-review|code-agent-task\.yml|replay-build-review/);
  assert.match(workflow, /group: factory-evaluation-delivery\n {2}queue: max/);
  assert.match(workflow, /schedule:/);
  for (const checkout of workflow.split('actions/checkout@v4').slice(1)) {
    assert.match(checkout.slice(0, 300), /persist-credentials: false/);
    assert.match(checkout.slice(0, 300), /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  }
});

test('task preparation records the entry workflow separately from the pinned control plane', () => {
  const workflow = read('code-agent-task.yml');
  const record = workflow.split('- name: Record the task chain control pin')[1].split('- name:')[0];
  assert.match(record, /FACTORY_CONTROL_SHA: \$\{\{ steps\.baseline\.outputs\.sha \}\}/);
  assert.match(record, /FACTORY_ENTRY_SHA: \$\{\{ github\.sha \}\}/);
});

test('batch coordination accepts no control SHA, budget, script or URL input and never builds itself', () => {
  const workflow = read('evaluation-batches.yml');
  const inputs = workflow.split('workflow_dispatch:\n    inputs:\n')[1].split('\n  schedule:')[0];
  assert.deepEqual([...inputs.matchAll(/^ {6}([a-z_]+):$/gm)].map(m => m[1]), ['action', 'plan', 'batch', 'dry_run', 'source_run']);
  const { coordinate, evaluation } = jobs(workflow);
  assert.match(coordinate, /actions: write\n {6}contents: read\n {6}issues: write/);
  assert.doesNotMatch(coordinate, /secrets\.|contents: write|pnpm install|agent-browser|run-agent|download-artifact/);
  assert.match(coordinate, /FACTORY_EVALUATION_PLANS_ENABLED: \$\{\{ vars\.FACTORY_EVALUATION_PLANS_ENABLED \}\}/);
  assert.match(coordinate, /export FACTORY_CONTROL_SHA="\$\(git -C control rev-parse HEAD\)"/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /group: factory-evaluation-batch\n {2}queue: max/);
  assert.match(evaluation, /contents: write/);
  assert.doesNotMatch(evaluation, /secrets\./);
  // Each open batch is exported to its own directory and registered in its own matrix job.
  assert.match(coordinate, /batches: \$\{\{ steps\.coordinate\.outputs\.batches \}\}/);
  assert.match(evaluation, /fail-fast: false/);
  assert.match(evaluation, /batch: \$\{\{ fromJSON\(needs\.coordinate\.outputs\.batches\) \}\}/);
  assert.match(evaluation, /--input "\$RUNNER_TEMP\/batch-export\/\$BATCH_KEY"/);
  // A batch that failed to coordinate fails the step, but the others' exports still archive.
  assert.match(coordinate, /if: '!cancelled\(\) && steps\.coordinate\.outputs\.export == ''true'''/);
  assert.match(evaluation, /if: "!cancelled\(\) && needs\.coordinate\.outputs\.export != '' && needs\.coordinate\.outputs\.batches != ''"/);
  assert.doesNotMatch(coordinate, /API_KEY|TOKEN: \$\{\{ vars|OAUTH/);
  assert.match(coordinate, /CODE_AGENT_MODEL: \$\{\{ vars\.CODE_AGENT_MODEL \}\}/);
  for (const checkout of workflow.split('actions/checkout@v4').slice(1)) {
    assert.match(checkout.slice(0, 300), /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
    assert.match(checkout.slice(0, 300), /persist-credentials: false/);
  }
  // The daily preset label flow stays independent of evaluation plans.
  assert.doesNotMatch(read('scheduled-preset-tests.yml'), /evaluation/);
});

test('a batch sample run asks the coordinator to advance without passing anything it trusts', () => {
  const { 'advance-evaluation-batch': advance } = jobs(read('code-agent-task.yml'));
  assert.match(advance, /if: always\(\) && needs\.prepare\.outputs\.evaluation_sample == 'true'/);
  assert.match(advance, /permissions:\n {6}actions: write\n/);
  assert.match(advance, /--field action=advance --field "source_run=\$SOURCE_RUN_ID"/);
  assert.doesNotMatch(advance, /secrets\.|checkout/);
});
