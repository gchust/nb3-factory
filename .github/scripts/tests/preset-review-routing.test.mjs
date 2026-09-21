import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { preparePresetIssue } from '../issue-presets.mjs';
import { replaceTemplate } from '../factory-lib.mjs';
import { receiptBody, resolveBuildTask } from '../comment-queue.mjs';

const marker = '<!-- factory:review-only -->';
const human = { login: 'owner', type: 'User' };
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const sourceBody = '### 目标分支\n\nold-branch\n\n### 任务类型\n\n创建新系统\n\n### 业务需求\n\n保存客户\n\n### 验收要求\n\n刷新后数据保留\n\n### 示例数据\n\n是';
function fixture(review = `${marker}\nREVIEW_SENTINEL: inspect private implementation evidence`) {
  const source = { number: 1, state: 'closed', title: '客户管理', body: sourceBody, user: human, labels: [{ name: 'factory:preset' }], html_url: 'https://github.com/owner/repo/issues/1' };
  const issue = { number: 2, state: 'open', title: '重搭', body: '### 预置案例\n\n#1 - 客户管理\n\n### 本次补充要求\n\n增加筛选', user: human, labels: [] };
  const comments = new Map([[1, [
    { id: 10, user: human, body: '/build\n新增搜索', html_url: `${source.html_url}#issuecomment-10` },
    ...(review == null ? [] : [{ id: 11, user: human, body: review }]),
    { id: 12, user: bot, body: 'BOT_OUTPUT_SENTINEL' },
  ]], [2, []]]);
  const client = {
    repository: 'owner/repo',
    getIssue: async number => structuredClone(number === 1 ? source : issue),
    async addComment(number, body) {
      const comment = { id: 100 + comments.get(number).length, user: bot, body };
      comments.get(number).push(comment);
      return structuredClone(comment);
    },
    async request(method, route, options = {}) {
      const match = /^\/issues\/(\d+)\/comments$/.exec(route);
      if (method === 'GET' && match) {
        const { page = 1, per_page = 100 } = options.query ?? {};
        return structuredClone(comments.get(Number(match[1])).slice((page - 1) * per_page, page * per_page));
      }
      if (method === 'PATCH' && route === '/issues/2') {
        Object.assign(issue, options.body);
        return structuredClone(issue);
      }
      throw new Error(`Unexpected API call: ${method} ${route}`);
    },
  };
  return { client, source, issue, comments };
}

test('preset copies reviewers visibly but excludes them from both business and browser QA input', async () => {
  const f = fixture();
  const result = await preparePresetIssue(f.client, f.issue);
  assert.match(result.task.requirements, /新增搜索/);
  assert.match(result.task.requirements, /增加筛选/);
  assert.match(result.task.acceptanceCriteria, /刷新后数据保留/);
  assert.match(result.task.acceptanceCriteria, /新增搜索/);
  for (const input of [result.task.requirements, result.task.acceptanceCriteria]) {
    assert.doesNotMatch(input, /REVIEW_SENTINEL|BOT_OUTPUT_SENTINEL|factory:review-only/);
  }
  assert.match(result.task.reviewCriteria, /REVIEW_SENTINEL/);
  assert.equal(result.preset.reviewCommentCount, 1);
  assert.equal(result.preset.humanCommentCount, 2);
  assert.match(result.preset.reviewHash, /^[a-f0-9]{64}$/);
  const copies = f.comments.get(2).filter(c => c.body.includes('<!-- factory-preset-copy:'));
  assert.equal(copies.length, 2);
  assert.ok(copies.some(c => c.body.includes(marker)));
});

test('retry preserves captured reviewer content and does not duplicate copies after source edits', async () => {
  const f = fixture();
  const first = await preparePresetIssue(f.client, f.issue);
  const count = f.comments.get(2).length;
  f.comments.get(1)[1].body = `${marker}\nNEW_REVIEW_SENTINEL`;
  f.source.body = sourceBody.replace('保存客户', '新需求');
  const second = await preparePresetIssue(f.client, first.issue);
  assert.deepEqual(second.task, first.task);
  assert.deepEqual(second.preset, first.preset);
  assert.equal(f.comments.get(2).length, count);
});

test('changing only the reviewer rubric does not change the business input hash', async () => {
  const a = fixture(`${marker}\n评审 A`);
  const b = fixture(`${marker}\n评审 B`);
  const first = await preparePresetIssue(a.client, a.issue);
  const second = await preparePresetIssue(b.client, b.issue);
  assert.equal(first.preset.inputHash, second.preset.inputHash);
  assert.notEqual(first.preset.reviewHash, second.preset.reviewHash);
});

test('unmarked legacy cases introduce no reviewer fields', async () => {
  const f = fixture(null);
  const result = await preparePresetIssue(f.client, f.issue);
  assert.equal(Object.hasOwn(result.task, 'reviewCriteria'), false);
  assert.equal(Object.hasOwn(result.preset, 'reviewHash'), false);
  assert.equal(Object.hasOwn(result.preset, 'reviewCommentCount'), false);
});

test('actual implementation builder and browser template never render reviewer sentinel', async () => {
  const f = fixture();
  const result = await preparePresetIssue(f.client, f.issue);
  const dir = mkdtempSync(path.join(tmpdir(), 'preset-review-'));
  try {
    const metadataPath = path.join(dir, 'task.json');
    const output = path.join(dir, 'implement.md');
    writeFileSync(metadataPath, JSON.stringify(result));
    const run = spawnSync(process.execPath, [
      new URL('../build-prompt.mjs', import.meta.url).pathname,
      '--metadata', metadataPath,
      '--template', new URL('../../prompts/implement.md', import.meta.url).pathname,
      '--output', output,
    ], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const implementation = readFileSync(output, 'utf8');
    const browser = replaceTemplate(readFileSync(new URL('../../prompts/browser-acceptance.md', import.meta.url), 'utf8'), {
      REQUIREMENTS: result.task.requirements, ACCEPTANCE_CRITERIA: result.task.acceptanceCriteria,
    });
    for (const prompt of [implementation, browser]) {
      assert.match(prompt, /新增搜索/);
      assert.doesNotMatch(prompt, /REVIEW_SENTINEL|BOT_OUTPUT_SENTINEL|factory:review-only/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('later /build keeps reviewer input separate from business history', async () => {
  const f = fixture();
  const first = await preparePresetIssue(f.client, f.issue);
  f.comments.get(2).push({ id: 500, user: human, body: '/build\n追加排序' });
  f.comments.get(2).push({ id: 501, user: bot, body: receiptBody({ id: 500, kind: 'build', status: 'dispatched', excerpt: '追加排序' }) });
  const task = await resolveBuildTask(f.client, first.issue, 500, first.task);
  assert.equal(task.reviewCriteria, first.task.reviewCriteria);
  assert.match(task.requirements, /追加排序/);
  assert.match(task.requirements, /新增搜索/);
  assert.doesNotMatch(task.requirements + task.acceptanceCriteria, /REVIEW_SENTINEL/);
});
