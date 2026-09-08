import { GitHubClient } from './factory-lib.mjs';

const issueNumber = Number(process.argv[2]);
if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
  throw new Error('Usage: mark-failure.mjs <issue-number>');
}

const repository = process.env.GITHUB_REPOSITORY;
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  repository,
  apiUrl: process.env.GITHUB_API_URL,
});
const issue = await client.getIssue(issueNumber);
const runUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;

await client.ensureStatusLabels();
await client.setIssueStatus(
  issue,
  'agent:failed',
  `本次实现或最终验证失败。请查看 [运行日志](${runUrl})；修正配置后可重新运行 Workflow。`,
);
