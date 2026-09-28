import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('optional delivery keeps the receiver token in read-only steps and never builds or reviews', () => {
  // No workflow waits on delivery: registration only dispatches it, so a slow
  // receiver never holds the reporter's or coordinator's concurrency group.
  for (const name of ['report-task-usage.yml']) {
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
  assert.equal((workflow.match(/secrets\.EVALUATION_TOKEN/g) ?? []).length, 2);
  assert.match(all.send, /secrets\.EVALUATION_TOKEN/);
  assert.match(all.send, /permissions:\n {6}contents: read\n {4}steps:/);
  for (const name of ['plan', 'record', 'backfill']) assert.doesNotMatch(all[name], /EVALUATION_TOKEN|secrets\./, name);
  // Classification reads the receiver's feature points with the token, then lets the
  // Agent see model credentials only in a later step; neither step can write the repository.
  assert.match(all.classify, /permissions:\n {6}contents: read\n {4}steps:/);
  assert.doesNotMatch(all.classify, /contents: write|actions: write/);
  const steps = all.classify.split(/\n {6}- /);
  const taxonomy = steps.find(step => step.includes('problem-classification.mjs taxonomy'));
  const agent = steps.find(step => step.includes('problem-classification.mjs run'));
  assert.match(taxonomy, /secrets\.EVALUATION_TOKEN/);
  assert.doesNotMatch(taxonomy.replace('secrets.EVALUATION_TOKEN', ''), /secrets\./);
  assert.doesNotMatch(agent, /EVALUATION_TOKEN|GITHUB_TOKEN|github\.token/);
  for (const step of steps.filter(step => step !== agent)) assert.doesNotMatch(step.replace('secrets.EVALUATION_TOKEN', ''), /secrets\./);
  for (const engine of ['codebuddy', 'claude-code', 'codex', 'opencode']) assert.ok(agent.includes(`vars.CODE_AGENT_ENGINE == '${engine}'`), engine);
  assert.match(all.classify, /vars\.EVALUATION_DELIVERY_FORMAT == 'testmanage3-links-v1'/);
  assert.match(all.send, /needs: \[plan, classify\]/);
  assert.match(all.send, /if: always\(\) && !cancelled\(\) && needs\.plan\.result == 'success'/);
  assert.match(all.send, /continue-on-error: true\n {8}with:\n {10}name: factory-problem-classification-/);
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

test('retired batch workflow has no task completion dispatch', () => {
  assert.equal(existsSync(path.join(workflows, 'evaluation-batches.yml')), false);
  const task = read('code-agent-task.yml');
  assert.doesNotMatch(task, /advance-evaluation-batch|gh workflow run evaluation-batches/);
  assert.match(read('scheduled-preset-tests.yml'), /workflow_dispatch:/);
  assert.match(read('scheduled-preset-tests.yml'), /cron: '0 19 \* \* \*'/);
});
