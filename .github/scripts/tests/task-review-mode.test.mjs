import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseIssueTask, parseBuildReviewMode, resolveBuildReviewMode } from '../factory-lib.mjs';
import { preparePresetIssue, renderPresetForm } from '../issue-presets.mjs';
import { inputHash } from '../pipeline-state.mjs';
import { runBuildReview } from '../run-build-review.mjs';
import { loadBuildReview } from '../build-review.mjs';

const business = '### 任务类型\n\n创建新系统\n\n### 业务需求\n\nA tiny page\n\n### 验收要求\n\nB01. Click once\n\n### 示例数据\n\n否\n';
const source = () => ({ number: 17, title: 'An ordinary named source', body: business + '\n### 框架评测\n\n轻量\n', labels: ['factory:preset'],
  user: { login: 'owner', type: 'User' }, html_url: 'https://github.com/owner/repo/issues/17' });
function fixture(choice = '自动') {
  const state = { source: source(), issue: { number: 50, title: 'Rebuild', body: `### 预置案例\n\n#17\n\n### 框架评测\n\n${choice}\n`,
    user: { login: 'owner', type: 'User' }, html_url: 'https://github.com/owner/repo/issues/50' }, comments: [] };
  const client = {
    async getIssue(number) { assert.equal(number, 17); return structuredClone(state.source); },
    async getRepository() { return { default_branch: 'develop' }; },
    async request(method, route, { body, query } = {}) {
      if (method === 'GET' && route.endsWith('/comments')) return route === '/issues/50/comments' && query.page === 1 ? structuredClone(state.comments) : [];
      if (method === 'PATCH' && route === '/issues/50') { Object.assign(state.issue, body); return structuredClone(state.issue); }
      throw new Error(`Unexpected request ${method} ${route}`);
    },
    async addComment(number, body) { assert.equal(number, 50); const comment = { id: 100 + state.comments.length, body,
      user: { login: 'github-actions[bot]', type: 'Bot' } }; state.comments.push(comment); return comment; },
  };
  return { state, client, prepare: () => preparePresetIssue(client, structuredClone(state.issue)) };
}

test('control values are strict, optional, and kept out of business and browser input', () => {
  for (const value of ['', undefined, '_No response_', 'auto', '自动']) assert.equal(parseBuildReviewMode(value), null);
  for (const [value, mode] of [['轻量','off'], ['off','off'], ['完整','full'], ['full','full']]) {
    const task = parseIssueTask({ body: business + `\n### 框架评测\n\n${value}\n` });
    assert.equal(task.buildReviewMode, mode);
    assert.equal(task.requirements, 'A tiny page');
    assert.equal(task.acceptanceCriteria, 'B01. Click once');
  }
  assert.equal(Object.hasOwn(parseIssueTask({body:business}), 'buildReviewMode'), false);
  assert.throws(() => parseBuildReviewMode('skip-everything'), /框架评测/);
});
test('task choice wins without changing global settings; explicit reassessment can review a light task', () => {
  const env = { FACTORY_BUILD_REVIEW: 'full' };
  assert.equal(resolveBuildReviewMode({buildReviewMode:'off'}, env), 'off');
  assert.equal(env.FACTORY_BUILD_REVIEW, 'full');
  assert.equal(resolveBuildReviewMode({buildReviewMode:'full'}, {FACTORY_BUILD_REVIEW:'off'}), 'full');
  assert.equal(resolveBuildReviewMode({}, {FACTORY_BUILD_REVIEW:'off'}), 'off');
  assert.equal(resolveBuildReviewMode({}, {}), 'full');
  assert.equal(resolveBuildReviewMode({}, {FACTORY_BUILD_REVIEW:''}), 'full');
  assert.equal(resolveBuildReviewMode({buildReviewMode:'off'}, env, true), 'full');
  assert.throws(() => resolveBuildReviewMode({buildReviewMode:'unknown'}, env), /Invalid captured/);
});
test('auto inherits any source preset and freezes it across source and visible control-field edits', async () => {
  const f = fixture(); const first = await f.prepare();
  assert.equal(first.task.buildReviewMode, 'off');
  assert.match(f.state.issue.body, /### 框架评测\n\n轻量/);
  f.state.source.body = f.state.source.body.replace('轻量','完整');
  f.state.issue.body = f.state.issue.body.replace('### 框架评测\n\n轻量', '### 框架评测\n\n完整');
  const repeated = await f.prepare();
  assert.equal(repeated.task.buildReviewMode, 'off');
  assert.equal(first.preset.inputHash, repeated.preset.inputHash);
});
test('full override changes execution only, not source input or preset business hash', async () => {
  const light = fixture('轻量'), full = fixture('完整');
  const a = await light.prepare(), b = await full.prepare();
  assert.equal(a.task.buildReviewMode, 'off'); assert.equal(b.task.buildReviewMode, 'full');
  assert.equal(a.preset.inputHash, b.preset.inputHash);
  assert.match(full.state.source.body, /轻量/);
  assert.equal(a.task.requirements, b.task.requirements);
  assert.equal(a.task.acceptanceCriteria, b.task.acceptanceCriteria);
});
test('unknown choice is rejected before writing a snapshot or runnable issue', async () => {
  const f = fixture('anything'); await assert.rejects(f.prepare(), /框架评测/);
  assert.equal(f.state.comments.length, 0); assert.match(f.state.issue.body, /### 预置案例/);
});
test('checkpoints distinguish explicit task choices but preserve old hashes without the field', () => {
  const metadata = {issue:{number:50},task:parseIssueTask({body:business})};
  const old = inputHash(metadata);
  assert.equal(old, inputHash({...metadata,task:{...metadata.task,buildReviewMode:undefined}}));
  assert.notEqual(old, inputHash({...metadata,task:{...metadata.task,buildReviewMode:'off'}}));
  assert.notEqual(inputHash({...metadata,task:{...metadata.task,buildReviewMode:'full'}}),
    inputHash({...metadata,task:{...metadata.task,buildReviewMode:'off'}}));
});
test('light runner emits an explicit non-scored report without snapshot work or any Agent call', async t => {
  const dir=mkdtempSync(path.join(os.tmpdir(),'light-review-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const workspace=path.join(dir,'workspace'), artifacts=path.join(dir,'artifacts');
  mkdirSync(workspace); mkdirSync(artifacts);
  writeFileSync(path.join(artifacts,'task-metadata.json'),JSON.stringify({repository:'owner/repo',issue:{number:50},task:{buildReviewMode:'off'}}));
  // There is deliberately no Git repo, patch or CLI: none should be needed to skip an optional review.
  const result=await runBuildReview(workspace,artifacts,{FACTORY_BUILD_REVIEW:'full',CODE_AGENT_ENGINE:'not-an-engine'});
  assert.equal(result.state,'not-reviewed'); assert.equal(result.evaluation,null);
  assert.deepEqual(result.execution,{buildReviewMode:'off',source:'task'});
  assert.equal(existsSync(path.join(artifacts,'agent-review.jsonl')),false);
  assert.equal(loadBuildReview(artifacts).state,'not-reviewed');
  assert.match(JSON.parse(readFileSync(path.join(artifacts,'build-review.json'),'utf8')).reason,/明确关闭/);
});
test('both Issue forms expose the same safe choice and the pipeline keeps every business gate', () => {
  assert.match(renderPresetForm([source()]), /label: 框架评测/);
  const form=readFileSync(new URL('../../ISSUE_TEMPLATE/code-agent-task.yml',import.meta.url),'utf8');
  assert.match(form, /label: 框架评测/);
  const workflow=readFileSync(new URL('../../workflows/code-agent-task.yml',import.meta.url),'utf8');
  assert.match(workflow,/Verify and repair until successful/);
  assert.match(workflow,/Independently verify the applied patch/);
  assert.match(workflow,/needs\.verify-final\.result == 'success'/);
  assert.doesNotMatch(workflow,/buildReviewMode.*(?:skip|verify)/);
});
