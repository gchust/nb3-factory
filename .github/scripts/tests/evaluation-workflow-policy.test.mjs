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
  const usage = read('report-task-usage.yml');
  const { delivery } = jobs(usage);
  assert.match(delivery, /vars\.FACTORY_EVALUATION_DELIVERY == 'true'/);
  assert.match(delivery, /uses: \.\/\.github\/workflows\/deliver-evaluation\.yml/);
  const workflow = read('deliver-evaluation.yml');
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
