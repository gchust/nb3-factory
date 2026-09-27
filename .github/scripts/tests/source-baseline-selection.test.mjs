import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparePresetIssue } from '../issue-presets.mjs';
import { isSourceBaselineRef, isSharedTaskBase } from '../source-baseline-ref.mjs';
import { pinInitialBase } from '../task-base.mjs';
import { assertSafeChangedPaths } from '../factory-lib.mjs';
import { captureBaseline } from '../baseline-record.mjs';
import { sourceDescriptor } from '../source-candidate.mjs';
import { exactCreatorVersion, recordCreator } from '../template-creator.mjs';

const branch = `factory-baseline/source-${'a'.repeat(12)}-123-1`;
const human = { login: 'owner', type: 'User' }, bot = { login: 'github-actions[bot]', type: 'Bot' };
function fixture(selected = branch) {
  const source = { number: 1, title: 'A small test', user: human, labels: ['factory:preset'], html_url: 'https://github.com/owner/repo/issues/1',
    body: '### 目标分支\n\nold\n\n### 任务类型\n\n创建新系统\n\n### 业务需求\n\n计数器\n\n### 验收要求\n\n0 → 1' };
  const issue = { number: 2, title: 'rebuild', body: `### 预置案例\n\n#1 - A small test\n\n### 测试基线分支\n\n${selected}`, user: human, labels: [] };
  const comments = [];
  const client = {
    repository: 'owner/repo',
    getIssue: async n => structuredClone(n === 1 ? source : issue),
    getRepository: async () => ({ default_branch: 'develop' }),
    getRef: async value => value === branch ? { object: { sha: 'b'.repeat(40) } } : null,
    async addComment(n, body) { assert.equal(n, 2); const comment = { id: comments.length + 100, user: bot, body }; comments.push(comment); return structuredClone(comment); },
    async request(method, route, options = {}) {
      if (method === 'GET' && route.endsWith('/comments')) return route === '/issues/1/comments' ? [] : structuredClone(comments);
      if (method === 'PATCH' && route === '/issues/2') { Object.assign(issue, options.body); return structuredClone(issue); }
      throw new Error(`Unexpected ${method} ${route}`);
    },
  };
  return { source, issue, client, comments };
}
test('preset rebuilds start from the default branch and ignore a legacy baseline field and the source branch', async () => {
  for (const selection of ['', '_No response_', branch, 'unknown']) {
    const f = fixture(selection), result = await preparePresetIssue(f.client, f.issue);
    assert.equal(result.task.targetBranch, 'develop');
    assert.equal(f.source.body.includes('\nold\n'), true);
  }
});
test('captured default branch and base SHA remain fixed after the default branch advances', async () => {
  const f = fixture(''); const one = await preparePresetIssue(f.client, f.issue);
  const original = 'b'.repeat(40);
  assert.equal(await pinInitialBase(f.client, 2, 'develop', original), original);
  f.client.getRepository = async () => ({ default_branch: 'new-default' });
  const two = await preparePresetIssue(f.client, f.issue);
  assert.equal(two.task.targetBranch, 'develop'); assert.equal(two.preset.inputHash, one.preset.inputHash);
  assert.equal(await pinInitialBase(f.client, 2, 'develop', 'c'.repeat(40)), original);
});
test('only exact source baselines share independent-task behavior and descriptor is protected', () => {
  assert.ok(isSourceBaselineRef(branch)); assert.ok(isSharedTaskBase(branch, 'develop'));
  assert.ok(!isSourceBaselineRef('factory-baseline/source-latest'));
  assert.ok(!isSharedTaskBase('apps/crm', 'develop'));
  assert.throws(() => assertSafeChangedPaths(['factory-source.json']));
});
test('baseline records actual creator and source descriptor without guessing source from published versions', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'selected-baseline-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'package.json'), '{}');
  const template = path.join(root, 'factory-template.json'); writeFileSync(template, JSON.stringify({ templateVersion: '1.0.0-beta.43' }));
  recordCreator(template, '0.1.0-beta.19');
  assert.equal(captureBaseline(root).creatorVersion, '0.1.0-beta.19'); assert.equal(captureBaseline(root).source, null);
  const value = sourceDescriptor({ repository: process.env.GITHUB_REPOSITORY || 'owner/repo', sourceSha: 'a'.repeat(40), runId: 123, attempt: 1 }, Buffer.from('safe bytes'));
  writeFileSync(path.join(root, 'factory-source.json'), JSON.stringify(value));
  assert.equal(captureBaseline(root).source.sha, value.sourceSha);
  assert.throws(() => captureBaseline(root, { sourceSha: 'b'.repeat(40) }), /conflicts/);
  assert.throws(() => exactCreatorVersion('latest')); assert.throws(() => exactCreatorVersion('1.0.0\nINJECT=1'));
});
test('all three clean runners restore the selected snapshot before installing and preserve final archive gates', () => {
  const workflow = readFileSync(new URL('../../workflows/code-agent-task.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/source-snapshot.mjs restore workspace/g) ?? []).length, 3);
  for (const [name, next] of [['agent', 'verify-final'], ['verify-final', 'publish'], ['preview-build-failed', 'report-failure']]) {
    const job = workflow.split(`  ${name}:
`)[1].split(`  ${next}:
`)[0];
    const restore = job.indexOf('source-snapshot.mjs restore workspace');
    assert.ok(restore >= 0, `${name} restores its pinned source baseline`);
    assert.ok(job.indexOf('pnpm install --frozen-lockfile') > restore, `${name} restores before installing`);
  }
  assert.match(workflow, /Capture the actual installed package and Skill baseline/);
  assert.match(workflow, /FACTORY_BUILD_ARCHIVE: '1'/);
  assert.doesNotMatch(workflow, /scripts\/utils\/pack-dist.mjs/);
  const history = readFileSync(new URL('../agent-history.mjs', import.meta.url), 'utf8');
  assert.match(history, /baseline/);
});
