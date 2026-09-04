import { readFileSync } from 'node:fs';

import { GitHubClient } from './factory-lib.mjs';

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
const titleText = metadata.issue.title.replace(/^\[Pi\]\s*/i, '').trim();
const title = `[Pi #${metadata.issue.number}] ${titleText}`.slice(0, 240);
const body = [
  '## 来源',
  '',
  `Related to #${metadata.issue.number}`,
  '',
  `<!-- pi-issue: ${metadata.issue.number} -->`,
  `<!-- pi-target-branch: ${metadata.task.targetBranch} -->`,
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
  '- 真实浏览器启动冒烟：通过',
  `- 修改文件：${summary.counts.files}（新增 ${summary.counts.added}、修改 ${summary.counts.modified}、删除 ${summary.counts.deleted}、重命名 ${summary.counts.renamed}）`,
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
  'pi:review',
  [
    `实现与独立验证已完成：${pull.html_url}`,
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
