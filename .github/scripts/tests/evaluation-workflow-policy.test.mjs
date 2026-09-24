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

test('task preparation records the entry workflow separately from the pinned control plane', () => {
  const workflow = read('code-agent-task.yml');
  const record = workflow.split('- name: Record the task chain control pin')[1].split('- name:')[0];
  assert.match(record, /FACTORY_CONTROL_SHA: \$\{\{ steps\.baseline\.outputs\.sha \}\}/);
  assert.match(record, /FACTORY_ENTRY_SHA: \$\{\{ github\.sha \}\}/);
});
