import { readFileSync } from 'node:fs';

import { GitHubClient } from './factory-lib.mjs';
import { stripTaskTitle } from './task-compat.mjs';

const args = parseArgs(process.argv.slice(2));
const metadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
const summary = JSON.parse(readFileSync(args.summary, 'utf8'));
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  repository: process.env.GITHUB_REPOSITORY,
  apiUrl: process.env.GITHUB_API_URL,
});
const issue = await client.getIssue(metadata.issue.number);
const owner = metadata.repository.split('/')[0];
const runUrl = `${process.env.GITHUB_SERVER_URL}/${metadata.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const titleText = stripTaskTitle(metadata.issue.title);
const title = `[Code Agent #${metadata.issue.number}] ${titleText}`.slice(
  0,
  240,
);
const changeSummary = summary.reusedExistingWorkBranch
  ? '- 本次重新验收未产生额外代码修改；沿用当前工作分支和 PR 差异'
  : `- 修改文件：${summary.counts.files}（新增 ${summary.counts.added}、修改 ${summary.counts.modified}、删除 ${summary.counts.deleted}、重命名 ${summary.counts.renamed}）`;
const body = [
  '## 来源',
  '',
  `Related to #${metadata.issue.number}`,
  '',
  `<!-- agent-issue: ${metadata.issue.number} -->`,
  `<!-- agent-target-branch: ${metadata.task.targetBranch} -->`,
  '',
  '## 任务',
  '',
  metadata.task.requirements,
  '',
  '## 验收要求',
  '',
  metadata.task.acceptanceCriteria,
  '',
  '## 自动验证',
  '',
  '- TypeScript、测试、Lint、格式与构建：通过',
  '- 全新 SQLite Migration 与 Seed：通过',
  '- Agent Browser 登录后逐条业务验收：通过',
  '- 独立 Job 登录后生产启动检查：通过',
  changeSummary,
  `- [GitHub Actions 运行记录](${runUrl})`,
  '',
  '> 此 PR 不会自动合并；请人工检查 Diff 和实际业务效果。',
].join('\n');

const openPulls = await client.request('GET', '/pulls', {
  query: {
    state: 'open',
    head: `${owner}:${metadata.workBranch}`,
    per_page: 100,
  },
});
let pull = openPulls.find(
  (candidate) => candidate.base?.ref === metadata.task.targetBranch,
);

if (pull) {
  pull = await client.request('PATCH', `/pulls/${pull.number}`, {
    body: { title, body, base: metadata.task.targetBranch },
  });
} else {
  if (openPulls.length > 0) {
    throw new Error(
      `工作分支 ${metadata.workBranch} 已有指向其他目标分支的开放 PR。`,
    );
  }
  pull = await client.request('POST', '/pulls', {
    body: {
      title,
      head: metadata.workBranch,
      base: metadata.task.targetBranch,
      body,
      draft: false,
    },
  });
}

await client.ensureStatusLabels();
await client.setIssueStatus(
  issue,
  'agent:review',
  [
    `实现与独立验证已完成：${pull.html_url}`,
    '',
    `合并前本地预览请检出工作分支：\`git fetch origin && git switch --track origin/${metadata.workBranch}\`。`,
    '',
    `请检查后手动合并到 \`${metadata.task.targetBranch}\`。合并后 Issue 会自动关闭。`,
  ].join('\n'),
);

console.log(`Pull request ready: ${pull.html_url}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['metadata', 'summary']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}
